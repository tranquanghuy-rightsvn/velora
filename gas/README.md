# Velora Admin CMS (Google Apps Script)

Admin panel for the Velora Jewelry static site — manages products, orders,
posts (news) and CMS staff accounts. **UI language is Vietnamese** (the
operators are Vietnamese-speaking staff; the storefront itself stays Korean). Built on the free-cms-static-site-pipeline
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
- **Manually** — staff create/edit them in the admin (Quản lý đơn hàng), same as before.
- **From the cart page** — the `/cart/` "이체 완료, 주문 확정" (bank transfer
  done / confirm order) button collects name/phone/email/address and posts
  straight to this script's `doPost` (see "Public checkout endpoint" below),
  no login involved. This is the buyer *self-declaring* they paid — staff
  still verifies the actual transfer before flipping payment status to
  "Đã thanh toán".

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
5. Run `importProductsFromWebsite` once the same way (function dropdown → Run) — this is a **one-time catalog import**: it pulls `data/products.json` (the ~108 products already live on velorakr.com, added before this CMS existed) into the Products sheet, so **Quản lý sản phẩm** isn't empty on first login. See "One-time catalog import" below for details — it's safe to re-run if you tweak `data/products.json` by hand afterward.
6. **Deploy → New deployment → Web app**. Execute as **Me**, access **Anyone**. Copy the `/exec` URL — that's both the admin panel's login page AND the public checkout endpoint.
7. Open the URL, log in with the email you deployed as (the script owner is always `root`, no Sheet row needed).
8. Once logged in, go to **Quản lý tài khoản (Users)** and add teammates as `editor` or `viewer`.
9. Paste the same `/exec` URL into `html/checkout-config.js` (`window.VELORA_CHECKOUT_ENDPOINT`) and deploy the static site — without this step the cart page's "이체 완료, 주문 확정" button shows a friendly error instead of submitting.

The first login/save auto-creates a spreadsheet named "Velora Admin CMS" in
the deployer's Drive — that's where Products/Orders/Posts/Users sheets live.

## After changing any file in this folder

`gas/` is tracked in git for reference, but **GAS never redeploys from a
git push** — you must manually run `clasp push` (or paste changes into the
script editor) **and then** go to **Deploy → Manage deployments → Edit →
New version** to make the live `/exec` URL actually serve the new code.
Saving in the editor alone is not enough; the web app keeps serving whatever
version was last deployed.

`appsscript.json` doesn't list `oauthScopes` — Apps Script auto-detects the
scopes it needs by scanning what services `Code.js` actually calls
(`SpreadsheetApp`, `DriveApp`, `MailApp`, `UrlFetchApp`, ...), so a new
service showing up in the code (e.g. adding `DriveApp` calls) is picked up
automatically; there's no scope list to keep in sync by hand.

What you DO still have to do whenever the set of needed scopes changes: run
any function once from the script editor's function dropdown. Google prompts
for the (now larger) authorization right there — accept everything offered,
including any "unverified app" warning (Advanced → Go to Velora Admin
(unsafe) → Allow). Skip this and you'll see "insufficient permission" /
"This app might not work as expected without providing all requested
permissions" errors even though the code itself is correct. Then, as always,
**Deploy → Manage deployments → Edit → New version** — re-authorizing in the
editor doesn't retroactively apply to a web app URL that was deployed before
the new scope existed.

## One-time catalog import

`importProductsFromWebsite` (in `Code.js`) is a manual, run-from-the-editor
utility — it has no button in the admin UI and isn't called from `js.html`.
It exists for exactly one situation: the site's ~108 products were added by
hand to `products-data.js` / `data/products.json` before this CMS existed,
so the Products sheet starts out empty even though the site has a full
catalog. Running it once copies `data/products.json` from GitHub into the
sheet, matching the exact field names the CMS already uses (`id`, `name`,
`category`, `price`, `images`, `description`, `status`, `order`).

- **Run it**: Script Editor → function dropdown → `importProductsFromWebsite` → Run (▶). Check **Executions** (or **View → Logs**) for a summary line like `Xong: đã nhập 108 sản phẩm mới, cập nhật 0 sản phẩm đã có, bỏ qua 0 mục lỗi.`
- **Safe to re-run**: it matches each item by `id` and overwrites that row in place — never duplicates, never touches a row whose id isn't in the file. So the workflow "edit `data/products.json` by hand (fix a category, a description...) → commit/push → re-run" works cleanly if you want to bulk-correct something before handing the catalog over to the CMS UI.
- **One-directional, no GitHub writes**: it only reads `data/products.json` and writes to the Sheet — it never calls `publishProductsIndex_`, so it can't accidentally trigger a site rebuild or overwrite `data/products.json` with something different. From that point on, edit products through **Quản lý sản phẩm** as usual; the CMS becomes the source of truth going forward.
- **After this**, `data/products.json` on GitHub and the Products sheet describe the same 108 products — the CMS just doesn't know about it until this import runs once.

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
- Writes a new Orders row with `paymentStatus: "Đang xác nhận chuyển khoản"`
  and `orderStatus: "Mới"` — always a brand-new order, this endpoint can't
  edit or delete.
- Emails `OWNER_NOTIFY_EMAIL` (if configured) with the buyer's info and
  purchased items. A failed email never fails the checkout for the buyer —
  the order is already saved by that point.

`fetch()` sends `Content-Type: text/plain;charset=utf-8` instead of
`application/json` on purpose — this keeps it a CORS "simple request" so the
browser skips an OPTIONS preflight, which `doPost` can't handle (see
`gas-backend-patterns.md` in the free-cms-static-site-pipeline skill).

## Images: staged in Drive, published to GitHub at save time

Selecting a product image or a post cover/inline image uploads it to a Drive
folder ("Velora Admin CMS Images") first, not to GitHub — Drive's share link
works instantly, so the gallery/editor always shows a real preview. A fresh
GitHub commit, by contrast, isn't visible on the live site until the host
(Vercel/Cloudflare) finishes redeploying, which can take anywhere from
seconds to a couple of minutes; previewing straight from GitHub would mean a
broken image for that whole window.

The Drive copy only ever matters while editing. Hitting **Lưu** is what
actually publishes: `saveProduct`/`savePost` read the bytes back from Drive
and push them to `html/images/products/` or `html/news/<id>/images/` on
GitHub, rewriting the reference to the final site-relative path before the
record is written to the Sheet. Nothing in the Sheet or in `data/*.json` ever
points at a Drive URL — only the admin UI does, and only for images added
during the current, unsaved edit.

## Known trade-offs (accepted for this site's scale)

- **Drive staging files are never deleted automatically.** If you upload an
  image and then cancel without saving (or remove it from the gallery before
  saving), the copy stays in Drive under "Velora Admin CMS Images" — harmless
  clutter (15GB free tier, not referenced by the Sheet or the site), but not
  self-cleaning. Delete manually from Drive if it piles up.
- **Product/post IDs (slugs) are only editable while creating a new item.**
  It's auto-suggested from the name/title but can be typed by hand before the
  first save (validated as lowercase letters/numbers/hyphens, and checked for
  collisions with existing items). Once saved, the ID field locks — renaming
  would orphan already-uploaded images (product images are named
  `<id>-01.jpg`; post images live under `html/news/<id>/images/`). To truly
  rename a slug, delete and recreate the item, or edit the Sheet + GitHub
  files directly.
- **No OTP brute-force lockout beyond a per-code attempt counter.** 5 wrong
  attempts invalidates the current code; the user can request a new one
  after the 60s cooldown.
- **Orders have no online payment** — this mirrors the site itself (DM +
  bank transfer). `totalAmount` is always recomputed server-side from line
  items minus discount, never trusted from the client.
- **The public checkout endpoint trusts the buyer's "I paid" click.** There
  is no payment gateway verifying the transfer actually happened —
  `paymentStatus` starts at "Đang xác nhận chuyển khoản" specifically so
  staff always confirm the real bank transfer before treating the order as paid.
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
