'use strict';
/**
 * 数据层核心（core）：共享状态 + 基础工具 + 持久化 + 加密管理 + 审计 + 查询助手
 * 其它功能模块（users/taxonomy/posts/...）统一 require('./core') 调用本模块。
 * 本文件只依赖底层库，不依赖任何功能模块，避免循环依赖。
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const initSqlJs = require('sql.js');
const sanitizeHtml = require('sanitize-html');
const cryptoSvc = require('../services/crypto');
const packSign = require('../services/pack-sign');
const timefmt = require('../services/timefmt');
const datadir = require('../services/datadir');
// 图片显示尺寸的口径（Beta.322）：与渲染层 src/utils/imageSize.js 逐字对应，
// 一致性由 electron/verify/image-size.test.mjs 断言，改一边不改另一边会报红。
const { IMAGE_SIZE_STYLE_RULES } = require('../services/imageSize');
const i18n = require('../i18n');

/* ---------------- 共享状态（单例） ---------------- */
let db = null;
let dataDir = null;
let dbPath = null;
let persistTimer = null;
let cryptoOpts = null; // { key: Buffer(32), salt: Buffer(16) } —— 非 null 即加密模式
let pendingIntegrityWarn = null; // 启动时数据库完整性告警（供 UI 弹窗）

/* ---------------- 基础工具 ---------------- */
// 存储用时间戳（YYYY-MM-DD HH:MM:SS，本地时间）：统一走 timefmt.localTime，避免各处自造 pad。
// 保持纯净、不带时区，以便 SQLite 的 date() 解析；时区标注只在展示/日志层追加。
function nowIso() {
  return timefmt.localTime();
}
function todayStr() {
  return nowIso().slice(0, 10);
}
function nv(v) {
  return v === undefined ? null : v;
}
function uid() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'A' + s;
}
function rnd6() {
  return Math.random().toString(36).slice(2, 8);
}

const HTML_CFG = {
  allowedTags: [
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'mark',
    'sup',
    'sub',
    'ul',
    'ol',
    'li',
    'blockquote',
    'hr',
    'br',
    'img',
    'a',
    'code',
    'pre',
    'div',
    'span',
    'table',
    'thead',
    'tbody',
    'tr',
    'td',
    'th'
  ],
  allowedAttributes: {
    // ★ Beta.322：img 必须显式放行 style —— 这是「发布后图片变小」的真正根因。
    //   Beta.316 只放行了 width 属性、并在 allowedStyles 里放行 width 的百分比值，
    //   但 allowedAttributes.img 里从来没有 'style'，于是 style 属性在进入
    //   allowedStyles 过滤之前就被整条剥掉了：编辑器里设的 25/50/75/100% 一存一读
    //   就没了，正文退化成 max-width:100% 的自然宽度（大图变小、小图不变）。
    //   现在放行 style，具体属性仍由下方 allowedStyles 的正则逐条把关。
    img: ['src', 'alt', 'width', 'height', 'style'],
    a: ['href', 'title', 'rel', 'target'],
    span: ['style'],
    p: ['style'],
    h1: ['style'],
    h2: ['style'],
    h3: ['style'],
    h4: ['style'],
    mark: ['data-color', 'style']
  },
  // style 属性只放行排版用 CSS 属性（Tiptap 书写工具输出）；值必须命中对应正则，
  // 其余 CSS 属性（含 url()/expression() 等注入向量）一律被 sanitize-html 剥掉。
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/],
      'background-color': [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/],
      'font-size': [/^\d{1,3}(px|pt|em|rem|%)$/]
    },
    // ★ Beta.322：宽高只对 <img> 放行（用户要求「图片尺寸可自定义像素 + 锁定比例」）。
    //   不挂到 '*' 的原因：那等于允许 <div style="width:9999px">，单个 div 就能把正文
    //   撑出横向滚动条。挂到 img 上，口径就只作用于图片。
    //   正则来自 electron/services/imageSize.js，与渲染层共用同一份（见该文件头注释）。
    img: IMAGE_SIZE_STYLE_RULES
  },
  allowedSchemes: ['http', 'https', 'data'],
  transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }) }
};
function cleanHtml(html) {
  return sanitizeHtml(String(html || ''), HTML_CFG);
}
function htmlToText(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------------- 初始化与持久化 ---------------- */
function resolveWasm() {
  let p = require.resolve('sql.js/dist/sql-wasm.wasm');
  if (p.includes('app.asar')) p = p.replace('app.asar', 'app.asar.unpacked');
  return p;
}

// 审计链的创世块（用于 prev_hash 链的初始值）
const GENESIS = crypto.createHash('sha256').update('ARCHAUDIT-GENESIS').digest('hex');

/**
 * 初始化数据库
 * @param {string} dir 数据目录
 * @param {{key?: Buffer}} opts.key 加密库的解密密钥（未提供且文件已加密时抛 DB_LOCKED）
 *
 * ★ 失败必须原子回滚 ★
 * 原先 dataDir / dbPath / db 都是「先赋值、后执行 migrate()」。当文件不是合法
 * SQLite 库时，`new SQL.Database(fileBuf)` 不抛错（惰性解析），真正的异常在
 * `migrate()` 才抛出 —— 而此时 db 已被赋成坏库对象、dataDir 已被写成目标目录。
 * 函数虽然抛了错，进程状态却被污染：再次调用 init 会被开头的 `if (db) return`
 * 短路，导致「重指目录修复」时指针换了、库还是坏的（Beta.202 报的
 * 「改正确目录后不跳转、要手动重启」正是这条链路）。
 * 故这里把「读文件 → 建库 → migrate → 落盘」整段包进 try，失败时把两个模块级
 * 变量清回 null，保证 init 要么完整成功、要么完全无副作用。
 */
async function init(dir, opts) {
  if (db) return;
  const prevDataDir = dataDir;
  const prevDbPath = dbPath;
  const targetDbPath = path.join(dir, 'archive.db');
  try {
    dataDir = dir;
    fs.mkdirSync(dataDir, { recursive: true });
    dbPath = targetDbPath;
    const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(resolveWasm()) });
    let fileBuf = null;
    if (fs.existsSync(dbPath)) {
      fileBuf = fs.readFileSync(dbPath);
      // 完整性校验（L1+L2+CRC32）：在 migrate/persist 修改前，比对磁盘既有 .sig
      const integ = verifyBufferIntegrity(fileBuf);
      if (!integ.ok) {
        pendingIntegrityWarn = integ.reason;
        // 粘滞标记：本会话内 persistNow 不再自动重签（防篡改痕迹被洗白），并触发只读模式
        markIntegrityCompromised(integ.reason);
      }
    }
    if (fileBuf && cryptoSvc.isEncrypted(fileBuf)) {
      if (!opts || !Buffer.isBuffer(opts.key)) {
        const err = new Error(i18n.errKey('sys.dbLockedNeedPass'));
        err.code = 'DB_LOCKED';
        throw err;
      }
      const { plain, salt } = cryptoSvc.decryptBuffer(fileBuf, opts.key); // 认证失败即口令错误
      cryptoOpts = { key: opts.key, salt };
      db = new SQL.Database(new Uint8Array(plain)); // 拷贝一份交给 sql.js，避免后续内存清零影响
      plain.fill(0); // 尽快清除解密明文副本（sql.js 内部已有自己的拷贝）
    } else {
      cryptoOpts = null;
      db = fileBuf ? new SQL.Database(fileBuf) : new SQL.Database();
    }
    migrate();
    // 迁移若新增了列/重算了历史链，立即落盘（防止进程意外退出导致升级丢失）
    try {
      persistNow();
    } catch (e) {
      /* 加密模式前不应落盘，但 migrate 后无加密 */
    }
  } catch (e) {
    // 原子回滚：不留下「半初始化」的 db / dataDir，否则重指目录时会被 `if (db) return` 短路
    db = null;
    dataDir = prevDataDir;
    dbPath = prevDbPath;
    cryptoOpts = null;
    // ★ 但完整性标记【故意不回滚】★
    //   一个库被外部改坏到 sql.js 都解析不了（migrate 报 malformed schema）时，
    //   回滚 db/dataDir 是为了让「重指目录修复」链路能正常工作；而
    //   integrityCompromised / integrityReason 是「证据」，必须比这次失败的打开活得更久：
    //   否则上层连一句有意义的提示都给不出来，用户只看到「数据库打开失败」而无从得知
    //   是被改了。注意主进程是在 init 抛错前就调用过 recordIntegrityIncident 的，
    //   所以证据已经落进审计链。
    throw e;
  }
}

/**
 * 生成下一条文档编号：<大区代码>-<分类代码>-<年份>-<4位序号>
 * 未选分类时分类段用 'NC'；地区/分类缺代码时回退为 'R{id}'/'C{id}'
 * 序号取该前缀下已存在编号的最大数字 +1
 */
function nextPostNo(regionId, categoryId, year) {
  const rc = (get('SELECT code FROM regions WHERE id=?', [regionId]) || {}).code || 'R' + regionId;
  const cc = categoryId
    ? (get('SELECT code FROM categories WHERE id=?', [categoryId]) || {}).code || 'C' + categoryId
    : 'NC';
  const prefix = `${rc}-${cc}-${year}-`;
  let max = 0;
  all('SELECT no FROM posts WHERE substr(no,1,?) = ?', [prefix.length, prefix]).forEach(r => {
    const m = /(\d+)$/.exec(r.no || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return prefix + String(max + 1).padStart(4, '0');
}

/** 代码字段最大长度（与 taxonomy.saveRegion/saveCategory 的 slice(0,20) 一致） */
const CODE_UNIQUE_MAX = 20;

/**
 * 为大区/分类的 code 建立唯一索引（Beta.217）。
 *
 * 【为什么不是写在 CREATE TABLE 里】
 *   `CREATE TABLE IF NOT EXISTS` 对**已存在的库**是空操作——把 UNIQUE 加在建表语句里，
 *   只对全新库生效，老库永远拿不到约束。所以约束必须用 CREATE UNIQUE INDEX 补，
 *   它对已有表同样生效。
 *
 * 【为什么用 UNIQUE INDEX 而不是 ALTER TABLE ADD CONSTRAINT】
 *   SQLite 不支持 `ALTER TABLE ADD CONSTRAINT`。想让既有表带上 UNIQUE，
 *   只能重建表（CREATE 新表 → 拷数据 → DROP → RENAME）。重建风险高：
 *   categories 被 posts.category_id 引用、还有 region_id 外键关系，
 *   且项目白名单里还有 share.db 同构表。CREATE UNIQUE INDEX 是等效且零风险的写法——
 *   在 SQLite 里它对写入的约束力与列级 UNIQUE 完全相同。
 *
 * 【先清重、再建索引：顺序不可颠倒】
 *   老库允许重码（Beta.215 之前没有任何查重），直接建唯一索引会因存量重复而失败。
 *   这里先把重复代码改写成「原代码+序号」（保留全部数据，不删任何大区/分类），
 *   再建索引。索引建不上时只记录日志、绝不抛错——否则 migrate 抛错会让整个应用起不来，
 *   而重码只是数据质量问题，不该阻断启动（与项目既有 migrate 段落一致：全部 try/catch 包裹）。
 *
 * 【NULL 的处理】
 *   SQLite 的唯一索引允许多行 NULL（NULL != NULL）。大区/分类的 code 有 NOT NULL 语义
 *   但列定义里没写 NOT NULL，故 migrate 前已用 `R{id}` / `C{id}` 回填空值。
 *   为了让「空字符串」也不重复，索引里再排一次空串兜底。
 */
function ensureCodeUniqueIndexes() {
  const dedupe = (table, prefix) => {
    try {
      // 找出所有重复代码（含空串），每组保留 id 最小的那条，其余改名
      const dups = all(`SELECT code FROM ${table}
        WHERE code IS NOT NULL AND code <> ''
        GROUP BY code HAVING COUNT(*) > 1`);
      let renamed = 0;
      for (const d of dups) {
        const rows = all(`SELECT id, code FROM ${table} WHERE code=? ORDER BY id`, [d.code]);
        // rows[0] 保持原代码不动，从第 2 条起依次找可用后缀
        for (let i = 1; i < rows.length; i++) {
          const base = String(rows[i].code || prefix).slice(0, CODE_UNIQUE_MAX);
          let cand = null;
          for (let n = 2; n <= 999; n++) {
            const suffix = String(n);
            const tryCode = base.slice(0, CODE_UNIQUE_MAX - suffix.length) + suffix;
            if (!get(`SELECT id FROM ${table} WHERE code=?`, [tryCode])) {
              cand = tryCode;
              break;
            }
          }
          if (!cand) {
            // 极端情况：999 个后缀都被占，退回带 id 的确定性写法
            cand = (prefix + rows[i].id).slice(0, CODE_UNIQUE_MAX);
          }
          run(`UPDATE ${table} SET code=? WHERE id=?`, [cand, rows[i].id]);
          renamed++;
        }
      }
      if (renamed) {
        console.error(`[migrate] ${table} 代码去重：改写 ${renamed} 条（原重复代码已加序号，数据未删除）`);
      }
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_${table}_code ON ${table}(code)`);
      return true;
    } catch (e) {
      // 绝不 rethrow：索引建不上只是少了一层兜底，应用层查重仍在（Beta.215）。
      // 直接抛错会让数据库打不开 → 用户彻底进不去，代价远大于收益。
      console.error(`[migrate] ${table} 代码唯一索引建立失败（已跳过，应用层查重仍生效）`, e && e.message);
      return false;
    }
  };
  const okRegions = dedupe('regions', 'R');
  const okCategories = dedupe('categories', 'C');
  // 空串兜底：唯一索引允许多个 NULL，但空串会互相冲突。
  // 前面 migrate 段已把空 code 回填为 R{id}/C{id}，这里再兜一次防止极端脏数据。
  try {
    run(`UPDATE regions SET code='R'||id WHERE code IS NULL OR code=''`);
    run(`UPDATE categories SET code='C'||id WHERE code IS NULL OR code=''`);
  } catch (e) {
    /* 忽略 */
  }
  if (okRegions && okCategories) {
    try {
      persist();
    } catch (e) {
      /* 落盘交给正常流程 */
    }
  }
}

function migrate() {
  db.run(`
  CREATE TABLE IF NOT EXISTS users(
    id TEXT PRIMARY KEY, name TEXT NOT NULL, mac TEXT NOT NULL,
    created_at TEXT NOT NULL, last_login TEXT
  );
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
    status TEXT DEFAULT 'published' CHECK(status IN ('draft','published')),
    author_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS post_tags(
    post_id INTEGER NOT NULL, tag_id INTEGER NOT NULL,
    PRIMARY KEY(post_id, tag_id)
  );
  CREATE TABLE IF NOT EXISTS post_fields(
    post_id INTEGER NOT NULL, field_def_id INTEGER NOT NULL, value TEXT DEFAULT '',
    PRIMARY KEY(post_id, field_def_id)
  );
  CREATE TABLE IF NOT EXISTS post_versions(
    id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL,
    version_no INTEGER NOT NULL, snapshot TEXT NOT NULL,
    user_id TEXT, created_at TEXT NOT NULL
  );
  /* 图片库（正文图片二进制入库）：正文 content_html 只存 archbox-img://{id} 协议短链，
   * 图片本体存本表。sha256 唯一约束天然去重（同一张图插多次只存一行）。
   * 提取/还原逻辑在 electron/services/db-images.js，本文件只负责 schema。 */
  CREATE TABLE IF NOT EXISTS images(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sha256 TEXT NOT NULL UNIQUE,
    mime TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notes(
    id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT DEFAULT '',
    color TEXT DEFAULT '#ffe58f', sort INTEGER DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log(
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, user_name TEXT, user_mac TEXT,
    action TEXT NOT NULL, entity TEXT, entity_id TEXT, detail TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    prev_hash TEXT, self_hash TEXT
  );
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS usage_stats(
    date TEXT PRIMARY KEY,
    seconds INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_posts_region ON posts(region_id);
  CREATE INDEX IF NOT EXISTS idx_posts_updated ON posts(updated_at);
  CREATE INDEX IF NOT EXISTS idx_fields_post ON post_fields(post_id);
  CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);
  `);

  // 兼容已有库：若旧表无 prev_hash/self_hash/user_mac 列则补列（幂等）
  try {
    const cols = all('PRAGMA table_info(audit_log)');
    const names = cols.map(c => c.name);
    if (!names.includes('prev_hash')) db.run('ALTER TABLE audit_log ADD COLUMN prev_hash TEXT');
    if (!names.includes('self_hash')) db.run('ALTER TABLE audit_log ADD COLUMN self_hash TEXT');
    if (!names.includes('user_mac')) {
      // 旧库升级：添加 user_mac 列 + 从 users 回填 MAC + 拆分旧 user_name 里的 (MAC) + 重算历史链
      db.run('ALTER TABLE audit_log ADD COLUMN user_mac TEXT');
      all('SELECT id, user_name FROM audit_log WHERE user_mac IS NULL AND user_id IS NOT NULL').forEach(r => {
        const u = get('SELECT mac FROM users WHERE id=?', [r.user_id]);
        if (u) run('UPDATE audit_log SET user_mac=? WHERE id=?', [u.mac, r.id]);
      });
      all("SELECT id, user_name FROM audit_log WHERE user_name LIKE '%(%)'").forEach(r => {
        const m = r.user_name.match(/^(.+)\(([0-9A-Fa-f:]{17})\)$/);
        if (m) run('UPDATE audit_log SET user_name=?, user_mac=? WHERE id=?', [m[1].trim(), m[2].toUpperCase(), r.id]);
      });
      let prev = GENESIS;
      all(
        'SELECT id,user_id,user_name,user_mac,action,entity,entity_id,detail,created_at FROM audit_log ORDER BY id ASC'
      ).forEach(r => {
        const h = auditHash(r, prev);
        run('UPDATE audit_log SET prev_hash=?, self_hash=? WHERE id=?', [prev, h, r.id]);
        prev = h;
      });
    }
  } catch (e) {
    /* 全新库已含列，忽略 */
  }

  // 兼容已有库：users 缺 password / sec_qa / mac_history 列则补列
  try {
    const ucols = all('PRAGMA table_info(users)').map(c => c.name);
    if (!ucols.includes('password')) db.run('ALTER TABLE users ADD COLUMN password TEXT');
    // sec_qa：安全问答（找回密码用），存 JSON 数组 [{q, a(hash)}]
    if (!ucols.includes('sec_qa')) db.run('ALTER TABLE users ADD COLUMN sec_qa TEXT');
    // mac_history：历史设备留底（跨机改绑时追加旧 MAC），存 JSON 数组 [{mac, at}]
    if (!ucols.includes('mac_history')) db.run("ALTER TABLE users ADD COLUMN mac_history TEXT DEFAULT '[]'");
  } catch (e) {
    /* 全新库已含列，忽略 */
  }

  // 兼容已有库：大区/分类空 code 回填为 R{id}/C{id}（需求④：代码改为必填，存量数据补默认）
  try {
    run("UPDATE regions SET code='R'||id WHERE code IS NULL OR code=''");
    run("UPDATE categories SET code='C'||id WHERE code IS NULL OR code=''");
  } catch (e) {
    /* 忽略 */
  }

  // 兼容已有库：重建 posts 表去掉 status 的 CHECK 约束（扩展到 template），并新增 no 列（文档自动编号）
  try {
    const pcols = all('PRAGMA table_info(posts)').map(c => c.name);
    if (!pcols.includes('no')) {
      run(`CREATE TABLE posts_new(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        region_id INTEGER NOT NULL, category_id INTEGER,
        title TEXT NOT NULL, content_html TEXT DEFAULT '', content_text TEXT DEFAULT '',
        status TEXT DEFAULT 'published',
        author_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        no TEXT
      )`);
      run(`INSERT INTO posts_new(id,region_id,category_id,title,content_html,content_text,status,author_id,created_at,updated_at)
           SELECT id,region_id,category_id,title,content_html,content_text,status,author_id,created_at,updated_at FROM posts`);
      run('DROP TABLE posts');
      run('ALTER TABLE posts_new RENAME TO posts');
      run('CREATE INDEX IF NOT EXISTS idx_posts_region ON posts(region_id)');
      run('CREATE INDEX IF NOT EXISTS idx_posts_updated ON posts(updated_at)');
    }
  } catch (e) {
    console.error('migrate posts rebuild', e);
  }

  // 兼容已有库：存量 posts 回填 no（按 大区代码/分类代码/创建年份 生成，前缀无编号则顺延）
  try {
    const curYear = new Date().getFullYear();
    all("SELECT id, region_id, category_id, substr(created_at,1,4) y FROM posts WHERE no IS NULL OR no=''").forEach(
      p => {
        const no = nextPostNo(p.region_id, p.category_id, p.y || curYear);
        run('UPDATE posts SET no=? WHERE id=?', [no, p.id]);
      }
    );
  } catch (e) {
    console.error('migrate no backfill', e);
  }

  // 兼容已有库：posts 补 deleted_at 列（回收站软删除用；NULL=未删除）
  try {
    const pcols2 = all('PRAGMA table_info(posts)').map(c => c.name);
    if (!pcols2.includes('deleted_at')) db.run('ALTER TABLE posts ADD COLUMN deleted_at TEXT');
  } catch (e) {
    console.error('migrate posts deleted_at', e);
  }

  // 兼容已有库：posts 补「来源标记」列（供甄别由文档包导入的文档）
  //   imported_at   导入时间（ISO）；NULL=非导入文档（本机自建）
  //   imported_from 来源文档包标识（导出者指纹/文件名），便于溯源
  try {
    const pcols3 = all('PRAGMA table_info(posts)').map(c => c.name);
    if (!pcols3.includes('imported_at')) db.run('ALTER TABLE posts ADD COLUMN imported_at TEXT');
    if (!pcols3.includes('imported_from')) db.run('ALTER TABLE posts ADD COLUMN imported_from TEXT');
    db.run('CREATE INDEX IF NOT EXISTS idx_posts_imported ON posts(imported_at)');
  } catch (e) {
    console.error('migrate posts imported_at', e);
  }

  // 兼容已有库：posts 补「拷贝来源」列（供甄别由局域共享拷贝而来的文档）
  //   copied_at     拷贝时间（ISO）；NULL=非拷贝文档
  //   copied_from   来源共享源标识（共享名@IP:端口），便于溯源
  //   origin_author 原始作者名快照（拷贝那一刻对方叫什么；本机当前作者另见 author_id）
  // ★ 与 imported_at/imported_from 语义不同，不合并 ★
  try {
    const pcols4 = all('PRAGMA table_info(posts)').map(c => c.name);
    if (!pcols4.includes('copied_at')) db.run('ALTER TABLE posts ADD COLUMN copied_at TEXT');
    if (!pcols4.includes('copied_from')) db.run('ALTER TABLE posts ADD COLUMN copied_from TEXT');
    if (!pcols4.includes('origin_author')) db.run('ALTER TABLE posts ADD COLUMN origin_author TEXT');
    db.run('CREATE INDEX IF NOT EXISTS idx_posts_copied ON posts(copied_at)');
  } catch (e) {
    console.error('migrate posts copied_at', e);
  }

  // 大区/分类代码的唯一索引（见 ensureCodeUniqueIndexes 的说明）
  ensureCodeUniqueIndexes();
}

function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      persistNow();
    } catch (e) {
      console.error('persist', e);
    }
  }, 500);
}
function persistNow() {
  if (!db) return;
  const buf = Buffer.from(db.export());
  const out = cryptoOpts ? cryptoSvc.encryptBuffer(buf, cryptoOpts.key, cryptoOpts.salt) : buf;
  fs.writeFileSync(dbPath, out);
  // ★ 防「签名洗白」★
  //   旧写法无条件 writeDbSignature()：启动时即便已检出库被外部篡改，
  //   只要用户照常使用一次，persistNow 就会对篡改后的内容重新签名，
  //   篡改痕迹被抹平 → 下次启动查不出来。
  //   现在改为：完整性已判不通过时【不再自动重签】，签名继续指向原始内容，
  //   使「被改过」这件事在 .sig 上长期可见（直到用户显式重建基准或从备份恢复）。
  //   注意：只跳过「重新签名」，数据本身仍照常落盘 —— 只读拦截由上层 state.writable 负责，
  //   这样即便某条链路漏了拦截，最坏也只是写下去，而不会把证据毁掉。
  if (!integrityCompromised) {
    try {
      writeDbSignature();
    } catch (e) {
      console.error('db sign', e);
    }
  } else {
    console.warn('完整性不通过：跳过数据库重新签名，保留篡改痕迹（如需重建基准请人工确认）');
  }
}

/**
 * 关闭当前数据库并释放模块级状态（切换数据目录前调用）。
 *
 * 仅供「数据库不可用屏 → 选择其它数据目录」的修复链路使用：reloadDataDir 在切到
 * 新目录前必须先关掉旧库。否则一旦某个库已成功打开（db 不为 null），
 * 再指向另一个目录时 db.init 会被开头的 `if (db) return` 短路，
 * 指针换了、库却没换（且会误报成功）。
 *
 * ★ 必须先 persistNow 再关闭：把内存中的改动落盘到「旧目录」，
 *   否则未落盘的改动会随 db 释放而丢失。
 */
function closeDb() {
  if (!db) return;
  try {
    persistNow();
  } catch (e) {
    console.error('closeDb persist', e);
  }
  try {
    db.close();
  } catch (e) {
    /* sql.js close 可能对已释放对象抛错，忽略 */
  }
  db = null;
  dataDir = null;
  dbPath = null;
  cryptoOpts = null;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}

/* ---------------- 数据库完整性（L1+L2+CRC32） ---------------- */
function dbSigPath() {
  return dbPath + '.sig';
}

/**
 * 完整性是否已被判定为「不通过」（本会话内的粘滞标记）。
 *
 * 【为什么需要粘滞】
 *   启动时若检出 archive.db 与 .sig 不一致，说明库被外部改过。此时若照常允许写库，
 *   persistNow 会立刻对**被篡改后的内容**重新签名 —— 等于把篡改痕迹洗白，
 *   下次启动再也查不出来（这正是本模块要堵的漏洞）。
 *   所以一旦判定不通过，本会话内保持 integrityCompromised=true：
 *     - persistNow 不再自动重签（签名保持「指向原始内容」，篡改痕迹长期留存）；
 *     - 上层据此进入只读模式（见 main.js / state.writable）。
 *   只有用户显式执行「确认为误报并重建基准」或从备份恢复时才会清除。
 */
let integrityCompromised = false;
/** 启动时完整性不通过的原因（供 UI 展示与审计），null 表示未检出 */
let integrityReason = null;

/** 对当前 archive.db 落盘字节计算 sha256+crc32 并 Ed25519 签名，写入伴随文件 archive.db.sig */
function writeDbSignature() {
  if (!dbPath || !fs.existsSync(dbPath)) return;
  const buf = fs.readFileSync(dbPath);
  const payload = { scope: 'archive.db', sha256: packSign.sha256(buf), crc32: packSign.crc32(buf) };
  const signed = { ...payload, signature: packSign.sign(JSON.stringify(payload)), signedAt: Date.now() };
  fs.writeFileSync(dbSigPath(), JSON.stringify(signed, null, 2));
}

/**
 * 标记完整性不通过（粘滞）。
 * @param {string} reason 人类可读原因；可以是 i18n errKey 编码串（见 i18n.errKey），
 *                        由取用点在语言确定后经 i18n.logText 还原。
 */
function markIntegrityCompromised(reason) {
  integrityCompromised = true;
  if (!integrityReason) integrityReason = String(reason || 'integDefault');
}

/** 查询当前会话是否处于「完整性不通过」状态（供只读模式判定） */
function isIntegrityCompromised() {
  return integrityCompromised;
}
/** 取完整性不通过的原因（无则返回 null）。返回值保持原始编码串，
 *  由取用点按用途处理：显示走 i18n.logText，进审计链同样走 logText（审计用中文）。 */
function getIntegrityReason() {
  return integrityReason;
}

/**
 * 用户显式确认「接受当前内容并重建签名基准」——唯一的洗白出口，必须人工触发。
 * 调用后清除粘滞标记并立即以当前字节重签，使后续启动以现状为基准。
 */
function acceptCurrentAsBaseline() {
  if (!dbPath || !fs.existsSync(dbPath)) return false;
  writeDbSignature();
  integrityCompromised = false;
  integrityReason = null;
  return true;
}

/**
 * 校验任意 db 字节缓冲区与既有 .sig 是否一致（L1 哈希 + L2 签名 + CRC32）
 * @returns {{ok:boolean, reason?:string}}
 */
function verifyBufferIntegrity(buf) {
  const sigPath = dbSigPath();
  if (!fs.existsSync(sigPath)) return { ok: true, note: i18n.t('sys.integNoSig') };
  let signed;
  try {
    signed = JSON.parse(fs.readFileSync(sigPath, 'utf8'));
  } catch (e) {
    return { ok: false, reason: i18n.errKey('sys.integSigBroken') };
  }
  const payload = { scope: signed.scope, sha256: signed.sha256, crc32: signed.crc32 };
  if (!packSign.verify(JSON.stringify(payload), signed.signature))
    return { ok: false, reason: i18n.errKey('sys.integSigFail') };
  if (packSign.sha256(buf) !== signed.sha256) return { ok: false, reason: i18n.errKey('sys.integHashMismatch') };
  if (packSign.crc32(buf) !== signed.crc32) return { ok: false, reason: i18n.errKey('sys.integCrcMismatch') };
  return { ok: true };
}

/** 重新读取磁盘 archive.db 并校验完整性（供 UI/启动后调用） */
function verifyDbIntegrity() {
  if (!dbPath || !fs.existsSync(dbPath)) return { ok: true, note: i18n.t('sys.integNoDbFile') };
  return verifyBufferIntegrity(fs.readFileSync(dbPath));
}

/** 取启动时的完整性告警（init 内已在校验前设置），取后清空。
 *
 * ★ 返回值是**已本地化的文本**：取用点（main.js 弹窗、审计链 detail）都需要文字，
 *   且取用点的语言此刻已确定（main.js 在 tryBootDb 后已 initFromSettings）。
 *   把 errKey 的翻译放在这里而不是取用点，是因为 reason 必须先经 logText/t 落到
 *   一条字符串上——它要进审计链、进错误屏，这些都存字符串。 */
function getPendingIntegrityWarn() {
  const w = pendingIntegrityWarn;
  pendingIntegrityWarn = null;
  return w === null || w === undefined ? w : i18n.logText(w);
}

/**
 * 把「完整性不通过」这件事写进审计链 —— 让篡改有迹可循。
 *
 * 【为什么必须进审计链，而不是只弹个窗】
 *   弹窗是一次性的：用户点「我知道了」就没了，下次谁也不知道曾经被改过。
 *   审计链是 SHA-256 链式的、任何删除/插入/改字段都会让后续 self_hash 对不上，
 *   因此「曾经被篡改」会成为一条永久留痕、且自身受链保护的历史记录。
 *
 * 【为什么每次启动都要写一条】
 *   需求是「告警不可自动清除」。若只写一次，用户（或攻击者）清掉那条记录即可抹去痕迹；
 *   每次启动都追加一条，说明「每次开机都仍然处于不通过状态」——
 *   想彻底消除，只能真正把库修复回与签名一致，或人工确认重建基准（两者都有明确审计）。
 *
 * 【为什么 userId 传 null】
 *   篡改是外部对文件的改动，与当前登录用户无关；归到操作者名下会误导排查。
 *   用 actorName='系统' 明确标识来源，detail 里带上具体原因便于定位。
 *
 * @returns {boolean} 是否成功写入
 */
function recordIntegrityIncident() {
  if (!integrityCompromised) return false;
  try {
    audit(null, i18n.t('sys.auditDbIntegrity'), 'integrity', 'archive.db', {
      reason: i18n.logText(integrityReason || 'sys.integDefault'),
      sigPath: dbSigPath(),
      action: i18n.t('sys.auditIntegrityAction')
    });
    return true;
  } catch (e) {
    console.error('recordIntegrityIncident', e);
    return false;
  }
}

/**
 * 把「程序文件与签名清单不一致」写进审计链。
 *
 * 与 recordIntegrityIncident（数据完整性）分开成两个动作名，理由：
 *   - 两者的处置完全不同：数据被改 → 只读 + 从备份恢复；程序被改 → 换回官方程序包；
 *   - 审计列表按 action 筛选时，混在一起会让管理员无法区分「谁的库被改了」与
 *     「谁在用改过的程序」——而后者往往意味着整台机器都不可信。
 *
 * @param {{modified?:string[], missing?:string[], added?:string[], checked?:number, reason?:string}} report
 *        verifyAppFiles 的返回值
 * @returns {boolean} 是否成功写入
 */
function recordAppIntegrityIncident(report) {
  if (!report || report.ok !== false) return false;
  try {
    audit(null, i18n.t('sys.auditAppIntegrity'), 'app-integrity', 'resources/app', {
      reason: report.reason || i18n.t('sys.auditAppIntegrityReason'),
      checked: report.checked || 0,
      modified: (report.modified || []).slice(0, 20),
      missing: (report.missing || []).slice(0, 20),
      added: (report.added || []).slice(0, 20),
      truncated: {
        modified: Math.max(0, (report.modified || []).length - 20),
        missing: Math.max(0, (report.missing || []).length - 20),
        added: Math.max(0, (report.added || []).length - 20)
      }
    });
    return true;
  } catch (e) {
    console.error('recordAppIntegrityIncident', e);
    return false;
  }
}

/* ---------------- 透明加密管理 ---------------- */
/** 当前会话是否处于加密模式（加密读入 / 已启用加密） */
function isEncryptedMode() {
  return !!cryptoOpts;
}
/** 磁盘上的数据库文件当前是否为加密格式（无需口令即可探测） */
function isDbFileEncrypted() {
  try {
    return fs.existsSync(dbPath) && cryptoSvc.isEncrypted(fs.readFileSync(dbPath));
  } catch (e) {
    return false;
  }
}
/** 启用/切换加密密钥：立即以新密钥加密落盘 */
function enableEncryption({ key, salt }) {
  if (!db) throw new Error(i18n.errKey('common.errDbNotInit'));
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error(i18n.errKey('common.errDbInvalidKey'));
  cryptoOpts = { key, salt: Buffer.isBuffer(salt) ? salt : cryptoSvc.randomSalt() };
  persistNow();
}
/** 关闭加密：立即以明文落盘 */
function disableEncryption() {
  if (!cryptoOpts) return false;
  cryptoOpts = null;
  persistNow();
  return true;
}
/** 验证口令是否与当前加密密钥一致（常数时间比较，用于关闭加密/改口令前的确认） */
function verifyPass(pass) {
  if (!cryptoOpts) return false;
  return cryptoSvc.keysEqual(cryptoSvc.deriveKey(pass, cryptoOpts.salt), cryptoOpts.key);
}
function setDataDir(dir) {
  dataDir = dir;
  dbPath = path.join(dir, 'archive.db');
  persistNow();
}
function dataDirPath() {
  return dataDir;
}

/** 检测数据库文件所在目录是否可写（启动时探针）——复用 datadir.canWrite 统一探针名与逻辑 */
function checkWritable() {
  return datadir.canWrite(dataDir);
}

/* ---------------- 查询助手 ---------------- */
/**
 * 数据库就绪断言：db 为 null 时（明文库打开失败 / 加密库未解锁 / 初始化异常）
 * 任何查询都不应再抛 `Cannot read properties of null (reading 'prepare')` 这种天书，
 * 而是给出可读的引导，把"崩溃到注册框/卡死"变成明确的"数据库不可用"提示。
 */
function assertDb() {
  if (!db) {
    throw new Error(i18n.errKey('common.errDbNotReady'));
  }
}
function all(sql, params = []) {
  assertDb();
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params.map(nv));
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    return out;
  } finally {
    stmt.free();
  }
}
function get(sql, params = []) {
  assertDb();
  return all(sql, params)[0] || null;
}
function run(sql, params = []) {
  assertDb();
  db.run(sql, params.map(nv));
}
function insert(sql, params = []) {
  assertDb();
  db.run(sql, params.map(nv));
  return get('SELECT last_insert_rowid() AS id').id;
}

/* ---------------- 审计 ---------------- */
/** 计算一条审计记录的 self_hash：绑定除自身外的全部业务字段 + 前条 hash */
function auditHash(row, prevHash) {
  const parts = [
    String(prevHash || ''),
    String(row.user_id || ''),
    String(row.user_name || ''),
    String(row.user_mac || ''),
    String(row.action || ''),
    String(row.entity || ''),
    String(row.entity_id || ''),
    String(row.detail || ''),
    String(row.created_at || '')
  ];
  return crypto.createHash('sha256').update(parts.join('¦')).digest('hex');
}

/**
 * 写一条审计记录（SHA-256 链式防篡改）。
 * @param {string} action 动作名，如 '登录' / '登录失败'
 * @param {object} [opts] 可选：{ actorName, actorMac }
 *   用于「用户不存在 / 身份未确认」场景显式指定操作者——此时 userId 查不到用户，
 *   若不显式传入会回退成「系统」，丢失登录尝试者线索（安全审计必需）。
 */
function audit(userId, action, entity, entityId, detail, opts) {
  const u = userId ? get('SELECT id,name,mac FROM users WHERE id=?', [userId]) : null;
  const uid = u ? u.id : null;
  // 用户名、ID、MAC 分别独立存储，便于审计溯源与筛选
  const uname = u ? u.name : opts && opts.actorName ? String(opts.actorName) : '系统';
  const umac = u ? u.mac : opts && opts.actorMac ? String(opts.actorMac) : null;
  const act = String(action || '');
  const ent = String(entity || '');
  const eid = String(entityId == null ? '' : entityId);
  const det = JSON.stringify(detail || {});
  const ts = nowIso();
  // 取上一条记录的 self_hash 作为 prev_hash（链式）
  const last = get('SELECT self_hash FROM audit_log ORDER BY id DESC LIMIT 1');
  const prevHash = (last && last.self_hash) || GENESIS;
  const selfHash = auditHash(
    {
      user_id: uid,
      user_name: uname,
      user_mac: umac,
      action: act,
      entity: ent,
      entity_id: eid,
      detail: det,
      created_at: ts
    },
    prevHash
  );
  insert(
    'INSERT INTO audit_log(user_id,user_name,user_mac,action,entity,entity_id,detail,created_at,prev_hash,self_hash) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [uid, uname, umac, act, ent, eid, det, ts, prevHash, selfHash]
  );
  persist();
}

/**
 * 审计链完整性校验：逐条重算 self_hash 并比对 prev_hash 链式关系
 * 任何记录被篡改/删除/插入都会让链断裂，返回 brokenAt 指向首条异常记录
 * @returns {{ok:boolean, total:number, chained:number, brokenAt:?number, brokenHash:?string, detail:string}}
 */
function verifyAuditChain() {
  const rows = all(
    'SELECT id,user_id,user_name,user_mac,action,entity,entity_id,detail,created_at,prev_hash,self_hash FROM audit_log ORDER BY id ASC'
  );
  const total = rows.length;
  if (total === 0) return { ok: true, total: 0, chained: 0, brokenAt: null, detail: i18n.t('sys.chainDetailNone') };
  let prevHash = GENESIS;
  let chained = 0;
  for (const r of rows) {
    // 兼容历史无链记录：prev_hash/self_hash 为空视为「未链化历史」，不参与校验但不报错
    if (!r.self_hash) continue;
    // 链式校验：prev_hash 必须等于上一条 self_hash
    if (r.prev_hash !== prevHash) {
      return {
        ok: false,
        total,
        chained,
        brokenAt: r.id,
        brokenHash: 'chain',
        detail: i18n.t('sys.chainBrokenPrev', { id: r.id })
      };
    }
    // 内容校验：重算 self_hash 必须一致
    const recomputed = auditHash(r, r.prev_hash);
    if (recomputed !== r.self_hash) {
      return {
        ok: false,
        total,
        chained,
        brokenAt: r.id,
        brokenHash: 'content',
        detail: i18n.t('sys.chainBrokenContent', { id: r.id })
      };
    }
    prevHash = r.self_hash;
    chained++;
  }
  return { ok: true, total, chained, brokenAt: null, detail: i18n.t('sys.chainOkDetail', { n: chained }) };
}

/* ---------------- 操作日志 ---------------- */
function listAudit(f = {}) {
  const page = Math.max(1, parseInt(f.page || 1, 10));
  const size = 50;
  const where = [];
  const params = [];
  if (f.q) {
    where.push(
      '(action LIKE ? OR entity LIKE ? OR user_name LIKE ? OR user_id LIKE ? OR user_mac LIKE ? OR detail LIKE ?)'
    );
    const l = `%${f.q}%`;
    params.push(l, l, l, l, l, l);
  }
  const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const total = get(`SELECT COUNT(*) n FROM audit_log${w}`, params).n;
  const rows = all(
    `SELECT id,user_id,user_name,user_mac,action,entity,entity_id,detail,created_at,prev_hash,self_hash FROM audit_log${w} ORDER BY id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`,
    params
  );
  return { total, page, rows };
}

module.exports = {
  // 公开 API（聚合文件 db.js 会按原签名导出以下子集）
  init,
  closeDb,
  persist,
  persistNow,
  setDataDir,
  dataDirPath,
  checkWritable,
  verifyDbIntegrity,
  getPendingIntegrityWarn,
  writeDbSignature,
  markIntegrityCompromised,
  isIntegrityCompromised,
  getIntegrityReason,
  acceptCurrentAsBaseline,
  recordIntegrityIncident,
  recordAppIntegrityIncident,
  isEncryptedMode,
  isDbFileEncrypted,
  enableEncryption,
  disableEncryption,
  verifyPass,
  nowIso,
  todayStr,
  uid,
  rnd6,
  cleanHtml,
  HTML_CFG,
  listAudit,
  verifyAuditChain,
  // 内部助手（供功能模块复用；聚合文件 db.js 仅导出上方公开子集，不会外泄）
  all,
  get,
  run,
  insert,
  audit,
  auditHash,
  htmlToText,
  migrate,
  GENESIS,
  resolveWasm,
  nv,
  nextPostNo
};
