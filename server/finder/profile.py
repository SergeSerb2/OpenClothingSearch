"""The user's profile: sizes, gender, budget and taste. Stored in data/profile.json."""

from __future__ import annotations

import json
import math

from . import catalog
from .config import DATA_DIR

PATH = DATA_DIR / "profile.json"
GENDERS = ("men", "women", "unisex")


def _number(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and 0 < number < 10_000_000 else None


def clean(data) -> dict:
    data = data if isinstance(data, dict) else {}
    sizes = data.get("sizes") if isinstance(data.get("sizes"), dict) else {}
    return {
        "gender": data.get("gender") if data.get("gender") in GENDERS else None,
        "height_cm": _number(data.get("height_cm")),
        "weight_kg": _number(data.get("weight_kg")),
        "sizes": {part: str(sizes.get(part) or "").strip()[:20] for part in ("top", "bottom", "shoe")},
        "budget_cny": _number(data.get("budget_cny")),
        "brands": catalog.valid("brands", data.get("brands")),
        "styles": catalog.valid("styles", data.get("styles")),
    }


def load() -> dict:
    try:
        return clean(json.loads(PATH.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return clean({})


def save(data: dict) -> dict:
    profile = clean(data)
    PATH.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    return profile


def describe(profile: dict) -> str:
    """The profile as one line for an AI prompt; "" when it is empty."""
    parts = []
    if profile.get("gender"):
        parts.append(f"shops for {profile['gender']}")
    if profile.get("height_cm"):
        parts.append(f"height {profile['height_cm']:.0f} cm")
    if profile.get("weight_kg"):
        parts.append(f"weight {profile['weight_kg']:.0f} kg")
    sizes = {k: v for k, v in (profile.get("sizes") or {}).items() if v}
    if sizes:
        parts.append("usual sizes " + ", ".join(f"{k} {v}" for k, v in sizes.items()))
    if profile.get("budget_cny"):
        parts.append(f"budget about {profile['budget_cny']:.0f} CNY per item")
    names = [catalog.get("brands", b)["name"] for b in profile.get("brands", []) if catalog.get("brands", b)]
    if names:
        parts.append("likes " + ", ".join(names[:8]))
    styles = [catalog.get("styles", s)["name"] for s in profile.get("styles", []) if catalog.get("styles", s)]
    if styles:
        parts.append("style " + ", ".join(styles[:5]))
    return "; ".join(parts)
