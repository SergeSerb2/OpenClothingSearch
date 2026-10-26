"""Download, normalize and cache images.

Chinese marketplace CDNs block hotlinking, so every download sends a
Referer that matches the image host.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import re
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import httpx
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

from .config import DATA_DIR
from .secrets import redact, safe_error

log = logging.getLogger(__name__)
register_heif_opener()  # iPhone photos (HEIC)

CACHE = DATA_DIR / "cache" / "img"
CACHE.mkdir(parents=True, exist_ok=True)
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)
MAX_SIDE = 512
UPLOAD_SIDE = 1280  # uploads keep more detail: "Shop the look" crops single items out of them

_client: httpx.AsyncClient | None = None
_sem = asyncio.Semaphore(16)


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(15, connect=8),
            follow_redirects=True,
            headers={"User-Agent": UA, "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"},
            limits=httpx.Limits(max_connections=32),
        )
    return _client


def referer_for(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if host == "photo.yupoo.com":
        # photo.yupoo.com/{store}/... only serves images to that store's pages.
        store = parsed.path.strip("/").split("/")[0]
        return f"https://{store}.x.yupoo.com/"
    if host.endswith("yupoo.com"):
        return "https://x.yupoo.com/"
    if host.endswith(("alicdn.com", "taobao.com", "tbcdn.cn")):
        return "https://www.taobao.com/"
    if host.endswith(("geilicdn.com", "weidian.com")):
        return "https://weidian.com/"
    if host.endswith("1688.com"):
        return "https://www.1688.com/"
    return ""


def normalize_url(url: str) -> str:
    url = url.strip()
    if url.startswith("//"):
        url = "https:" + url
    return url


def key_for(url: str) -> str:
    return hashlib.sha1(url.encode()).hexdigest()


def path_for(key: str) -> Path:
    if not re.fullmatch(r"[0-9a-fA-F]{40}", key):
        raise ValueError("invalid image cache key")
    return CACHE / f"{key}.jpg"


def _write(path: Path, data: bytes) -> None:
    temp = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".tmp", delete=False) as tmp:
            temp = Path(tmp.name)
            tmp.write(data)
        temp.replace(path)
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)


def to_jpeg(raw: bytes, max_side: int = MAX_SIDE) -> bytes:
    img = Image.open(io.BytesIO(raw))
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")
    img.thumbnail((max_side, max_side))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88)
    return out.getvalue()


async def fetch(url: str, referer: str | None = None) -> str | None:
    """Download an image into the cache. Returns its cache key, or None."""
    url = normalize_url(url)
    key = key_for(url)
    if read(key) is not None:
        return key
    headers = {"Sec-Fetch-Dest": "image", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Site": "cross-site"}
    ref = referer if referer is not None else referer_for(url)
    if ref:
        headers["Referer"] = ref
    async with _sem:
        try:
            resp = await client().get(url, headers=headers)
            resp.raise_for_status()
            if not resp.headers.get("content-type", "image").startswith("image"):
                raise ValueError(f"not an image: {resp.headers.get('content-type')}")
            jpeg = await asyncio.to_thread(to_jpeg, resp.content)
            _write(path_for(key), jpeg)
        except Exception as exc:  # noqa: BLE001 - one bad image must not stop a search
            log.debug("image fetch failed %s: %s", redact(url)[:120], safe_error(exc))
            return None
    return key


def store_bytes(raw: bytes, name_hint: str = "") -> str:
    """Save an uploaded image. Returns its cache key."""
    jpeg = to_jpeg(raw, UPLOAD_SIDE)
    key = hashlib.sha1(jpeg + name_hint.encode()).hexdigest()
    _write(path_for(key), jpeg)
    return key


def read(key: str) -> bytes | None:
    try:
        path = path_for(key)
        raw = path.read_bytes()
    except (OSError, ValueError):
        return None
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img.load()
    except Exception:  # noqa: BLE001 - discard corrupt images so fetch can repair them
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        return None
    return raw
