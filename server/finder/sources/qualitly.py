"""Qualit.ly: a community index of Weidian/Taobao/1688 listings with QC photos.

Free plan: 1,000 calls a month, 5 results a search. It covers listings the
community has bought, not whole catalogs.
"""

from __future__ import annotations

import asyncio
import logging
import re

import httpx

from ..config import settings
from ..models import Listing, SourceStatus
from . import links, weidian
from .base import Emit, SearchContext, Task, blocked_task, string_field

log = logging.getLogger(__name__)
API = "https://backend.qualit.ly/api/v1"
SOURCE_OF = {"weidian": "weidian", "taobao": "taobao", "1688": "1688"}


def _price(value) -> float | None:
    match = re.search(r"\d+(?:\.\d+)?", str(value or "").replace(",", ""))
    return float(match.group(0)) if match else None


async def search(query: str, storefront: str | None = None) -> list[Listing]:
    params = {"q": query}
    if storefront:
        params["storefront"] = storefront
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            f"{API}/products/search", params=params, headers={"Authorization": f"Bearer {settings.qualitly_key}"}
        )
        resp.raise_for_status()
        rows = resp.json().get("data") or []
    out = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        source = SOURCE_OF.get(string_field(row.get("storefront")))
        native = row.get("listing_id")
        image = string_field(row.get("pic_url"), "url", "src")
        if not source or not isinstance(native, (str, int)) or isinstance(native, bool) or not str(native).isdigit() or not image:
            continue
        native = str(native)
        url = string_field(row.get("product_url"))
        if not url:
            url = {"taobao": links.taobao_url, "1688": links.url_1688, "weidian": weidian.item_url}[source](native)
        out.append(
            Listing(
                source=source,
                native_id=native,
                url=url,
                title=string_field(row.get("name"), "text", "title", "name"),
                image_url=image,
                price_cny=_price(row.get("price")),
                sales=f"{row['qc_count']} QC photos" if row.get("qc_count") else None,
                found_by={"text"},
                via={"qualitly"},
            )
        )
    return out


async def _run(ctx: SearchContext, emit: Emit) -> None:
    # Index names are mostly English, so use the Latin queries.
    queries = ctx.latin_queries[:3]
    if not queries:
        return
    storefronts = ctx.wanted & set(SOURCE_OF)
    storefront = next(iter(storefronts)) if len(storefronts) == 1 else None
    results = await asyncio.gather(*(search(q, storefront=storefront) for q in queries), return_exceptions=True)
    errors = [r for r in results if isinstance(r, Exception)]
    for result in results:
        if not isinstance(result, Exception):
            await emit(result)
    if len(errors) == len(results):
        raise errors[0]


def tasks(ctx: SearchContext) -> list[Task]:
    if not ctx.latin_queries:
        return [blocked_task("weidian", "text", "qualitly", "skipped", "No product name is available for text search")]
    if not settings.qualitly_key:
        return [blocked_task("weidian", "text", "qualitly", "needs_key", "Add a free Qualit.ly key in Settings to search its index")]
    return [Task(SourceStatus(source="weidian", method="text", provider="qualitly"), _run)]
