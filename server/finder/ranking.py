"""Scores, tiers and groups.

Image similarity is the main signal. Text overlap and style codes help a
little, because seller titles are often vague ("shoes", "Dunks*").
"""

from __future__ import annotations

import re

import numpy as np

from .models import Listing

# Cosine similarity bands for Marqo e-commerce B, measured on a real
# "Nike Dunk Low Panda" search (482 Yupoo/Weidian listings, AI-checked):
# the exact product scored 0.83-0.90 and other colorways of the same model
# 0.79-0.87. Image similarity alone cannot split colorways, so the AI
# verdict decides the tier of the top results.
EXACT = 0.89
CLOSE = 0.84
SIMILAR = 0.76
IMG_LOW, IMG_HIGH = 0.55, 0.95
GROUP_SIM = 0.93
CODE_GAP = 0.05

# Official style codes, for example DD1391-100 (Nike) or 555088-134 (Jordan).
CODE_RE = re.compile(r"(?<![a-z0-9])([a-z]{1,3}\d{3,6}-\d{2,4}|\d{6}-\d{3})(?![a-z0-9])", re.I)

VERDICT_BONUS = {"same": 0.08, "variant": -0.12, "different": -0.3}
AVOID_PENALTY = 0.15
OFFICIAL_RE = re.compile(r"官方|旗舰店|品牌店|flagship|official store", re.I)


def _tokens(text: str) -> set[str]:
    text = text.lower()
    latin = set(re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)?", text))
    cjk = re.sub(r"[^一-鿿]", "", text)
    bigrams = {cjk[i : i + 2] for i in range(len(cjk) - 1)}
    return {t for t in latin if len(t) > 1} | bigrams


def title_codes(title: str) -> set[str]:
    return {c.upper() for c in CODE_RE.findall(title or "")}


def text_score(title: str, queries: list[str], codes: list[str]) -> float:
    if not title:
        return 0.0
    norm = title.lower()
    for code in codes:
        normalized = re.sub(r"[\s_]", "", code.lower())
        pattern = r"[\s_]*".join(re.escape(c) for c in normalized)
        if normalized and re.search(rf"(?<![a-z0-9]){pattern}(?![a-z0-9])", norm):
            return 1.0
    if codes and title_codes(title):
        return 0.0  # the title names another style code: most likely another colorway
    title_tokens = _tokens(title)
    best = 0.0
    for query in queries:
        q = _tokens(query)
        if q:
            best = max(best, len(q & title_tokens) / len(q))
    return round(best, 3)


# Style searches ("similar", "alternatives") compare different products with
# the same look, so their photos score lower: about 0.66-0.80 for good matches
# in real hoodie and shell-jacket searches.
STYLE_OFFSET = 0.08


def tier(image_score: float, verdict: str | None, mode: str = "exact") -> str:
    if verdict == "different":
        return "weak"
    exact, close, similar = (EXACT, CLOSE, SIMILAR) if mode == "exact" else (1.01, CLOSE - STYLE_OFFSET, SIMILAR - STYLE_OFFSET)
    if verdict == "variant":
        return "similar" if image_score >= similar else "weak"
    if image_score >= exact or (verdict == "same" and image_score >= close):
        return "exact"
    if image_score >= close or verdict == "same":
        return "close"
    if image_score >= similar:
        return "similar"
    return "weak"


def is_official(listing: Listing) -> bool:
    return bool(OFFICIAL_RE.search(listing.shop or ""))


def avoid_hit(title: str, avoid: list[str]) -> bool:
    low = (title or "").lower()
    for word in avoid:
        word = (word or "").lower()
        if not word:
            continue
        if word.isascii():
            # Latin words must stand alone: "lee" must not match "sleeve".
            if re.search(rf"(?<![a-z]){re.escape(word)}(?![a-z])", low):
                return True
        elif word in low:
            return True
    return False


def score(listing: Listing) -> float:
    img = (listing.image_score - IMG_LOW) / (IMG_HIGH - IMG_LOW)
    value = 0.85 * min(max(img, 0.0), 1.0) + 0.15 * listing.text_score
    if listing.avoid_hit or listing.branded:
        value -= AVOID_PENALTY
    if listing.verdict:
        value += VERDICT_BONUS.get(listing.verdict, 0.0)
    return round(min(max(value, 0.0), 1.0), 4)


PRICE_BONUS = 0.06  # "alternatives": the cheapest listing gets this much, the dearest none


def price_bonus(listings: list[Listing]) -> None:
    """Rank cheaper listings a little higher, by price rank among the priced ones."""
    priced = sorted((l for l in listings if l.price_cny), key=lambda l: l.price_cny or 0)
    prices = sorted({l.price_cny for l in priced})
    if len(prices) < 2:
        return
    ranks = {price: rank for rank, price in enumerate(prices)}
    for listing in priced:
        rank = ranks[listing.price_cny]
        listing.score = round(min(listing.score + PRICE_BONUS * (1 - rank / (len(prices) - 1)), 1.0), 4)


def image_scores(listing_vecs: np.ndarray, ref_vecs: np.ndarray) -> np.ndarray:
    """Best similarity of each listing photo to any reference photo.

    Uses the mean of the two best reference matches, so one odd reference
    photo cannot carry a listing on its own.
    """
    sims = listing_vecs @ ref_vecs.T
    if sims.shape[1] == 1:
        return sims[:, 0]
    top2 = np.sort(sims, axis=1)[:, -2:]
    return 0.6 * top2[:, 1] + 0.4 * top2[:, 0]


def photo_key(listing: Listing) -> str | None:
    """The photo that shows what the listing sells: its best match, else its cover.

    Buy links often share one generic "series" photo, so their cover says little.
    """
    return listing.match_key or listing.image_key


def group(listings: list[Listing], vecs: dict[str, np.ndarray]) -> list[dict]:
    """Group listings that sell the same product.

    Two listings join when their best photos are near-identical, when their
    titles name the same single style code, or when one is the buy link of a
    Yupoo album (it joins its best-matching album). vecs maps photo_key() to
    embeddings.
    """
    ranked = [l for l in sorted(listings, key=lambda l: -l.score) if photo_key(l) in vecs]
    for listing in listings:
        listing.group = -1
    if not ranked:
        return []
    index = {l.id: i for i, l in enumerate(ranked)}
    parent = list(range(len(ranked)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        a, b = find(i), find(j)
        if a != b:
            parent[max(a, b)] = min(a, b)  # the better-ranked listing stays the root

    mat = np.stack([vecs[photo_key(l)] for l in ranked])
    rows, cols = np.where(np.triu(mat @ mat.T, 1) >= GROUP_SIM)
    for i, j in zip(rows.tolist(), cols.tolist()):
        union(i, j)
    # Same style code: join listings whose image scores form one band. Some
    # albums show several colorways under one code; a score gap splits them off.
    by_code: dict[str, list[int]] = {}
    for i, listing in enumerate(ranked):
        codes = title_codes(listing.title)
        if len(codes) == 1:  # titles with several codes are often multi-colorway albums
            by_code.setdefault(codes.pop(), []).append(i)
    for members in by_code.values():
        members.sort(key=lambda i: ranked[i].image_score)
        for a, b in zip(members, members[1:]):
            if ranked[b].image_score - ranked[a].image_score <= CODE_GAP + 1e-9:
                union(a, b)
    for i, listing in enumerate(ranked):
        albums = [index[a] for a in listing.albums if a in index]
        if albums:
            union(i, max(albums, key=lambda a: ranked[a].image_score))

    members: dict[int, list[Listing]] = {}
    for idx, listing in enumerate(ranked):
        members.setdefault(find(idx), []).append(listing)
    groups = []
    for gid, (_, items) in enumerate(sorted(members.items(), key=lambda kv: -kv[1][0].score)):
        prices = [l.price_cny for l in items if l.price_cny]
        for listing in items:
            listing.group = gid
        groups.append(
            {
                "id": gid,
                "listing_ids": [l.id for l in items],
                "best_id": items[0].id,
                "size": len(items),
                "min_price": min(prices) if prices else None,
                "max_price": max(prices) if prices else None,
                "sources": sorted({l.source for l in items}),
                "score": items[0].score,
            }
        )
    return groups
