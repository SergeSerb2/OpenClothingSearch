"""1688 search in the logged-in browser profile (a Taobao account works).

Same approach as Taobao: open 1688's own search pages and read the JSON
they load. Keyword search needs GBK-encoded keywords.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from urllib.parse import quote, urlparse

from patchright.async_api import Page, Response

from .. import images
from ..browser import browser
from ..models import Blocked, Listing, NeedsLogin, SourceStatus
from . import links
from .base import Emit, SearchContext, Task, blocked_task
from .taobao import _challenge_url, _jsonp, _price, _response_error

log = logging.getLogger(__name__)
_SEARCH_API = re.compile(r"OfferResultViewService|offer_search|imageSearch|search\.1688\.com|mtop\.1688", re.I)


def _walk(node, out: list[dict]) -> None:
    if isinstance(node, dict):
        has_id = node.get("offerId") or node.get("id")
        has_img = node.get("imgUrl") or node.get("image") or node.get("offerPicUrl") or node.get("imageUrl")
        if has_id and has_img and (node.get("title") or node.get("subject") or node.get("information")):
            out.append(node)
            return
        for value in node.values():
            _walk(value, out)
    elif isinstance(node, list):
        for value in node:
            _walk(value, out)


def _text(value) -> str:
    if isinstance(value, dict):
        value = value.get("subject") or value.get("title") or ""
    return re.sub(r"<[^>]+>", "", str(value or ""))


def parse_offers(data, method: str) -> list[Listing]:
    rows: list[dict] = []
    _walk(data, rows)
    out = []
    for row in rows:
        native = str(row.get("offerId") or row.get("id"))
        if not native.isdigit():
            continue
        image = row.get("imgUrl") or row.get("offerPicUrl") or row.get("imageUrl") or row.get("image")
        if isinstance(image, dict):
            image = image.get("imgUrl") or image.get("url")
        if not isinstance(image, str) or not image.strip():
            continue
        price = row.get("price") or row.get("priceInfo") or (row.get("tradePrice") or {})
        if isinstance(price, dict):
            price = price.get("price") or price.get("offerPrice") or price.get("value")
        company = row.get("company") or row.get("companyName") or row.get("shop")
        if isinstance(company, dict):
            company = company.get("name") or company.get("companyName")
        out.append(
            Listing(
                source="1688",
                native_id=native,
                url=links.url_1688(native),
                title=_text(row.get("title") or row.get("subject") or row.get("information")),
                image_url=images.normalize_url(image),
                price_cny=_price(price),
                shop=str(company) if company else None,
                sales=str(row.get("bookedCount") or row.get("saleQuantity") or row.get("gmv30dRate") or "") or None,
                found_by={method},
                via={"browser"},
            )
        )
    return out


class _Collector:
    def __init__(self, method: str) -> None:
        self.method = method
        self.items: list[Listing] = []
        self.punished = False
        self.error: Exception | None = None
        self.event = asyncio.Event()

    async def on_response(self, resp: Response) -> None:
        if _challenge_url(resp.url):
            self.punished = True
            self.event.set()
            return
        if not _SEARCH_API.search(resp.url) or resp.request.resource_type not in ("xhr", "fetch", "script", "document"):
            return
        try:
            text = await resp.text()
        except Exception:  # noqa: BLE001
            return
        payloads = []
        if resp.request.resource_type == "document":
            # Keyword results are sometimes rendered into the page as window.data = {...}.
            for blob in re.findall(r"window\.(?:data|__INIT_DATA__|pageData)\s*=\s*(\{.*?\});\s*\n", text, re.S):
                try:
                    payloads.append(json.loads(blob))
                except json.JSONDecodeError:
                    continue
        if not payloads:
            try:
                payloads.append(_jsonp(text))
            except (json.JSONDecodeError, ValueError):
                return
        for data in payloads:
            if not isinstance(data, (dict, list)):
                continue
            error = _response_error(data, "1688")
            if error:
                self.error = error
                self.punished = isinstance(error, Blocked)
            else:
                self.items += parse_offers(data, self.method)
            self.event.set()


async def _check(page: Page, collector: _Collector) -> None:
    if urlparse(page.url).hostname in {"login.1688.com", "login.taobao.com"}:
        raise NeedsLogin("Log in to 1688 in Settings")
    if collector.error:
        raise collector.error
    if collector.punished or _challenge_url(page.url):
        raise Blocked("1688 showed a slider check. Open the login window and solve it once.")


async def _wait(collector: _Collector, page: Page, timeout: float) -> list[Listing]:
    try:
        await asyncio.wait_for(collector.event.wait(), timeout)
    except TimeoutError:
        await _check(page, collector)
        raise
    await _check(page, collector)
    await page.wait_for_timeout(800)
    await _check(page, collector)
    return collector.items


async def text_search(query: str) -> list[Listing]:
    try:
        keywords = quote(query.encode("gbk"))
    except UnicodeEncodeError:
        raise ValueError("1688 cannot search these characters. Use a Chinese or English name that can be encoded as GBK.") from None
    if not keywords.strip():
        raise ValueError("Enter a product name for the 1688 search")
    async with browser.page() as page:
        collector = _Collector("text")
        page.on("response", collector.on_response)
        await page.goto(f"https://s.1688.com/selloffer/offer_search.htm?keywords={keywords}", wait_until="domcontentloaded")
        await _check(page, collector)
        return await _wait(collector, page, 20)


async def image_search(jpeg: bytes) -> list[Listing]:
    async with browser.page() as page:
        collector = _Collector("image")
        page.on("response", collector.on_response)
        await page.goto("https://www.1688.com/", wait_until="domcontentloaded")
        await _check(page, collector)
        file_input = page.locator("input[type=file]").first
        if await file_input.count() == 0:
            camera = page.locator("[class*=camera], [class*=img-search], [class*=imageSearch], [title*=图]").first
            if await camera.count():
                await camera.click()
                await page.wait_for_timeout(600)
            file_input = page.locator("input[type=file]").first
        if await file_input.count() == 0:
            raise RuntimeError("could not find 1688's photo search button")
        await file_input.set_input_files({"name": "item.jpg", "mimeType": "image/jpeg", "buffer": jpeg})
        # Upload opens the results in the same tab or a new one.
        try:
            popup = await page.context.wait_for_event("page", timeout=6000)
            popup.on("response", collector.on_response)
            await popup.wait_for_load_state("domcontentloaded")
            try:
                return await _wait(collector, popup, 30)
            finally:
                await popup.close()
        except Exception:  # noqa: BLE001 - no new tab: results load in place
            return await _wait(collector, page, 30)


def _text_runner():
    async def run(ctx: SearchContext, emit: Emit) -> None:
        for query in ctx.text_queries[:2]:
            await emit(await text_search(query))

    return run


def tasks(ctx: SearchContext, logged_in: bool, photo_by_apify: bool) -> list[Task]:
    """Text search in the browser. Photo search runs through Apify (see apify.py)."""
    out = (
        [Task(SourceStatus(source="1688", method="text", provider="browser"), _text_runner())]
        if logged_in
        else [blocked_task("1688", "text", "browser", "needs_login", "Log in to 1688 in Settings (a Taobao account works)")]
    )
    if not photo_by_apify:
        out.append(blocked_task("1688", "image", "apify", "needs_key", "Add an Apify key in Settings to search 1688 by photo"))
    return out
