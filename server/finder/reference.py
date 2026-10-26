"""Find reference photos of the item from web image search.

Order of providers: Google Images through Serper, then SerpAPI (if a key is
set), Google in the shared browser (only works in a visible browser or a
logged-in profile), then Bing (free, works without a browser).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import AsyncIterator
from urllib.parse import quote_plus

import httpx
import numpy as np
from selectolax.lexbor import LexborHTMLParser as HTMLParser

from . import embed, images
from .browser import browser
from .config import settings
from .models import RefImage
from .secrets import safe_error

log = logging.getLogger(__name__)


async def _bing(query: str, limit: int) -> list[dict]:
    url = (
        "https://www.bing.com/images/async?q="
        f"{quote_plus(query)}&first=0&count=35&mmasync=1&setlang=en&qft=+filterui:photo-photo"
    )
    resp = await images.client().get(url, headers={"Accept": "text/html"})
    resp.raise_for_status()
    out = []
    for node in HTMLParser(resp.text).css("a.iusc"):
        try:
            meta = json.loads(node.attributes.get("m") or "{}")
        except json.JSONDecodeError:
            continue
        if meta.get("murl"):
            out.append(
                {"url": meta["murl"], "thumb": meta.get("turl", ""), "title": meta.get("t", ""), "page": meta.get("purl", "")}
            )
        if len(out) >= limit:
            break
    return out


async def _serper(query: str, limit: int) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://google.serper.dev/images",
            json={"q": query},  # the free plan rejects "num" above 10
            headers={"X-API-KEY": settings.serper_key},
        )
        resp.raise_for_status()
        rows = resp.json().get("images", [])
    return [
        {"url": r.get("imageUrl") or r.get("thumbnailUrl"), "thumb": r.get("thumbnailUrl", ""), "title": r.get("title", ""), "page": r.get("link", "")}
        for r in rows[:limit]
        if r.get("imageUrl") or r.get("thumbnailUrl")
    ]


async def _serpapi(query: str, limit: int) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            "https://serpapi.com/search.json",
            params={"engine": "google_images", "q": query, "api_key": settings.serpapi_key, "hl": "en"},
        )
        resp.raise_for_status()
        rows = resp.json().get("images_results", [])
    return [
        {"url": r.get("original") or r.get("thumbnail"), "thumb": r.get("thumbnail", ""), "title": r.get("title", ""), "page": r.get("link", "")}
        for r in rows[:limit]
        if r.get("original") or r.get("thumbnail")
    ]


async def _google_browser(query: str, limit: int) -> list[dict]:
    async with browser.page() as page:
        await page.goto(f"https://www.google.com/search?q={quote_plus(query)}&udm=2&hl=en", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        if "/sorry/" in page.url:
            raise RuntimeError("Google served a captcha")
        html = await page.content()
    out, seen = [], set()
    for url, _, _ in re.findall(r'\["(https?://[^"]+?)",(\d+),(\d+)\]', html):
        url = url.encode().decode("unicode_escape")
        if "gstatic.com" in url or url in seen:
            continue
        seen.add(url)
        out.append({"url": url, "thumb": "", "title": "", "page": ""})
        if len(out) >= limit:
            break
    return out


async def _searches(query: str, limit: int) -> AsyncIterator[tuple[list[dict], str]]:
    providers = []
    if settings.serper_key:
        providers.append(("google (Serper)", _serper))
    if settings.serpapi_key:
        providers.append(("google (SerpAPI)", _serpapi))
    if settings.headful:
        providers.append(("google", _google_browser))
    providers.append(("bing", _bing))
    last_error = None
    for name, fn in providers:
        try:
            rows = await fn(query, limit)
            if rows:
                yield rows, name
        except Exception as exc:  # noqa: BLE001
            log.warning("reference search via %s failed: %s", name, safe_error(exc))
            last_error = safe_error(exc)
    raise RuntimeError(f"no reference images found ({last_error})")


async def search_images(query: str, limit: int = 14) -> tuple[list[dict], str]:
    async for rows, provider in _searches(query, limit):
        return rows, provider
    raise RuntimeError("no reference images found")


async def find_references(query: str, want: int = 8) -> tuple[list[RefImage], str]:
    async def grab(row: dict) -> RefImage | None:
        url = row["url"]
        key = await images.fetch(url)
        if not key and row.get("thumb"):
            url = row["thumb"]
            key = await images.fetch(url)
        if not key:
            return None
        return RefImage(key=key, url=url, title=row["title"], page=row["page"])

    async for rows, provider in _searches(query, 14):
        refs = [r for r in await asyncio.gather(*(grab(r) for r in rows)) if r]
        refs = list({r.key: r for r in refs}.values())
        refs = select_consensus(refs, await embed.embed([r.key for r in refs]), want) if refs else []
        if refs:
            return refs, provider
    raise RuntimeError("could not download any usable reference image")


def select_consensus(refs: list[RefImage], vecs: dict[str, np.ndarray], want: int) -> list[RefImage]:
    """Keep the photos that agree with each other.

    Search results mix in look-alikes, other colorways and lifestyle shots.
    The real product forms the largest cluster, so each photo is scored by
    its mean similarity to the other photos, and outliers are deselected.
    """
    refs = [r for r in refs if r.key in vecs]
    if len(refs) <= 2:
        return refs
    mat = np.stack([vecs[r.key] for r in refs])
    sims = mat @ mat.T
    np.fill_diagonal(sims, np.nan)
    consensus = np.nanmean(sims, axis=1)
    order = np.argsort(-consensus)
    best = float(consensus[order[0]])
    kept = []
    for rank, idx in enumerate(order[: max(want, 1) + 4]):
        ref = refs[int(idx)]
        ref.consensus = round(float(consensus[idx]), 3)
        ref.selected = rank < want and float(consensus[idx]) >= best - 0.12
        kept.append(ref)
    return kept
