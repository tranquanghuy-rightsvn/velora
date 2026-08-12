/**
 * Velora Admin CMS — Google Apps Script backend.
 *
 * 4 modules, all backed by Google Sheets in one spreadsheet:
 *   - Products  : catalog (draft/published/sold) — publishes data/products.json to GitHub
 *   - Posts     : news/blog — publishes data/news.json + data/news/<slug>/post.json to GitHub
 *   - Orders    : manual order book (site has no checkout — orders are DM/bank-transfer based) — Sheets only
 *   - Users     : CMS staff accounts (root/editor/viewer) — Sheets only
 *
 * GitHub Actions (.github/workflows/build.yml) rebuilds the static site under
 * html/ whenever data/products.json or data/news.json changes — this script
 * never generates HTML itself, it only writes data.
 *
 * Required Script Properties (Project Settings -> Script Properties):
 *   GITHUB_TOKEN   fine-grained PAT, Contents: Read and write, scoped to this repo only
 *   GITHUB_REPO    "tranquanghuy-rightsvn/velora"
 *   GITHUB_BRANCH  "master" (optional, defaults to "master")
 */

// ---------------------------------------------------------------------------
// Web app entry points
// ---------------------------------------------------------------------------

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Velora Admin')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Markup for the logged-in app shell — only returned once the token passes requireRole_. */
function getAppHtml(token) {
  requireRole_(token, 'viewer');
  return HtmlService.createHtmlOutputFromFile('app').getContent();
}

/** Single round-trip for page load: session check + app shell together. */
function boot(token) {
  const me = getMe(token);
  return { me: me, appHtml: me.role ? HtmlService.createHtmlOutputFromFile('app').getContent() : '' };
}

// ---------------------------------------------------------------------------
// Auth — OTP over email (no dependency on Google Workspace session)
// ---------------------------------------------------------------------------

const USERS_SHEET_NAME = 'Users';
const OTP_TTL_SECONDS = 600; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;
const TOKEN_TTL_DAYS = 30;

function getUsersSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
    sheet.appendRow(['email', 'role', 'createdAt']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 'root' | 'editor' | 'viewer' | null. The script owner is always root, never needs a Users row. */
function findRole_(email) {
  if (!email) return null;
  const ownerEmail = (Session.getEffectiveUser().getEmail() || '').toLowerCase().trim();
  if (email === ownerEmail) return 'root';
  const sheet = getUsersSheet_();
  if (sheet.getLastRow() >= 2) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (let i = 0; i < rows.length; i++) {
      const rowEmail = String(rows[i][0] || '').toLowerCase().trim();
      const role = String(rows[i][1] || '').toLowerCase().trim();
      if (rowEmail === email && (role === 'root' || role === 'editor' || role === 'viewer')) return role;
    }
  }
  return null;
}

function requestOtp(email) {
  email = String(email || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('이메일 형식이 올바르지 않습니다.');
  if (!findRole_(email)) throw new Error('접근 권한이 없는 이메일입니다. 관리자에게 문의하세요.');

  const cache = CacheService.getScriptCache();
  if (cache.get('otp_cooldown:' + email)) throw new Error('1분 후 다시 시도해 주세요.');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('otp:' + email, code, OTP_TTL_SECONDS);
  cache.put('otp_tries:' + email, '0', OTP_TTL_SECONDS);
  cache.put('otp_cooldown:' + email, '1', 60);

  MailApp.sendEmail({
    to: email,
    subject: 'Velora Admin — 로그인 코드',
    body: '로그인 코드: ' + code + '\n\n10분간 유효합니다. 요청하지 않으셨다면 이 메일을 무시하세요.',
  });
  return { ok: true };
}

function verifyOtp(email, code) {
  email = String(email || '').toLowerCase().trim();
  const cache = CacheService.getScriptCache();

  const tries = Number(cache.get('otp_tries:' + email) || '0');
  if (tries >= OTP_MAX_ATTEMPTS) {
    cache.remove('otp:' + email);
    throw new Error('시도 횟수를 초과했습니다. 코드를 다시 요청해 주세요.');
  }

  const expected = cache.get('otp:' + email);
  if (!expected || expected !== String(code || '').trim()) {
    cache.put('otp_tries:' + email, String(tries + 1), OTP_TTL_SECONDS);
    throw new Error('코드가 올바르지 않거나 만료되었습니다.');
  }
  cache.remove('otp:' + email);
  cache.remove('otp_tries:' + email);

  const token = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty(
    'token:' + token,
    JSON.stringify({ email: email, created: Date.now() })
  );
  return { token: token, me: getMe(token) };
}

function getSession_(token) {
  if (!token) return null;
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('token:' + token);
  if (!raw) return null;
  const session = JSON.parse(raw);
  if (Date.now() - session.created > TOKEN_TTL_DAYS * 86400000) {
    props.deleteProperty('token:' + token);
    return null;
  }
  return session;
}

/** {email, role}. role is null when the token is missing/expired or access was revoked. */
function getMe(token) {
  const session = getSession_(token);
  if (!session) return { email: '', role: null };
  return { email: session.email, role: findRole_(session.email) };
}

function logout(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('token:' + token);
  return { ok: true };
}

function requireRole_(token, need) {
  const rank = { viewer: 1, editor: 2, root: 3 };
  const me = getMe(token);
  if (!me.role || rank[me.role] < rank[need]) {
    throw new Error('권한이 없습니다 ("' + need + '" 이상 필요). 다시 로그인해 주세요.');
  }
  return me;
}

// ---------------------------------------------------------------------------
// Users (CMS staff accounts) — root only
// ---------------------------------------------------------------------------

function listUsers(token) {
  requireRole_(token, 'root');
  const sheet = getUsersSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 3)
    .getValues()
    .filter(function (r) { return String(r[0] || '').trim(); })
    .map(function (r) {
      const role = String(r[1] || '').toLowerCase().trim();
      return { email: String(r[0]).toLowerCase().trim(), role: role, createdAt: normalizeDate_(r[2]), editable: role !== 'root' };
    });
}

function findUserRow_(sheet, email) {
  if (sheet.getLastRow() < 2) return -1;
  const emails = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < emails.length; i++) {
    if (String(emails[i][0] || '').toLowerCase().trim() === email) return i + 2;
  }
  return -1;
}

function addUser(token, email, role) {
  requireRole_(token, 'root');
  email = String(email || '').toLowerCase().trim();
  role = String(role || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('이메일 형식이 올바르지 않습니다.');
  if (role !== 'editor' && role !== 'viewer') throw new Error('권한은 editor 또는 viewer만 가능합니다.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getUsersSheet_();
    if (findUserRow_(sheet, email) !== -1) throw new Error('이미 등록된 이메일입니다.');
    sheet.appendRow([email, role, new Date().toISOString()]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function updateUserRole(token, email, role) {
  const me = requireRole_(token, 'root');
  email = String(email || '').toLowerCase().trim();
  role = String(role || '').toLowerCase().trim();
  if (role !== 'editor' && role !== 'viewer') throw new Error('권한은 editor 또는 viewer만 가능합니다.');
  if (email === me.email) throw new Error('자기 자신의 권한은 변경할 수 없습니다.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getUsersSheet_();
    const row = findUserRow_(sheet, email);
    if (row === -1) throw new Error('사용자를 찾을 수 없습니다.');
    const current = String(sheet.getRange(row, 2).getValue()).toLowerCase().trim();
    if (current === 'root') throw new Error('root 계정은 화면에서 수정할 수 없습니다. 시트에서 직접 수정하세요.');
    sheet.getRange(row, 2).setValue(role);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function deleteUser(token, email) {
  const me = requireRole_(token, 'root');
  email = String(email || '').toLowerCase().trim();
  if (email === me.email) throw new Error('자기 자신은 삭제할 수 없습니다.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getUsersSheet_();
    const row = findUserRow_(sheet, email);
    if (row === -1) throw new Error('사용자를 찾을 수 없습니다.');
    const current = String(sheet.getRange(row, 2).getValue()).toLowerCase().trim();
    if (current === 'root') throw new Error('root 계정은 화면에서 삭제할 수 없습니다. 시트에서 직접 수정하세요.');
    sheet.deleteRow(row);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sheet helpers (generic)
// ---------------------------------------------------------------------------

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create('Velora Admin CMS');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function ensureSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < headers.length) {
    // New columns land at the end (see HEADERS constants below) so old rows never shift.
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function findRowIndexById_(sheet, id) {
  if (sheet.getLastRow() < 2) return -1;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return -1;
}

/** Sheets silently turns "YYYY-MM-DD" strings into Date objects on write; normalize back on read. */
function normalizeDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return value === undefined || value === null ? '' : String(value);
}

function slugify_(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const PRODUCTS_SHEET_NAME = 'Products';
const PRODUCT_HEADERS = ['id', 'name', 'category', 'price', 'imagesJson', 'description', 'status', 'order', 'createdAt', 'updatedAt'];
const PRODUCT_CATEGORIES = ['jewelry', 'watch'];
const PRODUCT_STATUSES = ['draft', 'published', 'sold'];

function getProductsSheet_() {
  return ensureSheet_(PRODUCTS_SHEET_NAME, PRODUCT_HEADERS);
}

function rowToProduct_(row) {
  const p = {};
  PRODUCT_HEADERS.forEach(function (h, i) { p[h] = row[i] === undefined ? '' : row[i]; });
  try {
    p.images = p.imagesJson ? JSON.parse(p.imagesJson) : [];
  } catch (e) {
    p.images = [];
  }
  delete p.imagesJson;
  p.price = Number(p.price) || 0;
  p.order = p.order === '' || p.order === null ? 0 : Number(p.order);
  p.createdAt = normalizeDate_(p.createdAt);
  p.updatedAt = normalizeDate_(p.updatedAt);
  return p;
}

/** List for the admin table — includes every status, sorted by display order. */
function listProducts(token) {
  requireRole_(token, 'viewer');
  const sheet = getProductsSheet_();
  if (sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, PRODUCT_HEADERS.length).getValues();
  return rows
    .filter(function (r) { return r[0]; })
    .map(rowToProduct_)
    .sort(function (a, b) { return a.order - b.order; });
}

function getProduct(token, id) {
  requireRole_(token, 'viewer');
  const sheet = getProductsSheet_();
  const rowIndex = findRowIndexById_(sheet, id);
  if (rowIndex === -1) throw new Error('상품을 찾을 수 없습니다: ' + id);
  return rowToProduct_(sheet.getRange(rowIndex, 1, 1, PRODUCT_HEADERS.length).getValues()[0]);
}

/**
 * Computes a unique product id (slug) from a proposed name, without writing
 * anything. The client calls this once (e.g. on first blur of the name
 * field) and locks the result in as the id BEFORE uploading any images —
 * image paths are named "<id>-01.jpg" etc, so the id has to exist first.
 */
function reserveProductId(token, name) {
  requireRole_(token, 'editor');
  const sheet = getProductsSheet_();
  const base = slugify_(name) || 'product';
  let id = base;
  let n = 2;
  while (findRowIndexById_(sheet, id) !== -1) { id = base + '-' + n; n++; }
  return { id: id };
}

/**
 * product = {id, name, category, price, images: [path...], description, status}
 * id is required — either an id reserved via reserveProductId (create) or an
 * existing product's id (edit).
 */
function saveProduct(token, product) {
  requireRole_(token, 'editor');
  if (!product || !product.name || !product.name.trim()) throw new Error('상품명을 입력하세요.');
  const id = String((product && product.id) || '').trim();
  if (!id) throw new Error('상품 ID가 없습니다. 상품명을 입력해 ID를 먼저 생성하세요.');
  if (PRODUCT_CATEGORIES.indexOf(product.category) === -1) throw new Error('카테고리는 jewelry 또는 watch만 가능합니다.');
  const price = Number(product.price);
  if (!isFinite(price) || price < 0) throw new Error('가격이 올바르지 않습니다.');
  const status = PRODUCT_STATUSES.indexOf(product.status) === -1 ? 'draft' : product.status;

  let record = null;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getProductsSheet_();
    const rowIndex = findRowIndexById_(sheet, id);
    const now = new Date().toISOString();
    const existing = rowIndex !== -1 ? rowToProduct_(sheet.getRange(rowIndex, 1, 1, PRODUCT_HEADERS.length).getValues()[0]) : null;
    const lastRow = sheet.getLastRow();
    const nextOrder = lastRow < 2 ? 0 : lastRow - 1;

    record = {
      id: id,
      name: product.name.trim(),
      category: product.category,
      price: price,
      images: Array.isArray(product.images) ? product.images : [],
      description: product.description || '',
      status: status,
      order: existing ? existing.order : nextOrder,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    const rowValues = PRODUCT_HEADERS.map(function (h) {
      return h === 'imagesJson' ? JSON.stringify(record.images) : record[h];
    });

    if (rowIndex === -1) {
      sheet.appendRow(rowValues);
    } else {
      sheet.getRange(rowIndex, 1, 1, PRODUCT_HEADERS.length).setValues([rowValues]);
    }
  } finally {
    lock.releaseLock();
  }

  let github = { ok: true };
  try {
    publishProductsIndex_('CMS: update product "' + record.id + '"');
  } catch (e) {
    github = { ok: false, error: String((e && e.message) || e) };
  }
  return { ok: true, id: record.id, github: github };
}

function deleteProduct(token, id) {
  requireRole_(token, 'editor');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getProductsSheet_();
    const rowIndex = findRowIndexById_(sheet, id);
    if (rowIndex === -1) throw new Error('상품을 찾을 수 없습니다: ' + id);
    sheet.deleteRow(rowIndex);
  } finally {
    lock.releaseLock();
  }

  let github = { ok: true };
  try {
    ghDeleteFilesByPrefix_('html/images/products', id + '-', 'CMS: delete product "' + id + '" images');
    publishProductsIndex_('CMS: delete product "' + id + '"');
  } catch (e) {
    github = { ok: false, error: String((e && e.message) || e) };
  }
  return { ok: true, github: github };
}

/** Full catalog dump (every status) — data/products.json is always rebuilt from the whole sheet. */
function listAllProductsForPublish_() {
  const sheet = getProductsSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, PRODUCT_HEADERS.length)
    .getValues()
    .filter(function (r) { return r[0]; })
    .map(rowToProduct_)
    .sort(function (a, b) { return a.order - b.order; });
}

function publishProductsIndex_(message) {
  ghPutJson_('data/products.json', listAllProductsForPublish_(), message);
}

/**
 * Uploads one already-compressed product image straight to the site's image
 * folder (html/images/products/) — this repo already commits product images
 * to git directly (no Drive staging), so the CMS keeps that same convention.
 */
function uploadProductImage(token, productId, index, base64Data, mimeType) {
  requireRole_(token, 'editor');
  if (!productId) throw new Error('상품 ID가 없습니다.');
  const ext = extForMime_(mimeType);
  const n = String(index).padStart(2, '0');
  const path = 'html/images/products/' + productId + '-' + n + '.' + ext;
  ghPutFile_(path, base64Data, 'CMS: upload image for "' + productId + '"');
  return { path: '/images/products/' + productId + '-' + n + '.' + ext };
}

// ---------------------------------------------------------------------------
// Posts (news / blog)
// ---------------------------------------------------------------------------

const POSTS_SHEET_NAME = 'Posts';
const POST_HEADERS = ['id', 'title', 'excerpt', 'coverImage', 'content', 'status', 'publishedAt', 'createdAt', 'updatedAt'];
const POST_STATUSES = ['draft', 'published'];

function getPostsSheet_() {
  return ensureSheet_(POSTS_SHEET_NAME, POST_HEADERS);
}

function rowToPost_(row) {
  const p = {};
  POST_HEADERS.forEach(function (h, i) { p[h] = row[i] === undefined ? '' : row[i]; });
  p.publishedAt = normalizeDate_(p.publishedAt);
  p.createdAt = normalizeDate_(p.createdAt);
  p.updatedAt = normalizeDate_(p.updatedAt);
  return p;
}

/** List for the admin table — content is heavy, so it's stripped here (fetch full record via getPost). */
function listPosts(token) {
  requireRole_(token, 'viewer');
  const sheet = getPostsSheet_();
  if (sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, POST_HEADERS.length).getValues();
  return rows
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      const p = rowToPost_(r);
      delete p.content;
      return p;
    })
    .sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
}

function getPost(token, id) {
  requireRole_(token, 'viewer');
  const sheet = getPostsSheet_();
  const rowIndex = findRowIndexById_(sheet, id);
  if (rowIndex === -1) throw new Error('게시글을 찾을 수 없습니다: ' + id);
  return rowToPost_(sheet.getRange(rowIndex, 1, 1, POST_HEADERS.length).getValues()[0]);
}

/**
 * Computes a unique post id (slug) from a proposed title, without writing
 * anything. The client calls this once (e.g. on first blur of the title
 * field) and locks the result in as the id BEFORE uploading a cover/inline
 * image — image paths live under html/news/<id>/images/, so the id has to
 * exist first.
 */
function reservePostId(token, title) {
  requireRole_(token, 'editor');
  const sheet = getPostsSheet_();
  const base = slugify_(title) || 'post';
  let id = base;
  let n = 2;
  while (findRowIndexById_(sheet, id) !== -1) { id = base + '-' + n; n++; }
  return { id: id };
}

/**
 * post = {id, title, excerpt, coverImage, content, status, publishedAt}
 * id is required — either an id reserved via reservePostId (create) or an
 * existing post's id (edit).
 */
function savePost(token, post) {
  requireRole_(token, 'editor');
  if (!post || !post.title || !post.title.trim()) throw new Error('제목을 입력하세요.');
  const id = String((post && post.id) || '').trim();
  if (!id) throw new Error('게시글 ID가 없습니다. 제목을 입력해 ID를 먼저 생성하세요.');
  const status = POST_STATUSES.indexOf(post.status) === -1 ? 'draft' : post.status;

  let record = null;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getPostsSheet_();
    const rowIndex = findRowIndexById_(sheet, id);
    const now = new Date().toISOString();
    const existing = rowIndex !== -1 ? rowToPost_(sheet.getRange(rowIndex, 1, 1, POST_HEADERS.length).getValues()[0]) : null;

    record = {
      id: id,
      title: post.title.trim(),
      excerpt: (post.excerpt || '').trim(),
      coverImage: post.coverImage || '',
      content: post.content || '',
      status: status,
      publishedAt: post.publishedAt || (existing ? existing.publishedAt : '') || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    const rowValues = POST_HEADERS.map(function (h) { return record[h]; });

    if (rowIndex === -1) {
      sheet.appendRow(rowValues);
    } else {
      sheet.getRange(rowIndex, 1, 1, POST_HEADERS.length).setValues([rowValues]);
    }
  } finally {
    lock.releaseLock();
  }

  let github = { ok: true };
  try {
    publishPostToGitHub_(record);
  } catch (e) {
    github = { ok: false, error: String((e && e.message) || e) };
  }
  return { ok: true, id: record.id, github: github };
}

function deletePost(token, id) {
  requireRole_(token, 'editor');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getPostsSheet_();
    const rowIndex = findRowIndexById_(sheet, id);
    if (rowIndex === -1) throw new Error('게시글을 찾을 수 없습니다: ' + id);
    sheet.deleteRow(rowIndex);
  } finally {
    lock.releaseLock();
  }

  let github = { ok: true };
  try {
    ghDeleteDir_('data/news/' + id, 'CMS: delete post "' + id + '"');
    ghDeleteDir_('html/news/' + id, 'CMS: delete post "' + id + '"'); // images + CI-built index.html
    publishPostsIndex_('CMS: delete post "' + id + '"');
  } catch (e) {
    github = { ok: false, error: String((e && e.message) || e) };
  }
  return { ok: true, github: github };
}

/** Published-only index metadata for data/news.json. */
function listPublishedPostsMeta_() {
  const sheet = getPostsSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, POST_HEADERS.length)
    .getValues()
    .filter(function (r) { return r[0]; })
    .map(rowToPost_)
    .filter(function (p) { return p.status === 'published'; })
    .map(function (p) {
      return { id: p.id, title: p.title, excerpt: p.excerpt, coverImage: p.coverImage, publishedAt: p.publishedAt };
    });
}

function publishPostsIndex_(message) {
  ghPutJson_('data/news.json', listPublishedPostsMeta_(), message);
}

/**
 * Pushes one post's full record to data/news/<id>/post.json when published,
 * removes it from GitHub when it's a draft (or was unpublished), then always
 * rewrites data/news.json last — that's the single "commit chốt" file the
 * CI build workflow triggers on.
 */
function publishPostToGitHub_(post) {
  const msg = 'CMS: update post "' + post.id + '"';
  if (post.status === 'published') {
    ghPutJson_('data/news/' + post.id + '/post.json', post, msg);
  } else {
    ghDeleteDir_('data/news/' + post.id, msg);
    ghDeleteDir_('html/news/' + post.id, msg);
  }
  publishPostsIndex_(msg);
}

/** Uploads a post cover/inline image straight to the site's image folder. */
function uploadPostImage(token, postId, base64Data, mimeType, fileName) {
  requireRole_(token, 'editor');
  if (!postId) throw new Error('게시글 ID가 없습니다.');
  const ext = extForMime_(mimeType, fileName);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
  const safeName = (fileName || 'image').replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = 'html/news/' + postId + '/images/' + stamp + '-' + safeName.replace(/\.[^.]+$/, '') + '.' + ext;
  ghPutFile_(path, base64Data, 'CMS: upload image for post "' + postId + '"');
  return { path: '/' + path.replace(/^html\//, '') };
}

// ---------------------------------------------------------------------------
// Orders — manual order book (no online checkout on the site; staff record
// orders taken over Instagram DM / bank transfer). Sheets only, not published
// to GitHub — this is internal bookkeeping, not public site content.
// ---------------------------------------------------------------------------

const ORDERS_SHEET_NAME = 'Orders';
const ORDER_HEADERS = [
  'id', 'customerName', 'customerPhone', 'customerEmail', 'customerInstagram', 'shippingAddress',
  'itemsJson', 'discount', 'totalAmount', 'paymentMethod', 'paymentStatus',
  'orderStatus', 'trackingNumber', 'note', 'createdAt', 'updatedAt',
];
const ORDER_PAYMENT_STATUSES = ['미결제', '입금확인중', '입금완료', '환불'];
const ORDER_STATUSES = ['신규', '확인중', '배송준비', '배송중', '완료', '취소'];

function getOrdersSheet_() {
  return ensureSheet_(ORDERS_SHEET_NAME, ORDER_HEADERS);
}

function rowToOrder_(row) {
  const o = {};
  ORDER_HEADERS.forEach(function (h, i) { o[h] = row[i] === undefined ? '' : row[i]; });
  try {
    o.items = o.itemsJson ? JSON.parse(o.itemsJson) : [];
  } catch (e) {
    o.items = [];
  }
  delete o.itemsJson;
  o.discount = Number(o.discount) || 0;
  o.totalAmount = Number(o.totalAmount) || 0;
  o.createdAt = normalizeDate_(o.createdAt);
  o.updatedAt = normalizeDate_(o.updatedAt);
  return o;
}

function listOrders(token) {
  requireRole_(token, 'viewer');
  const sheet = getOrdersSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, ORDER_HEADERS.length)
    .getValues()
    .filter(function (r) { return r[0]; })
    .map(rowToOrder_)
    .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
}

function getOrder(token, id) {
  requireRole_(token, 'viewer');
  const sheet = getOrdersSheet_();
  const rowIndex = findRowIndexById_(sheet, id);
  if (rowIndex === -1) throw new Error('주문을 찾을 수 없습니다: ' + id);
  return rowToOrder_(sheet.getRange(rowIndex, 1, 1, ORDER_HEADERS.length).getValues()[0]);
}

function validateOrderItems_(items) {
  if (!items.length) throw new Error('최소 1개 이상의 상품을 추가하세요.');
  items.forEach(function (it, i) {
    if (!it.name || !String(it.name).trim()) throw new Error('상품명이 없는 항목이 있습니다 (' + (i + 1) + '번째).');
    if (!isFinite(Number(it.price)) || Number(it.price) < 0) throw new Error('가격이 올바르지 않은 항목이 있습니다 (' + (i + 1) + '번째).');
    if (!isFinite(Number(it.qty)) || Number(it.qty) <= 0) throw new Error('수량이 올바르지 않은 항목이 있습니다 (' + (i + 1) + '번째).');
  });
}

function orderRowValues_(record) {
  return ORDER_HEADERS.map(function (h) { return h === 'itemsJson' ? JSON.stringify(record.items) : record[h]; });
}

/**
 * order = {id?, customerName, customerPhone, customerEmail, customerInstagram,
 *          shippingAddress, items: [{productId, name, price, qty}], discount,
 *          paymentMethod, paymentStatus, orderStatus, trackingNumber, note}
 * totalAmount is always recomputed server-side from items - discount (never
 * trusts a client-sent total) so the sheet can't drift from the line items.
 */
function saveOrder(token, order) {
  requireRole_(token, 'editor');
  if (!order || !order.customerName || !order.customerName.trim()) throw new Error('고객명을 입력하세요.');
  const items = Array.isArray(order.items) ? order.items : [];
  validateOrderItems_(items);
  const discount = Number(order.discount) || 0;
  const subtotal = items.reduce(function (sum, it) { return sum + Number(it.price) * Number(it.qty); }, 0);
  const totalAmount = Math.max(0, subtotal - discount);
  const paymentStatus = ORDER_PAYMENT_STATUSES.indexOf(order.paymentStatus) === -1 ? ORDER_PAYMENT_STATUSES[0] : order.paymentStatus;
  const orderStatus = ORDER_STATUSES.indexOf(order.orderStatus) === -1 ? ORDER_STATUSES[0] : order.orderStatus;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrdersSheet_();
    let id = String(order.id || '').trim();
    let rowIndex = id ? findRowIndexById_(sheet, id) : -1;
    if (!id) {
      id = 'ORD' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMddHHmmss');
    } else if (rowIndex === -1) {
      throw new Error('주문을 찾을 수 없습니다: ' + id);
    }

    const now = new Date().toISOString();
    const existing = rowIndex !== -1 ? rowToOrder_(sheet.getRange(rowIndex, 1, 1, ORDER_HEADERS.length).getValues()[0]) : null;
    const record = {
      id: id,
      customerName: order.customerName.trim(),
      customerPhone: (order.customerPhone || '').trim(),
      customerEmail: (order.customerEmail || '').trim(),
      customerInstagram: (order.customerInstagram || '').trim(),
      shippingAddress: (order.shippingAddress || '').trim(),
      items: items,
      discount: discount,
      totalAmount: totalAmount,
      paymentMethod: (order.paymentMethod || '').trim(),
      paymentStatus: paymentStatus,
      orderStatus: orderStatus,
      trackingNumber: (order.trackingNumber || '').trim(),
      note: (order.note || '').trim(),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    if (rowIndex === -1) {
      sheet.appendRow(orderRowValues_(record));
    } else {
      sheet.getRange(rowIndex, 1, 1, ORDER_HEADERS.length).setValues([orderRowValues_(record)]);
    }
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function deleteOrder(token, id) {
  requireRole_(token, 'editor');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrdersSheet_();
    const rowIndex = findRowIndexById_(sheet, id);
    if (rowIndex === -1) throw new Error('주문을 찾을 수 없습니다: ' + id);
    sheet.deleteRow(rowIndex);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public checkout endpoint — the cart page has no login; a buyer who clicks
// "이체 완료, 주문 확정" (bank transfer done / payment confirmed) posts here.
// No requireRole_ — this is intentionally open to anonymous site visitors,
// so it gets its own, stricter input validation plus basic anti-spam.
// ---------------------------------------------------------------------------

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data.action === 'submitOrder') {
      return jsonOutput_(submitOrderPublic_(data));
    }
    return jsonOutput_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String((err && err.message) || err) });
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * data = {customerName, customerPhone, customerEmail, shippingAddress,
 *         paymentMethod, items: [{name, price, qty}], website}
 * `website` is a honeypot field the cart page keeps hidden from real
 * visitors — bots that auto-fill every input trip it, and the submission is
 * silently accepted-but-dropped so they don't learn to avoid it.
 * Creates a brand-new order (no editing via this endpoint) with
 * paymentStatus "입금확인중" (awaiting staff confirmation) — the buyer is only
 * self-declaring they paid, staff still verifies before marking 입금완료.
 */
function submitOrderPublic_(data) {
  if (data.website) return { ok: true };

  const identifier = String(data.customerPhone || data.customerEmail || '').trim();
  if (identifier) {
    const cache = CacheService.getScriptCache();
    const key = 'order_rl:' + identifier;
    if (cache.get(key)) throw new Error('잠시 후 다시 시도해 주세요.');
    cache.put(key, '1', 20);
  }

  const customerName = String(data.customerName || '').trim();
  const customerPhone = String(data.customerPhone || '').trim();
  const customerEmail = String(data.customerEmail || '').trim();
  const shippingAddress = String(data.shippingAddress || '').trim();
  if (!customerName) throw new Error('이름을 입력하세요.');
  if (!shippingAddress) throw new Error('배송지 주소를 입력하세요.');
  if (!customerPhone && !customerEmail) throw new Error('연락처(전화번호 또는 이메일)를 입력하세요.');
  if (customerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)) throw new Error('이메일 형식이 올바르지 않습니다.');

  const items = (Array.isArray(data.items) ? data.items : []).map(function (it) {
    return { name: it.name, price: Number(it.price) || 0, qty: Number(it.qty) || 0 };
  });
  validateOrderItems_(items);
  const totalAmount = items.reduce(function (sum, it) { return sum + it.price * it.qty; }, 0);

  let record = null;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrdersSheet_();
    const now = new Date().toISOString();
    record = {
      id: 'ORD' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMddHHmmss'),
      customerName: customerName,
      customerPhone: customerPhone,
      customerEmail: customerEmail,
      customerInstagram: '',
      shippingAddress: shippingAddress,
      items: items,
      discount: 0,
      totalAmount: totalAmount,
      paymentMethod: String(data.paymentMethod || '').trim(),
      paymentStatus: '입금확인중',
      orderStatus: '신규',
      trackingNumber: '',
      note: '',
      createdAt: now,
      updatedAt: now,
    };
    sheet.appendRow(orderRowValues_(record));
  } finally {
    lock.releaseLock();
  }

  try {
    notifyOwnerOfOrder_(record);
  } catch (e) {
    // Order is already saved — a notification failure must not fail the checkout for the buyer.
  }
  return { ok: true, id: record.id };
}

/** Emails the shop owner (Script Properties: OWNER_NOTIFY_EMAIL) with the new order's details. */
function notifyOwnerOfOrder_(order) {
  const to = PropertiesService.getScriptProperties().getProperty('OWNER_NOTIFY_EMAIL');
  if (!to) return; // not configured — order is still saved, just no email sent

  const lines = order.items.map(function (it) {
    return '  - ' + it.name + ' x' + it.qty + ' (' + it.price.toLocaleString() + '원)';
  });
  const body = [
    '새 주문이 접수되었습니다 (주문번호 ' + order.id + ').',
    '',
    '고객명: ' + order.customerName,
    '연락처: ' + (order.customerPhone || '-'),
    '이메일: ' + (order.customerEmail || '-'),
    '배송지: ' + order.shippingAddress,
    '결제수단: ' + (order.paymentMethod || '-'),
    '',
    '주문 상품:',
  ].concat(lines).concat([
    '',
    '합계: ' + order.totalAmount.toLocaleString() + '원',
    '',
    '결제 확인 후 Velora Admin > 주문 관리에서 상태를 업데이트해 주세요.',
  ]).join('\n');

  MailApp.sendEmail({ to: to, subject: '[Velora] 새 주문 - ' + order.customerName + ' (' + order.id + ')', body: body });
}

// ---------------------------------------------------------------------------
// GitHub (Contents API) — used only by Products and Posts.
// ---------------------------------------------------------------------------

function ghConfig_() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const repo = props.getProperty('GITHUB_REPO');
  if (!token || !repo) {
    throw new Error('Script Properties에 GITHUB_TOKEN / GITHUB_REPO가 설정되지 않았습니다.');
  }
  return { token: token, repo: repo, branch: props.getProperty('GITHUB_BRANCH') || 'master' };
}

function ghEncodePath_(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function ghFetch_(method, path, payload) {
  const cfg = ghConfig_();
  const res = UrlFetchApp.fetch('https://api.github.com' + path, {
    method: method,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + cfg.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    payload: payload ? JSON.stringify(payload) : undefined,
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  let body = null;
  try { body = JSON.parse(res.getContentText()); } catch (e) {}
  if (code >= 400 && code !== 404) {
    throw new Error('GitHub API ' + code + ' (' + method + ' ' + path + '): ' + ((body && body.message) || res.getContentText()));
  }
  return { code: code, body: body };
}

function ghGetSha_(path) {
  const cfg = ghConfig_();
  const r = ghFetch_('get', '/repos/' + cfg.repo + '/contents/' + ghEncodePath_(path) + '?ref=' + cfg.branch);
  return r.code === 404 ? null : r.body.sha;
}

function ghListDir_(path) {
  const cfg = ghConfig_();
  const r = ghFetch_('get', '/repos/' + cfg.repo + '/contents/' + ghEncodePath_(path) + '?ref=' + cfg.branch);
  return r.code === 404 || !Array.isArray(r.body) ? [] : r.body;
}

function ghPutFile_(path, base64Content, message) {
  const cfg = ghConfig_();
  const payload = { message: message, content: base64Content, branch: cfg.branch };
  const sha = ghGetSha_(path);
  if (sha) payload.sha = sha;
  ghFetch_('put', '/repos/' + cfg.repo + '/contents/' + ghEncodePath_(path), payload);
}

function ghDeleteFile_(path, sha, message) {
  const cfg = ghConfig_();
  ghFetch_('delete', '/repos/' + cfg.repo + '/contents/' + ghEncodePath_(path), { message: message, sha: sha, branch: cfg.branch });
}

/** Recursively deletes a directory (Contents API only deletes one file at a time). */
function ghDeleteDir_(path, message) {
  ghListDir_(path).forEach(function (item) {
    if (item.type === 'dir') ghDeleteDir_(path + '/' + item.name, message);
    else ghDeleteFile_(path + '/' + item.name, item.sha, message);
  });
}

/** Deletes every file directly inside `dir` whose name starts with `prefix`. */
function ghDeleteFilesByPrefix_(dir, prefix, message) {
  ghListDir_(dir).forEach(function (item) {
    if (item.type === 'file' && item.name.indexOf(prefix) === 0) {
      ghDeleteFile_(dir + '/' + item.name, item.sha, message);
    }
  });
}

function ghPutJson_(path, obj, message) {
  ghPutFile_(path, Utilities.base64Encode(JSON.stringify(obj, null, 2), Utilities.Charset.UTF_8), message);
}

function extForMime_(mimeType, fileName) {
  const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
  if (map[mimeType]) return map[mimeType];
  if (fileName && fileName.indexOf('.') !== -1) return fileName.split('.').pop().toLowerCase();
  return 'jpg';
}

/** Run manually from the script editor after filling in Script Properties. */
function testGitHubConnection() {
  const cfg = ghConfig_();
  const r = ghFetch_('get', '/repos/' + cfg.repo + '/branches/' + cfg.branch);
  Logger.log('OK - repo %s, branch %s, commit %s', cfg.repo, cfg.branch, r.body.commit.sha.slice(0, 7));
}
