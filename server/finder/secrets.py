"""Keep API keys out of error messages, logs, saved searches and the UI."""

from __future__ import annotations

import logging
import re

import httpx

from .config import settings

_PARAM = re.compile(r"((?:api_key|apikey|token|key)=)[^&\s'\"]+", re.I)


def redact(text: str, *extra: str) -> str:
    """Hide the saved keys, plus `extra` secrets (for example a key that is being tested)."""
    for value in (settings.llm_api_key, settings.serper_key, settings.serpapi_key, settings.qualitly_key, settings.apify_token, *extra):
        if value and len(value) >= 4:
            text = text.replace(value, "***")
    return _PARAM.sub(r"\1***", text)


def safe_error(exc: BaseException) -> str:
    """A short error text for users: no URLs with keys in them."""
    if isinstance(exc, httpx.HTTPStatusError):
        return f"{exc.request.url.host} answered HTTP {exc.response.status_code}"
    return redact(str(exc) or exc.__class__.__name__)


class RedactFilter(logging.Filter):
    """Redacts the message and the traceback text of every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        clean = redact(message)
        if clean != message:
            record.msg, record.args = clean, ()
        if record.exc_info and not record.exc_text:
            # The formatter reuses exc_text, so the raw traceback is never printed.
            record.exc_text = redact(logging.Formatter().formatException(record.exc_info))
        if record.stack_info:
            record.stack_info = redact(record.stack_info)
        return True
