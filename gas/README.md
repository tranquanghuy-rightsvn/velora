# Velora Admin CMS (Google Apps Script)

Admin panel for the Velora Jewelry static site — manages products, orders,
posts (news) and CMS staff accounts. Built on the free-cms-static-site-pipeline
pattern: this script is the only "backend" (Google Sheets as the database),
and it publishes data to this repo's `data/` folder; GitHub Actions
(`.github/workflows/build.yml`) rebuilds `html/` from that data on every push.

## Architecture

```
GAS admin (this folder)
   │ writes
   ▼
Google Sheets (Products, Orders, Posts, Users) — internal source of truth
   │ Products/Posts also publish to GitHub via Contents API
   ▼
data/products.json, data/news.json, data/news/<id>/post.json
   │ push triggers
   ▼
GitHub Actions → scripts/build.py → html/** (regenerated, committed by CI)
   │
   ▼
Vercel/Cloudflare Pages deploys on push
```

Orders and Users are **Sheets-only** — nothing about them is published to
GitHub, it's internal bookkeeping. Only Products and Posts ever touch GitHub.

Orders can arrive two ways:
- **Manually** — staff create/edit them in the admin (주문 관리), same as before.
- **From the cart page** — the `/cart/` "이체 완료, 주문 확정" button collects
  name/phone/email/address and posts straight to this script's `doPost`
  (see "Public checkout endpoint" below), no login involved. This is the
  buyer *self-declaring* they paid — staff still verifies the actual
  transfer/KakaoPay/NaverPay before flipping payment status to 입금완료.

## One-time setup

1. Go to [script.google.com](https://script.google.com), create a new project named "Velora Admin".
2. Copy every file in this folder into the project (matching names):
   `appsscript.json`, `Code.js`, `index.html`, `app.html`, `css.html`, `js.html`.
   (Or install [`clasp`](https://github.com/google/clasp) and run `clasp push` from this folder — recommended once you're iterating, since this folder is **not** deployed by pushing to GitHub; it only lives in git as source, deploys are always manual via clasp or the script editor.)
3. **Project Settings → Script Properties**, add:
   | Key | Value |
   |---|---|
   | `GITHUB_TOKEN` | Fine-grained PAT, scoped to `tranquanghuy-rightsvn/velora` only, **Contents: Read and write** |
   | `GITHUB_REPO` | `tranquanghuy-rightsvn/velora` |
   | `GITHUB_BRANCH` | `master` (optional, this is the default) |
   | `OWNER_NOTIFY_EMAIL` | Your email — where new-order notifications get sent. Optional; orders still save without it, you just won't get emailed. |
4. Run `testGitHubConnection` once from the script editor (select it from the function dropdown, click Run) — authorize the requested scopes when prompted. Check the execution log for `OK - repo ...`.
5. **Deploy → New deployment → Web app**. Execute as **Me**, access **Anyone**. Copy the `/exec` URL — that's both the admin panel's login page AND the public checkout endpoint.
6. Open the URL, log in with the email you deployed as (the script owner is always `root`, no Sheet row needed).
7. Once logged in, go to **계정 관리 (Users)** and add teammates as `editor` or `viewer`.
8. Paste the same `/exec` URL into `html/checkout-config.js` (`window.VELORA_CHECKOUT_ENDPOINT`) and deploy the static site — without this step the cart page's "이체 완료, 주문 확정" button shows a friendly error instead of submitting.

The first login/save auto-creates a spreadsheet named "Velora Admin CMS" in
the deployer's Drive — that's where Products/Orders/Posts/Users sheets live.

## After changing any file in this folder

`gas/` is tracked in git for reference, but **GAS never redeploys from a
git push** — you must manually run `clasp push` (or paste changes into the
script editor) **and then** go to **Deploy → Manage deployments → Edit →
New version** to make the live `/exec` URL actually serve the new code.
Saving in the editor alone is not enough; the web app keeps serving whatever
version was last deployed.

## Public checkout endpoint

`doPost` accepts one action, `submitOrder`, from the cart page's `fetch()`
call (no `google.script.run`, no login — cross-origin from the static site).
It:
- Drops the request silently (`{ok:true}`, no error) if the hidden `website`
  honeypot field is filled — real visitors never touch it, bots that
  auto-fill every field do.
- Rate-limits to 1 submission / 20s per phone-or-email via `CacheService`.
- Requires name + address + (phone or email); validates email format.
- **Recomputes the total from line items server-side** — never trusts a
  client-sent total.
- Writes a new Orders row with `paymentStatus: "입금확인중"` and
  `orderStatus: "신규"` — always a brand-new order, this endpoint can't edit
  or delete.
- Emails `OWNER_NOTIFY_EMAIL` (if configured) with the buyer's info and
  purchased items. A failed email never fails the checkout for the buyer —
  the order is already saved by that point.

`fetch()` sends `Content-Type: text/plain;charset=utf-8` instead of
`application/json` on purpose — this keeps it a CORS "simple request" so the
browser skips an OPTIONS preflight, which `doPost` can't handle (see
`gas-backend-patterns.md` in the free-cms-static-site-pipeline skill).

## Known trade-offs (accepted for this site's scale)

- **Images upload straight to GitHub, no Drive staging.** Every image is its
  own commit (matches how this repo already stores product images directly
  in git). If you open "새로 추가", upload an image, then cancel without
  saving, that image file is left orphaned in the repo (never referenced by
  any published data, so it never appears on the live site — just wasted
  repo space). Clean up manually via GitHub if it accumulates.
- **Product/post IDs (slugs) are immutable once reserved.** The id is
  generated from the name/title the first time you upload an image or hit
  Save, and can't be changed afterward through the UI (renaming would orphan
  already-uploaded images). To truly rename a slug, delete and recreate the
  item, or edit the Sheet + GitHub files directly.
- **No OTP brute-force lockout beyond a per-code attempt counter.** 5 wrong
  attempts invalidates the current code; the user can request a new one
  after the 60s cooldown.
- **Orders have no online payment** — this mirrors the site itself (DM +
  bank transfer). `totalAmount` is always recomputed server-side from line
  items minus discount, never trusted from the client.
- **The public checkout endpoint trusts the buyer's "I paid" click.** There
  is no payment gateway verifying the transfer actually happened —
  `paymentStatus` starts at 입금확인중 specifically so staff always confirm
  the real bank/KakaoPay/NaverPay transfer before treating the order as paid.
- **Email notification uses `MailApp`, which shares Gmail's 100/day quota**
  with OTP login codes. Fine at this site's order volume (one-of-a-kind
  preloved items); if that ever gets tight, move order notifications to a
  Telegram bot (see `hosting-and-quotas.md` in the CMS skill) and keep Gmail
  reserved for OTP.

## Sheet reference

| Sheet | Written by | Published to GitHub? |
|---|---|---|
| `Products` | CMS | Yes → `data/products.json` (full dump, every status) |
| `Posts` | CMS | Yes → `data/news.json` (published only) + `data/news/<id>/post.json` (published only) |
| `Orders` | CMS + public checkout (`doPost`) | No — internal only |
| `Users` | CMS (root only) | No — internal only |

`scripts/sync_products_data.py` filters `data/products.json` down to
`status: "published"` when generating the public `html/products-data.js` —
draft/sold products stay in the sheet and in git history but never appear
on the site.
