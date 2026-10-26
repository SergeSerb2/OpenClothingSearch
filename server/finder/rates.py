"""Approximate exchange rates from CNY, to show prices in the user's currency. Display only.

Rates come from ExchangeRate-API's free endpoint (no key) and are cached for 12 hours.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time

import httpx

from .config import DATA_DIR
from .secrets import safe_error

log = logging.getLogger(__name__)
URL = "https://open.er-api.com/v6/latest/CNY"
PATH = DATA_DIR / "rates.json"
MAX_AGE = 12 * 3600
# Used when the rates cannot be downloaded (approximate, 2026).
FALLBACK = {
    "USD": 0.14, "EUR": 0.12, "GBP": 0.105, "CAD": 0.19, "AUD": 0.21, "NZD": 0.24, "CHF": 0.11,
    "SEK": 1.33, "NOK": 1.4, "DKK": 0.9, "PLN": 0.51, "JPY": 21.0, "KRW": 195.0, "SGD": 0.18,
    "HKD": 1.09, "INR": 12.2, "MXN": 2.6, "BRL": 0.76,
}
_lock = asyncio.Lock()


def _cached() -> dict | None:
    try:
        data = json.loads(PATH.read_text(encoding="utf-8"))
        return data if isinstance(data.get("rates"), dict) and isinstance(data.get("updated"), (int, float)) else None
    except (OSError, ValueError, AttributeError):
        return None


async def get() -> dict:
    async with _lock:
        cached = _cached()
        if cached and time.time() - cached["updated"] < MAX_AGE:
            return cached
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(URL)
                resp.raise_for_status()
                data = resp.json()
            rates = {k: float(v) for k, v in data["rates"].items() if isinstance(v, (int, float)) and v > 0}
            if not rates:
                raise ValueError("no rates in the reply")
            out = {"rates": rates, "updated": int(time.time()), "source": "ExchangeRate-API"}
            PATH.write_text(json.dumps(out), encoding="utf-8")
            return out
        except Exception as exc:  # noqa: BLE001 - display only
            log.info("exchange rates unavailable: %s", safe_error(exc))
            return cached or {"rates": FALLBACK, "updated": 0, "source": "built-in"}
