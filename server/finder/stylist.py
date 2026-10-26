"""AI stylist features: "Shop the look" (items in an outfit photo) and suggestions."""

from __future__ import annotations

import asyncio
import io

from PIL import Image

from . import catalog, images, llm, profile

CROP_PAD = 0.06  # fraction of the photo added around each item box


def _crop(jpeg: bytes, box: list[float]) -> str | None:
    img = Image.open(io.BytesIO(jpeg))
    width, height = img.size
    x0, y0, x1, y1 = box
    left = max(0, int((x0 - CROP_PAD) * width))
    top = max(0, int((y0 - CROP_PAD) * height))
    right = min(width, int((x1 + CROP_PAD) * width))
    bottom = min(height, int((y1 + CROP_PAD) * height))
    if right - left < 48 or bottom - top < 48:
        return None
    out = io.BytesIO()
    img.crop((left, top, right, bottom)).convert("RGB").save(out, "JPEG", quality=90)
    return images.store_bytes(out.getvalue(), f"crop:{box}")


async def look(upload_key: str) -> dict:
    """Find the clothing items in an outfit photo and crop each one."""
    jpeg = images.read(upload_key)
    if jpeg is None:
        raise LookupError("photo not found; upload it again")
    data = catalog.load()
    items = await llm.locate_items(jpeg, [c["id"] for c in data["categories"]], [c["id"] for c in data["colors"]])
    out = []
    for item in items:
        try:
            crop_key = await asyncio.to_thread(_crop, jpeg, item["box"])
        except (OSError, ValueError):
            crop_key = None  # the UI shows the photo region instead
        out.append(
            {
                **item,
                "category": item["category"] if catalog.get("categories", item["category"]) else "",
                "colors": catalog.valid("colors", item["colors"]),
                "crop_key": crop_key,
            }
        )
    return {"upload_key": upload_key, "items": out}


def _ids(kind: str) -> str:
    return ", ".join(row["id"] for row in catalog.load()[kind])


async def suggest(request: dict, anchor: str = "") -> dict:
    """Concrete items to search for: complete a look, a style starter kit, or free ideas."""
    user = profile.load()
    styles = [catalog.get("styles", s) for s in catalog.valid("styles", request.get("styles"))]
    lines = []
    if anchor:
        lines.append(
            f"Anchor item (the user has it or wants it): {anchor}. Suggest pieces that go with it. "
            "Do not suggest another item of the same kind."
        )
    for style in styles:
        lines.append(f"Style: {style['name']} - {style.get('description', '')}")
    notes = str(request.get("notes") or "").strip()[:500]
    if notes:
        lines.append(f"Wishes: {notes}")
    if not lines:
        lines.append("Suggest a versatile everyday wardrobe for the user.")
    count = min(max(int(request.get("count") or 6), 1), 10)
    catalog_text = "\n".join(
        f"{kind}: {_ids(kind)}" for kind in ("categories", "colors", "materials", "fits", "brands")
    )
    reply = await llm.suggest("\n".join(lines), profile.describe(user), catalog_text, count)
    items = []
    for row in reply["items"][:count]:
        if not isinstance(row, dict) or not row.get("query"):
            continue
        options = catalog.clean_options(
            {
                "mode": "similar",
                "category": row.get("category"),
                "colors": row.get("colors"),
                "materials": row.get("materials"),
                "fit": row.get("fit"),
                "brands": row.get("brands"),
                "styles": [s["id"] for s in styles],
                "gender": user.get("gender"),
                "price_max": row.get("price_max") or user.get("budget_cny"),
            }
        )
        items.append(
            {
                "label": str(row.get("label", ""))[:60],
                "why": str(row.get("why", ""))[:160],
                "query": str(row["query"])[:100],
                "options": options,
            }
        )
    if not items:
        raise ValueError("the AI did not suggest any items")
    return {"title": str(reply.get("title") or "Suggestions")[:60], "items": items}
