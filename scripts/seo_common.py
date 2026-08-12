"""Shared SEO constants/helpers for seo_meta.py, generate_products.py and
generate_collections.py."""
from __future__ import annotations

import html
import re

BASE_URL = "https://velorakr.com"
SITE_NAME = "Velora Jewelry"
INSTAGRAM = "https://www.instagram.com/velo.rajwlry"
DEFAULT_OG_IMAGE = "https://www.sodastw.com/cdn/shop/files/nh_man_hinh_2026-06-24_luc_13.51.06.png"

COLLECTION = {
    "jewelry": {"label": "주얼리", "link": "/jewelry/"},
    "watch": {"label": "시계", "link": "/watch/"},
}

# Subcategory nav, one list per top-level family. Each family's subcategory
# submenu is only ever shown while browsing that family — jewelry's submenu
# never appears on a watch page and vice versa (they're unrelated product
# lines). "path" is relative to html/.
JEWELRY_SUBCATEGORIES = [
    {"key": "ring", "label": "반지", "path": "jewelry/rings"},
    {"key": "necklace", "label": "목걸이", "path": "jewelry/necklaces"},
    {"key": "bracelet", "label": "팔찌", "path": "jewelry/bracelets"},
    {"key": "earring", "label": "귀걸이", "path": "jewelry/earrings"},
]

WATCH_SUBCATEGORIES = [
    {"key": "women", "label": "여성 시계", "path": "watch/women"},
    {"key": "men", "label": "남성 시계", "path": "watch/men"},
]

FAMILIES = [
    {"key": "jewelry", "label": "주얼리", "path": "jewelry", "subcategories": JEWELRY_SUBCATEGORIES},
    {"key": "watch", "label": "시계", "path": "watch", "subcategories": WATCH_SUBCATEGORIES},
]

# Every listing page generate_collections.py *may* write. Subcategory pages
# only actually get generated when at least one product falls into them
# (e.g. 남성 시계 is skipped while there are zero men's watches in the
# catalog), so seo_meta.py's sitemap builder must check each path still
# exists on disk before linking to it — this list is just the candidate set.
COLLECTION_PAGE_PATHS = (
    [f["path"] for f in FAMILIES]
    + [sc["path"] for f in FAMILIES for sc in f["subcategories"]]
)

# products-data.js's "id" is a reliable slug of the real product (verified
# against the actual images); its "name" is frequently a reused/generic
# placeholder shared across unrelated items, so classification here reads
# the id, never the name.
_JEWELRY_SUBCATEGORY_PATTERNS = [
    ("earring", [r"earring"]),
    ("necklace", [r"necklace", r"pendant", r"\bnake\b"]),
    ("bracelet", [r"bracelet", r"bangle"]),
    ("ring", [r"\bring\b"]),
]

# ids that the regex heuristic gets wrong (either because the name/id uses
# an abbreviation like "tif-knot", or because the item isn't actual jewelry
# at all, e.g. leftover template placeholders / bags / wallets).
_JEWELRY_SUBCATEGORY_OVERRIDES = {
    "tiff-knox": "ring",
    "cn-coco": "ring",
    "sixteen-stone": "ring",
    "tif-t": "bracelet",
    "tif-lock": "bracelet",
    "tif-knot": "bracelet",
    "tif-hardwear": "bracelet",
    "ch-18k": "necklace",
    "l-demin-jean": None,
    "gy-black": None,
    "multipocket-backpack": None,
    "box": None,
    "custom-order": None,
    "elegant-flower-motif-jewelry-collection": None,  # boxed multi-piece set
}


def classify_jewelry_subcategory(product: dict) -> str | None:
    """Returns one of JEWELRY_SUBCATEGORIES' keys, or None if it doesn't fit
    any (e.g. watch items, or non-jewelry/placeholder entries under
    "jewelry")."""
    if product["category"] != "jewelry":
        return None
    if product["id"] in _JEWELRY_SUBCATEGORY_OVERRIDES:
        return _JEWELRY_SUBCATEGORY_OVERRIDES[product["id"]]
    id_text = product["id"].replace("-", " ")
    for key, patterns in _JEWELRY_SUBCATEGORY_PATTERNS:
        if any(re.search(p, id_text) for p in patterns):
            return key
    return None


# Neither existing watch product's id/name carries a gender marker, so
# there's no reliable regex signal (unlike jewelry's ring/necklace/etc.
# keywords) — every watch has to be classified explicitly here. Add new
# watch ids as they're catalogued; anything not listed here falls through
# to the keyword patterns below as a fallback for future entries that *do*
# spell out "men"/"women" in the id.
_WATCH_SUBCATEGORY_OVERRIDES = {
    "santos-de-watch-gold": "women",
    "santos-de-watch": "women",
}
_WATCH_SUBCATEGORY_PATTERNS = [
    ("men", [r"\bmen\b", r"\bmens\b", r"\bmale\b"]),
    ("women", [r"\bwomen\b", r"\bwomens\b", r"\bfemale\b", r"\blad(y|ies)\b"]),
]


def classify_watch_subcategory(product: dict) -> str | None:
    """Returns a WATCH_SUBCATEGORIES key, or None if ungendered/unclassified."""
    if product["category"] != "watch":
        return None
    if product["id"] in _WATCH_SUBCATEGORY_OVERRIDES:
        return _WATCH_SUBCATEGORY_OVERRIDES[product["id"]]
    id_text = product["id"].replace("-", " ")
    for key, patterns in _WATCH_SUBCATEGORY_PATTERNS:
        if any(re.search(p, id_text) for p in patterns):
            return key
    return None


def abs_url(path: str) -> str:
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return BASE_URL + path


def breadcrumb_jsonld(crumbs: list[tuple[str, str]]) -> dict:
    return {
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": i + 1,
                "name": label,
                "item": abs_url(url),
            }
            for i, (label, url) in enumerate(crumbs)
        ],
    }


def money(n) -> str:
    return "₩" + f"{int(n):,}"


def esc(s: str) -> str:
    """Escapes text for use as HTML content or an attribute value. Data now
    comes from free-text CMS input (product names, post titles/excerpts),
    not just hand-picked strings, so a literal `"` or `&` must not be able
    to break out of a `content="..."` / `alt="..."` attribute."""
    return html.escape(str(s or ""), quote=True)
