'use strict';
/**
 * 图片库（db-images）：正文图片二进制入库、正文只存协议短链。
 *
 * 【为什么把图片搬进数据库】
 *   原先图片以 base64 data: URI 内联在 content_html 里，正文动辄几百 KB：
 *   · 列表页/预览/版本快照/文档包导出都要拖着这串巨串跑，内存与 IPC 载荷被撑爆；
 *   · 同一张图在 N 篇文档里出现 N 份拷贝，库体积无谓翻倍。
 *
 * 【方案：协议链接只活在水下存储层】
 *   · 入库（extractImages）：把 content_html 里的 <img src="data:..."> 逐个搬进
 *     images 表，正文里只留 archbox-img://{id} 短链（约 25 字节）；
 *   · 出库（hydrateImages）：反向把短链还原成 data:，交给渲染层/导出层。
 *   编辑器、IPC 契约、前端 API 全程只见 data:，零改动。
 *
 * 【存量兼容】老库正文里已是 data: 内联：extract 是幂等的（只搬 data:，短链原样
 *   跳过），老文档下次保存时自动瘦身；hydrate 对 data: 原样返回，读取零感知。
 *
 * 【依赖方向】本服务只依赖 db/core（查询助手），不依赖任何功能模块，避免循环依赖
 *   （与 core.js 依赖 services/crypto 等同属既有的 db→services 方向）。
 */
const crypto = require('crypto');
const core = require('../db/core');

/** 协议短链前缀：仅存在于存储层，禁止出现在任何渲染/导出产物（导出前必须 hydrate） */
const IMG_SCHEME = 'archbox-img://';
/** 单张图片大小上限：与 ipc/media.js img:upload 的 20MB 保持一致（超限不搬库，原样保留） */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/* ---------------- data: URI 解析 ---------------- */

/**
 * 解析 data: URI，只收 base64 图片（本项目 img:upload 与粘贴链路只产生 base64）。
 * @returns {{mime:string, b64:string}|null} 非图片/非 base64/格式非法时返回 null（调用方原样保留）
 */
function parseDataUri(src) {
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/i.exec(String(src || ''));
  if (!m || !m[2]) return null; // 非 base64（URL 编码 data）不收：无生产路径会产生它
  const mime = m[1].toLowerCase();
  if (!/^image\//.test(mime)) return null;
  const b64 = m[3].replace(/\s+/g, '');
  return b64 ? { mime, b64 } : null;
}

/* ---------------- img 标签级的 src 读写 ---------------- */

// 与 export-text.js 的图片正则同口径：属性值里含 '>' 的极端写法不覆盖（sanitize-html
// 会转义属性内的尖括号，实际不会出现）。
const IMG_TAG_RE = /<img\b[^>]*>/gi;
const SRC_ATTR_RE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
/** 取出某个 img 标签的 src 属性值 */
function srcOf(tag) {
  const m = SRC_ATTR_RE.exec(tag);
  if (!m) return null;
  return m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] || '';
}
/** 把某个 img 标签的 src 属性整体替换为 newSrc（保留其余属性与引号风格由替换值统一为双引号） */
function withSrc(tag, newSrc) {
  return tag.replace(SRC_ATTR_RE, () => `src="${newSrc}"`);
}

/* ---------------- 入库：data: → images 表 + 短链 ---------------- */

/**
 * 写入一张图片（sha256 去重），返回 images.id。
 * 同一张图（内容完全相同）重复插入只存一行 —— 这是「同图多处引用」不翻倍的关键。
 */
function storeImage(mime, b64) {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > MAX_IMAGE_BYTES) return null; // 超限：调用方保留原 data:
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const hit = core.get('SELECT id FROM images WHERE sha256=?', [sha256]);
  if (hit) return hit.id;
  return core.insert('INSERT INTO images(sha256,mime,bytes,data,created_at) VALUES(?,?,?,?,?)', [
    sha256,
    mime,
    buf.length,
    b64,
    core.nowIso()
  ]);
}

/**
 * 提取正文里的内联图片为协议短链（幂等）。
 *  - data: 图片 → 入库 + 替换为 archbox-img://{id}（超限或格式不识别则原样保留，不静默丢图）；
 *  - archbox-img:// 短链 / 外链 src → 原样不动；
 *  - 正文不含 data: 时走快路径直接返回原串（列表/保存热路径零开销）。
 * @returns {string} 替换后的 HTML
 */
function extractImages(html) {
  const s = String(html == null ? '' : html);
  if (!s || s.indexOf('data:') === -1) return s;
  return s.replace(IMG_TAG_RE, tag => {
    const src = srcOf(tag);
    const parsed = parseDataUri(src);
    if (!parsed) return tag;
    const id = storeImage(parsed.mime, parsed.b64);
    if (!id) return tag; // 超限保留原样
    return withSrc(tag, IMG_SCHEME + id);
  });
}

/* ---------------- 出库：短链 → data: ---------------- */

/**
 * 还原正文里的协议短链为 data: URI（幂等）。
 *  - archbox-img://{id} → 查库拼回 data:{mime};base64,{data}；
 *  - 查不到（图片行被清 / 换库后 id 不存在）→ 移除整个 img 标签：不留裂图，
 *    也不留一个 src 非法的坏标签污染 DOM；
 *  - data: / 外链 src → 原样不动；正文不含短链时快路径返回原串。
 * @returns {string} 还原后的 HTML
 */
function hydrateImages(html) {
  const s = String(html == null ? '' : html);
  if (!s || s.indexOf(IMG_SCHEME) === -1) return s;
  return s.replace(IMG_TAG_RE, tag => {
    const src = srcOf(tag);
    if (!src || src.indexOf(IMG_SCHEME) !== 0) return tag;
    const id = parseInt(src.slice(IMG_SCHEME.length), 10);
    const row = Number.isInteger(id) && id > 0 ? core.get('SELECT mime,data FROM images WHERE id=?', [id]) : null;
    if (!row) return ''; // 图片已不存在：摘掉标签，不留裂图
    return withSrc(tag, `data:${row.mime};base64,${row.data}`);
  });
}

/* ---------------- 回收：清理无引用图片 ---------------- */

/** 从一段 HTML 里收集被引用的 images.id 集合 */
function collectUsedIds(html, used) {
  const s = String(html || '');
  if (!s || s.indexOf(IMG_SCHEME) === -1) return;
  IMG_TAG_RE.lastIndex = 0;
  let m;
  while ((m = IMG_TAG_RE.exec(s))) {
    const src = srcOf(m[0]);
    if (src && src.indexOf(IMG_SCHEME) === 0) {
      const id = parseInt(src.slice(IMG_SCHEME.length), 10);
      if (Number.isInteger(id) && id > 0) used.add(id);
    }
  }
}

/**
 * 扫描全库引用，返回 { used: Set<number>, all: Array<{id,bytes}> }。
 *
 * 【引用面必须扫全，漏扫就会误删正在用的图】
 *   posts.content_html —— 含回收站软删除文档与草稿/模板（它们仍占着图片）；
 *   post_versions.snapshot —— 历史版本快照里的短链同样是有效引用
 *     （用户随时可能把某版恢复回来，恢复时快照内容会重新成为正文）。
 *
 * ★ 「回收站里的文档算不算在用」是**有意为之的口径**（Beta.316 用户确认「算」）：
 *   软删文档的 content_html 仍计入引用，因此它的图不会被回收 —— 用户在回收站点恢复，
 *   正文里的图必须原样回来。代价是「彻底删除之后」才真正释放空间，这是取舍不是漏。
 *
 * 单一来源：purgeUnusedImages / statistics 共用本函数，两处口径不可能漂移。
 */
function scanReferences() {
  const used = new Set();
  core.all('SELECT content_html FROM posts').forEach(r => collectUsedIds(r.content_html, used));
  core.all('SELECT snapshot FROM post_versions').forEach(r => {
    try {
      collectUsedIds(JSON.parse(r.snapshot).content_html, used);
    } catch (e) {
      /* 快照 JSON 损坏：跳过（该版本本就无法恢复） */
    }
  });
  const all = core.all('SELECT id, bytes FROM images');
  return { used, all };
}

/**
 * 数据清洗 · 图片项：统计可回收的无引用图片（不写库）。
 *
 * 【为什么要预检接口】「清理无用图片」是破坏性操作，必须先让用户看见「能清掉几张、多少
 *   MB」再决定 —— 直接给一个按钮，用户点下去只会看到一个不知后果的确认框。
 *   预检与实清共用 scanReferences，两个数字必然一致。
 *
 * @returns {{stale:number, staleBytes:number, total:number, totalBytes:number}}
 *   stale = 无任何引用的图片行数；total = images 表总行数
 */
function imageStatistics() {
  const { used, all } = scanReferences();
  let stale = 0;
  let staleBytes = 0;
  let totalBytes = 0;
  for (const row of all) {
    totalBytes += row.bytes || 0;
    if (!used.has(row.id)) {
      stale++;
      staleBytes += row.bytes || 0;
    }
  }
  return { stale, staleBytes, total: all.length, totalBytes };
}

/**
 * 清理没有任何正文引用的图片行（数据清洗 · 图片项 / 彻底删除文档后调用）。
 *
 * 【为什么不做成每次保存都跑】全库扫 content 是 O(库体积) 的操作，
 *   挂在保存热路径上不可接受；彻底删除与手动清洗都是低频破坏性操作，频率与代价匹配。
 *   副作用：普通删除图片引用后 images 行会留存直到下次清洗，
 *   属可接受的延迟回收（数据只多不丢，不会误删）。
 *
 * @returns {number} 删除的图片行数
 */
function purgeUnusedImages() {
  const { used, all } = scanReferences();
  let removed = 0;
  for (const row of all) {
    if (!used.has(row.id)) {
      core.run('DELETE FROM images WHERE id=?', [row.id]);
      removed++;
    }
  }
  return removed;
}

/* ---------------- 清单：图片 ↔ 引用文档（数据清洗 · 图片文件板块） ---------------- */

/**
 * 把一段 HTML 里引用的图片 id 收集成 id → 出现次数。
 * 与 collectUsedIds 同样是「扫 img 标签的 src」，区别只在记账方式（这里要次数）。
 *
 * ★ 为什么单独写一个而不是改造 collectUsedIds ★
 *   回收口径只需要「用过没有」（Set，可提前短路）；清单口径要「用了几次」，
 *   且要分组到具体文档。两者用途不同，硬合成一个会让回收热路径也跟着记账。
 *   但**扫描面必须一致**（posts.content_html + post_versions.snapshot），
 *   否则会出现「清单显示在用、回收认为没用」的自相矛盾。此处两者共用 scanReferences
 *   的扫描顺序与 hydrate/短链判定（本函数只被 buildImageInventory 调用）。
 */
function collectIdCounts(html, out) {
  const s = String(html || '');
  if (!s || s.indexOf(IMG_SCHEME) === -1) return;
  IMG_TAG_RE.lastIndex = 0;
  let m;
  while ((m = IMG_TAG_RE.exec(s))) {
    const src = srcOf(m[0]);
    if (src && src.indexOf(IMG_SCHEME) === 0) {
      const id = parseInt(src.slice(IMG_SCHEME.length), 10);
      if (Number.isInteger(id) && id > 0) out.set(id, (out.get(id) || 0) + 1);
    }
  }
}

/** 取快照里的标题（只给「引用文档」列表显示用；正文太长不进 IPC，标题足够认人） */
function titleOfSnapshot(snapText) {
  try {
    const snap = JSON.parse(snapText);
    return String(snap.title || '');
  } catch (e) {
    return '';
  }
}

/**
 * 图片清单：列出库里每张图片的编号、类型、大小、上传时间，以及被哪些文档引用。
 *
 * 【用户要的是什么】
 *   「展示当前库里的图片文件，并展示哪些文档在引用，要有图片编号，上传时间」——
 *   目的是**判断能不能安心清理**：看到某张图没被任何文档引用，才敢点「清理无用图片」。
 *   所以引用信息不能只给个数，必须能追到具体文档（可点击跳过去看）。
 *
 * 【引用面与回收口径完全一致】
 *   正文 posts.content_html + 历史版本 post_versions.snapshot。
 *   ★ 「历史版本的图片也算作在用」★ 这是用户本轮明确要求，也是 scanReferences
 *   一开始就采用的口径（Beta.316 用户确认回收站算在用，历史版本同理）：
 *   任何一版可能被恢复，恢复时图片必须还在。
 *   清单里把「正文在用」与「仅历史版本在用」分开标出，用户能区分这层差异，
 *   而不是看到「有引用」就以为当前正文里有它。
 *
 * 【性能】只查元数据，不查 data 列 —— 图片本体是 base64，几百张就能把 IPC 撑爆。
 *   缩略图由前端按 id 单独取（img:data 通道），列表本身永远只跑 SQL 元数据。
 *
 * @param {{page?:number, size?:number, q?:string, only?:'unused'|'all'}} opts
 * @returns {{total:number, page:number, size:number, pages:number,
 *            rows:Array<{id,no,mime,ext,bytes,bytesText,created_at,refCount,postCount,usedInBody,refs}>,
 *            summary:{total:number, totalBytes:number, unused:number, unusedBytes:number}}}
 */
function buildImageInventory(opts = {}) {
  const size = Math.max(1, Math.min(200, parseInt(opts.size, 10) || 20));
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const q = String(opts.q || '').trim();

  /* ---- 1. 扫引用：图片 id → Map(postId → {postId,title,status,inBody,versionNos}) ----
   *
   * ★ inBody 必须记在【文档】这一层，不能靠「versionNos 是否为空」推 ★
   *   每次 savePost 都会 saveVersion，于是正文引用的同一份内容必然也在最新一版快照里
   *   —— 用「有没有版本号」判断「正文有没有引用」，会把**所有**图都判成「仅历史版本」
   *   （本测试 12h/12i 就是这么红起来的）。
   */
  const refs = new Map();
  const addRef = (id, postId, title, status, versionNo) => {
    let perPost = refs.get(id);
    if (!perPost) {
      perPost = new Map();
      refs.set(id, perPost);
    }
    let e = perPost.get(postId);
    if (!e) {
      e = { postId, title: title || '', status: status || 'published', inBody: false, versionNos: [] };
      perPost.set(postId, e);
    }
    if (versionNo == null) e.inBody = true;
    else if (!e.versionNos.includes(versionNo)) e.versionNos.push(versionNo);
  };

  for (const p of core.all('SELECT id,title,status,content_html FROM posts')) {
    const counts = new Map();
    collectIdCounts(p.content_html, counts);
    for (const id of counts.keys()) addRef(id, p.id, p.title, p.status, null);
  }
  for (const v of core.all('SELECT post_id,version_no,snapshot FROM post_versions')) {
    let snap;
    try {
      snap = JSON.parse(v.snapshot);
    } catch (e) {
      continue; // 快照损坏：该版本本就无法恢复，不计引用
    }
    const counts = new Map();
    collectIdCounts(snap.content_html, counts);
    /* 快照里可能连标题都改了：正文在用但标题不同时，以正文（posts）的标题为准，
       这里只在「该文档尚无正文引用」时用快照标题补一个可读名字。 */
    for (const id of counts.keys()) addRef(id, v.post_id, titleOfSnapshot(v.snapshot), snap.status, v.version_no);
  }

  /* ---- 2. 过滤 + 统计（统计永远基于全库，不受筛选影响） ---- */
  const allRows = core.all('SELECT id,mime,bytes,created_at FROM images ORDER BY id DESC');
  let unused = 0;
  let unusedBytes = 0;
  let totalBytes = 0;
  for (const r of allRows) {
    totalBytes += r.bytes || 0;
    if (!refs.has(r.id)) {
      unused++;
      unusedBytes += r.bytes || 0;
    }
  }

  const kw = q.toLowerCase();
  const matched = allRows.filter(r => {
    if (opts.only === 'unused' && refs.has(r.id)) return false;
    if (!kw) return true;
    // 搜索面：编号（#12 或 12）+ 类型（png/jpg），够用且不误伤
    if (String(r.id) === kw || `#${r.id}` === kw) return true;
    return String(r.mime || '')
      .toLowerCase()
      .includes(kw);
  });

  const total = matched.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const pageRows = matched.slice((page - 1) * size, page * size);

  /* ---- 3. 给当前页的行补引用详情（只拼当前页，避免整库拼装） ---- */
  const rows = pageRows.map(r => {
    const perPost = refs.get(r.id);
    const list = perPost ? Array.from(perPost.values()) : [];
    // 正文在用 = 至少有一篇文档的**当前正文**引用了它（不是「最新快照里有」）
    const usedInBody = list.some(x => x.inBody);
    return {
      id: r.id,
      no: `IMG-${String(r.id).padStart(4, '0')}`,
      mime: r.mime,
      ext: (String(r.mime || '').split('/')[1] || 'img').replace('+xml', ''),
      bytes: r.bytes || 0,
      created_at: r.created_at,
      refCount: list.reduce((n, x) => n + Math.max(1, x.versionNos.length), 0),
      postCount: list.length,
      usedInBody,
      refs: list
        .sort((a, b) => Number(b.inBody) - Number(a.inBody) || a.postId - b.postId)
        .map(x => ({
          postId: x.postId,
          title: x.title,
          status: x.status,
          inBody: x.inBody,
          // 列出引用它的历史版本号（正文也在用时会一并给出，供判断「删掉后哪些版本会缺图」）
          versionNos: x.versionNos.slice().sort((a, b) => b - a)
        }))
        .slice(0, 20) // 单图被几十篇文档引用时截断，避免单行撑爆 IPC
    };
  });

  return {
    total,
    page,
    size,
    pages,
    rows,
    summary: {
      total: allRows.length,
      totalBytes,
      unused,
      unusedBytes
    }
  };
}

module.exports = {
  IMG_SCHEME,
  MAX_IMAGE_BYTES,
  parseDataUri,
  extractImages,
  hydrateImages,
  imageStatistics,
  purgeUnusedImages,
  buildImageInventory,
  /** 单张图片的 data URI（清单里显示缩略图/预览用；只按 id 取一张，不批量） */
  imageDataUri(id) {
    const n = parseInt(id, 10);
    if (!Number.isInteger(n) || n <= 0) return null;
    const row = core.get('SELECT mime,data FROM images WHERE id=?', [n]);
    return row ? `data:${row.mime};base64,${row.data}` : null;
  }
};
