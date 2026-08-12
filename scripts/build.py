#!/usr/bin/env python3
"""Rebuilds the static site from data/*.json (the CMS source of truth).

Run this after data/products.json, data/news.json or data/news/<slug>/post.json
change — locally after editing them by hand, or in CI after the GAS admin
CMS pushes a change. Order matters: products-data.js must exist before the
product/collection generators read it.

Usage: python3 scripts/build.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sync_products_data  # noqa: E402
import generate_products  # noqa: E402
import generate_collections  # noqa: E402
import generate_news  # noqa: E402
import seo_meta  # noqa: E402


def main():
    sync_products_data.main()
    generate_products.main()
    generate_collections.main()
    generate_news.main()
    seo_meta.main()


if __name__ == "__main__":
    main()
