"""Weidian items.

Weidian has no public catalog search. Weidian listings come from links in
Yupoo albums, Google (Serper) and Lens results, and the Qualit.ly index.
Item pages load without login, so each found link is resolved to a full
listing here.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import re
from urllib.parse import parse_qs, urlparse

from selectolax.lexbor import LexborHTMLParser as HTMLParser

from .. import images
from ..models import Listing

log = logging.getLogger(__name__)
_sem = asyncio.Semaphore(6)


def item_id(url: str) -> str | None:
    if not isinstance(url, str):
        return None
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not (host == "weidian.com" or host.endswith(".weidian.com")):
        return None
    if parsed.path.lower() in {"/item.html", "/fastorder.html"}:
        query = {key.lower(): value for key, value in parse_qs(parsed.query).items()}
        native = (query.get("itemid") or [""])[0]
        return native if re.fullmatch(r"\d{6,}", native) else None
    match = re.fullmatch(r"/i/(\d{6,})/?", parsed.path, re.I)
    return match.group(1) if match else None


def item_url(native_id: str) -> str:
    return f"https://weidian.com/item.html?itemID={native_id}"


def _parse(native_id: str, text: str) -> Listing | None:
    node = HTMLParser(text).css_first("#__rocker-render-inject__")
    if node is None or not node.attributes.get("data-obj"):
        return None
    data = json.loads(node.attributes["data-obj"])
    model = (data.get("result") or {}).get("default_model") or {}
    item = model.get("item_info") or {}
    shop = model.get("shop_info") or {}
    pics = [images.normalize_url(p) for p in item.get("imgs") or [] if isinstance(p, str)]
    head = item.get("item_head") or (pics[0] if pics else "")
    if not isinstance(head, str) or not head.strip():
        return None
    try:
        price = float(item.get("itemLowPrice"))
    except (TypeError, ValueError):
        price = 0
    title = item.get("item_name")
    shop_name = shop.get("shopName")
    return Listing(
        source="weidian",
        native_id=native_id,
        url=item_url(native_id),
        title=title if isinstance(title, str) else "",
        image_url=images.normalize_url(head),
        price_cny=round(price / 100, 2) if math.isfinite(price) and price > 0 else None,
        shop=shop_name if isinstance(shop_name, str) else None,
        sales=None,
    )


async def fetch_item(native_id: str) -> Listing | None:
    async with _sem:
        try:
            resp = await images.client().get(item_url(native_id), headers={"Accept": "text/html"})
        except Exception as exc:  # noqa: BLE001
            log.debug("weidian %s failed: %s", native_id, exc)
            return None
    if resp.status_code != 200:
        return None
    try:
        return _parse(native_id, resp.text)
    except (json.JSONDecodeError, TypeError, AttributeError) as exc:
        log.debug("weidian %s parse failed: %s", native_id, exc)
        return None


async def resolve_links(links: list[str], found_by: str, via: str, fallback_image: str = "", fallback_title: str = "") -> list[Listing]:
    ids = list(dict.fromkeys(i for i in (item_id(link) for link in links) if i))
    results = await asyncio.gather(*(fetch_item(i) for i in ids))
    out = []
    for native_id, listing in zip(ids, results):
        if listing is None:
            if not fallback_image:
                continue
            listing = Listing(source="weidian", native_id=native_id, url=item_url(native_id), title=fallback_title, image_url=fallback_image)
        listing.found_by.add(found_by)
        listing.via.add(via)
        out.append(listing)
    return out
