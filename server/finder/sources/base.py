"""What every source task gets, and how it reports results."""

from __future__ import annotations

from dataclasses import dataclass, field
from itertools import zip_longest
from typing import Awaitable, Callable

from ..models import Listing, RefImage, SourceStatus

Emit = Callable[[list[Listing]], Awaitable[None]]


def string_field(value, *keys: str) -> str:
    if isinstance(value, dict):
        value = next((value[key] for key in keys if isinstance(value.get(key), str) and value[key].strip()), "")
    return value.strip() if isinstance(value, str) else ""


@dataclass
class SearchContext:
    query: str
    zh: list[str]
    en: list[str]
    codes: list[str]
    refs: list[RefImage]  # selected reference photos, best first
    wanted: set[str] = field(default_factory=lambda: {"taobao", "1688", "weidian", "yupoo"})

    @property
    def text_queries(self) -> list[str]:
        """Queries for Chinese marketplaces: Chinese first, then codes."""
        out = list(self.zh) + list(self.codes)
        if not out and self.query:
            out = [self.query]
        return list(dict.fromkeys(q for q in out if q))

    @property
    def latin_queries(self) -> list[str]:
        """Queries for Yupoo/Weidian titles, which are often English or codes."""
        names = list(self.en) + ([self.query] if self.query else [])
        codes = list(self.codes)
        # Alternate codes and names, so the first two queries are one of each.
        out = [q for pair in zip_longest(codes, names) for q in pair if q]
        return list(dict.fromkeys(out))

    def image_refs(self, n: int = 2) -> list[RefImage]:
        return self.refs[:n]


@dataclass
class Task:
    """One search unit, for example "Taobao by image via the browser"."""

    status: SourceStatus
    run: Callable[[SearchContext, Emit], Awaitable[None]] | None = None
    # A task with no run() is shown with its status only (needs_login, needs_key).
    tags: set[str] = field(default_factory=set)


def blocked_task(source: str, method: str, provider: str, state: str, message: str) -> Task:
    return Task(SourceStatus(source=source, method=method, provider=provider, state=state, message=message))
