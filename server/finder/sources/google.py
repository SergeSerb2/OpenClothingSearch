"""Google discovery through Serper (free 2,500 credits) or SerpAPI.

- Lens: reverse image search with each reference photo. Keeps only the
  visual matches that point at Taobao, Tmall, 1688, Weidian or Yupoo.
- site: search: finds indexed Yupoo albums and Weidian items by name.
"""

from __future__ import annotations

import asyncio
import logging
import re

import httpx

from ..config import settings
from ..models import Listing, SourceStatus
from . import links, weidian, yupoo
from .base import Emit, SearchContext, Task, blocked_task, string_field

log = logging.getLogger(__name__)


def _price(value) -> float | None:
    """A CNY price from a Google row; None for other or unknown currencies."""
    currency = ""
    if isinstance(value, dict):
        currency = str(value.get("currency") or "")
        if currency and currency.strip().upper() not in {"CNY", "RMB", "CN¥", "¥", "￥", "元", "人民币"}:
            return None
        value = value.get("extracted_value") or value.get("value")
    text = f"{currency} {value or ''}"
    if not re.search(r"[¥￥元]|CNY|RMB", text, re.I) or re.search(r"[$€£]|USD|CAD|EUR|GBP|JPY|JP¥", text, re.I):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"\d+(?:\.\d+)?", str(value or "").replace(",", ""))
    return float(match.group(0)) if match else None


def _provider_data(data) -> dict:
    if not isinstance(data, dict):
        raise RuntimeError("Google provider returned an invalid response")
    metadata = data.get("search_metadata")
    status_code = str(data.get("statusCode") or "")
    if (data.get("error") or data.get("errors") or data.get("success") is False
            or status_code.isdigit() and int(status_code) >= 400
            or str(data.get("status") or "").lower() in {"error", "failed"}
            or isinstance(metadata, dict) and str(metadata.get("status") or "").lower() in {"error", "failed"}):
        raise RuntimeError("Google provider reported a search error")
    return data


def _rows(data) -> list[dict]:
    """Collect result rows from any provider's JSON (shapes differ)."""
    rows: list[dict] = []
    data = _provider_data(data)
    for key in ("visual_matches", "visualMatches", "organic", "organic_results", "exact_matches", "images", "products"):
        value = data.get(key)
        if isinstance(value, list):
            rows += [r for r in value if isinstance(r, dict)]
    return rows


async def _listings_from_rows(rows: list[dict], method: str, via: str) -> list[Listing]:
    out: list[Listing] = []
    weidian_rows: list[Listing] = []
    yupoo_rows: list[Listing] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        url = string_field(row.get("link")) or string_field(row.get("url"))
        hit = links.classify(url)
        if not hit:
            continue
        source, native, canonical = hit
        image = next((value for key in ("thumbnail", "thumbnailUrl", "imageUrl", "image")
                      if (value := string_field(row.get(key), "url", "src"))), "")
        title = string_field(row.get("title"), "text", "title", "name")
        listing = Listing(
            source=source, native_id=native, url=canonical, title=title,
            image_url=image, price_cny=_price(row.get("price")) if source != "yupoo" else yupoo.title_price(title),
            shop=native.split("/")[0] if source == "yupoo" else None,
            found_by={method}, via={via},
        )
        if source == "weidian":
            weidian_rows.append(listing)
        elif source == "yupoo" and not image:
            yupoo_rows.append(listing)
        else:
            out.append(listing)
    # Weidian pages give the full price/title/photo; resolve them.
    async def enrich(listing: Listing) -> Listing:
        try:
            resolved = await weidian.fetch_item(listing.native_id)
        except Exception:  # noqa: BLE001 - keep the Google metadata if resolution fails
            resolved = None
        if resolved:
            listing.title = resolved.title or listing.title
            listing.image_url = resolved.image_url or listing.image_url
            listing.price_cny = resolved.price_cny if resolved.price_cny is not None else listing.price_cny
            listing.shop = resolved.shop or listing.shop
            listing.sales = resolved.sales or listing.sales
        return listing

    out += [r for r in await asyncio.gather(*(enrich(r) for r in weidian_rows)) if r.image_url]
    # Yupoo results from text search have no photo; read the album cover.
    async def cover(listing: Listing) -> Listing | None:
        try:
            photos, _ = await yupoo.fetch_album(listing)
        except Exception:  # noqa: BLE001
            return None
        if not photos:
            return None
        listing.image_url = photos[0]
        return listing

    out += [r for r in await asyncio.gather(*(cover(r) for r in yupoo_rows[:12])) if r]
    return out


# ---------- providers ----------

async def serper(path: str, payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=40) as client:
        resp = await client.post(
            f"https://google.serper.dev/{path}", json=payload, headers={"X-API-KEY": settings.serper_key}
        )
        resp.raise_for_status()
        return _provider_data(resp.json())


async def serpapi(params: dict) -> dict:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get("https://serpapi.com/search.json", params={**params, "api_key": settings.serpapi_key})
        resp.raise_for_status()
        return _provider_data(resp.json())


def providers() -> list[str]:
    """Serper first (larger free plan), SerpAPI as the backup."""
    return [name for name, key in (("serper", settings.serper_key), ("serpapi", settings.serpapi_key)) if key]


def lens_provider() -> str | None:
    return next(iter(providers()), None)


async def _first(calls: dict) -> tuple[list[dict], str]:
    """Run the call for each configured provider in order; return the first that works."""
    last: Exception = RuntimeError("no Google provider configured")
    for provider in providers():
        try:
            return await calls[provider](), provider
        except Exception as exc:  # noqa: BLE001 - try the backup provider
            log.warning("google via %s failed (%s)", provider, type(exc).__name__)
            last = RuntimeError(f"Google search via {provider} failed ({type(exc).__name__})")
    raise last


async def lens(image_url: str, query: str = "") -> tuple[list[dict], str]:
    async def via_serper() -> list[dict]:
        return _rows(await serper("lens", {"url": image_url}))

    async def via_serpapi() -> list[dict]:
        params = {"engine": "google_lens", "url": image_url, "type": "visual_matches", "hl": "en"}
        if query:
            params["q"] = query
        return _rows(await serpapi(params))

    return await _first({"serper": via_serper, "serpapi": via_serpapi})


async def web_search(query: str) -> tuple[list[dict], str]:
    async def via_serper() -> list[dict]:
        return _rows(await serper("search", {"q": query}))  # free plan: 10 results, no "num"

    async def via_serpapi() -> list[dict]:
        data = await serpapi({"engine": "google", "q": query, "num": 20})
        return _rows(data)

    return await _first({"serper": via_serper, "serpapi": via_serpapi})


# ---------- tasks ----------

async def _lens_run(ctx: SearchContext, emit: Emit, status: SourceStatus | None = None) -> None:
    refs = [r for r in ctx.refs if r.url.startswith(("http://", "https://"))][:2]
    if not refs:
        raise RuntimeError("Lens needs a reference photo with a public URL (uploads are not public)")
    results = await asyncio.gather(*(lens(r.url, ctx.query) for r in refs), return_exceptions=True)
    errors = [r for r in results if isinstance(r, Exception)]
    used = sorted({r[1] for r in results if not isinstance(r, Exception)})
    if status and used:
        status.message = f"Google Lens via {', '.join(used)}"
    for result in results:
        if not isinstance(result, Exception):
            rows, provider = result
            await emit(await _listings_from_rows(rows, "lens", provider))
    if len(errors) == len(results):
        raise errors[0]


async def _site_run(ctx: SearchContext, emit: Emit, status: SourceStatus | None = None) -> None:
    terms = ctx.latin_queries[:2]
    queries = [f"site:x.yupoo.com {t}" for t in terms] if "yupoo" in ctx.wanted else []
    queries += [f"site:weidian.com {t}" for t in terms[:1]] if "weidian" in ctx.wanted else []
    if not queries:
        return
    results = await asyncio.gather(*(web_search(q) for q in queries), return_exceptions=True)
    if all(isinstance(r, Exception) for r in results):
        raise results[0]  # type: ignore[misc]
    used = sorted({r[1] for r in results if not isinstance(r, Exception)})
    if status:
        status.message = f"Google site search via {', '.join(used)}"
    for result in results:
        if not isinstance(result, Exception):
            rows, provider = result
            await emit(await _listings_from_rows(rows, "text", provider))


def tasks(ctx: SearchContext) -> list[Task]:
    provider = lens_provider()
    if provider is None:
        msg = "Add a free Serper key in Settings to use Google Lens and site search"
        return [
            blocked_task("google", "lens", "serper", "needs_key", msg),
        ]
    # Keep the status identity stable when individual queries use the backup.
    provider = provider if len(providers()) == 1 else "google"
    lens_status = SourceStatus(source="google", method="lens", provider=provider)
    text_status = SourceStatus(source="google", method="text", provider=provider, message="Yupoo and Weidian pages indexed by Google")

    async def run_lens(ctx: SearchContext, emit: Emit) -> None:
        await _lens_run(ctx, emit, lens_status)

    async def run_text(ctx: SearchContext, emit: Emit) -> None:
        await _site_run(ctx, emit, text_status)

    text_task = Task(text_status, run_text) if ctx.latin_queries else blocked_task(
        "google", "text", provider, "skipped", "No product name is available for text search"
    )
    return [Task(lens_status, run_lens), text_task]
