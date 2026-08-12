#!/usr/bin/env python3
"""Generates the news (blog) pages from CMS data:

  data/news.json               index of PUBLISHED posts (id, title, excerpt,
                                coverImage, publishedAt) — written by the GAS
                                admin CMS, always the full published list.
  data/news/<slug>/post.json   full record for one post (adds `content`,
                                the rich HTML body) — written per-post by the
                                CMS, only when that post is saved.

Output:
  html/news/index.html         listing of every published post
  html/news/<slug>/index.html  one detail page per published post

Safe to re-run: regenerates every file from data/news.json each time, and
deletes stale html/news/<slug>/ directories for posts no longer in the index
(same pattern as generate_products.py).

Usage: python3 scripts/generate_news.py
"""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

from bs4 import BeautifulSoup

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from seo_common import BASE_URL, SITE_NAME, abs_url, breadcrumb_jsonld, esc  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
NEWS_DIR = ROOT / "html" / "news"


def load_index() -> list[dict]:
    return json.loads((DATA_DIR / "news.json").read_text(encoding="utf-8"))


def load_post(post_id: str) -> dict | None:
    path = DATA_DIR / "news" / post_id / "post.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


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
    text = BeautifulSoup(html or "", "html.parser").get_text("")
    return re.sub(r"\s+", " ", text).strip()


def truncate(s: str, max_len: int) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1].rstrip() + "…"


def format_date(iso_date: str) -> str:
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", iso_date or "")
    if not m:
        return iso_date or ""
    y, mo, d = m.groups()
    return f"{y}.{mo}.{d}"


def post_card_html(post: dict) -> str:
    link = f'/news/{post["id"]}/'
    cover = post.get("coverImage") or abs_url("/images/seo/default-og.jpg")
    title = esc(post["title"])
    return (
        '<a class="post-card" href="' + link + '">'
        '<div class="post-card__media"><img loading="lazy" src="' + cover + '" alt="' + title + '" /></div>'
        '<div class="post-card__body">'
        '<p class="post-card__date">' + format_date(post.get("publishedAt", "")) + '</p>'
        '<h2 class="post-card__title">' + title + '</h2>'
        '<p class="post-card__excerpt">' + esc(truncate(post.get("excerpt", ""), 110)) + '</p>'
        "</div></a>"
    )


LIST_TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>뉴스 — {site_name}</title>
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
    <span>뉴스</span>
  </nav>

  <div class="news-page" id="main-content">
    <h1 class="news-page__title">뉴스</h1>
{body}
  </div>

  <div id="newsletter-placeholder"></div>

  <script src="/shared.js"></script>
  <script src="/wishlist.js"></script>
  <script src="/cart.js"></script>
</body>
</html>
"""

DETAIL_TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title} — {site_name}</title>
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
    <a href="/news/">뉴스</a>
    <span class="breadcrumb__sep">/</span>
    <span>{title}</span>
  </nav>

  <article class="post-detail" id="main-content">
    <p class="post-detail__date">{date}</p>
    <h1 class="post-detail__title">{title}</h1>
{cover_html}
    <div class="post-detail__content">{content}</div>
    <a class="post-detail__back" href="/news/">← 뉴스 목록으로</a>
  </article>

  <div id="newsletter-placeholder"></div>

  <script src="/shared.js"></script>
  <script src="/wishlist.js"></script>
  <script src="/cart.js"></script>
</body>
</html>
"""


def build_list_seo(posts: list[dict]) -> str:
    canonical_url = abs_url("/news/")
    description = "Velora Jewelry의 새로운 입고 소식과 브랜드 스토리를 확인해 보세요."
    graph = [
        breadcrumb_jsonld([("홈", "/"), ("뉴스", "/news/")]),
        {"@type": "WebPage", "name": f"뉴스 — {SITE_NAME}", "description": description, "url": canonical_url},
    ]
    ld_json = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False)
    og_image = posts[0]["coverImage"] if posts and posts[0].get("coverImage") else abs_url("/images/seo/default-og.jpg")
    return f"""  <!-- SEO:AUTO:START -->
  <link rel="canonical" href="{canonical_url}" />
  <meta name="description" content="{description}" />
  <meta name="robots" content="index, follow" />
  <meta name="theme-color" content="#0d0d0d" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="{SITE_NAME}" />
  <meta property="og:locale" content="ko_KR" />
  <meta property="og:title" content="뉴스 — {SITE_NAME}" />
  <meta property="og:description" content="{description}" />
  <meta property="og:url" content="{canonical_url}" />
  <meta property="og:image" content="{og_image}" />
  <script type="application/ld+json" id="seo-jsonld">{ld_json}</script>
  <!-- SEO:AUTO:END -->"""


def build_detail_seo(post: dict, canonical_url: str, plain_excerpt: str, cover: str) -> str:
    title = esc(post["title"])
    desc = esc(plain_excerpt)
    graph = [
        breadcrumb_jsonld([("홈", "/"), ("뉴스", "/news/"), (post["title"], canonical_url)]),
        {
            "@type": "BlogPosting",
            "headline": post["title"],
            "description": plain_excerpt,
            "image": [cover] if cover else [],
            "datePublished": post.get("publishedAt", ""),
            "url": canonical_url,
            "publisher": {"@type": "Organization", "name": SITE_NAME},
        },
    ]
    ld_json = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False)
    return f"""  <!-- SEO:AUTO:START -->
  <link rel="canonical" href="{canonical_url}" />
  <meta name="description" content="{desc}" />
  <meta name="robots" content="index, follow" />
  <meta name="theme-color" content="#0d0d0d" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="{SITE_NAME}" />
  <meta property="og:locale" content="ko_KR" />
  <meta property="og:title" content="{title} — {SITE_NAME}" />
  <meta property="og:description" content="{desc}" />
  <meta property="og:url" content="{canonical_url}" />
  <meta property="og:image" content="{cover}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{title} — {SITE_NAME}" />
  <meta name="twitter:description" content="{desc}" />
  <meta name="twitter:image" content="{cover}" />
  <script type="application/ld+json" id="seo-jsonld">{ld_json}</script>
  <!-- SEO:AUTO:END -->"""


def build_list_page(posts: list[dict]) -> str:
    if posts:
        body = '\n    <div class="post-list">\n' + "\n".join(post_card_html(p) for p in posts) + "\n    </div>"
    else:
        body = '\n    <div class="news-empty">\n      <p class="news-empty__msg">아직 게시된 글이 없습니다</p>\n    </div>'
    return LIST_TEMPLATE.format(site_name=SITE_NAME, seo_block=build_list_seo(posts), body=body)


def build_detail_page(post: dict) -> str:
    canonical_url = abs_url(f'/news/{post["id"]}/')
    cover = abs_url(post["coverImage"]) if post.get("coverImage") else ""
    plain_excerpt = truncate(post.get("excerpt") or strip_html(post.get("content", "")), 160)
    title = esc(post["title"])
    cover_html = f'    <div class="post-detail__cover"><img src="{cover}" alt="{title}" /></div>\n' if cover else ""
    return DETAIL_TEMPLATE.format(
        site_name=SITE_NAME,
        title=title,
        seo_block=build_detail_seo(post, canonical_url, plain_excerpt, cover),
        date=format_date(post.get("publishedAt", "")),
        cover_html=cover_html,
        content=sanitize_html(post.get("content", "")),
    )


def main():
    index = load_index()
    ids = {p["id"] for p in index}

    NEWS_DIR.mkdir(exist_ok=True)
    for existing in NEWS_DIR.iterdir():
        if existing.is_dir() and existing.name not in ids:
            shutil.rmtree(existing)
            print(f"  removed stale: news/{existing.name}/")

    posts_sorted = sorted(index, key=lambda p: p.get("publishedAt", ""), reverse=True)
    (NEWS_DIR / "index.html").write_text(build_list_page(posts_sorted), encoding="utf-8")

    built = 0
    for entry in index:
        full = load_post(entry["id"])
        if full is None:
            print(f"  WARNING: data/news/{entry['id']}/post.json missing, skipping detail page")
            continue
        out_dir = NEWS_DIR / entry["id"]
        out_dir.mkdir(exist_ok=True)
        (out_dir / "index.html").write_text(build_detail_page(full), encoding="utf-8")
        built += 1

    print(f"Generated news list + {built} post page(s) under {NEWS_DIR.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
