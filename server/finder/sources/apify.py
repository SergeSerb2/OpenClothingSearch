"""1688 photo search through an Apify actor (paid, needs APIFY_TOKEN).

Actor: crawleast/1688-image-search-scraper. It runs with limited permissions
(it cannot touch the rest of the Apify account) and costs about $0.015 per run
(a $0.01 run fee plus $0.005 per photo). Apify's free plan gives $5 a month.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import math

import httpx

from .. import images
from ..config import settings
from ..models import Listing, SourceStatus
from . import links
from .base import Emit, SearchContext, Task

log = logging.getLogger(__name__)
ACTOR = "crawleast~1688-image-search-scraper"
MAX_CHARGE_USD = 0.05  # hard cap per run, set in the actor input


def parse_result(row: dict) -> Listing | None:
    if not isinstance(row, dict):
        return None
    offer = str(row.get("offerId") or "")
    image = row.get("imageUrl")
    if not offer.isdigit() or not isinstance(image, str) or not image.strip():
        return None
    supplier = row.get("supplier") if isinstance(row.get("supplier"), dict) else {}
    booked = row.get("bookedCount")
    try:
        price = float(row.get("priceYuan"))
    except (TypeError, ValueError):
        price = 0
    shop = supplier.get("name")
    return Listing(
        source="1688",
        native_id=offer,
        url=links.url_1688(offer),
        title=str(row.get("title") or ""),
        image_url=images.normalize_url(image),
        price_cny=price if math.isfinite(price) and price > 0 else None,
        shop=shop if isinstance(shop, str) else None,
        sales=f"{booked} sold" if booked else None,
        found_by={"image"},
        via={"apify"},
    )


async def photo_search(jpegs: list[bytes], per_photo: int = 20) -> list[Listing]:
    payload = {
        "imagesBase64": [{"base64": base64.b64encode(j).decode(), "fileName": f"item{i}.jpg"} for i, j in enumerate(jpegs[:3])],
        "maxImages": min(len(jpegs), 3),
        "maxResultsPerImage": per_photo,
        "enrichDetails": False,
        "maxTotalChargeUsd": MAX_CHARGE_USD,
    }
    async with asyncio.timeout(110), httpx.AsyncClient(timeout=110) as client:
        resp = await client.post(
            f"https://api.apify.com/v2/acts/{ACTOR}/run-sync-get-dataset-items",
            params={"timeout": 100},
            headers={"Authorization": f"Bearer {settings.apify_token}"},  # never in the URL
            json=payload,
        )
        resp.raise_for_status()
        rows = resp.json()
    out = []
    errors = 0
    succeeded = 0
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        if row.get("error"):
            errors += 1
            log.info("1688 photo search: image-search record failed")
        else:
            succeeded += 1
        results = row.get("results")
        for result in results if isinstance(results, list) else []:
            listing = parse_result(result) if isinstance(result, dict) else None
            if listing:
                out.append(listing)
    if errors and not succeeded and not out:
        raise RuntimeError("1688 photo search failed for every reference image")
    return out


async def _run(ctx: SearchContext, emit: Emit) -> None:
    jpegs = [j for j in (images.read(r.key) for r in ctx.image_refs(2)) if j]
    if not jpegs:
        raise RuntimeError("no reference photo")
    await emit(await photo_search(jpegs))


def tasks(ctx: SearchContext, wanted: set[str]) -> list[Task]:
    """1688 photo search, when a token is set and 1688 is wanted."""
    if not settings.apify_token or "1688" not in wanted:
        return []
    return [Task(SourceStatus(source="1688", method="image", provider="apify"), _run)]
