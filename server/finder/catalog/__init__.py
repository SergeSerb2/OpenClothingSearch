"""Static clothing data: categories, brands, styles, colors, fits, materials.

The JSON files sit next to this module. The AI uses the Chinese words in
them to write the search terms that sellers use.
"""

from __future__ import annotations

import json
import math
import re
from functools import cache
from pathlib import Path

HERE = Path(__file__).parent
KINDS = ("categories", "brands", "styles", "colors", "fits", "materials")


@cache
def load() -> dict[str, list[dict]]:
    out = {}
    for kind in KINDS:
        path = HERE / f"{kind}.json"
        out[kind] = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    return out


@cache
def index(kind: str) -> dict[str, dict]:
    return {row["id"]: row for row in load()[kind]}


def get(kind: str, item_id) -> dict | None:
    return index(kind).get(item_id) if isinstance(item_id, str) else None


def valid(kind: str, ids) -> list[str]:
    """Keep only ids that exist in the catalog, in order, without repeats."""
    table = index(kind)
    strings = [i for i in ids if isinstance(i, str)] if isinstance(ids, list) else []
    return [i for i in dict.fromkeys(strings) if i in table]


def _zh(row: dict) -> str:
    zh = row.get("zh")
    words = zh if isinstance(zh, list) else [zh] if zh else []
    return " / ".join(w for w in words if w)


def _label(kind: str, item_id: str) -> str:
    row = get(kind, item_id)
    if not row:
        return item_id
    zh = _zh(row)
    return f"{row['name']} ({zh})" if zh else row["name"]


def describe_options(options: dict) -> str:
    """The search options as plain lines for an AI prompt, with Chinese seller words."""
    lines = []
    if options.get("category"):
        lines.append(f"Category: {_label('categories', options['category'])}")
    if options.get("gender"):
        lines.append(f"Gender: {options['gender']}")
    if options.get("colors"):
        lines.append("Colors: " + ", ".join(_label("colors", c) for c in options["colors"]))
    if options.get("fit"):
        lines.append(f"Fit: {_label('fits', options['fit'])}")
    if options.get("materials"):
        lines.append("Materials: " + ", ".join(_label("materials", m) for m in options["materials"]))
    if options.get("season"):
        lines.append(f"Season: {options['season']}")
    if options.get("size"):
        lines.append(f"Size: {options['size']}")
    for brand_id in options.get("brands") or []:
        brand = get("brands", brand_id)
        if brand:
            lines.append(f"Brand: {brand['name']} (sellers write: {_zh(brand) or brand['name']})")
    for style_id in options.get("styles") or []:
        style = get("styles", style_id)
        if style:
            lines.append(f"Style: {style['name']} (sellers write: {_zh(style)}) - {style.get('description', '')}")
    low, high = options.get("price_min"), options.get("price_max")
    if low or high:
        lines.append(f"Price: {low or 0}-{high or 'any'} CNY")
    if options.get("official_only"):
        lines.append("Only official / flagship brand stores")
    if options.get("notes"):
        lines.append(f"Wishes: {options['notes']}")
    return "\n".join(lines)


def image_query(options: dict) -> str:
    """An English image-search query built from the options, for searches with no query."""
    parts = []
    for brand_id in options.get("brands") or []:
        brand = get("brands", brand_id)
        if brand:
            parts.append(brand["name"])
    for color_id in (options.get("colors") or [])[:1]:
        color = get("colors", color_id)
        if color:
            parts.append(color["name"].lower())
    category = get("categories", options.get("category"))
    if category:
        parts.append(category["name"].lower())
    elif not options.get("brands"):
        # The style is the subject when there is no category or brand ("black" alone finds nothing).
        style = next((s for s in (get("styles", i) for i in options.get("styles") or []) if s), None)
        if style:
            parts.append(style.get("image_query") or style["name"])
    return " ".join(parts)


MODES = ("exact", "similar", "alternatives")
SEASONS = ("spring", "summer", "autumn", "winter")


def clean_options(raw: dict | None) -> dict:
    """Validate SearchOptions from the client; drop unknown ids and empty values."""
    raw = raw if isinstance(raw, dict) else {}

    def number(key: str) -> float | None:
        try:
            value = float(raw.get(key))
        except (TypeError, ValueError):
            return None
        return value if math.isfinite(value) and 0 < value < 10_000_000 else None

    def text(key: str, limit: int) -> str:
        return str(raw.get(key) or "").strip()[:limit]

    options = {
        "mode": raw.get("mode") if raw.get("mode") in MODES else "exact",
        "category": raw.get("category") if get("categories", raw.get("category")) else None,
        "gender": raw.get("gender") if raw.get("gender") in ("men", "women", "unisex") else None,
        "colors": valid("colors", raw.get("colors")),
        "fit": raw.get("fit") if get("fits", raw.get("fit")) else None,
        "materials": valid("materials", raw.get("materials")),
        "season": raw.get("season") if raw.get("season") in SEASONS else None,
        "size": text("size", 20),
        "brands": valid("brands", raw.get("brands")),
        "styles": valid("styles", raw.get("styles")),
        "price_min": number("price_min"),
        "price_max": number("price_max"),
        "official_only": bool(raw.get("official_only")),
        "notes": text("notes", 300),
    }
    return {k: v for k, v in options.items() if v not in (None, "", [], False)}


def has_subject(options: dict) -> bool:
    """True when the options alone say what to search for (no query needed)."""
    return bool(options.get("category") or options.get("brands") or options.get("styles"))


# Title words that mark a copy of a branded product, not an alternative.
COPY_MARKERS = ["莆田", "顶版", "顶板", "高版本", "纯原", "原版", "复刻", "1:1", "1比1", "一比一", "原单", "公司级"]


def _norm(text: str) -> str:
    return "".join(ch for ch in text.lower() if ch.isalnum())


# Brand names that are also product words: "polo shirt" is not a Ralph Lauren search.
GENERIC_NAMES = {"polo"}


def _specific(name: str) -> bool:
    """Long enough to mean the brand: not "On" or "Lee"; "H&M" is fine thanks to the "&"."""
    if not name.isascii():
        return len(name) >= 2
    return name.lower() not in GENERIC_NAMES and (len(_norm(name)) >= 3 or not name.replace(" ", "").isalnum())


def brand_words(text: str, brand_ids: list[str] | None = None) -> list[str]:
    """Names sellers use for the brands in `text` or `brand_ids` (for "alternatives" mode)."""
    low = text.lower()

    def named(name: str) -> bool:
        if not _specific(name):
            return False
        if not name.isascii():
            return name.lower() in low  # Chinese names: 始祖鸟
        # Latin names stand alone: "lee" must not match "fleece".
        return re.search(rf"(?<![a-z]){re.escape(name.lower())}(?![a-z])", low) is not None

    words: list[str] = []
    for brand in load()["brands"]:
        names = [brand["name"], *brand.get("aliases", []), *brand.get("zh", [])]
        if brand["id"] in (brand_ids or []) or any(named(n) for n in names):
            words += [*brand.get("zh", []), brand["name"]]
    return list(dict.fromkeys(w for w in words if _specific(w)))
