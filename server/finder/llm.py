"""AI helpers. Every provider is called through its OpenAI-compatible chat API.

Providers differ in small ways. chat() adapts on the first error and remembers it:
max_tokens vs max_completion_tokens, unknown reasoning_effort values, a lower token
limit, and models that cannot read photos.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import math
import re
import time

import httpx

from .config import settings
from .secrets import redact

log = logging.getLogger(__name__)


class ProviderError(RuntimeError):
    """The AI provider answered with an error. The message is safe to show and log."""


class VisionUnsupported(ProviderError):
    """The AI model cannot read photos."""


class Endpoint:
    """One provider configuration and what we learned about it."""

    def __init__(self, base_url: str, api_key: str, model: str, vision: str = "auto") -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.vision_setting = vision
        self.vision = vision not in ("off", "0", "false", "no")
        self.token_field = "max_tokens"
        self.token_cap: int | None = None
        self.effort: dict[str, str | None] = {}  # wanted reasoning_effort -> value the provider accepts

    @property
    def key(self) -> tuple:
        return (self.base_url, self.api_key, self.model, self.vision_setting)

    def headers(self) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        if self.api_key and "anthropic.com" in self.base_url:
            headers |= {"x-api-key": self.api_key, "anthropic-version": "2023-06-01"}
        return headers

    def adapt(self, body: dict, status: int, text: str, images: bool) -> bool:
        """Change the request after an error. True when it is worth sending again."""
        low = text.lower()
        if "max_tokens" in body and "max_completion_tokens" in low:
            body["max_completion_tokens"] = body.pop("max_tokens")
            self.token_field = "max_completion_tokens"
            return True
        if "reasoning_effort" in body and "reasoning" in low:
            wanted = next((k for k, v in self.effort.items() if v == body["reasoning_effort"]), body["reasoning_effort"])
            if body["reasoning_effort"] == "none":
                body["reasoning_effort"] = self.effort[wanted] = "minimal"
            else:
                body.pop("reasoning_effort")
                self.effort[wanted] = None
            return True
        limit = re.search(r"(?:at most|maximum|max|up to|<=)\D{0,40}?(\d{3,6})", low)
        field = self.token_field
        if limit and ("max_tokens" in low or "max_completion_tokens" in low or "token" in low) and field in body:
            cap = int(limit.group(1))
            if 256 <= cap < body[field]:
                body[field] = self.token_cap = cap
                return True
        if images and status in (400, 404, 415, 422) and _NO_VISION.search(low) and not _IMAGE_LIMIT.search(low):
            if self.vision:
                log.warning("the AI model %s cannot read photos; photo checks are off", self.model)
            self.vision = False
            raise VisionUnsupported(f"The AI model {self.model} cannot read photos. Pick a model with vision in Settings.")
        return False


# "This model cannot read images" (OpenAI, DeepSeek, Ollama...), as opposed to a limit on
# the number, size or format of images, which a vision model can also report.
_NO_VISION = re.compile(
    r"(?:image|vision|multimodal|modalit)[^.]{0,60}(?:support|expected|unknown variant|not allowed|only text)"
    r"|(?:support|unknown variant|expected)[^.]{0,60}(?:image|vision|multimodal|modalit)"
    r"|text[- ]only"
)
_IMAGE_LIMIT = re.compile(r"at most|too many|maximum|exceed|too large|size|resolution|dimension|decode|base64|format")


_current: Endpoint | None = None


def endpoint() -> Endpoint:
    """The endpoint for the current settings (rebuilt when Settings change)."""
    global _current
    wanted = (settings.llm_base_url, settings.llm_api_key, settings.llm_model, settings.llm_vision)
    if _current is None or _current.key != wanted:
        _current = Endpoint(*wanted)
    return _current


def vision_enabled() -> bool:
    return settings.llm_enabled and endpoint().vision


def _has_images(messages: list[dict]) -> bool:
    return any(
        isinstance(part, dict) and part.get("type") == "image_url"
        for message in messages
        if isinstance(message.get("content"), list)
        for part in message["content"]
    )


def error_text(resp: httpx.Response, *secrets: str) -> str:
    """The provider's own error message, without secrets."""
    text = resp.text
    try:
        data = resp.json()
        error = data.get("error") if isinstance(data, dict) else None
        if isinstance(error, dict) and error.get("message"):
            text = str(error["message"])
        elif isinstance(error, str):
            text = error
        elif isinstance(data, dict) and data.get("message"):
            text = str(data["message"])
    except ValueError:
        pass
    return redact(" ".join(text.split()), *secrets)[:300]


def _content(data, secret: str = "") -> str:
    if isinstance(data, dict) and data.get("error") and not data.get("choices"):
        error = data["error"]
        raise ProviderError(redact(str(error.get("message") if isinstance(error, dict) else error), secret)[:300])
    try:
        message = data["choices"][0].get("message") or {}
    except (KeyError, IndexError, TypeError, AttributeError) as exc:
        raise ProviderError(f"unexpected AI reply: {redact(str(data), secret)[:200]}") from exc
    content = message.get("content")
    if isinstance(content, list):  # some providers return a list of parts
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return (content or "").strip() if isinstance(content, str) else ""


async def chat(
    messages: list[dict],
    *,
    max_tokens: int = 2000,
    timeout: float = 90,
    reasoning: str | None = None,
    target: Endpoint | None = None,
) -> str:
    """One chat completion. reasoning="none" asks for no thinking: faster for simple jobs.

    Some models spend part of max_tokens on thinking, so callers keep it generous.
    """
    ep = target or endpoint()
    if not ep.base_url or not ep.model:
        raise ProviderError("No AI provider is set up. Open Settings to connect one.")
    images = _has_images(messages)
    if images and not ep.vision:
        raise VisionUnsupported(f"The AI model {ep.model} cannot read photos.")
    body: dict = {"model": ep.model, "messages": messages, ep.token_field: min(max_tokens, ep.token_cap or max_tokens)}
    effort = ep.effort.get(reasoning, reasoning) if reasoning else None
    if effort:
        body["reasoning_effort"] = effort
    async with httpx.AsyncClient(timeout=timeout * settings.llm_timeout) as client:
        for attempt in range(5):
            try:
                resp = await client.post(f"{ep.base_url}/chat/completions", headers=ep.headers(), json=body)
            except httpx.ConnectError as exc:
                if attempt == 0:
                    await asyncio.sleep(1.5)
                    continue
                raise ProviderError(f"Cannot reach the AI provider at {ep.base_url}. Is it running?") from exc
            except httpx.TimeoutException as exc:
                raise ProviderError(f"The AI provider did not answer within {timeout * settings.llm_timeout:.0f} s.") from exc
            if resp.status_code < 400:
                break
            text = error_text(resp, ep.api_key)
            if resp.status_code in (400, 404, 415, 422) and ep.adapt(body, resp.status_code, text, images):
                continue
            if (resp.status_code == 429 or resp.status_code >= 500) and attempt == 0:
                await asyncio.sleep(2)
                continue
            raise ProviderError(f"The AI provider answered HTTP {resp.status_code}: {text}")
        else:
            raise ProviderError("The AI provider kept rejecting the request.")
    try:
        data = resp.json()
    except ValueError as exc:
        raise ProviderError(f"The AI provider did not answer with JSON: {redact(resp.text[:200], ep.api_key)}") from exc
    return _content(data, ep.api_key)


def parse_json(text: str) -> dict:
    """The first JSON object in a model reply, also inside code fences or after prose.

    Titles and notes often contain brackets, so a regex is not enough.
    """
    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", text):
        try:
            data, _ = decoder.raw_decode(text, match.start())
        except ValueError:
            continue
        if isinstance(data, dict):
            return data
    raise ValueError(f"no JSON object in model reply: {text[:200]!r}")


async def list_models(target: Endpoint) -> list[str]:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{target.base_url}/models", headers=target.headers())
    if resp.status_code >= 400:
        raise ProviderError(f"HTTP {resp.status_code}: {error_text(resp, target.api_key)}")
    data = resp.json()
    rows = (data.get("data") or data.get("models") or []) if isinstance(data, dict) else data
    ids = []
    for row in rows if isinstance(rows, list) else []:
        mid = (row.get("id") or row.get("name")) if isinstance(row, dict) else row
        if isinstance(mid, str) and mid:
            ids.append(mid.removeprefix("models/"))
    return sorted(set(ids))[:500]


def _test_photo() -> bytes:
    from PIL import Image

    img = Image.new("RGB", (96, 96), (220, 30, 30))
    img.paste((30, 60, 220), (48, 0, 96, 96))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=90)
    return out.getvalue()


async def test_connection(base_url: str, api_key: str, model: str) -> dict:
    """Check a provider before it is saved: model list, a JSON answer, and photo reading."""
    target = Endpoint(base_url, api_key, model)
    result: dict = {"models": [], "models_error": None, "chat": {"ok": False}, "vision": {"ok": False}}
    try:
        result["models"] = await list_models(target)
    except Exception as exc:  # noqa: BLE001 - not every provider lists models
        result["models_error"] = str(exc) if isinstance(exc, ProviderError) else "This provider does not list its models."
    if not model:
        result["chat"] = {"ok": False, "error": "Pick a model."}
        return result
    started = time.monotonic()
    try:
        reply = await chat(
            [{"role": "user", "content": 'Reply with JSON only: {"ok": true, "zh": "<the Chinese word for hoodie>"}'}],
            max_tokens=1500, timeout=60, reasoning="none", target=target,
        )
        data = parse_json(reply)
        ok = isinstance(data, dict) and data.get("ok") is True
        result["chat"] = {"ok": ok, "ms": round((time.monotonic() - started) * 1000), "sample": str(data.get("zh", ""))[:20] if ok else ""}
        if not ok:
            result["chat"]["error"] = "The model did not answer with the JSON it was asked for."
    except Exception as exc:  # noqa: BLE001
        result["chat"] = {"ok": False, "error": _message(exc, api_key)}
        return result
    try:
        content = [
            {"type": "image_url", "image_url": {"url": data_url(_test_photo())}},
            {"type": "text", "text": 'What color is the left half of this image? Reply with JSON only: {"color": "<one word>"}'},
        ]
        reply = await chat([{"role": "user", "content": content}], max_tokens=1500, timeout=60, reasoning="none", target=target)
        color = str(parse_json(reply).get("color", "")).lower()
        # A wrong color means the photo never reached the model (some servers drop images).
        result["vision"] = {"ok": True} if "red" in color else {"ok": False, "unsupported": True, "error": f'The model saw "{color}", not red.'}
    except Exception as exc:  # noqa: BLE001 - a timeout or rate limit says nothing about photo support
        result["vision"] = {"ok": False, "unsupported": isinstance(exc, VisionUnsupported), "error": _message(exc, api_key)}
    return result


def _message(exc: Exception, secret: str = "") -> str:
    if isinstance(exc, ProviderError):
        return redact(str(exc), secret)
    if isinstance(exc, ValueError):
        return "The model did not answer with JSON."
    return redact(f"{type(exc).__name__}: {exc}", secret)[:300]


def data_url(jpeg: bytes) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()


MODE_RULES = {
    "exact": "Find this exact product. Keep brand and model words.",
    "similar": (
        "Find items of this kind and look from any seller. Describe the look with category, color, "
        "fit, material and style words. Use brand words only when the user picked a brand."
    ),
    "alternatives": (
        "Find the same look for less: unbranded or cheaper items. Do not put brand names, logos or "
        "model names in the queries. Describe the look (category, color, material, fit, details) the "
        "way sellers do. You may add 平替 to one Chinese query."
    ),
}


def _strings(value, limit: int) -> list[str]:
    return [v.strip() for v in value if isinstance(v, str) and v.strip()][:limit] if isinstance(value, list) else []


async def expand_query(query: str, mode: str = "exact", options_text: str = "", profile_text: str = "") -> dict:
    """Turn the item name and options into the search terms Chinese sellers use.

    Returns {"zh", "en", "codes", "category", "summary", "avoid", "size_tip"}.
    Falls back to the raw query when the AI is unavailable.
    """
    fallback = {"zh": [], "en": [query] if query else [], "codes": [], "category": "", "summary": "", "avoid": [], "size_tip": ""}
    if not settings.llm_enabled:
        return fallback
    prompt = f"""You help search Taobao, Tmall, 1688, Weidian and Yupoo for clothing and other products.
Search mode: {MODE_RULES.get(mode, MODE_RULES["exact"])}
What the user typed: "{query}"
Options the user picked:
{options_text or "(none)"}
User profile: {profile_text or "(none)"}

Return JSON only, with these keys:
- "zh": 2-4 short Chinese search queries as sellers write listing titles. Put the important options (category, color, fit, material, style) in seller words. Keep words that sellers write in Latin letters (for example "Dunk", "AJ1"), and add a common Chinese nickname if there is one.
- "en": 1-2 short English/Latin queries. The first one must work as a Google Images query that shows the item.
- "codes": official style/article codes, only in exact mode and only if you are confident (for example "DD1391-100"; add the women's and kids' codes of the same colorway when they differ). Else [].
- "category": one or two English words for the product type (for example "sneakers", "hoodie").
- "summary": one line, at most 14 words, saying what will be searched (include the key options).
- "avoid": 0-5 short words (Chinese or English) that mark a wrong listing, for example "童装" for adult clothes, the other gender, or a wrong category.
- "size_tip": one short sentence of size advice for Chinese sizing (often 1-2 sizes smaller than US/EU), based on the profile and the size option. "" when there is no size information.
Keep every query under 30 characters."""
    try:
        reply = await chat([{"role": "user", "content": prompt}], max_tokens=1800)
        out = parse_json(reply)
        en = _strings(out.get("en"), 2) or fallback["en"]
        return {
            "zh": _strings(out.get("zh"), 4),
            "en": en,
            "codes": _strings(out.get("codes"), 4) if mode == "exact" else [],
            "category": str(out.get("category", "")),
            "summary": str(out.get("summary", ""))[:140],
            "avoid": _strings(out.get("avoid"), 5),
            "size_tip": str(out.get("size_tip", ""))[:200],
        }
    except Exception as exc:  # noqa: BLE001 - AI is optional; search continues
        log.warning("query expansion failed: %s", exc)
        return fallback


async def identify_product(jpeg: bytes) -> str:
    """Name the product in a photo, for photo-only searches."""
    if not vision_enabled():
        return ""
    content = [
        {"type": "image_url", "image_url": {"url": data_url(jpeg)}},
        {
            "type": "text",
            "text": (
                "Name this exact product the way a shopper would search for it: brand, model and "
                'colorway or nickname, for example "Nike Dunk Low Panda". Reply with JSON only: '
                '{"name": "..."}. Use an empty string if there is no clear product.'
            ),
        },
    ]
    try:
        name = parse_json(await chat([{"role": "user", "content": content}], max_tokens=1500)).get("name")
        return name.strip()[:80] if isinstance(name, str) else ""
    except Exception as exc:  # noqa: BLE001
        log.warning("identify failed: %s", exc)
        return ""


async def filter_references(query: str, jpegs: list[bytes], mode: str = "exact") -> list[bool] | None:
    """Mark which web search photos show exactly the product the user typed.

    Returns None when the AI is unavailable, so the caller keeps its own choice.
    """
    if not vision_enabled() or not jpegs:
        return None
    content: list[dict] = []
    for idx, jpeg in enumerate(jpegs):
        content.append({"type": "text", "text": f"Photo {idx}:"})
        content.append({"type": "image_url", "image_url": {"url": data_url(jpeg)}})
    content.append(
        {
            "type": "text",
            "text": (
                f'These are web image search results for "{query}". For each photo, say if it clearly '
                + (
                    "shows exactly that product (same model and same colorway/version) as the main subject. "
                    "Say no for other colorways or versions, "
                    if mode == "exact"
                    else "shows one item of that kind and look as the main subject. Say no for other kinds of items, "
                )
                + "collages, size charts, logos, and photos where the item is small or hidden. "
                'Reply with JSON only: {"keep": [true, false, ...]} with '
                f"{len(jpegs)} booleans in photo order."
            ),
        }
    )
    try:
        out = parse_json(await chat([{"role": "user", "content": content}], max_tokens=3000, timeout=120))
        raw = out.get("keep")
        # Only a real true (or "true") keeps a photo; "false" as a string must not.
        keep = [x is True or (isinstance(x, str) and x.strip().lower() == "true") for x in raw] if isinstance(raw, list) else []
    except Exception as exc:  # noqa: BLE001
        log.warning("reference filter failed: %s", exc)
        return None
    return keep if len(keep) == len(jpegs) else None


async def verify_matches(
    query: str, reference_jpegs: list[bytes], candidates: list[tuple[str, bytes, str]], mode: str = "exact"
) -> dict[str, dict]:
    """Ask the vision model whether each candidate is the same product.

    candidates: (listing_id, jpeg, title). Returns {listing_id: {"verdict", "note"}}
    where verdict is "same", "variant" or "different".
    """
    if not vision_enabled() or not candidates:
        return {}
    content: list[dict] = [
        {
            "type": "text",
            "text": (
                (f'The user wants this exact product: "{query}". ' if mode == "exact" else f'The user wants items with this look: "{query}". ')
                + f"The first {len(reference_jpegs)} image(s) are reference photos of it."
            ),
        }
    ]
    for jpeg in reference_jpegs:
        content.append({"type": "image_url", "image_url": {"url": data_url(jpeg)}})
    content.append(
        {
            "type": "text",
            "text": "Next are marketplace listing photos. Each one comes after its label.",
        }
    )
    for idx, (_, jpeg, title) in enumerate(candidates):
        content.append({"type": "text", "text": f"Candidate {idx}: {title[:80]}"})
        content.append({"type": "image_url", "image_url": {"url": data_url(jpeg)}})
    content.append(
        {
            "type": "text",
            "text": (
                (
                    "For each candidate, decide if it is the same product as the reference: same model "
                    "AND same colorway/design. "
                    if mode == "exact"
                    else "For each candidate, decide if it has the same look as the reference: same kind of "
                    "item, silhouette, color, material and key details. Brand, logos and labels do not matter. "
                )
                + "Ignore watermarks, backgrounds, angles and photo quality. "
                + (
                    'Also decide "branded": true when the candidate photo or title shows the brand of the '
                    "reference item (its logo, name, a nickname or a misspelling of the name), else false. "
                    if mode == "alternatives"
                    else ""
                )
                + 'Reply with JSON only: {"results": [{"i": 0, "verdict": "same"|"variant"|"different", '
                + ('"branded": true|false, ' if mode == "alternatives" else "")
                + '"note": "<max 8 words>"}]}. Use "variant" for '
                + ("the same model in a different colorway/version." if mode == "exact" else "a close look with one clear difference (color, length, fit, material).")
            ),
        }
    )
    try:
        reply = await chat([{"role": "user", "content": content}], max_tokens=4000, timeout=150)
        out = parse_json(reply)
    except Exception as exc:  # noqa: BLE001
        log.warning("verification failed: %s", exc)
        return {}
    results: dict[str, dict] = {}
    rows = out.get("results") if isinstance(out, dict) else None
    for row in rows if isinstance(rows, list) else []:
        index = row.get("i") if isinstance(row, dict) else None
        if type(index) is not int or not 0 <= index < len(candidates):  # bool is an int subclass
            continue
        listing_id = candidates[index][0]
        verdict = row.get("verdict")
        if verdict in ("same", "variant", "different"):
            results[listing_id] = {
                "verdict": verdict,
                "note": str(row.get("note", ""))[:80],
                "branded": row.get("branded") is True,
            }
    return results


async def locate_items(jpeg: bytes, categories: list[str], colors: list[str]) -> list[dict]:
    """Find each clothing item in an outfit photo.

    Returns [{"label", "category", "query", "colors", "box"}] where box is
    [x0, y0, x1, y1] as fractions of the photo. Raises when the AI fails.
    """
    content = [
        {"type": "image_url", "image_url": {"url": data_url(jpeg)}},
        {
            "type": "text",
            "text": (
                "List each clothing item, shoe, bag and accessory that is clearly visible in this outfit photo "
                "(at most 6, the most important first). For each item give:\n"
                '- "label": short description, at most 6 words, e.g. "Charcoal oversized hoodie"\n'
                f'- "category": one of: {", ".join(categories)}\n'
                '- "query": an English shopping search query that describes the item\'s look '
                "(color, material, fit, details; a brand only if a logo is clearly readable)\n"
                f'- "colors": 1-2 of: {", ".join(colors)}\n'
                '- "box": [x0, y0, x1, y1], the tight bounding box of the item as fractions 0..1 of the '
                "image width and height, measured from the top-left corner\n"
                'Reply with JSON only: {"items": [...]}'
            ),
        },
    ]
    out = parse_json(await chat([{"role": "user", "content": content}], max_tokens=3000, timeout=120))
    items = []
    for row in out.get("items", []) if isinstance(out, dict) else []:
        try:
            box = [float(v) for v in row["box"]][:4]
        except (KeyError, TypeError, ValueError):
            continue
        if not all(math.isfinite(v) for v in box):
            continue
        box = [min(max(v, 0.0), 1.0) for v in box]
        if len(box) != 4 or box[2] - box[0] < 0.03 or box[3] - box[1] < 0.03:
            continue
        items.append(
            {
                "label": str(row.get("label", ""))[:60],
                "category": str(row.get("category", "")),
                "query": str(row.get("query", ""))[:100],
                "colors": _strings(row.get("colors"), 2),
                "box": box,
            }
        )
    return items


async def suggest(request_text: str, profile_text: str, catalog_text: str, count: int) -> dict:
    """AI stylist: concrete items to search. Returns {"title", "items": [...]}; raises when the AI fails."""
    prompt = f"""You are a personal stylist who shops on Taobao, Tmall and 1688 for the user.
Request:
{request_text}
User profile: {profile_text or "(none)"}

Suggest exactly {count} concrete items to search for. They must work together and fit the request,
the profile (gender, sizes, budget, taste) and the season if given. Prefer a mix of categories.

Allowed ids (use only these):
{catalog_text}

Return JSON only:
{{"title": "<short title, at most 6 words>",
  "items": [{{"label": "<at most 6 words>", "why": "<one short sentence>",
             "query": "<English shopping search query describing the look>",
             "category": "<category id>", "colors": ["<color id>"], "materials": ["<material id>"],
             "fit": "<fit id or empty>", "brands": ["<brand id, only if a brand matters>"],
             "price_max": <CNY number or null>}}]}}"""
    out = parse_json(await chat([{"role": "user", "content": prompt}], max_tokens=4000, timeout=120))
    if not isinstance(out, dict) or not isinstance(out.get("items"), list):
        raise ValueError("the AI reply has no items")
    return out
