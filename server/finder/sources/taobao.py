"""Taobao/Tmall search in the logged-in browser profile.

Text search opens s.taobao.com and reads the JSON the page itself loads
(mtop.relationrecommend.wirelessrecommend.recommend). Photo search uploads
the reference photo through the page's own camera button. The page signs
its own requests, so the tool never deals with mtop signatures.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from urllib.parse import parse_qs, quote, urlparse

from patchright.async_api import Page, Response

from .. import images
from ..browser import browser
from ..models import Blocked, Listing, NeedsLogin, SourceStatus
from . import links
from .base import Emit, SearchContext, Task, blocked_task

log = logging.getLogger(__name__)
_SEARCH_API = re.compile(r"mtop\.relationrecommend\.wirelessrecommend\.recommend|mtop\.taobao\.wsearch|imgsearch|pailitao", re.I)


def _challenge_url(url: str) -> bool:
    parsed = urlparse(url)
    return bool(
        re.search(r"(?:^|/)(?:punish|captcha|_____tmd_____)(?:[./]|$)", parsed.path, re.I)
        or {key.lower() for key in parse_qs(parsed.query, keep_blank_values=True)} & {"x5secdata", "x5sec", "_____tmd_____", "punish"}
    )


def _response_error(data, site: str) -> Exception | None:
    if not isinstance(data, dict):
        return None
    for key, value in data.items():
        if key.lower() in {"ret", "code", "errorcode", "error_code", "error", "errors", "message", "msg"}:
            text = str(value)
            if re.search(r"\b(?:FAIL_SYS_USER_VALIDATE\b|RGV587(?:\b|_))", text, re.I):
                return Blocked(f"{site} showed a slider check. Open the login window and solve it once.")
            if re.search(r"\bFAIL_SYS_(?:SESSION_EXPIRED|SESSION_NOT_EXIST|TOKEN_EXPIRED|TOKEN_EMPTY|USER_NOT_LOGIN)\b", text, re.I):
                return NeedsLogin(f"Log in to {site} in Settings")
            if re.search(r"\bFAIL_[A-Z_]+\b", text):
                return RuntimeError(f"{site} search returned an error")
        if key in {"data", "result"}:
            error = _response_error(value, site)
            if error:
                return error
    return None


def _jsonp(text: str):
    text = text.strip()
    match = re.match(r"^[\w$.]+\((.*)\)\s*;?\s*$", text, re.S)
    return json.loads(match.group(1) if match else text)


def _price(value) -> float | None:
    match = re.search(r"\d+(?:\.\d+)?", str(value or "").replace(",", ""))
    return float(match.group(0)) if match else None


def _walk_items(node, out: list[dict]) -> None:
    """Find item dicts anywhere in the response (layouts change often)."""
    if isinstance(node, dict):
        if (node.get("item_id") or node.get("itemId") or node.get("nid")) and (
            node.get("pic_path") or node.get("pic") or node.get("picUrl") or node.get("mainPic")
        ):
            out.append(node)
            return
        for value in node.values():
            _walk_items(value, out)
    elif isinstance(node, list):
        for value in node:
            _walk_items(value, out)


def parse_items(data, method: str) -> list[Listing]:
    rows: list[dict] = []
    _walk_items(data, rows)
    out = []
    for row in rows:
        native = str(row.get("item_id") or row.get("itemId") or row.get("nid"))
        if not native.isdigit():
            continue
        title = re.sub(r"<[^>]+>", "", str(row.get("title") or row.get("raw_title") or ""))
        pic = row.get("pic_path") or row.get("pic") or row.get("picUrl") or row.get("mainPic")
        if not isinstance(pic, str) or not pic.strip():
            continue
        shop_info = row.get("shopInfo") if isinstance(row.get("shopInfo"), dict) else {}
        shop = row.get("nick") or row.get("shopName") or shop_info.get("title")
        price_show = row.get("priceShow")
        price = row.get("price") or row.get("view_price") or (price_show.get("price") if isinstance(price_show, dict) else None)
        out.append(
            Listing(
                source="taobao",
                native_id=native,
                url=links.taobao_url(native),
                title=title,
                image_url=images.normalize_url(pic),
                price_cny=_price(price),
                shop=str(shop) if shop else None,
                sales=str(row.get("realSales") or row.get("sold") or row.get("view_sales") or "") or None,
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
        url = resp.url
        if _challenge_url(url):
            self.punished = True
            self.event.set()
            return
        if not _SEARCH_API.search(url):
            return
        try:
            text = await resp.text()
        except Exception:  # noqa: BLE001
            return
        try:
            data = _jsonp(text)
        except (json.JSONDecodeError, ValueError):
            return
        if not isinstance(data, (dict, list)):
            return
        error = _response_error(data, "Taobao")
        if error:
            self.error = error
            self.punished = isinstance(error, Blocked)
        else:
            self.items += parse_items(data, self.method)
        self.event.set()


async def _check_page(page: Page) -> None:
    if urlparse(page.url).hostname in {"login.taobao.com", "login.tmall.com"}:
        raise NeedsLogin("Log in to Taobao in Settings")
    if _challenge_url(page.url):
        raise Blocked("Taobao showed a slider check. Open the login window and solve it once.")


async def _wait(collector: _Collector, page: Page, timeout: float = 20) -> list[Listing]:
    try:
        await asyncio.wait_for(collector.event.wait(), timeout)
    except TimeoutError:
        await _check_page(page)
        raise
    await _check_page(page)
    if collector.error:
        raise collector.error
    if collector.punished:
        raise Blocked("Taobao showed a slider check. Open the login window and solve it once.")
    # The first response can arrive before the rest of the page; give it a moment.
    await page.wait_for_timeout(800)
    await _check_page(page)
    if collector.error:
        raise collector.error
    if collector.punished:
        raise Blocked("Taobao showed a slider check. Open the login window and solve it once.")
    return collector.items


async def text_search(query: str) -> list[Listing]:
    async with browser.page() as page:
        collector = _Collector("text")
        page.on("response", collector.on_response)
        await page.goto(f"https://s.taobao.com/search?q={quote(query)}&tab=all", wait_until="domcontentloaded")
        await _check_page(page)
        return await _wait(collector, page)


async def image_search(jpeg: bytes) -> list[Listing]:
    async with browser.page() as page:
        collector = _Collector("image")
        page.on("response", collector.on_response)
        await page.goto("https://s.taobao.com/search?q=%E9%9E%8B&tab=all", wait_until="domcontentloaded")
        await _check_page(page)
        file_input = page.locator("input[type=file]").first
        if await file_input.count() == 0:
            # The camera button creates the file input lazily.
            camera = page.locator("[class*=camera], [class*=imgSearch], [class*=image-search], [aria-label*=图片]").first
            if await camera.count():
                await camera.click()
                await page.wait_for_timeout(600)
            file_input = page.locator("input[type=file]").first
        if await file_input.count() == 0:
            raise RuntimeError("could not find Taobao's photo search button")
        # Results from the plain search above must not count as photo results.
        collector.items.clear()
        collector.event.clear()
        collector.error = None
        collector.punished = False
        await file_input.set_input_files({"name": "item.jpg", "mimeType": "image/jpeg", "buffer": jpeg})
        return await _wait(collector, page, timeout=30)


def _text_runner():
    async def run(ctx: SearchContext, emit: Emit) -> None:
        for query in ctx.text_queries[:3]:
            await emit(await text_search(query))

    return run


def tasks(ctx: SearchContext, logged_in: bool) -> list[Task]:
    """Text search in the browser. Photo search is not available yet: the photo
    upload on the search page does not start a real photo search."""
    if not logged_in:
        return [blocked_task("taobao", "text", "browser", "needs_login", "Log in to Taobao in Settings to search it")]
    return [Task(SourceStatus(source="taobao", method="text", provider="browser"), _text_runner())]
