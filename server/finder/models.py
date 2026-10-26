"""Shared data types."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

SOURCES = ("taobao", "1688", "weidian", "yupoo")


@dataclass
class Listing:
    source: str  # one of SOURCES ("taobao" includes Tmall)
    native_id: str
    url: str
    title: str
    image_url: str
    price_cny: float | None = None
    shop: str | None = None
    sales: str | None = None
    found_by: set[str] = field(default_factory=set)  # "text", "image", "lens", "store"
    via: set[str] = field(default_factory=set)  # provider names, e.g. "browser", "tmapi"
    # Filled in by the ranking step.
    image_key: str | None = None
    image_score: float = 0.0
    text_score: float = 0.0
    score: float = 0.0
    tier: str = "weak"  # "exact", "close", "similar", "weak"
    verdict: str | None = None  # "same", "variant", "different" (AI check)
    verdict_note: str = ""
    group: int = -1
    # More photos of the same item (Yupoo album photos); the best one counts.
    extra_keys: list[str] = field(default_factory=list)
    match_key: str | None = None  # the photo that matched the reference best
    # Buy links found in Yupoo albums: the albums that link here. The link
    # often shows a generic "series" photo, so it is scored with the album photos.
    albums: list[str] = field(default_factory=list)
    official: bool = False  # official or flagship store (Tmall flagship, brand store)
    avoid_hit: bool = False  # the title has one of the AI's "avoid" words
    branded: bool = False  # "alternatives" mode: the AI saw the original brand's logo or name
    _image_urls: list[str] = field(default_factory=list, repr=False)

    @property
    def id(self) -> str:
        return f"{self.source}:{self.native_id}"

    def merge(self, other: "Listing") -> None:
        self.found_by |= other.found_by
        self.via |= other.via
        self.price_cny = self.price_cny if self.price_cny is not None else other.price_cny
        self.shop = self.shop or other.shop
        self.sales = self.sales or other.sales
        if len(other.title) > len(self.title):
            self.title = other.title
        candidates = [other.image_url, *other._image_urls]
        self._image_urls += [u for u in candidates if u and u != self.image_url and u not in self._image_urls]
        if other.image_key and other.image_key != self.image_key:
            if self.image_key:
                if other.image_key not in self.extra_keys:
                    self.extra_keys.append(other.image_key)
            else:
                self.image_key = other.image_key
                self.image_url = other.image_url or self.image_url
        self.extra_keys += [k for k in other.extra_keys if k not in self.extra_keys and k != self.image_key]
        self.albums += [a for a in other.albums if a not in self.albums]

    def to_json(self) -> dict:
        data = asdict(self)
        data.pop("_image_urls")
        data["id"] = self.id
        data["found_by"] = sorted(self.found_by)
        data["via"] = sorted(self.via)
        return data


@dataclass
class RefImage:
    key: str
    url: str  # source page image URL, or "upload"
    title: str = ""
    page: str = ""
    selected: bool = True
    consensus: float = 0.0

    def to_json(self) -> dict:
        return asdict(self)


@dataclass
class SourceStatus:
    source: str
    method: str  # "text", "image", "lens", "store"
    provider: str
    state: str = "pending"  # pending, running, done, error, needs_login, skipped
    count: int = 0
    message: str = ""

    def to_json(self) -> dict:
        return asdict(self)


class NeedsLogin(Exception):
    """The site redirected to a login page or a captcha we cannot pass."""


class Blocked(Exception):
    """The site served a captcha or anti-bot page."""
