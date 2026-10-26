"""Yupoo seller galleries.

Yupoo has no global search, so the tool searches inside a list of seller
galleries (data/yupoo_stores.json). Album pages often hold the seller's
Weidian or Taobao link, which the ranking step follows for the best albums.
"""

from __future__ import annotations

import asyncio
import html
import json
import logging
import re
from urllib.parse import unquote, urljoin

from selectolax.lexbor import LexborHTMLParser as HTMLParser

from .. import images
from ..config import DATA_DIR
from ..models import Listing, SourceStatus
from .base import Emit, SearchContext, Task, blocked_task

log = logging.getLogger(__name__)
STORES_FILE = DATA_DIR / "yupoo_stores.json"

# The app ships with no stores. Users add the stores they want in Settings; with a
# Serper or SerpAPI key, Google also finds albums in stores that are not in the list.
DEFAULT_STORES: list[str] = []
_STORE_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
_sem = asyncio.Semaphore(6)


def normalize_store(value: str) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip().lower()
    match = re.search(r"([a-z0-9-]+)\.x\.yupoo\.com", value) or re.search(r"x\.yupoo\.com/photos/([a-z0-9-]+)", value)
    if match:
        value = match.group(1)
    return value if _STORE_RE.match(value) else None


def load_stores() -> list[str]:
    try:
        stores = json.loads(STORES_FILE.read_text())
        if isinstance(stores, list):
            return list(dict.fromkeys(n for n in (normalize_store(s) for s in stores if isinstance(s, str)) if n))
    except (OSError, UnicodeError, json.JSONDecodeError):
        pass
    return list(dict.fromkeys(DEFAULT_STORES))


def save_stores(stores: list[str]) -> list[str]:
    clean = list(dict.fromkeys(s for s in (normalize_store(x) for x in stores) if s))
    STORES_FILE.write_text(json.dumps(clean, indent=1))
    return clean


def _headers(store: str) -> dict:
    return {"Referer": f"https://{store}.x.yupoo.com/", "Accept": "text/html"}


# Sellers put the price in album titles: "【110Y】", "[240Y]", "￥260", "($67=470CNY)", "260元",
# or a bare number in brackets at the start: "【480】416635 SALOMON XT-6".
PRICE_RES = (
    re.compile(r"[￥¥]\s*(\d+(?:\.\d+)?)(?![\d.])"),
    re.compile(r"[【\[(（]\s*(\d+(?:\.\d+)?)\s*[Yy元]\s*[】\])）]"),
    re.compile(r"(?<![\d.])(\d+(?:\.\d+)?)\s*(?:CNY\b|RMB\b|元)", re.I),
    re.compile(r"^\s*[【\[]\s*(\d{2,4})\s*[】\]]"),
)


def title_price(title: str) -> float | None:
    for pattern in PRICE_RES:
        match = pattern.search(title)
        if match and 0 < float(match.group(1)) <= 20000:
            return float(match.group(1))
    return None


def parse_search(store: str, text: str, page_url: str | None = None) -> list[Listing]:
    out = []
    for node in HTMLParser(text).css("a.album__main"):
        href = node.attributes.get("href") or ""
        match = re.search(r"/albums/(\d+)", href)
        img = node.css_first("img.album__img")
        if not match or img is None:
            continue
        cover = images.normalize_url(img.attributes.get("data-origin-src") or img.attributes.get("src") or "")
        if not cover:
            continue
        cover = urljoin(page_url or f"https://{store}.x.yupoo.com/search/album", cover)
        cover = re.sub(r"/(small|square)\.(jpg|jpeg|png|webp)$", r"/medium.\2", cover)
        album_id = match.group(1)
        title = html.unescape(node.attributes.get("title") or "")
        out.append(
            Listing(
                source="yupoo",
                native_id=f"{store}/{album_id}",
                url=f"https://{store}.x.yupoo.com/albums/{album_id}?uid=1",
                title=title,
                image_url=cover,
                price_cny=title_price(title),
                shop=store,
                found_by={"store"},
                via={"store-index"},
            )
        )
    return out


async def search_store(store: str, query: str, limit: int = 24) -> list[Listing]:
    async with _sem:
        resp = await images.client().get(
            f"https://{store}.x.yupoo.com/search/album",
            params={"q": query, "uid": "1", "sort": ""},
            headers=_headers(store),
        )
    if resp.status_code != 200:
        raise RuntimeError(f"{store}: HTTP {resp.status_code}")
    return parse_search(store, resp.text, str(resp.url))[:limit]


async def _run(ctx: SearchContext, emit: Emit) -> None:
    stores = load_stores()
    queries = ctx.latin_queries[:2]
    failures = 0

    async def one(store: str, query: str) -> None:
        nonlocal failures
        try:
            found = await search_store(store, query)
        except Exception as exc:  # noqa: BLE001
            failures += 1
            log.debug("yupoo %s failed: %s", store, exc)
            return
        for item in found:
            item.found_by.add("text")
        await emit(found)

    await asyncio.gather(*(one(s, q) for s in stores for q in queries))
    if failures and failures == len(stores) * len(queries):
        raise RuntimeError("every Yupoo store failed to load")


def tasks(ctx: SearchContext) -> list[Task]:
    stores = load_stores()
    if not stores:
        return [blocked_task("yupoo", "store", "store-index", "skipped", "Add Yupoo stores in Settings")]
    return [
        Task(
            SourceStatus(
                source="yupoo", method="store", provider="store-index",
                message=f"Searching {len(stores)} seller galleries",
            ),
            _run,
        )
    ]


# ---------- album pages ----------

_LINK_RE = re.compile(
    r"https?://(?:[a-z0-9-]+\.)*(?:weidian\.com|taobao\.com|tmall\.com|1688\.com)/[^\s\"'<>\\]+",
    re.I,
)


def extract_links(text: str) -> list[str]:
    text = html.unescape(text)
    # Yupoo wraps outbound links as /external?url=<double-encoded>.
    for enc in re.findall(r"external\?url=([^\"'&\s<>]+)", text):
        text += " " + unquote(unquote(enc))
    links = []
    for link in _LINK_RE.findall(text):
        link = link.rstrip(".,;)】")
        links.append(link)
    return list(dict.fromkeys(links))


async def fetch_album(listing: Listing) -> tuple[list[str], list[str]]:
    """Return (photo URLs, outbound marketplace links) for a Yupoo album."""
    store = listing.shop or listing.native_id.split("/")[0]
    async with _sem:
        resp = await images.client().get(listing.url, headers=_headers(store))
    if resp.status_code != 200:
        return [], []
    tree = HTMLParser(resp.text)
    photos = []
    for img in tree.css("img[data-origin-src]"):
        src = images.normalize_url(img.attributes.get("data-origin-src") or "")
        if src and "photo.yupoo.com" in src:
            photos.append(src)
    header = tree.css_first(".showalbumheader__main") or tree.body
    return list(dict.fromkeys(photos))[:8], extract_links(header.html if header else resp.text)
