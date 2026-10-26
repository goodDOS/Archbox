'use strict';
/**
 * 局域网共享副本库（share.db）：一个**独立**的 SqlJs 实例，与主 archive.db 物理隔离。
 * 只持有被选中大区的文档数据（regions/categories/tags/field_defs/posts/post_fields/post_tags），
 * 绝不创建 users / password / audit_log / settings / notes 等表——保证共享出去的副本不含任何账户信息。
 *
 * 数据流：主库（archive.db）按选定大区复制 → 本副本库 → 局域网只读 HTTP 服务只查本库。
 * 复制由 ipc/lanshare.js 触发（addRegion/removeRegion/syncNow/自动同步），本文件只负责副本库的
 * 建表、复制、只读查询与持久化。
 */
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const core = require('./core'); // 复用主库的 all/get 只读查询（从 archive.db 读出数据）
const dbImages = require('../services/db-images');
const i18n = require('../i18n');

let sdb = null; // 共享副本 SqlJs 实例（独立，不污染主 db）
let sdataDir = null;
let sdbPath = null;
let SQL = null;

// resolveWasm / nv 直接复用 core 的同名实现（单一数据源）：
// 此前本文件各写了一份，与 core.js 一字不差——wasm 路径寻址逻辑若调整会出现两份真相。

async function initShare(dir) {
  if (sdb) return;
  sdataDir = dir;
  fs.mkdirSync(sdataDir, { recursive: true });
  sdbPath = path.join(sdataDir, 'share.db');
  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(core.resolveWasm()) });
  let buf = null;
  if (fs.existsSync(sdbPath)) buf = fs.readFileSync(sdbPath);
  sdb = buf ? new SQL.Database(buf) : new SQL.Database();
  migrateShare();
}

function isReady() {
  return !!sdb;
}

/** 只建文档表，绝不建 users/password/audit_log/settings/notes */
function migrateShare() {
  sdb.run(`
  CREATE TABLE IF NOT EXISTS regions(
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT,
    color TEXT DEFAULT '#3b6df0', sort INTEGER DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS categories(
    id INTEGER PRIMARY KEY AUTOINCREMENT, region_id INTEGER NOT NULL,
    name TEXT NOT NULL, code TEXT, sort INTEGER DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tags(
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS field_defs(
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE, type TEXT NOT NULL,
    options TEXT DEFAULT '', required INTEGER DEFAULT 0,
    unique_field INTEGER DEFAULT 0, sort INTEGER DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS posts(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    region_id INTEGER NOT NULL, category_id INTEGER,
    title TEXT NOT NULL, content_html TEXT DEFAULT '', content_text TEXT DEFAULT '',
    status TEXT DEFAULT 'published',
    author_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, no TEXT,
    author_name TEXT
  );
  CREATE TABLE IF NOT EXISTS post_fields(
    post_id INTEGER NOT NULL, field_def_id INTEGER NOT NULL,
    value TEXT DEFAULT '',
    PRIMARY KEY(post_id, field_def_id)
  );
  CREATE TABLE IF NOT EXISTS post_tags(
    post_id INTEGER NOT NULL, tag_id INTEGER NOT NULL,
    PRIMARY KEY(post_id, tag_id)
  );
  `);
  /*
   * 大区/分类代码唯一索引（Beta.217）。
   * ★ 为什么副本库也要建 ★
   *   share.db 是主库 regions/categories 的原样拷贝（copyRows 按 id 复制）。
   *   主库既然保证代码唯一，副本库天然也唯一；这里建索引是为了让「拷贝契约在两侧一致」——
   *   若哪天副本库被写入重码，问题会在共享那一刻暴露，而不是等到主库。
   *   CREATE UNIQUE INDEX 对已存在的表同样生效（不像 CREATE TABLE IF NOT EXISTS 会被跳过）。
   * 用 try/catch 包住：副本库是可重建的派生数据，建索引失败不该阻断共享功能。
   */
  try {
    sdb.run('CREATE UNIQUE INDEX IF NOT EXISTS uq_share_regions_code ON regions(code)');
    sdb.run('CREATE UNIQUE INDEX IF NOT EXISTS uq_share_categories_code ON categories(code)');
  } catch (e) {
    // share.js 不引 logger（它属于 db 层，保持零上层依赖），失败只落 console
    console.error('[share] 代码唯一索引建立失败（不影响共享）', e && e.message);
  }
  // 兼容已有 share.db：posts 补 deleted_at 列（与主库回收站软删除口径一致）。
  // 否则主库 posts 经 ALTER 新增 deleted_at 后，rebuild 的 SELECT * 会带该列，
  // 而副本库 posts 缺列 → INSERT 抛 "table posts has no column named deleted_at"，自动同步整体失败。
  // 只读查询 buildWhere 也依赖此列排除已删除文档。
  try {
    const pcols = sAll('PRAGMA table_info(posts)').map(c => c.name);
    if (!pcols.includes('deleted_at')) sdb.run('ALTER TABLE posts ADD COLUMN deleted_at TEXT');
    // 兼容已有 share.db：posts 补 author_name 列。
    // 副本库刻意不建 users 表（令牌泄露不暴露账号），故作者名必须在此**冗余快照**，
    // 否则主库改名会不同步 / 共享出去的文档作者名丢失。迁移后由 rebuild 回填。
    if (!pcols.includes('author_name')) sdb.run('ALTER TABLE posts ADD COLUMN author_name TEXT');
  } catch (e) {
    /* 全新库已含列，忽略 */
  }
}

/* 副本库只读查询助手 */
function sAll(sql, params = []) {
  const stmt = sdb.prepare(sql);
  try {
    stmt.bind(params.map(core.nv));
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    return out;
  } finally {
    stmt.free();
  }
}

/* 从主库读出指定表/条件的行，原样插入副本库（列名来自主库 schema，可信） */
function copyRows(table, where, params) {
  const rows = core.all(`SELECT * FROM ${table} ${where}`, params);
  for (const row of rows) {
    const cols = Object.keys(row);
    const sql = `INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`;
    sdb.run(
      sql,
      cols.map(c => row[c])
    );
  }
  return rows;
}
/**
 * 复制选中大区的已发布文档到副本库，并联表带出作者名（冗余快照）。
 * 不能走 copyRows：副本库 posts 有 author_name 列而主库没有，列集必须显式对齐。
 * @returns {number[]} 已复制文档的 id 列表
 */
function copyPostsWithAuthor(regionIds, ph) {
  const rows = core
    .all(
      `SELECT p.*, u.name AS author_name FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
      WHERE p.region_id IN (${ph}) AND p.status NOT IN ('draft','template') AND p.deleted_at IS NULL`,
      regionIds
    )
    // 副本库存【还原后的 data: 内联正文】而不是 archbox-img:// 短链：
    // 访客机器没有本机的 images 表，短链过去就是死链；且访客把文档拷回本机时
    // （lan:copyPost → savePost）extract 会把 data: 重新入它的库，闭环成立。
    // 存量 data: 正文不含短链，hydrate 快路径原样返回。
    .map(r => ({ ...r, content_html: dbImages.hydrateImages(r.content_html) }));
  // 副本库 posts 的列集（显式声明，避免主库将来加列时 INSERT 列名对不上）
  const cols = [
    'id',
    'region_id',
    'category_id',
    'title',
    'content_html',
    'content_text',
    'status',
    'author_id',
    'created_at',
    'updated_at',
    'no',
    'deleted_at',
    'author_name'
  ];
  const sql = `INSERT INTO posts(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`;
  for (const row of rows)
    sdb.run(
      sql,
      cols.map(c => (c in row ? row[c] : null))
    );
  return rows.map(r => r.id).filter(Boolean);
}

/**
 * 全量重建当前共享集：清空文档表 → 复制选中大区的全部文档数据（含引用的 tags/field_defs）。
 * ids 为空时只清空（无共享大区）。
 */
function rebuild(ids) {
  if (!sdb) throw new Error(i18n.errKey('common.errShareDbNotInit'));
  const list = (ids || []).map(Number).filter(n => n > 0);
  // 注意：tags / field_defs 是共享数据的派生表，每次重建必须一并清空，否则保留的旧 id
  // 与 copyRows 重新插入的主库 id 冲突，触发 UNIQUE constraint failed: tags.id
  ['post_tags', 'post_fields', 'tags', 'field_defs', 'posts', 'categories', 'regions'].forEach(t =>
    sdb.run(`DELETE FROM ${t}`)
  );
  if (!list.length) {
    persistShare();
    return;
  }
  const ph = list.map(() => '?').join(',');
  copyRows('regions', `WHERE id IN (${ph})`, list);
  copyRows('categories', `WHERE region_id IN (${ph})`, list);
  // 共享副本只含已发布文档：草稿(status='draft')与模板(status='template')不进入副本库，
  // 既不被本机自浏览、也不被局域网其它终端看到。status 字面量内联，无注入风险。
  // 回收站文档(deleted_at 非空)同样排除——与主库「回收站不共享」口径一致，且不依赖副本库内 deleted_at 判空。
  // ★ 作者名必须在此联表带出 ★ 副本库无 users 表（刻意隔离，令牌泄露不暴露账号），
  //   若不冗余作者名，共享/拷贝出去的文档「作者」一栏将永远为空。
  const postIds = copyPostsWithAuthor(list, ph);
  if (postIds.length) {
    const pph = postIds.map(() => '?').join(',');
    copyRows('post_fields', `WHERE post_id IN (${pph})`, postIds);
    copyRows('post_tags', `WHERE post_id IN (${pph})`, postIds);
    const tagRows = core.all(`SELECT DISTINCT tag_id FROM post_tags WHERE post_id IN (${pph})`, postIds);
    const tagIds = tagRows.map(r => r.tag_id).filter(Boolean);
    if (tagIds.length) copyRows('tags', `WHERE id IN (${tagIds.map(() => '?').join(',')})`, tagIds);
    const fdRows = core.all(`SELECT DISTINCT field_def_id FROM post_fields WHERE post_id IN (${pph})`, postIds);
    const fdIds = fdRows.map(r => r.field_def_id).filter(Boolean);
    if (fdIds.length) copyRows('field_defs', `WHERE id IN (${fdIds.map(() => '?').join(',')})`, fdIds);
  }
  persistShare();
}

/** 自动同步判定：任一共享大区的 posts 最新 updated_at 与主库不一致即需同步 */
function needsSync(ids) {
  if (!sdb) return false;
  const list = (ids || []).map(Number).filter(n => n > 0);
  for (const rid of list) {
    const m = core.get('SELECT MAX(updated_at) AS m FROM posts WHERE region_id=?', [rid]);
    const s = sAll('SELECT MAX(updated_at) AS m FROM posts WHERE region_id=?', [rid])[0];
    if ((m && m.m) !== (s && s.m)) return true;
  }
  return false;
}

function persistShare() {
  if (!sdb || !sdbPath) return;
  fs.writeFileSync(sdbPath, Buffer.from(sdb.export()));
}

/* ---------------- 只读查询（只查 sdb，绝不碰主库 users） ---------------- */
function listRegions() {
  return sAll('SELECT * FROM regions ORDER BY sort, id');
}
function listCategories(regionId) {
  return regionId
    ? sAll('SELECT * FROM categories WHERE region_id=? ORDER BY sort,id', [regionId])
    : sAll('SELECT * FROM categories ORDER BY sort,id');
}
function listTags() {
  return sAll('SELECT * FROM tags ORDER BY name');
}
function listFieldDefs() {
  return sAll('SELECT * FROM field_defs ORDER BY sort, id');
}

function buildWhere(f) {
  const where = [];
  const params = [];
  // 防御性过滤：共享只读查询永不返回草稿/模板（即使副本库为老版本遗留数据也如此）
  where.push("p.status NOT IN ('draft','template')");
  // 回收站内的文档不对外共享
  where.push('p.deleted_at IS NULL');
  if (f.regionId) {
    where.push('p.region_id=?');
    params.push(f.regionId);
  }
  if (f.q) {
    where.push('(p.title LIKE ? OR p.content_text LIKE ?)');
    const l = `%${f.q}%`;
    params.push(l, l);
  }
  return { where, params };
}
function countPosts(f = {}) {
  const { where, params } = buildWhere(f);
  const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const r = sAll(`SELECT COUNT(*) AS n FROM posts p ${w}`, params)[0];
  return r ? r.n : 0;
}
/** listPosts 与 getPost 共用的列集合：必须都带上 rname/cname。
 *  ★ 单一真相 ★
 *  getPost 曾被写成 `SELECT * FROM posts`（无 JOIN），于是 rname/cname 恒为 undefined。
 *  下游 lan:copyPost 的「跟随源文档」回退依赖这两个字段拿源大区/分类名，
 *  取空后静默落到兜底名「共享拷贝」——用户看到的现象是"拷贝没跟对地方"，
 *  且因为不报错，排查成本极高（Beta.209 实测）。两个函数共用本常量即不可能再漂移。
 *  ★ Beta.215 扩充 ★
 *  再带上 rcode/ccode：本机「跟随源文档」时若需新建大区/分类，应当沿用源代码，
 *  而不是退回按名推导（否则源叫「企业信息库/代码QY」拷过来会变成代码「QY」之类）。
 *  同一处修改、两处生效，继续维持「单一真相」。 */
const POST_COLS =
  'p.*, r.name AS rname, r.code AS rcode, c.name AS cname, c.code AS ccode, p.author_name AS author_name';
const POST_JOINS = 'LEFT JOIN regions r ON r.id=p.region_id LEFT JOIN categories c ON c.id=p.category_id';

function listPosts(f = {}) {
  const { where, params } = buildWhere(f);
  const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const limit = Number(f.limit) || 50;
  const offset = Number(f.offset) || 0;
  return sAll(
    `SELECT ${POST_COLS} FROM posts p ${POST_JOINS}
     ${w} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}
function getPost(id) {
  const p = sAll(`SELECT ${POST_COLS} FROM posts p ${POST_JOINS} WHERE p.id=?`, [id])[0];
  if (!p || p.status === 'draft' || p.status === 'template' || p.deleted_at) return null;
  p.fields = sAll(
    'SELECT f.code, f.name, f.type, pf.value FROM post_fields pf JOIN field_defs f ON f.id=pf.field_def_id WHERE pf.post_id=?',
    [id]
  );
  p.tags = sAll('SELECT t.id, t.name FROM post_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.post_id=?', [id]);
  return p;
}
function regionStats(regionId) {
  return { regionId, postCount: countPosts({ regionId }), catCount: listCategories(regionId).length };
}

module.exports = {
  initShare,
  isReady,
  rebuild,
  needsSync,
  persistShare,
  listRegions,
  listCategories,
  listTags,
  listFieldDefs,
  listPosts,
  getPost,
  countPosts,
  regionStats
};
