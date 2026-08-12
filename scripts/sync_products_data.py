#!/usr/bin/env python3
"""Syncs data/products.json (CMS source of truth, every status) into
html/products-data.js (public runtime data, published products only).

data/products.json is written by the GAS admin CMS on every product
save/delete — it always holds the FULL catalog (draft/sold/published).
This script filters to status == "published", sorts by the `order` field,
and writes the plain array shape products-data.js has always had (no
status/order/createdAt/updatedAt — those are CMS-only bookkeeping).

Safe to re-run: fully regenerates html/products-data.js from data/products.json.

Usage: python3 scripts/sync_products_data.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "products.json"
OUT_FILE = ROOT / "html" / "products-data.js"

PUBLIC_FIELDS = ("id", "name", "category", "price", "images", "description")


def main():
    products = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    published = [p for p in products if p.get("status", "published") == "published"]
    published.sort(key=lambda p: p.get("order", 0))

    public = [{k: p[k] for k in PUBLIC_FIELDS} for p in published]
    body = json.dumps(public, ensure_ascii=False)
    OUT_FILE.write_text(f"window.VELORA_PRODUCTS ={body};", encoding="utf-8")
    print(f"Synced {len(public)}/{len(products)} published product(s) to {OUT_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
