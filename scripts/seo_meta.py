#!/usr/bin/env python3
"""Bulk SEO injector for the Velora Jewelry static site.

Adds/updates, for every static page under html/:
  - canonical link
  - meta description + robots
  - Open Graph + Twitter Card tags
  - JSON-LD (Organization/WebSite on the homepage, BreadcrumbList +
    CollectionPage/WebPage/FAQPage elsewhere)

Also regenerates robots.txt and sitemap.xml (products pulled live from
products-data.js so the sitemap never goes stale), and syncs the
"N개 제품" counter on the collection pages to the real card count.

Safe to re-run: every page keeps one auto-managed block between
<!-- SEO:AUTO:START --> / <!-- SEO:AUTO:END --> markers that gets fully
replaced on each run. Nothing outside that block is touched.

Usage: python3 scripts/seo_meta.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seo_common import BASE_URL, SITE_NAME, INSTAGRAM, DEFAULT_OG_IMAGE, COLLECTION_PAGE_PATHS, abs_url, breadcrumb_jsonld  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent / "html"

START = "<!-- SEO:AUTO:START -->"
END = "<!-- SEO:AUTO:END -->"


# ---------------------------------------------------------------------------
# Page catalogue
# ---------------------------------------------------------------------------
# path: URL path (also the folder holding index.html, "" = site root)
# title: reused verbatim from the page's own <title> unless overridden here
# desc: meta description / og:description
# breadcrumbs: [(label, url_path), ...] ending in the current page
# schema: which JSON-LD type(s) to emit besides BreadcrumbList
# robots: override default "index, follow"
#
# /jewelry/, /jewelry/rings|necklaces|bracelets|earrings/, /watch/ and
# /products/<id>/ own their SEO block generation in generate_collections.py
# / generate_products.py instead — not listed here.
PAGES = [
    {
        "path": "",
        "desc": "Cartier, Tiffany & Co., Van Cleef & Arpels 등 하이엔드 브랜드의 정품 프리러브드 주얼리와 시계를 만나보세요. "
                "정품 인증서와 오리지널 박스가 함께하는 합리적인 가격의 럭셔리 주얼리 셀렉트숍, Velora Jewelry.",
        "breadcrumbs": [("홈", "/")],
        "schema": {"org_website": True},
        "og_image": DEFAULT_OG_IMAGE,
    },
    {
        "path": "about",
        "desc": "Velora Jewelry의 정품 보증 절차를 소개합니다. 매입부터 판매까지 각인 · 소재 · 마감을 확인하는 정품 감정을 거치며, "
                "모든 제품은 오리지널 박스와 인증서와 함께 제공됩니다.",
        "breadcrumbs": [("홈", "/"), ("정품 보증 안내", "/about/")],
        "schema": {"webpage": "AboutPage"},
        "og_image": "/images/products/love-ring-certificate-detail.jpg",
    },
    {
        "path": "contact",
        "desc": "제품 사이즈, 컨디션, 가격 문의는 인스타그램 DM @velo.rajwlry로 편하게 연락해 주세요. 평균 24시간 이내 답변드립니다.",
        "breadcrumbs": [("홈", "/"), ("문의하기", "/contact/")],
        "schema": {"webpage": "ContactPage"},
    },
    {
        "path": "faqs",
        "desc": "정품 확인 절차, 배송, 교환 · 반품 등 Velora Jewelry 이용에 관해 자주 묻는 질문을 확인해 보세요.",
        "breadcrumbs": [("홈", "/"), ("자주 묻는 질문", "/faqs/")],
        "schema": {"faq": True},
    },
    {
        "path": "news",
        "desc": "Velora Jewelry의 새로운 입고 소식과 브랜드 스토리를 확인해 보세요.",
        "breadcrumbs": [("홈", "/"), ("뉴스", "/news/")],
        "schema": {"webpage": "WebPage"},
    },
    {
        "path": "cart",
        "desc": "선택하신 프리러브드 주얼리 · 시계를 장바구니에서 확인하고 인스타그램 DM으로 주문을 진행해 보세요.",
        "breadcrumbs": [("홈", "/"), ("장바구니", "/cart/")],
        "schema": {},
        "robots": "noindex, follow",
    },
    {
        "path": "wishlist",
        "desc": "관심 있는 프리러브드 주얼리 · 시계를 위시리스트에 저장하고 나중에 다시 확인해 보세요.",
        "breadcrumbs": [("홈", "/"), ("위시리스트", "/wishlist/")],
        "schema": {},
        "robots": "noindex, follow",
    },
]


def get_title(soup: BeautifulSoup) -> str:
    tag = soup.find("title")
    return tag.get_text(strip=True) if tag else SITE_NAME


def extract_faqs(soup: BeautifulSoup) -> list[tuple[str, str]]:
    pairs = []
    for item in soup.select(".faq-item"):
        btn = item.select_one(".faq-item__btn")
        content = item.select_one(".faq-item__content")
        if not btn or not content:
            continue
        question = btn.get_text(" ", strip=True)
        question = re.sub(r"\s*\+\s*$", "", question).strip()
        answer = content.get_text(" ", strip=True)
        if question and answer:
            pairs.append((question, answer))
    return pairs


def build_head_block(page: dict, soup: BeautifulSoup) -> str:
    path = page["path"]
    url_path = f"/{path}/" if path else "/"
    url = abs_url(url_path)
    title = get_title(soup)
    desc = page["desc"]
    robots = page.get("robots", "index, follow")
    og_image = abs_url(page.get("og_image", DEFAULT_OG_IMAGE))

    lines = [START]
    lines.append(f'<link rel="canonical" href="{url}" />')
    lines.append(f'<meta name="description" content="{desc}" />')
    lines.append(f'<meta name="robots" content="{robots}" />')
    lines.append(f'<meta name="theme-color" content="#0d0d0d" />')

    # Open Graph
    og_type = "website"
    lines.append(f'<meta property="og:type" content="{og_type}" />')
    lines.append(f'<meta property="og:site_name" content="{SITE_NAME}" />')
    lines.append(f'<meta property="og:locale" content="ko_KR" />')
    lines.append(f'<meta property="og:title" content="{title}" />')
    lines.append(f'<meta property="og:description" content="{desc}" />')
    lines.append(f'<meta property="og:url" content="{url}" />')
    lines.append(f'<meta property="og:image" content="{og_image}" />')
    lines.append(f'<meta property="og:image:alt" content="{title}" />')

    # Twitter
    lines.append(f'<meta name="twitter:card" content="summary_large_image" />')
    lines.append(f'<meta name="twitter:title" content="{title}" />')
    lines.append(f'<meta name="twitter:description" content="{desc}" />')
    lines.append(f'<meta name="twitter:image" content="{og_image}" />')

    # JSON-LD
    graph = [breadcrumb_jsonld(page["breadcrumbs"])]
    schema = page.get("schema", {})

    if schema.get("org_website"):
        graph.append(
            {
                "@type": "Organization",
                "name": SITE_NAME,
                "url": BASE_URL,
                "logo": og_image,
                "sameAs": [INSTAGRAM],
            }
        )
        graph.append(
            {
                "@type": "WebSite",
                "name": SITE_NAME,
                "url": BASE_URL,
            }
        )

    if schema.get("webpage"):
        graph.append(
            {
                "@type": schema["webpage"],
                "name": title,
                "description": desc,
                "url": url,
            }
        )

    if schema.get("faq"):
        pairs = extract_faqs(soup)
        if pairs:
            graph.append(
                {
                    "@type": "FAQPage",
                    "mainEntity": [
                        {
                            "@type": "Question",
                            "name": q,
                            "acceptedAnswer": {"@type": "Answer", "text": a},
                        }
                        for q, a in pairs
                    ],
                }
            )

    ld = {"@context": "https://schema.org", "@graph": graph}
    lines.append(
        '<script type="application/ld+json" id="seo-jsonld">'
        + json.dumps(ld, ensure_ascii=False)
        + "</script>"
    )

    lines.append(END)
    return "\n  ".join(lines)


def process_file(path: Path, page: dict) -> bool:
    raw = path.read_text(encoding="utf-8")
    soup = BeautifulSoup(raw, "html.parser")

    block = build_head_block(page, soup)

    if START in raw and END in raw:
        new_raw = re.sub(
            re.escape(START) + r".*?" + re.escape(END),
            block,
            raw,
            flags=re.S,
        )
    else:
        title_match = re.search(r"</title>\s*\n", raw)
        if not title_match:
            raise RuntimeError(f"no <title> found in {path}")
        insert_at = title_match.end()
        new_raw = raw[:insert_at] + "  " + block + "\n" + raw[insert_at:]

    if new_raw != raw:
        path.write_text(new_raw, encoding="utf-8")
        return True
    return False


def write_robots():
    content = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /cart/\n"
        "Disallow: /wishlist/\n"
        "Disallow: /admin/\n"
        f"Sitemap: {BASE_URL}/sitemap.xml\n"
    )
    (ROOT / "robots.txt").write_text(content, encoding="utf-8")


def write_sitemap():
    products = json.loads(
        (ROOT / "products-data.js").read_text(encoding="utf-8").split("=", 1)[1].rstrip(";\n")
    )
    news_index_path = ROOT.parent / "data" / "news.json"
    news_posts = json.loads(news_index_path.read_text(encoding="utf-8")) if news_index_path.exists() else []

    urls: list[tuple[str, str]] = []
    for page in PAGES:
        if page.get("robots", "").startswith("noindex"):
            continue
        path = page["path"]
        urls.append((f"/{path}/" if path else "/", "weekly" if path == "" else "daily"))
    for path in COLLECTION_PAGE_PATHS:
        # Subcategory pages (e.g. watch/men) only exist once generate_collections.py
        # has actually generated one — skip candidates with no matching products.
        if (ROOT / path / "index.html").exists():
            urls.append((f"/{path}/", "daily"))

    entries = "\n".join(
        f"  <url>\n    <loc>{abs_url(p)}</loc>\n    <changefreq>{freq}</changefreq>\n  </url>"
        for p, freq in urls
    )
    entries += "\n" + "\n".join(
        f'  <url>\n    <loc>{abs_url("/products/" + prod["id"] + "/")}</loc>\n    <changefreq>weekly</changefreq>\n  </url>'
        for prod in products
    )
    entries += "\n" + "\n".join(
        f'  <url>\n    <loc>{abs_url("/news/" + post["id"] + "/")}</loc>\n    <changefreq>monthly</changefreq>\n  </url>'
        for post in news_posts
    )

    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entries}\n"
        "</urlset>\n"
    )
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")


def main():
    changed = []
    for page in PAGES:
        path = ROOT / page["path"] / "index.html" if page["path"] else ROOT / "index.html"
        if not path.exists():
            print(f"  skip (missing): {path}")
            continue
        if process_file(path, page):
            changed.append(path)

    write_robots()
    write_sitemap()

    print(f"Updated {len(changed)} page(s):")
    for p in changed:
        print(f"  - {p.relative_to(ROOT)}")
    print("Wrote robots.txt and sitemap.xml")


if __name__ == "__main__":
    main()
