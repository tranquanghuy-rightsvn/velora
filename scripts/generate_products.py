#!/usr/bin/env python3
"""Generates one static page per product: html/products/<id>/index.html.

Replaces the old single `/product/?item=<id>` template (product-detail.js
read the query string and rendered the product client-side). Every product
now gets a real pre-rendered HTML file — full content, meta tags and
JSON-LD are present in the initial response, no JS required to see them.

The product `id` in products-data.js (already a kebab-case slug, e.g.
"tiffany-knot-ring-rose-gold-diamonds") is reused as the URL slug.

Safe to re-run: it always regenerates every products/<id>/index.html from
scratch from products-data.js, so it stays in sync as products are added,
edited or removed (stale directories for removed products are deleted too).

Usage: python3 scripts/generate_products.py
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seo_common import BASE_URL, SITE_NAME, COLLECTION, abs_url, breadcrumb_jsonld, esc, money  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent / "html"
PRODUCTS_DIR = ROOT / "products"


def load_products() -> list[dict]:
    raw = (ROOT / "products-data.js").read_text(encoding="utf-8")
    return json.loads(raw.split("=", 1)[1].rstrip(";\n"))


def sanitize_html(html: str) -> str:
    soup = BeautifulSoup(html or "", "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    for tag in soup.find_all(True):
        for attr in list(tag.attrs):
            if attr.lower().startswith("on"):
                del tag.attrs[attr]
    return str(soup)


def strip_html(html: str) -> str:
    # No join separator: real whitespace between block tags already exists
    # in the source (e.g. "</p>\n<p>"); a separator would also wrongly
    # inject spaces at inline-tag boundaries like "<b>노트 링</b>은".
    text = BeautifulSoup(html or "", "html.parser").get_text("")
    return re.sub(r"\s+", " ", text).strip()


def truncate(s: str, max_len: int) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1].rstrip() + "…"


def pick_related(product: dict, products: list[dict], limit: int = 8) -> list[dict]:
    related = [p for p in products if p["category"] == product["category"] and p["id"] != product["id"]]
    if len(related) <= limit:
        return related
    step = max(1, len(related) // limit)
    picks = []
    i = 0
    while i < len(related) and len(picks) < limit:
        picks.append(related[i])
        i += step
    return picks


def thumb_html(src: str, alt: str, active: bool) -> str:
    cls = "product-gallery__thumb" + (" product-gallery__thumb--active" if active else "")
    loading = "" if active else ' loading="lazy"'
    return f'<button class="{cls}"><img{loading} src="{src}" alt="{esc(alt)}" /></button>'


def pcard_html(p: dict) -> str:
    img = p["images"][0] if p["images"] else ""
    link = f'/products/{p["id"]}/'
    name = esc(p["name"])
    return (
        '<div class="pcard">'
        '<div class="pcard__media">'
        f'<button class="pcard__wish" aria-label="위시리스트 추가" data-wish-id="{p["id"]}" '
        f'data-wish-name="{name}" data-wish-image="{img}" data-wish-link="{link}">'
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">'
        '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>'
        "</button>"
        f'<a href="{link}"><img loading="lazy" src="{img}" alt="{name}" /></a>'
        '<span class="pcard__badge">정품 · 프리러브드</span>'
        "</div>"
        '<div class="pcard__info">'
        f'<p class="pcard__name">{name}</p>'
        f'<p class="pcard__price">{money(p["price"])}</p>'
        f'<a href="{link}" class="pcard__cta">장바구니 담기</a>'
        "</div>"
        "</div>"
    )


def build_seo_block(product: dict, collection: dict, canonical_url: str, plain_desc: str, images: list[str]) -> str:
    name = esc(product["name"])
    desc = esc(plain_desc)
    title = f'{name} — {SITE_NAME}'
    og_image = images[0] if images else abs_url("/images/seo/default-og.jpg")

    graph = [
        breadcrumb_jsonld(
            [
                ("홈", "/"),
                (collection["label"], collection["link"]),
                (product["name"], canonical_url),
            ]
        ),
        {
            "@type": "Product",
            "name": product["name"],
            "image": images,
            "description": plain_desc,
            "sku": product["id"],
            "brand": {"@type": "Brand", "name": SITE_NAME},
            "offers": {
                "@type": "Offer",
                "url": canonical_url,
                "priceCurrency": "KRW",
                "price": str(product["price"]),
                "availability": "https://schema.org/InStock",
                "itemCondition": "https://schema.org/UsedCondition",
            },
        },
    ]
    ld = {"@context": "https://schema.org", "@graph": graph}
    ld_json = json.dumps(ld, ensure_ascii=False)

    return f"""  <!-- SEO:AUTO:START -->
  <link rel="canonical" href="{canonical_url}" />
  <meta name="description" content="{desc}" />
  <meta name="robots" content="index, follow" />
  <meta name="theme-color" content="#0d0d0d" />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="{SITE_NAME}" />
  <meta property="og:locale" content="ko_KR" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{desc}" />
  <meta property="og:url" content="{canonical_url}" />
  <meta property="og:image" content="{og_image}" />
  <meta property="og:image:alt" content="{name}" />
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
    <a href="{collection_link}">{collection_label}</a>
    <span class="breadcrumb__sep">/</span>
    <span>{name}</span>
  </nav>

  <div class="product-detail" id="main-content">
    <div class="product-gallery">
      <div class="product-gallery__thumbs">{thumbs}</div>
      <div class="product-gallery__main">
        <img src="{main_image}" alt="{name}" id="productMainImg" />
      </div>
    </div>

    <div class="product-info">
      <p class="product-info__vendor">Velora</p>
      <h1 class="product-info__title">{name}</h1>
      <p class="product-info__price-label">가격</p>
      <p class="product-info__price">{price}</p>
      <p class="product-info__tax">정품 확인 완료 · 오리지널 박스 &amp; 인증서 포함.</p>

      <div class="product-info__actions">
        <a href="/cart/" class="product-info__add-to-cart" id="addToCartBtn" data-cart-id="{id}" data-cart-name="{name}" data-cart-image="{main_image}" data-cart-price="{raw_price}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="10" y1="11" x2="14" y2="11"/></svg>
          <span class="product-info__add-to-cart-label">장바구니 담기</span>
        </a>
        <a href="/cart/" class="product-info__view-cart" aria-label="장바구니로 이동">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </a>
      </div>
      <a href="{collection_link}" class="product-info__other-options">다른 상품 보기</a>

      <div class="product-info__secure">
        <p>DM 문의 후 결제 안내</p>
        <div class="payment-badges">
          <span class="payment-badge">카카오페이</span>
          <span class="payment-badge">네이버페이</span>
          <span class="payment-badge">계좌이체</span>
        </div>
      </div>

      <ul class="product-info__trust">
        <li>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6L9 17l-5-5"/></svg>
          정품 확인 절차 완료
        </li>
        <li>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6L9 17l-5-5"/></svg>
          오리지널 박스 · 인증서 포함
        </li>
        <li>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6L9 17l-5-5"/></svg>
          1:1 DM 상담으로 사이즈 확인
        </li>
      </ul>
    </div>
  </div>

  <div class="product-more">
    <div class="product-accordion">
      <div class="faq-item open">
        <button class="faq-item__btn">설명 <span class="faq-item__icon">+</span></button>
        <div class="faq-item__body">
          <div class="faq-item__content">{description}</div>
        </div>
      </div>
      <div class="faq-item">
        <button class="faq-item__btn">배송 정책 <span class="faq-item__icon">+</span></button>
        <div class="faq-item__body">
          <div class="faq-item__content">DM으로 결제 확인 후 1-2 영업일 내 안전 포장하여 발송해 드립니다. 국내 무료 배송이며, 등기 및 안심 택배로만 발송됩니다.</div>
        </div>
      </div>
      <div class="faq-item">
        <button class="faq-item__btn">반품 및 교환 <span class="faq-item__icon">+</span></button>
        <div class="faq-item__body">
          <div class="faq-item__content">프리러브드 특성상 단순 변심에 의한 반품은 어려운 점 양해 부탁드립니다. 다만 정품이 아니거나 상품 설명과 실제 상태가 다른 경우, 수령 후 3일 이내 연락 주시면 전액 환불 또는 교환해 드립니다.</div>
        </div>
      </div>
    </div>

    <button class="product-info__share">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      공유하기
    </button>
  </div>

  <!-- Related Products -->
  <section class="related-products">
    <div class="products__header">
      <h2 class="products__heading">함께 보면 좋은 상품</h2>
      <p class="products__sub">한 점씩만 보유하는 프리러브드 특성상 재고가 빠르게 소진될 수 있습니다.</p>
    </div>
    <div class="products__carousel" id="productsCarousel">
      <button class="products__arrow products__arrow--prev" id="prevBtn" aria-label="이전">
        <svg width="9" height="16" viewBox="0 0 9 16">
          <path d="M8 1L1 8l7 7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"
            stroke-linejoin="round" />
        </svg>
      </button>
      <div class="products__track-wrap">
        <div class="products__viewport">
          <div class="products__track" id="productsTrack">
{related_cards}
          </div>
        </div>
      </div>
      <button class="products__arrow products__arrow--next" id="nextBtn" aria-label="다음">
        <svg width="9" height="16" viewBox="0 0 9 16">
          <path d="M1 1l7 7-7 7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"
            stroke-linejoin="round" />
        </svg>
      </button>
    </div>
    <div class="products__dots" id="productsDots" role="tablist" aria-label="상품 슬라이드 위치"></div>
  </section>

  <!-- Sticky mobile purchase bar -->
  <div class="sticky-buy-bar" id="stickyBuyBar">
    <div class="sticky-buy-bar__info">
      <p class="sticky-buy-bar__name">{name}</p>
      <p class="sticky-buy-bar__price">{price}</p>
    </div>
    <a href="/cart/" class="sticky-buy-bar__cta" id="stickyBuyBarCta" data-cart-id="{id}" data-cart-name="{name}" data-cart-image="{main_image}" data-cart-price="{raw_price}">장바구니 담기</a>
  </div>

  <div id="newsletter-placeholder"></div>

  <script src="/shared.js"></script>
  <script src="/wishlist.js"></script>
  <script src="/script.js"></script>
  <script src="/cart.js"></script>
  <script>
    document.querySelectorAll('.product-accordion .faq-item__btn').forEach(function (btn) {{
      btn.addEventListener('click', function () {{
        var item = this.closest('.faq-item');
        item.classList.toggle('open');
      }});
    }});

    document.querySelectorAll('.product-gallery__thumb').forEach(function (thumb) {{
      thumb.addEventListener('click', function () {{
        document.querySelectorAll('.product-gallery__thumb').forEach(function (t) {{ t.classList.remove('product-gallery__thumb--active'); }});
        this.classList.add('product-gallery__thumb--active');
        document.getElementById('productMainImg').src = this.querySelector('img').src;
      }});
    }});

    // Sticky mobile buy bar: reveal once the main CTA scrolls out of view
    (function () {{
      var bar = document.getElementById('stickyBuyBar');
      var mainCta = document.querySelector('.product-info__add-to-cart');
      if (!bar || !mainCta || !window.IntersectionObserver) return;
      var io = new IntersectionObserver(function (entries) {{
        entries.forEach(function (e) {{
          bar.classList.toggle('sticky-buy-bar--visible', !e.isIntersecting);
        }});
      }}, {{ threshold: 0 }});
      io.observe(mainCta);
    }})();
  </script>
</body>
</html>
"""


def build_page(product: dict, products: list[dict]) -> str:
    collection = COLLECTION.get(product["category"], COLLECTION["jewelry"])
    canonical_url = abs_url(f'/products/{product["id"]}/')
    images = [abs_url(src) for src in product["images"]]
    plain_desc = truncate(strip_html(product["description"]) or product["name"], 160)

    thumbs = "".join(
        thumb_html(src, product["name"], i == 0) for i, src in enumerate(product["images"])
    )
    related = pick_related(product, products)
    related_cards = "\n".join(pcard_html(p) for p in related)

    seo_block = build_seo_block(product, collection, canonical_url, plain_desc, images)

    return PAGE_TEMPLATE.format(
        title=f'{esc(product["name"])} — {SITE_NAME}',
        seo_block=seo_block,
        collection_link=collection["link"],
        collection_label=collection["label"],
        name=esc(product["name"]),
        thumbs=thumbs,
        main_image=product["images"][0] if product["images"] else "",
        price=money(product["price"]),
        raw_price=product["price"],
        id=product["id"],
        description=sanitize_html(product["description"]) or f'<p>{product["name"]}</p>',
        related_cards=related_cards,
    )


def main():
    products = load_products()
    ids = {p["id"] for p in products}

    PRODUCTS_DIR.mkdir(exist_ok=True)

    # Drop stale directories for products that no longer exist.
    for existing in PRODUCTS_DIR.iterdir():
        if existing.is_dir() and existing.name not in ids:
            shutil.rmtree(existing)
            print(f"  removed stale: products/{existing.name}/")

    for product in products:
        out_dir = PRODUCTS_DIR / product["id"]
        out_dir.mkdir(exist_ok=True)
        (out_dir / "index.html").write_text(build_page(product, products), encoding="utf-8")

    print(f"Generated {len(products)} product page(s) under {PRODUCTS_DIR.relative_to(ROOT.parent)}/")


if __name__ == "__main__":
    main()
