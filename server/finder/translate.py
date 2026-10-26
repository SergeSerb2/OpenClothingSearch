"""Chinese to English for the text the web app shows: listing titles, shop names, search terms.

Each text costs one AI call once: translations are kept in data/translations.sqlite.
Sales counts such as "1000+人付款" are translated by rules, with no AI call.
"""

from __future__ import annotations

import asyncio
import logging
import re
import sqlite3
import threading
import time

from . import llm
from .config import DATA_DIR, settings
from .secrets import safe_error

log = logging.getLogger(__name__)
CJK = re.compile(r"[㐀-鿿豈-﫿]")
MAX_LEN = 300  # longer texts are not translated (titles are at most about 140 characters)
BATCH = 25  # texts per AI call
RETRY_AFTER = 60  # seconds before a text the AI did not translate is tried again
DB_PATH = DATA_DIR / "translations.sqlite"

_db: sqlite3.Connection | None = None
_db_lock = threading.Lock()
_slots = asyncio.Semaphore(3)  # AI calls at the same time
_pending: dict[str, asyncio.Future] = {}  # texts being translated now, shared by all callers
_failed: dict[str, float] = {}

PROMPT = """Translate each numbered text from a Chinese shopping site into short, natural English.
The texts are product titles, shop names and search terms from Taobao, 1688, Weidian and Yupoo.
- Keep model names, style codes, sizes and numbers. Write brands the usual English way (耐克 = Nike, 始祖鸟 = Arc'teryx).
- Translate seller words by meaning (重磅 = heavyweight, 宽松 = loose fit, 同款 = same style as, 现货 = in stock).
- Shop and company names: translate the meaning of common words (旗舰店 = Flagship Store, 服饰有限公司 = Apparel Co., Ltd.); write names in pinyin.
- Do not add or drop information. Do not add notes.
Return JSON only, one entry for each number: {{"1": "...", "2": "..."}}

Texts:
{texts}"""


def has_cjk(text: str) -> bool:
    return bool(CJK.search(text))


def _number(digits: str, wan: str) -> str:
    value = float(digits) * (10_000 if wan else 1)
    return f"{value:,.0f}"


SALES_RULES = [
    (re.compile(r"(\d+(?:\.\d+)?)(万)?(\+?)人付款"), "{n}{plus} bought"),
    (re.compile(r"(\d+(?:\.\d+)?)(万)?(\+?)人收货"), "{n}{plus} received"),
    (re.compile(r"(?:月销|月售)\s*(\d+(?:\.\d+)?)(万)?(\+?)(?:件|笔)?"), "{n}{plus} sold this month"),
    (re.compile(r"已售\s*(\d+(?:\.\d+)?)(万)?(\+?)(?:件)?"), "{n}{plus} sold"),
]


def _rule(text: str) -> str | None:
    for pattern, template in SALES_RULES:
        match = pattern.fullmatch(text)
        if match:
            return template.format(n=_number(match.group(1), match.group(2)), plus=match.group(3))
    return None


def _conn() -> sqlite3.Connection:
    global _db
    if _db is None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        _db = sqlite3.connect(DB_PATH, check_same_thread=False)
        _db.execute("CREATE TABLE IF NOT EXISTS translations (zh TEXT PRIMARY KEY, en TEXT NOT NULL)")
        _db.commit()
    return _db


def _lookup(texts: list[str]) -> dict[str, str]:
    found: dict[str, str] = {}
    with _db_lock:
        db = _conn()
        for i in range(0, len(texts), 500):
            chunk = texts[i : i + 500]
            marks = ",".join("?" * len(chunk))
            found.update(db.execute(f"SELECT zh, en FROM translations WHERE zh IN ({marks})", chunk).fetchall())
    return found


def _store(pairs: dict[str, str]) -> None:
    with _db_lock:
        db = _conn()
        db.executemany("INSERT OR REPLACE INTO translations (zh, en) VALUES (?, ?)", pairs.items())
        db.commit()


FULLWIDTH = str.maketrans({"【": "[", "】": "]", "（": "(", "）": ")", "，": ", ", "：": ": ", "；": "; ", "！": "!", "？": "?"})


def _tidy(english: str) -> str:
    return re.sub(r"\s+", " ", english.translate(FULLWIDTH)).strip()


async def _ask(batch: list[str]) -> dict[str, str]:
    numbered = "\n".join(f"{i}. {text}" for i, text in enumerate(batch, 1))
    messages = [{"role": "user", "content": PROMPT.format(texts=numbered)}]
    try:
        data = llm.parse_json(await llm.chat(messages, max_tokens=4000, timeout=60, reasoning="none"))
    except ValueError as exc:
        log.info("translation retry: %s", exc)
        data = llm.parse_json(await llm.chat(messages, max_tokens=4000, timeout=60, reasoning="none"))
    out = {}
    for i, text in enumerate(batch, 1):
        english = data.get(str(i))
        if isinstance(english, str) and english.strip() and not has_cjk(english):
            out[text] = _tidy(english)[:400]
    return out


def _resolve(futures: dict[str, asyncio.Future], found: dict[str, str]) -> None:
    """Hand the results to other callers waiting on these texts. Only our own futures:
    after a retry, another request can own the pending entry for the same text."""
    for text, future in futures.items():
        if _pending.get(text) is future:
            del _pending[text]
        if not future.done():
            future.set_result(found.get(text))


async def _translate_batch(batch: list[str], futures: dict[str, asyncio.Future]) -> dict[str, str]:
    found: dict[str, str] = {}
    try:
        async with _slots:
            found = await _ask(batch)
        if found:
            await asyncio.to_thread(_store, found)
    except Exception as exc:  # noqa: BLE001
        log.warning("translation failed for %d texts: %s", len(batch), safe_error(exc))
    now = time.monotonic()
    for text in batch:
        if text not in found:
            _failed[text] = now
    _resolve({t: futures[t] for t in batch}, found)
    return found


async def english(texts: list[str]) -> dict[str, str]:
    """English for each text that has Chinese in it, keyed by the text as given.

    Texts with no translation (no AI, the AI failed, or too long) are left out.
    """
    clean_of: dict[str, str] = {}  # text as given -> stripped text
    for text in texts:
        clean = text.strip() if isinstance(text, str) else ""
        if clean and len(clean) <= MAX_LEN and has_cjk(clean):
            clean_of[text] = clean
    unique = list(dict.fromkeys(clean_of.values()))
    found: dict[str, str] = {}
    for clean in unique:
        rule = _rule(clean)
        if rule:
            found[clean] = rule
    rest = [clean for clean in unique if clean not in found]
    if rest:
        found.update(await asyncio.to_thread(_lookup, rest))

    now = time.monotonic()
    missing = [c for c in rest if c not in found and now - _failed.get(c, -RETRY_AFTER) >= RETRY_AFTER]
    if missing and settings.llm_enabled:
        loop = asyncio.get_running_loop()
        mine: dict[str, asyncio.Future] = {}
        theirs: dict[str, asyncio.Future] = {}
        for clean in missing:
            if clean in _pending:
                theirs[clean] = _pending[clean]
            else:
                _pending[clean] = mine[clean] = loop.create_future()
        try:
            if mine:
                # Another request can store a text between our lookup and our claim: look again.
                again = await asyncio.to_thread(_lookup, list(mine))
                found.update(again)
                todo = [c for c in mine if c not in again]
                batches = [todo[i : i + BATCH] for i in range(0, len(todo), BATCH)]
                for result in await asyncio.gather(*(_translate_batch(b, mine) for b in batches)):
                    found.update(result)
        finally:
            # Also on cancel, so callers waiting on our texts never hang.
            _resolve(mine, found)
        for clean, future in theirs.items():
            # shield: if this request is cancelled, the other waiters still get the result.
            result = await asyncio.shield(future)
            if result:
                found[clean] = result
    return {text: found[clean] for text, clean in clean_of.items() if clean in found}
