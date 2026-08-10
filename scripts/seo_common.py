"""Shared SEO constants/helpers for seo_meta.py and generate_products.py."""
from __future__ import annotations

BASE_URL = "https://velorakr.com"
SITE_NAME = "Velora Jewelry"
INSTAGRAM = "https://www.instagram.com/velo.rajwlry"
DEFAULT_OG_IMAGE = "https://www.sodastw.com/cdn/shop/files/nh_man_hinh_2026-06-24_luc_13.51.06.png"

COLLECTION = {
    "jewelry": {"label": "주얼리", "link": "/jewelry/"},
    "watch": {"label": "시계", "link": "/watch/"},
}


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
