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

const SITE_BASE_URL = 'https://velorakr.com';

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
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email không hợp lệ.');
  if (!findRole_(email)) throw new Error('Email này chưa được cấp quyền truy cập. Vui lòng liên hệ quản trị viên.');

  const cache = CacheService.getScriptCache();
  if (cache.get('otp_cooldown:' + email)) throw new Error('Vui lòng thử lại sau 1 phút.');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('otp:' + email, code, OTP_TTL_SECONDS);
  cache.put('otp_tries:' + email, '0', OTP_TTL_SECONDS);
  cache.put('otp_cooldown:' + email, '1', 60);

  MailApp.sendEmail({
    to: email,
    subject: 'Velora Admin — Mã đăng nhập',
    body: 'Mã đăng nhập của bạn: ' + code + '\n\nMã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, vui lòng bỏ qua email này.',
  });
  return { ok: true };
}

function verifyOtp(email, code) {
  email = String(email || '').toLowerCase().trim();
  const cache = CacheService.getScriptCache();

  const tries = Number(cache.get('otp_tries:' + email) || '0');
  if (tries >= OTP_MAX_ATTEMPTS) {
    cache.remove('otp:' + email);
    throw new Error('Bạn đã nhập sai quá số lần cho phép. Vui lòng yêu cầu mã mới.');
  }

  const expected = cache.get('otp:' + email);
  if (!expected || expected !== String(code || '').trim()) {
    cache.put('otp_tries:' + email, String(tries + 1), OTP_TTL_SECONDS);
    throw new Error('Mã không đúng hoặc đã hết hạn.');
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
    throw new Error('Bạn không có quyền thực hiện thao tác này (cần quyền "' + need + '" trở lên). Vui lòng đăng nhập lại.');
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
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email không hợp lệ.');
  if (role !== 'editor' && role !== 'viewer') throw new Error('Quyền chỉ có thể là editor hoặc viewer.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getUsersSheet_();
    if (findUserRow_(sheet, email) !== -1) throw new Error('Email này đã được đăng ký.');
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
  if (role !== 'editor' && role !== 'viewer') throw new Error('Quyền chỉ có thể là editor hoặc viewer.');
  if (email === me.email) throw new Error('Không thể tự thay đổi quyền của chính mình.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getUsersSheet_();
    const row = findUserRow_(sheet, email);
    if (row === -1) throw new Error('Không tìm thấy người dùng.');
    const current = String(sheet.getRange(row, 2).getValue()).toLowerCase().trim();
    if (current === 'root') throw new Error('Không thể chỉnh sửa tài khoản root từ giao diện. Vui lòng sửa trực tiếp trong Google Sheet.');
    sheet.getRange(row, 2).setValue(role);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function deleteUser(token, email) {
  const me = requireRole_(token, 'root');
  email = String(email || '').toLowerCase().trim();
  if (email === me.email) throw new Error('Không thể tự xoá chính mình.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getUsersSheet_();
    const row = findUserRow_(sheet, email);
    if (row === -1) throw new Error('Không tìm thấy người dùng.');
    const current = String(sheet.getRange(row, 2).getValue()).toLowerCase().trim();
    if (current === 'root') throw new Error('Không thể xoá tài khoản root từ giao diện. Vui lòng sửa trực tiếp trong Google Sheet.');
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
  if (rowIndex === -1) throw new Error('Không tìm thấy sản phẩm: ' + id);
  return rowToProduct_(sheet.getRange(rowIndex, 1, 1, PRODUCT_HEADERS.length).getValues()[0]);
}

/**
 * product = {id, isNew, name, category, price, images: [path...], description, status}
 * id is a slug the client fills in — typed by hand or auto-suggested from the
 * name — and is only ever editable while `isNew` (before the first save);
 * once a product exists its id is locked in the UI, so an edit always finds
 * the same row it was loaded from. `isNew` disambiguates a slug typed for a
 * brand-new product from an edit — without it, a create whose typed slug
 * happens to collide with an existing product would silently overwrite that
 * unrelated product instead of failing with a clear error.
 */
function saveProduct(token, product) {
  requireRole_(token, 'editor');
  if (!product || !product.name || !product.name.trim()) throw new Error('Vui lòng nhập tên sản phẩm.');
  const id = String((product && product.id) || '').trim();
  if (!id) throw new Error('Chưa có ID sản phẩm. Vui lòng nhập tên sản phẩm hoặc ID để tạo ID trước.');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new Error('ID sản phẩm không hợp lệ (chỉ gồm chữ thường a-z, số 0-9 và dấu gạch ngang).');
  if (PRODUCT_CATEGORIES.indexOf(product.category) === -1) throw new Error('Danh mục chỉ có thể là jewelry hoặc watch.');
  const price = Number(product.price);
  if (!isFinite(price) || price < 0) throw new Error('Giá không hợp lệ.');
  const status = PRODUCT_STATUSES.indexOf(product.status) === -1 ? 'draft' : product.status;

  // Push any newly-staged Drive images to GitHub BEFORE taking the sheet lock
  // (network calls to GitHub shouldn't hold up other admins' saves).
  let resolvedImages;
  try {
    resolvedImages = publishProductImages_(id, product.images);
  } catch (e) {
    throw new Error('Không thể lưu ảnh lên GitHub: ' + ((e && e.message) || e));
  }

  let record = null;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getProductsSheet_();
    const rowIndex = findRowIndexById_(sheet, id);
    if (product.isNew) {
      if (rowIndex !== -1) throw new Error('ID "' + id + '" đã được sử dụng cho sản phẩm khác. Vui lòng chọn ID khác.');
    } else if (rowIndex === -1) {
      throw new Error('Không tìm thấy sản phẩm: ' + id);
    }
    const now = new Date().toISOString();
    const existing = rowIndex !== -1 ? rowToProduct_(sheet.getRange(rowIndex, 1, 1, PRODUCT_HEADERS.length).getValues()[0]) : null;
    const lastRow = sheet.getLastRow();
    const nextOrder = lastRow < 2 ? 0 : lastRow - 1;

    record = {
      id: id,
      name: product.name.trim(),
      category: product.category,
      price: price,
      images: resolvedImages,
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
    if (rowIndex === -1) throw new Error('Không tìm thấy sản phẩm: ' + id);
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
 * Uploads one already-compressed product image to Drive for instant preview
 * while editing. NOT pushed to GitHub yet — see publishProductImages_, which
 * runs at save time and is the only thing that actually puts an image in
 * front of site visitors.
 */
function uploadProductImage(token, productId, base64Data, mimeType) {
  requireRole_(token, 'editor');
  if (!productId) throw new Error('Thiếu ID sản phẩm.');
  const ext = extForMime_(mimeType);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, 'image.' + ext);
  const file = getAssetSubfolder_('products/' + productId).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { driveId: file.getId(), url: driveViewUrl_(file.getId()), ext: ext };
}

/**
 * Resolves a product's `images` array into final GitHub paths:
 *   - a string is already a published path (e.g. "/images/products/x-01.jpg")
 *     from a previous save — left untouched, never re-uploaded.
 *   - an object {driveId, ext} is a NEW image staged in Drive during this
 *     edit — its bytes get pushed to html/images/products/ now, numbered
 *     right after whatever numbers are already in use (so existing files are
 *     never renamed, and reordering the gallery can't cause a collision).
 * Called from saveProduct, before the Sheet row is written, so the record
 * that ends up in the Sheet/data/products.json always holds final paths only.
 */
function publishProductImages_(id, images) {
  const list = Array.isArray(images) ? images : [];
  let maxIndex = 0;
  list.forEach(function (img) {
    if (typeof img !== 'string') return;
    const m = img.match(/-(\d+)\.[a-zA-Z0-9]+$/);
    if (m) maxIndex = Math.max(maxIndex, parseInt(m[1], 10));
  });
  return list.map(function (img) {
    if (typeof img === 'string') return img;
    maxIndex += 1;
    const n = String(maxIndex).padStart(2, '0');
    const fileName = id + '-' + n + '.' + img.ext;
    const bytes = DriveApp.getFileById(img.driveId).getBlob().getBytes();
    ghPutFile_('html/images/products/' + fileName, Utilities.base64Encode(bytes), 'CMS: upload image for "' + id + '"');
    return '/images/products/' + fileName;
  });
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
  if (rowIndex === -1) throw new Error('Không tìm thấy bài viết: ' + id);
  return rowToPost_(sheet.getRange(rowIndex, 1, 1, POST_HEADERS.length).getValues()[0]);
}

/**
 * post = {id, isNew, title, excerpt, coverImage, content, status, publishedAt}
 * id is a slug the client fills in — typed by hand or auto-suggested from the
 * title — and is only ever editable while `isNew` (before the first save);
 * once a post exists its id is locked in the UI. `isNew` disambiguates a slug
 * typed for a brand-new post from an edit, the same way saveProduct does.
 */
function savePost(token, post) {
  requireRole_(token, 'editor');
  if (!post || !post.title || !post.title.trim()) throw new Error('Vui lòng nhập tiêu đề.');
  const id = String((post && post.id) || '').trim();
  if (!id) throw new Error('Chưa có ID bài viết. Vui lòng nhập tiêu đề hoặc ID để tạo ID trước.');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new Error('ID bài viết không hợp lệ (chỉ gồm chữ thường a-z, số 0-9 và dấu gạch ngang).');
  const status = POST_STATUSES.indexOf(post.status) === -1 ? 'draft' : post.status;

  // Push any newly-staged Drive images (cover + inline content) to GitHub
  // BEFORE taking the sheet lock — network calls to GitHub shouldn't hold up
  // other admins' saves.
  let resolvedCover, resolvedContent;
  try {
    resolvedCover = publishPostCoverImage_(id, post.coverImage);
    resolvedContent = publishPostContentImages_(id, post.content);
  } catch (e) {
    throw new Error('Không thể lưu ảnh lên GitHub: ' + ((e && e.message) || e));
  }

  let record = null;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getPostsSheet_();
    const rowIndex = findRowIndexById_(sheet, id);
    if (post.isNew) {
      if (rowIndex !== -1) throw new Error('ID "' + id + '" đã được sử dụng cho bài viết khác. Vui lòng chọn ID khác.');
    } else if (rowIndex === -1) {
      throw new Error('Không tìm thấy bài viết: ' + id);
    }
    const now = new Date().toISOString();
    const existing = rowIndex !== -1 ? rowToPost_(sheet.getRange(rowIndex, 1, 1, POST_HEADERS.length).getValues()[0]) : null;

    record = {
      id: id,
      title: post.title.trim(),
      excerpt: (post.excerpt || '').trim(),
      coverImage: resolvedCover,
      content: resolvedContent,
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
    if (rowIndex === -1) throw new Error('Không tìm thấy bài viết: ' + id);
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

/**
 * Uploads a post cover/inline image to Drive for instant preview while
 * editing. NOT pushed to GitHub yet — see publishPostCoverImage_ /
 * publishPostContentImages_, which run at save time.
 */
function uploadPostImage(token, postId, base64Data, mimeType, fileName) {
  requireRole_(token, 'editor');
  if (!postId) throw new Error('Thiếu ID bài viết.');
  const ext = extForMime_(mimeType, fileName);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, 'image.' + ext);
  const file = getAssetSubfolder_('news/' + postId).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { driveId: file.getId(), url: driveViewUrl_(file.getId()), ext: ext };
}

function pushPostImageToGitHub_(postId, driveId, ext, fileNamePrefix) {
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
  const fileName = fileNamePrefix + stamp + '-' + driveId.slice(0, 6) + '.' + ext;
  const bytes = DriveApp.getFileById(driveId).getBlob().getBytes();
  ghPutFile_('html/news/' + postId + '/images/' + fileName, Utilities.base64Encode(bytes), 'CMS: upload image for post "' + postId + '"');
  return '/news/' + postId + '/images/' + fileName;
}

/**
 * coverImage is either already a final path (string, from a previous save —
 * left untouched) or a Drive preview URL from a fresh upload this session,
 * which gets pushed to GitHub now and replaced with the final path.
 */
function publishPostCoverImage_(postId, coverImage) {
  if (!coverImage || !isDrivePreviewUrl_(coverImage)) return coverImage || '';
  const driveId = driveIdFromPreviewUrl_(coverImage);
  const ext = extForMime_(DriveApp.getFileById(driveId).getBlob().getContentType());
  return pushPostImageToGitHub_(postId, driveId, ext, 'cover-');
}

/**
 * Scans `content` for Drive preview URLs (inline images inserted via TinyMCE
 * for instant preview), pushes each one to GitHub, and rewrites it to the
 * final site-relative path. Already-published /news/<id>/images/... <img>
 * tags don't match this pattern and pass through untouched. A driveId
 * referenced more than once only gets uploaded once.
 */
function publishPostContentImages_(postId, content) {
  if (!content) return content || '';
  const resolved = {};
  return content.replace(/https:\/\/lh3\.googleusercontent\.com\/d\/([-\w]+)/g, function (full, driveId) {
    if (!resolved[driveId]) {
      const ext = extForMime_(DriveApp.getFileById(driveId).getBlob().getContentType());
      resolved[driveId] = pushPostImageToGitHub_(postId, driveId, ext, '');
    }
    return resolved[driveId];
  });
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
const ORDER_PAYMENT_STATUSES = ['Chưa thanh toán', 'Đang xác nhận chuyển khoản', 'Đã thanh toán', 'Đã hoàn tiền'];
const ORDER_STATUSES = ['Mới', 'Đang xác nhận', 'Chuẩn bị hàng', 'Đang giao hàng', 'Hoàn thành', 'Đã huỷ'];

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
  if (rowIndex === -1) throw new Error('Không tìm thấy đơn hàng: ' + id);
  return rowToOrder_(sheet.getRange(rowIndex, 1, 1, ORDER_HEADERS.length).getValues()[0]);
}

function validateOrderItems_(items) {
  if (!items.length) throw new Error('Vui lòng thêm ít nhất 1 sản phẩm.');
  items.forEach(function (it, i) {
    if (!it.name || !String(it.name).trim()) throw new Error('Có sản phẩm chưa nhập tên (dòng thứ ' + (i + 1) + ').');
    if (!isFinite(Number(it.price)) || Number(it.price) < 0) throw new Error('Có sản phẩm giá không hợp lệ (dòng thứ ' + (i + 1) + ').');
    if (!isFinite(Number(it.qty)) || Number(it.qty) <= 0) throw new Error('Có sản phẩm số lượng không hợp lệ (dòng thứ ' + (i + 1) + ').');
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
  if (!order || !order.customerName || !order.customerName.trim()) throw new Error('Vui lòng nhập tên khách hàng.');
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
      throw new Error('Không tìm thấy đơn hàng: ' + id);
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
    if (rowIndex === -1) throw new Error('Không tìm thấy đơn hàng: ' + id);
    sheet.deleteRow(rowIndex);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public checkout endpoint — the cart page has no login; a buyer who clicks
// "Đã chuyển khoản, xác nhận đơn hàng" (bank transfer done / payment confirmed) posts here.
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
 * paymentStatus "Đang xác nhận chuyển khoản" (awaiting staff confirmation) —
 * the buyer is only self-declaring they paid, staff still verifies before
 * marking it "Đã thanh toán".
 */
function submitOrderPublic_(data) {
  if (data.website) return { ok: true };

  const identifier = String(data.customerPhone || data.customerEmail || '').trim();
  if (identifier) {
    const cache = CacheService.getScriptCache();
    const key = 'order_rl:' + identifier;
    if (cache.get(key)) throw new Error('Vui lòng thử lại sau ít phút.');
    cache.put(key, '1', 20);
  }

  const customerName = String(data.customerName || '').trim();
  const customerPhone = String(data.customerPhone || '').trim();
  const customerEmail = String(data.customerEmail || '').trim();
  const shippingAddress = String(data.shippingAddress || '').trim();
  if (!customerName) throw new Error('Vui lòng nhập họ tên.');
  if (!shippingAddress) throw new Error('Vui lòng nhập địa chỉ giao hàng.');
  if (!customerPhone && !customerEmail) throw new Error('Vui lòng nhập thông tin liên hệ (số điện thoại hoặc email).');
  if (customerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)) throw new Error('Email không hợp lệ.');

  // productId/image/link are what let staff later tell apart two products
  // that happen to share a name — carried through from the cart, but this is
  // a public unauthenticated endpoint, so each is strictly validated rather
  // than trusted as-is (the admin UI renders `link`/`image` as an <a href>/
  // <img src>, so a bad value here would be stored XSS against the admin).
  const items = (Array.isArray(data.items) ? data.items : []).map(function (it) {
    const productId = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(it.productId) ? it.productId : '';
    const image = /^\/[^\s"'<>]*$/.test(it.image || '') ? it.image : '';
    const link = /^\/[^\s"'<>]*$/.test(it.link || '') ? it.link : '';
    return { productId: productId, name: it.name, price: Number(it.price) || 0, qty: Number(it.qty) || 0, image: image, link: link };
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
      paymentStatus: 'Đang xác nhận chuyển khoản',
      orderStatus: 'Mới',
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
    var line = '  - ' + it.name + ' x' + it.qty + ' (' + it.price.toLocaleString() + ' KRW)';
    if (it.link) line += '\n    ' + SITE_BASE_URL + it.link; // absolute URL — relative paths aren't clickable in an email client
    return line;
  });
  const body = [
    'Đơn hàng mới đã được ghi nhận (mã đơn ' + order.id + ').',
    '',
    'Tên khách hàng: ' + order.customerName,
    'Số điện thoại: ' + (order.customerPhone || '-'),
    'Email: ' + (order.customerEmail || '-'),
    'Địa chỉ giao hàng: ' + order.shippingAddress,
    'Phương thức thanh toán: ' + (order.paymentMethod || '-'),
    '',
    'Sản phẩm đặt mua:',
  ].concat(lines).concat([
    '',
    'Tổng cộng: ' + order.totalAmount.toLocaleString() + ' KRW',
    '',
    'Sau khi xác nhận thanh toán, vui lòng cập nhật trạng thái trong Velora Admin > Quản lý đơn hàng.',
  ]).join('\n');

  MailApp.sendEmail({ to: to, subject: '[Velora] Đơn hàng mới - ' + order.customerName + ' (' + order.id + ')', body: body });
}

// ---------------------------------------------------------------------------
// Drive (temporary image staging) — uploaded images land here FIRST so they
// preview instantly while editing (a fresh GitHub commit isn't live on the
// site until the host redeploys, which can take a minute or more; Drive's
// own share link works immediately). They're pushed to GitHub — where the
// live site actually reads images from — only when the record is saved; see
// publishProductImages_ / publishPostCoverImage_ / publishPostContentImages_.
// Drive files are never deleted automatically (harmless leftover staging
// copies, not referenced by the Sheet or the site) — see README trade-offs.
// ---------------------------------------------------------------------------

const ASSET_ROOT_FOLDER_NAME = 'Velora Admin CMS Images';

function getAssetRootFolder_() {
  const it = DriveApp.getFoldersByName(ASSET_ROOT_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ASSET_ROOT_FOLDER_NAME);
}

/** One subfolder per product/post (e.g. "products/<id>", "news/<id>") so staged images stay organized. */
function getAssetSubfolder_(relativeName) {
  let folder = getAssetRootFolder_();
  relativeName.split('/').forEach(function (part) {
    const it = folder.getFoldersByName(part);
    folder = it.hasNext() ? it.next() : folder.createFolder(part);
  });
  return folder;
}

function driveViewUrl_(driveId) {
  return 'https://lh3.googleusercontent.com/d/' + driveId;
}

/** true for a Drive preview URL (driveViewUrl_ output); false for anything else (a final site-relative path, or empty). */
function isDrivePreviewUrl_(value) {
  return /^https:\/\/lh3\.googleusercontent\.com\/d\//.test(String(value || ''));
}

function driveIdFromPreviewUrl_(url) {
  const m = String(url || '').match(/^https:\/\/lh3\.googleusercontent\.com\/d\/([-\w]+)/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// GitHub (Contents API) — used only by Products and Posts.
// ---------------------------------------------------------------------------

function ghConfig_() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const repo = props.getProperty('GITHUB_REPO');
  if (!token || !repo) {
    throw new Error('Chưa cấu hình GITHUB_TOKEN / GITHUB_REPO trong Script Properties.');
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

/** Reads a text file's content (UTF-8), or null if it doesn't exist. Only works for files under ~1MB (GitHub Contents API limit for inline content). */
function ghGetFileContent_(path) {
  const cfg = ghConfig_();
  const r = ghFetch_('get', '/repos/' + cfg.repo + '/contents/' + ghEncodePath_(path) + '?ref=' + cfg.branch);
  if (r.code === 404 || !r.body || !r.body.content) return null;
  const bytes = Utilities.base64Decode(r.body.content.replace(/\n/g, ''));
  return Utilities.newBlob(bytes).getDataAsString('UTF-8');
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

// ---------------------------------------------------------------------------
// One-time setup utility — run manually from the script editor's function
// dropdown, NOT wired to any button in the admin UI. Not needed again once
// the Products sheet has been populated (re-running is still safe, though —
// see below).
// ---------------------------------------------------------------------------

/**
 * Imports the catalog from data/products.json on GitHub — the same file this
 * CMS itself writes to (publishProductsIndex_) — into the Products sheet.
 * Needed exactly once, for the ~108 products that were already live on
 * velorakr.com before this CMS existed (added by hand to products-data.js,
 * never entered through the admin, so the Sheet starts out empty otherwise).
 *
 * Safe to run more than once: matches each item by `id` and overwrites that
 * row in place rather than duplicating, so if you edit data/products.json by
 * hand afterward (fix a category, a price, a description...) and run this
 * again, it just re-applies the current file over the same rows. It never
 * touches a row whose id isn't present in the file, and never writes
 * anything back to GitHub — this only fills in the Sheet.
 *
 * How to run: Script Editor → function dropdown (top toolbar) → select
 * "importProductsFromWebsite" → Run (▶). Check View → Logs (or Executions)
 * for the "Đã nhập ... / cập nhật ..." summary line when it finishes.
 */
function importProductsFromWebsite() {
  const json = ghGetFileContent_('data/products.json');
  if (!json) throw new Error('Không tìm thấy data/products.json trên GitHub (repo/branch trong Script Properties có đúng không?).');

  const items = JSON.parse(json);
  if (!Array.isArray(items)) throw new Error('data/products.json không phải là một mảng sản phẩm.');

  const sheet = getProductsSheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    items.forEach(function (item, i) {
      const id = String(item.id || '').trim();
      if (!id) { Logger.log('Bỏ qua mục thứ %s: thiếu id.', i + 1); skipped++; return; }

      const now = new Date().toISOString();
      const record = {
        id: id,
        name: String(item.name || '').trim(),
        category: PRODUCT_CATEGORIES.indexOf(item.category) === -1 ? 'jewelry' : item.category,
        price: Number(item.price) || 0,
        images: Array.isArray(item.images) ? item.images : [],
        description: item.description || '',
        status: PRODUCT_STATUSES.indexOf(item.status) === -1 ? 'published' : item.status,
        order: item.order != null ? Number(item.order) : i,
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now,
      };
      const rowValues = PRODUCT_HEADERS.map(function (h) {
        return h === 'imagesJson' ? JSON.stringify(record.images) : record[h];
      });

      const rowIndex = findRowIndexById_(sheet, id);
      if (rowIndex === -1) {
        sheet.appendRow(rowValues);
        imported++;
      } else {
        sheet.getRange(rowIndex, 1, 1, PRODUCT_HEADERS.length).setValues([rowValues]);
        updated++;
      }
    });
    Logger.log('Xong: đã nhập %s sản phẩm mới, cập nhật %s sản phẩm đã có, bỏ qua %s mục lỗi.', imported, updated, skipped);
  } finally {
    lock.releaseLock();
  }
}
