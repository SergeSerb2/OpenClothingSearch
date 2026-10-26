"""Turn any marketplace URL into (source, native id, canonical URL)."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, unquote, urlparse

from . import weidian

_ALI_HOSTS = {
    "item.taobao.com", "detail.tmall.com", "detail.tmall.hk", "world.taobao.com",
    "m.intl.taobao.com", "h5.m.taobao.com", "chaoshi.detail.tmall.com",
}
_ALI_PATHS = {"/item.htm", "/item.html", "/i.htm", "/awp/core/detail.htm", "/detail/detail.html", "/hk/item.htm"}


def taobao_url(native_id: str) -> str:
    return f"https://item.taobao.com/item.htm?id={native_id}"


def url_1688(native_id: str) -> str:
    return f"https://detail.1688.com/offer/{native_id}.html"


def yupoo_url(store: str, album: str) -> str:
    return f"https://{store}.x.yupoo.com/albums/{album}?uid=1"


def classify(url: str) -> tuple[str, str, str] | None:
    if not isinstance(url, str) or not url:
        return None
    url = unquote(url) if "%2f" in url[:40].lower() else url
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"}:
        return None
    query = parse_qs(parsed.query)
    if host in _ALI_HOSTS and (parsed.path in _ALI_PATHS or re.fullmatch(r"/item/\d+\.htm", parsed.path)):
        native = (query.get("id") or query.get("itemId") or query.get("item_id") or [None])[0]
        if native and native.isdigit():
            return "taobao", native, taobao_url(native)
        return None
    if host in {"detail.1688.com", "m.1688.com"}:
        match = re.fullmatch(r"/offer/(\d{6,})(?:\.html)?/?", parsed.path)
        if match:
            return "1688", match.group(1), url_1688(match.group(1))
    if host == "detail.m.1688.com" and parsed.path == "/page/index.html":
        native = (query.get("offerId") or [""])[0]
        if re.fullmatch(r"\d{6,}", native):
            return "1688", native, url_1688(native)
    native = weidian.item_id(url)
    if native:
        return "weidian", native, weidian.item_url(native)
    match = re.fullmatch(r"([a-z0-9-]+)\.x\.yupoo\.com", host)
    album_match = re.fullmatch(r"/albums/(\d+)/?", parsed.path) if match else None
    if match and album_match:
        store, album = match.group(1), album_match.group(1)
        return "yupoo", f"{store}/{album}", yupoo_url(store, album)
    match = re.fullmatch(r"/photos/([a-z0-9-]+)/albums/(\d+)/?", parsed.path, re.I) if host == "x.yupoo.com" else None
    if match:
        store, album = match.group(1).lower(), match.group(2)
        return "yupoo", f"{store}/{album}", yupoo_url(store, album)
    return None
