#!/usr/bin/env python3
"""Generates the jewelry/watch collection listing pages as static HTML:

  /jewelry/            all jewelry
  /jewelry/rings/      subcategory: 반지
  /jewelry/necklaces/  subcategory: 목걸이
  /jewelry/bracelets/  subcategory: 팔찌
  /jewelry/earrings/   subcategory: 귀걸이
  /watch/              all watches
  /watch/women/        subcategory: 여성 시계
  /watch/men/          subcategory: 남성 시계 (only generated once a men's
                        watch actually exists in products-data.js)

Subcategory is derived from each product's `id` (see seo_common's
classify_jewelry_subcategory / classify_watch_subcategory) — products-data.js
itself is never modified by this script.

Jewelry and watch are unrelated product lines, so their sidebars never mix:
a jewelry page's sidebar shows 주얼리 expanded into its own submenu (전체/반지/
목걸이/팔찌/귀걸이) with 시계 as a single plain link, and a watch page shows the
mirror image — 시계 expanded (전체/여성 시계[/남성 시계]) with 주얼리 as a plain
link. A subcategory with zero matching products is dropped from both the
submenu and the generated pages, never a placeholder page linking nowhere.

Safe to re-run: fully regenerates every file from products-data.js each time.

Usage: python3 scripts/generate_collections.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seo_common import (  # noqa: E402
    FAMILIES,
    SITE_NAME,
    abs_url,
    breadcrumb_jsonld,
    classify_jewelry_subcategory,
    classify_watch_subcategory,
    money,
)

ROOT = Path(__file__).resolve().parent.parent / "html"

CLASSIFY = {
    "jewelry": classify_jewelry_subcategory,
    "watch": classify_watch_subcategory,
}

# Meta description per page. Keyed by (family_key, subcategory_key_or_None).
DESCRIPTIONS = {
    ("jewelry", None): "반지, 목걸이, 팔찌까지 Cartier · Tiffany & Co. · Van Cleef & Arpels 정품 프리러브드 주얼리를 만나보세요. "
                        "정품 인증서와 오리지널 박스가 모든 제품에 포함됩니다.",
    ("jewelry", "ring"): "Cartier LOVE 링, 저스트 앵 끌루 링부터 Tiffany 노트 링까지 — 정품 프리러브드 반지를 만나보세요. "
                          "정품 인증서와 오리지널 박스가 모든 제품에 포함됩니다.",
    ("jewelry", "necklace"): "Van Cleef & Arpels 빈티지 알함브라, Cartier LOVE 펜던트 등 정품 프리러브드 목걸이 · 펜던트를 만나보세요. "
                              "정품 인증서와 오리지널 박스가 모든 제품에 포함됩니다.",
    ("jewelry", "bracelet"): "Cartier 저스트 앵 끌루, Van Cleef & Arpels 빈티지 알함브라 등 정품 프리러브드 팔찌 · 뱅글을 만나보세요. "
                              "정품 인증서와 오리지널 박스가 모든 제품에 포함됩니다.",
    ("jewelry", "earring"): "Cartier LOVE 스터드 등 정품 프리러브드 귀걸이를 만나보세요. 정품 인증서와 오리지널 박스가 모든 제품에 포함됩니다.",
    ("watch", None): "산토스 드 까르띠에 등 정품 프리러브드 시계를 합리적인 가격에 만나보세요. "
                      "정품 인증서와 오리지널 박스가 모든 제품에 포함됩니다.",
    ("watch", "women"): "산토스 드 까르띠에 등 정품 프리러브드 여성 시계를 합리적인 가격에 만나보세요. "
                         "정품 인증서와 오리지널 박스가 모든 제품에 포함됩니다.",
    ("watch", "men"): "정품 프리러브드 남성 시계를 합리적인 가격에 만나보세요. 정품 인증서와 오리지널 박스가 모든 제품에 포함됩니다.",
}


def load_products() -> list[dict]:
    raw = (ROOT / "products-data.js").read_text(encoding="utf-8")
    return json.loads(raw.split("=", 1)[1].rstrip(";\n"))


def build_pages(products: list[dict]) -> list[dict]:
    """One entry per page actually worth generating: every family's "all"
    page, plus each subcategory that has at least one matching product."""
    pages = []
    for family in FAMILIES:
        classify = CLASSIFY[family["key"]]
        family_products = [p for p in products if p["category"] == family["key"]]
        pages.append(
            {
                "family": family["key"],
                "sub": None,
                "path": family["path"],
                "label": family["label"],
                "products": family_products,
            }
        )
        for sc in family["subcategories"]:
            matched = [p for p in family_products if classify(p) == sc["key"]]
            if not matched:
                continue  # e.g. 남성 시계 while no men's watch exists yet
            pages.append(
                {
                    "family": family["key"],
                    "sub": sc["key"],
                    "path": sc["path"],
                    "label": sc["label"],
                    "products": matched,
                }
            )
    return pages


def product_card_html(p: dict) -> str:
    img = p["images"][0] if p["images"] else ""
    link = f'/products/{p["id"]}/'
    return (
        '        <div class="product-card">\n'
        '          <div class="product-card__media">\n'
        f'            <button class="pcard__wish" aria-label="위시리스트 추가" data-wish-id="{p["id"]}" '
        f'data-wish-name="{p["name"]}" data-wish-image="{img}" data-wish-link="{link}">\n'
        '              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">'
        '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>\n'
        '            </button>\n'
        f'            <a href="{link}"><img src="{img}" alt="{p["name"]}" loading="lazy" /></a>\n'
        '            <span class="product-card__badge">정품 · 프리러브드</span>\n'
        '          </div>\n'
        '          <div class="product-card__info">\n'
        f'            <a href="{link}" class="product-card__name">{p["name"]}</a>\n'
        f'            <p class="product-card__price">{money(p["price"])}</p>\n'
        f'            <a href="{link}" class="pcard__cta">장바구니 담기</a>\n'
        '          </div>\n'
        '        </div>'
    )


def build_sidebar(active_family: str, active_sub: str | None, generated_pages: list[dict]) -> str:
    def link(href: str, label: str, is_active: bool) -> str:
        aria = ' aria-current="page"' if is_active else ""
        return f'<a href="{href}"{aria}>{label}</a>'

    lines = ['<ul class="collection-sidebar__list">']
    for family in FAMILIES:
        is_active_family = family["key"] == active_family
        top_href = f'/{family["path"]}/'
        if not is_active_family:
            lines.append(f'        <li>{link(top_href, family["label"], False)}</li>')
            continue

        # Only list subcategories that actually got a page generated for
        # them (i.e. have >=1 product) — same rule build_pages() used.
        available_subs = [
            sc for sc in family["subcategories"]
            if any(pg["family"] == family["key"] and pg["sub"] == sc["key"] for pg in generated_pages)
        ]
        sub_items = [f'          <li>{link(top_href, "전체", active_sub is None)}</li>']
        for sc in available_subs:
            sub_href = f'/{sc["path"]}/'
            sub_items.append(
                f'          <li>{link(sub_href, sc["label"], active_sub == sc["key"])}</li>'
            )
        lines.append('        <li class="collection-sidebar__group collection-sidebar__group--active">')
        lines.append(f'          {link(top_href, family["label"], active_sub is None)}')
        lines.append('          <ul class="collection-sidebar__sublist">')
        lines.extend(sub_items)
        lines.append('          </ul>')
        lines.append('        </li>')
    lines.append('      </ul>')
    return "\n".join(lines)


def build_seo_block(page: dict, url: str, image: str | None, count: int) -> str:
    title = f'{page["label"]} — {SITE_NAME}'
    desc = DESCRIPTIONS[(page["family"], page["sub"])]
    og_image = abs_url(image) if image else abs_url("/images/products/love-ring-certificate-detail.jpg")

    family_meta = next(f for f in FAMILIES if f["key"] == page["family"])
    breadcrumbs = [("홈", "/"), (family_meta["label"], f'/{family_meta["path"]}/')]
    if page["sub"] is not None:
        breadcrumbs.append((page["label"], url.replace("https://velorakr.com", "")))

    graph = [
        breadcrumb_jsonld(breadcrumbs),
        {
            "@type": "CollectionPage",
            "name": title,
            "description": desc,
            "url": url,
            "image": og_image,
            "mainEntity": {"@type": "ItemList", "numberOfItems": count},
        },
    ]
    ld_json = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False)

    return f"""  <!-- SEO:AUTO:START -->
  <link rel="canonical" href="{url}" />
  <meta name="description" content="{desc}" />
  <meta name="robots" content="index, follow" />
  <meta name="theme-color" content="#0d0d0d" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="{SITE_NAME}" />
  <meta property="og:locale" content="ko_KR" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{desc}" />
  <meta property="og:url" content="{url}" />
  <meta property="og:image" content="{og_image}" />
  <meta property="og:image:alt" content="{title}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{title}" />
  <meta name="twitter:description" content="{desc}" />
  <meta name="twitter:image" content="{og_image}" />
  <script type="application/ld+json" id="seo-jsonld">{ld_json}</script>
  <!-- SEO:AUTO:END -->"""


PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
{seo_block}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Funnel+Display:wght@300;400;500;600&family=Figtree:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body class="inner-page">

  <nav class="breadcrumb">
    <a href="/">홈</a>
    <span class="breadcrumb__sep">/</span>
{breadcrumb_extra}  </nav>

  <div class="collection-page" id="main-content">
    <aside class="collection-sidebar">
      {sidebar}

      <div class="collection-filter">
        <h3 class="collection-filter__title">안내</h3>
        <div class="collection-filter__group collection-filter__group--note">
          <p>모든 제품은 정품 확인 절차를 거친 프리러브드(사전 소유) 제품이며, 한 점씩만 보유하고 있어 재고가 수시로 변동됩니다. 정확한 가격과 재고는 인스타그램 DM으로 문의해 주세요.</p>
          <a href="https://www.instagram.com/velo.rajwlry" target="_blank" rel="noopener" class="collection-filter__cta">DM으로 문의하기</a>
        </div>
      </div>
    </aside>

    <div class="collection-main">
      <div class="collection-toolbar">
        <p class="collection-toolbar__count">{count}개 제품</p>
        <div class="collection-sort">
          <label for="sort-select">정렬 기준:</label>
          <select id="sort-select">
            <option value="manual">추천</option>
            <option value="title-ascending">알파벳순, A-Z</option>
            <option value="title-descending">알파벳순, Z-A</option>
          </select>
        </div>
      </div>

      <h2 class="collection-section-title">{label}</h2>

      <div class="product-grid product-grid--section">

{cards}
      </div>
    </div>
  </div>

  <div id="newsletter-placeholder"></div>

  <script src="/shared.js"></script>
  <script src="/wishlist.js"></script>
  <script src="/cart.js"></script>
</body>
</html>
"""


def build_page(page: dict, generated_pages: list[dict]) -> str:
    products = page["products"]
    url = abs_url(f'/{page["path"]}/')
    title = f'{page["label"]} — {SITE_NAME}'
    image = products[0]["images"][0] if products and products[0]["images"] else None
    family_meta = next(f for f in FAMILIES if f["key"] == page["family"])

    if page["sub"] is None:
        breadcrumb_extra = f'    <span>{page["label"]}</span>\n'
    else:
        breadcrumb_extra = (
            f'    <a href="/{family_meta["path"]}/">{family_meta["label"]}</a>\n'
            '    <span class="breadcrumb__sep">/</span>\n'
            f'    <span>{page["label"]}</span>\n'
        )

    return PAGE_TEMPLATE.format(
        title=title,
        seo_block=build_seo_block(page, url, image, len(products)),
        breadcrumb_extra=breadcrumb_extra,
        sidebar=build_sidebar(page["family"], page["sub"], generated_pages),
        count=len(products),
        label=page["label"],
        cards="\n\n".join(product_card_html(p) for p in products),
    )


def main():
    products = load_products()
    pages = build_pages(products)

    for page in pages:
        out_dir = ROOT / page["path"]
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(build_page(page, pages), encoding="utf-8")
        print(f'  /{page["path"]}/  ({len(page["products"])}개 제품)')

    print(f"Generated {len(pages)} collection page(s).")


if __name__ == "__main__":
    main()
