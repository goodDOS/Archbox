'use strict';
/**
 * 文档（文章）：查询/筛选、CRUD、版本快照、合并、删除、历史版本恢复、附件
 * 依赖 core（查询助手/审计/持久化/HTML 清洗）与 taxonomy（标签解析）。
 */
const core = require('./core');
const taxonomy = require('./taxonomy');
const dbImages = require('../services/db-images');
const i18n = require('../i18n');

const { all, get, run, insert, audit, persist, nowIso, cleanHtml, htmlToText, nextPostNo } = core;
const { resolveTagIds } = taxonomy;

/* ---------------- 分页参数归一化 ---------------- */
// limit/offset 解析的唯一实现：limit 缺省 200、封顶 100000；offset 缺省 0、非负。
// 此前 listPosts / listTrash / ipc/posts.js 各写一份，现收敛为单一 helper。
function normalizePage(f = {}) {
  const limit = Math.min(parseInt(f.limit || 200, 10) || 200, 100000);
  const offset = Math.max(0, parseInt(f.offset || 0, 10) || 0);
  return { limit, offset };
}

/* ---------------- 筛选与列表 ---------------- */
function buildWhere(f) {
  const where = [];
  const params = [];
  if (f.regionId) {
    where.push('p.region_id=?');
    params.push(parseInt(f.regionId, 10));
  }
  if (f.categoryId) {
    where.push('p.category_id=?');
    params.push(parseInt(f.categoryId, 10));
  }
  if (f.tagId) {
    where.push('EXISTS(SELECT 1 FROM post_tags pt WHERE pt.post_id=p.id AND pt.tag_id=?)');
    params.push(parseInt(f.tagId, 10));
  }
  if (f.authorId) {
    where.push('p.author_id=?');
    params.push(String(f.authorId));
  }
  if (f.q) {
    const like = `%${f.q}%`;
    where.push(
      '(p.title LIKE ? OR p.content_text LIKE ? OR EXISTS(SELECT 1 FROM post_fields pf WHERE pf.post_id=p.id AND pf.value LIKE ?) OR EXISTS(SELECT 1 FROM users ua WHERE ua.id=p.author_id AND ua.name LIKE ?))'
    );
    params.push(like, like, like, like);
  }
  if (f.fieldCode && f.fieldValue) {
    where.push(
      'EXISTS(SELECT 1 FROM post_fields pf JOIN field_defs fd ON fd.id=pf.field_def_id WHERE pf.post_id=p.id AND fd.code=? AND pf.value LIKE ?)'
    );
    params.push(String(f.fieldCode), `%${f.fieldValue}%`);
  }
  if (f.dateFrom) {
    where.push('date(p.created_at)>=?');
    params.push(String(f.dateFrom));
  }
  if (f.dateTo) {
    where.push('date(p.created_at)<=?');
    params.push(String(f.dateTo));
  }
  // 来源甄别：f.origin ∈ ''(不筛) | 'import'(文档包导入) | 'copy'(局域共享拷贝) | 'local'(本机自建)
  // ★ 单一数据源：三者互斥，拷贝文档不再计入「本机自建」★
  if (f.origin === 'import') {
    where.push('p.imported_at IS NOT NULL');
  } else if (f.origin === 'copy') {
    where.push('p.copied_at IS NOT NULL');
  } else if (f.origin === 'local') {
    where.push('p.imported_at IS NULL AND p.copied_at IS NULL');
  }
  if (f.trash) {
    // 回收站：仅看已软删除的文档（deleted_at 非空），不再限制状态
    where.push('p.deleted_at IS NOT NULL');
  } else {
    // 正常视图：排除已软删除的文档；未显式指定状态时只返回已发布（草稿/模板需显式查询）
    where.push('p.deleted_at IS NULL');
    if (f.status) {
      where.push('p.status=?');
      params.push(String(f.status));
    } else {
      where.push("p.status='published'");
    }
  }
  return { sql: where.length ? ' WHERE ' + where.join(' AND ') : '', params };
}
function listPosts(f = {}) {
  const w = buildWhere(f);
  const { limit, offset } = normalizePage(f);
  // Beta.327：tnames 子查询按 TRIM(t.name)<>'' 过滤历史脏数据（空名标签）。
  // 现行写入链 resolveTagIds 拦空名，脏行只可能来自旧版本；
  // 不过滤则列表/导出会带出空段（「；；」），用户看着就是一条空标签。
  return all(
    `SELECT p.id,p.no,p.author_id,p.title,p.status,p.created_at,p.updated_at,p.content_text,
      p.imported_at, p.imported_from,
      p.copied_at, p.copied_from, p.origin_author,
      r.name rname, c.name cname, u.name author_name,
      (SELECT group_concat(t.name,'；') FROM post_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.post_id=p.id AND TRIM(t.name)<>'') tnames,
      (SELECT group_concat(pf.value,' ｜ ') FROM post_fields pf JOIN field_defs fd ON fd.id=pf.field_def_id WHERE pf.post_id=p.id AND pf.value<>'') fvalues
    FROM posts p JOIN regions r ON r.id=p.region_id LEFT JOIN categories c ON c.id=p.category_id
    LEFT JOIN users u ON u.id=p.author_id
    ${w.sql} ORDER BY p.updated_at DESC LIMIT ${limit} OFFSET ${offset}`,
    w.params
  );
}
function countPosts(f = {}) {
  const w = buildWhere(f);
  return get(`SELECT COUNT(*) n FROM posts p ${w.sql}`, w.params).n;
}
/**
 * 批量存活校验：返回「未软删除」的 id 集合。
 * 用途：托盘「最近浏览」列表落地在 userData 的 JSON 里，文档被删后历史条目
 * 就成了死链；打开托盘时用一次 IN 查询洗掉，避免用户点进去才看到「不存在」。
 * 不走 listPosts —— 那个会连带 content_text/字段值/标签拼接，为几条历史付全表代价。
 */
function aliveIds(ids) {
  const list = (Array.isArray(ids) ? ids : []).map(n => parseInt(n, 10)).filter(n => Number.isInteger(n) && n > 0);
  if (!list.length) return [];
  const ph = list.map(() => '?').join(',');
  return all(`SELECT id FROM posts WHERE id IN (${ph}) AND deleted_at IS NULL`, list).map(r => r.id);
}
/** 列表 + 每条文档的字段值映射（供文档包导出使用） */
function postsWithFields(f = {}) {
  const rows = listPosts({ ...f, limit: f.limit || 100000 });
  const map = {};
  all(
    "SELECT pf.post_id, fd.code, pf.value FROM post_fields pf JOIN field_defs fd ON fd.id=pf.field_def_id WHERE pf.value<>''"
  ).forEach(r => {
    (map[r.post_id] = map[r.post_id] || {})[r.code] = r.value;
  });
  return rows.map(r => ({ ...r, fields: map[r.id] || {} }));
}
function getPostRaw(id) {
  return get('SELECT * FROM posts WHERE id=?', [id]);
}
/**
 * 归属校验：非本人文档禁止修改。
 * 规则：author_id 为空（无主 / 历史 / 种子数据）时任何人可改；
 *       否则必须与当前登录用户一致。
 * @param {number} id  文档 id
 * @param {string} userId  当前用户 id
 * @returns {object} 文档原始行（含 author_id）
 * @throws 文档不存在 / 非本人时抛错
 */
function assertOwnership(id, userId) {
  const p = getPostRaw(id);
  if (!p) throw new Error(i18n.errKey('common.errPostMissing'));
  const owner = p.author_id ? String(p.author_id) : '';
  if (!owner) return p;
  if (String(userId || '') !== owner) throw new Error(i18n.errKey('common.errPostNotOwner'));
  return p;
}
/** 统计用户名下未删除文档数（供 UI 预览移交影响面） */
function countMyPosts(userId) {
  const u = String(userId || '');
  if (!u) return 0;
  return get('SELECT COUNT(*) n FROM posts WHERE author_id=? AND deleted_at IS NULL', [u]).n;
}
/**
 * 直接改写文档归属（仅测试/数据修复使用，不经审计与归属校验）。
 * @param {number} id
 * @param {string|null} authorId  传 null 表示置为「无主」
 */
function setPostAuthor(id, authorId) {
  run('UPDATE posts SET author_id=? WHERE id=?', [authorId == null ? null : String(authorId), id]);
}
/**
 * 取文档完整内容（含正文 HTML、字段、标签、版本列表）。
 *
 * @param {object} [opts]
 * @param {boolean} [opts.raw] true = 返回【库里的原始正文】（archbox-img:// 短链），
 *   不还原 data:。仅供库内消费（版本快照、合并拼接）——它们要写回库，
 *   必须用存储态；hydrate 后的 data: 再 extract 一遍虽幂等，却是纯浪费。
 *   默认（raw=false）走出库还原：编辑器/预览/导出拿到自包含 HTML，零改动。
 */
function getPost(id, opts = {}) {
  const p = get(
    `SELECT p.*, r.name rname, r.color rcolor, c.name cname, u.name author_name
    FROM posts p JOIN regions r ON r.id=p.region_id LEFT JOIN categories c ON c.id=p.category_id
    LEFT JOIN users u ON u.id=p.author_id WHERE p.id=? AND p.deleted_at IS NULL`,
    [id]
  );
  if (!p) return null;
  const fields = {};
  all('SELECT fd.code, pf.value FROM post_fields pf JOIN field_defs fd ON fd.id=pf.field_def_id WHERE pf.post_id=?', [
    id
  ]).forEach(r => {
    fields[r.code] = r.value;
  });
  // Beta.327：TRIM(t.name)<>'' 与 listPosts 的 tnames 同口径过滤空名脏行。
  // 【不过滤会怎样】编辑页载入 form.tags 带进 ''，界面渲染一个空 chip；
  //   用户删掉它再保存，sameSnapshot 的 normTags 把 [''] 归一成 []，
  //   判「无实质改动」直接 return —— 空关联永远删不掉（用户报的原始现场）。
  const tags = all(
    "SELECT t.name FROM post_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.post_id=? AND TRIM(t.name)<>''",
    [id]
  ).map(r => r.name);
  // ★ 复用 listVersions 而不是就地再写一条 SQL（Beta.242）。
  //
  // 【缺陷】这里原来是内联的 `SELECT v.id, v.version_no, ... FROM post_versions`，
  //   只查了 5 个字段；而 listVersions 后来多了 is_current、并 JOIN 了 users.name。
  //   于是同「一份版本列表」有了两条各自演进的查询：详情页走 getPost 拿不到 is_current，
  //   页头「历史版本（1）· 当前 v1」显示得出来（version_no 有查），
  //   面板里的「当前版本」标记却永远不亮（is_current 恒为 undefined）。
  //   —— 殊途同归：版本列表只有一个来源，就是 listVersions。
  //   顺带修掉面板作者名恒为空的老毛病（内联 SQL 没 JOIN users）。
  const versions = listVersions(id);
  // 出库还原：正文短链 → data: URI，编辑器/预览/导出拿到的仍是自包含 HTML（零改动）。
  // 存量 data: 正文不含短链，hydrate 快路径原样返回。raw 模式跳过还原（见函数注释）。
  const contentHtml = opts.raw ? p.content_html : dbImages.hydrateImages(p.content_html);
  return { ...p, content_html: contentHtml, fields, tags, versions };
}
function snapshotOf(id) {
  // ★ raw 模式：快照必须存【库里的原始形态】（短链）★
  //   若走默认 hydrate，快照 JSON 里会重新躺回 base64 巨串 ——
  //   「快照同步瘦身」的设计直接失效，且 sameSnapshot 与 projectedSnapshot
  //   （extract 后的短链形态）永远不相等，「无改动跳过」被打破。
  const p = getPost(id, { raw: true });
  if (!p) return null;
  return {
    title: p.title,
    region_id: p.region_id,
    category_id: p.category_id,
    content_html: p.content_html,
    status: p.status,
    no: p.no || '',
    fields: p.fields,
    tags: p.tags
  };
}

/**
 * 把「字段名 → 值」归一化成可直接比对的形式：丢弃空值，按键名排序。
 *
 * 必须归一化，否则「传了空字符串」会被误判成改动 ——
 * applyFieldsAndTags 对空值是**不写库**的（`if (v !== '')`），
 * 而前端 buildDraft 会把所有勾选字段都带上（含空串）。
 * 不比归一化后的形态，「打开编辑→直接保存」就会被判成有改动，白留一个版本。
 */
function normFields(m) {
  const out = {};
  for (const k of Object.keys(m || {}).sort()) {
    const v = String((m || {})[k] == null ? '' : (m || {})[k]).trim();
    if (v !== '') out[k] = v;
  }
  return out;
}
/** 标签归一化：去空、去重、排序（库里是集合语义，顺序无意义） */
function normTags(a) {
  return [...new Set((Array.isArray(a) ? a : []).map(t => String(t || '').trim()).filter(Boolean))].sort();
}
/** 两份快照是否**内容等价**（与顺序/空白无关） */
function sameSnapshot(a, b) {
  if (!a || !b) return false;
  return (
    a.title === b.title &&
    a.region_id === b.region_id &&
    a.category_id === b.category_id &&
    a.status === b.status &&
    (a.no || '') === (b.no || '') &&
    a.content_html === b.content_html &&
    JSON.stringify(normFields(a.fields)) === JSON.stringify(normFields(b.fields)) &&
    JSON.stringify(normTags(a.tags)) === JSON.stringify(normTags(b.tags))
  );
}
/**
 * 算出「本次保存落库之后」该文档的快照 —— 不真的写库，只按 savePost 的规则推演。
 * 口径必须与 snapshotOf 完全一致（同一个 { title, region_id, category_id, content_html, status, no, fields, tags }），
 * 否则比对会永远不相等，「无改动跳过」就失效了。
 */
function projectedSnapshot(id, v, html, no, payload) {
  const cur = snapshotOf(id);
  if (!cur) return null;
  return {
    title: v.title,
    region_id: v.regionId,
    category_id: v.categoryId,
    content_html: html,
    status: v.status,
    no: no || '',
    fields: normFields(payload.fields),
    tags: normTags(payload.tags)
  };
}
/**
 * 把文档【当前】库内容存为一个版本快照。
 *
 * ★ 语义（Beta.241 重构）：每条版本 = 一个【真实落库过】的文档状态，
 *   因此最新版本的内容恒等于当前内容 ⇒ 「当前版本」就是 MAX(version_no)。
 *
 *   【为什么必须由调用方在 UPDATE 之后调用】
 *   本函数读的是 snapshotOf(id)，即【当下库里的内容】。若在 UPDATE 之前调用，
 *   存下的就是「这次改动之前」的内容，于是：
 *     - 最新版本永远滞后于当前内容，界面上找不到「我现在的版本是哪个」；
 *     - 新建文档时 INSERT 后调用存的是新建内容，但首次修改若在 UPDATE 前调用，
 *       又会把「新建内容」再存一遍 ⇒ v1 与 v2 完全相同（重复版本）。
 *   实机实测过的错序结果：v1=C0, v2=C0, v3=C1, 当前=C2 —— 两个症结同时现形。
 *   故凡调用本函数者，务必【先落库（含 applyFieldsAndTags）再存快照】。
 *
 * 【内置去重】与最新一条快照等价时直接跳过，不写新版本。
 *   这是 restoreVersion 追加版本的安全阀，也让「版本号序列干净地反映内容变过几次」
 *   对任意调用路径都成立，而不只是在 savePost 那一条路径上成立。
 */
function saveVersion(id, userId) {
  const snap = snapshotOf(id);
  if (!snap) return;
  const last = get('SELECT snapshot FROM post_versions WHERE post_id=? ORDER BY version_no DESC LIMIT 1', [id]);
  if (last) {
    // 快照是明文 JSON；解析失败（理论上不该发生）时按「无法比对」处理，宁可多存一条也不误删历史
    try {
      if (sameSnapshot(JSON.parse(last.snapshot), snap)) return;
    } catch (e) {}
  }
  const no = (get('SELECT MAX(version_no) m FROM post_versions WHERE post_id=?', [id]).m || 0) + 1;
  insert('INSERT INTO post_versions(post_id,version_no,snapshot,user_id,created_at) VALUES(?,?,?,?,?)', [
    id,
    no,
    JSON.stringify(snap),
    userId,
    nowIso()
  ]);
  return no;
}
function applyFieldsAndTags(postId, fieldsMap, tagNames, userId) {
  run('DELETE FROM post_fields WHERE post_id=?', [postId]);
  const defs = all('SELECT * FROM field_defs');
  for (const d of defs) {
    const v = String((fieldsMap && fieldsMap[d.code]) || '')
      .trim()
      .slice(0, 5000);
    if (v !== '') run('INSERT INTO post_fields(post_id,field_def_id,value) VALUES(?,?,?)', [postId, d.id, v]);
  }
  run('DELETE FROM post_tags WHERE post_id=?', [postId]);
  for (const tid of resolveTagIds(tagNames, userId))
    run('INSERT INTO post_tags(post_id,tag_id) VALUES(?,?)', [postId, tid]);
}
function validateDraft(payload) {
  const title = String(payload.title || '').trim();
  if (!title || title.length > 200) throw new Error(i18n.errKey('common.errPostTitleRule'));
  const regionId = parseInt(payload.regionId, 10);
  if (!regionId || !get('SELECT id FROM regions WHERE id=?', [regionId]))
    throw new Error(i18n.errKey('common.errCatRegionInvalid'));
  let categoryId = payload.categoryId ? parseInt(payload.categoryId, 10) : null;
  if (categoryId) {
    const c = get('SELECT id FROM categories WHERE id=? AND region_id=?', [categoryId, regionId]);
    if (!c) categoryId = null;
  }
  const status = ['draft', 'published', 'template'].includes(payload.status) ? payload.status : 'published';
  return { title, regionId, categoryId, status };
}
function savePost(payload, userId, opts = {}) {
  opts = opts || {};
  const id = payload.id ? parseInt(payload.id, 10) : null;
  // 归属校验前置：编辑他人文档立即拒绝，避免先走一遍校验/编号逻辑
  if (id && !opts.skipOwnerCheck) assertOwnership(id, userId);
  const v = validateDraft(payload);
  // 清洗后提取内联图片：data: 搬进 images 表，正文只留 archbox-img://{id} 短链。
  // extract 幂等：已是短链的正文原样返回；存量 data: 下次保存自动瘦身。
  const html = dbImages.extractImages(cleanHtml(payload.contentHtml));
  const text = htmlToText(html).slice(0, 20000);
  // 文档编号：新建且未填则按 大区/分类代码+年份 自动生成；编辑且未填则保留原编号
  // 模板不占用/生成文档编号（储存除编号外全部内容）；真实文档按 id 保留原编号，或新建态自动生成
  let no = String(payload.no || '').trim();
  if (v.status === 'template') {
    no = '';
  } else if (id) {
    if (!no) {
      const cur = get('SELECT no FROM posts WHERE id=?', [id]);
      no = cur ? cur.no || '' : '';
    }
  } else if (!no) {
    no = nextPostNo(v.regionId, v.categoryId, new Date().getFullYear());
  }
  // 编号查重（可编辑、查重）：与另一条（非自身）重复则阻断保存
  if (no) {
    const hit = get('SELECT id,title FROM posts WHERE no=? AND id<>?', [no, id || 0]);
    if (hit) throw new Error(i18n.errKey('common.errPostNoTaken', { no, title: hit.title }));
  }
  if (id) {
    // 归属已在函数入口校验（opts.skipOwnerCheck 仅供文档包导入内部链路使用）
    if (opts.skipOwnerCheck && !getPostRaw(id)) throw new Error(i18n.errKey('common.errPostMissing'));
    // ★ 内容没变就不写版本、也不动 updated_at（Beta.240）。
    //
    // 【缺陷现象（用户反馈）】「文档没改动就不能存为新版本」——
    //   打开编辑态、一个字符都不改、直接点保存，历史版本里就多出一条
    //   内容与上一条完全相同的记录。反复点几次能堆出一串一模一样的版本，
    //   真正的修改历史被淹没（这正是「版本号序列要干净反映内容变过几次」的反面）。
    //
    // 【根因】原实现在 id 分支里【无条件】saveVersion + UPDATE，
    //   从不判断这次提交的内容与库里已有的是否等价。
    //
    // 【为什么比对放后端】
    //   「是否等值」的判定必须与「什么算一次落库」用同一套口径（cleanHtml、
    //   字段空值不写库、标签去重…），这些规则全在后端。放前端比会出现
    //   「前端说没变、后端实际变了」或反之 —— 单一数据源。
    //
    // 【比对口径】拿【推演出的落库后快照】与【库里当前快照】比。
    //   注意不能拿 payload 直接跟库比：payload 里带的是原始输入，
    //   经过 cleanHtml / 空值过滤后才等价于落库结果。
    const projected = projectedSnapshot(id, v, html, no, payload);
    const current = snapshotOf(id);
    if (sameSnapshot(projected, current)) {
      // 无实质改动：不写版本、不更新 updated_at、不记审计 —— 这次保存是空操作。
      // 返回 { id, unchanged: true } 让前端能区分「已保存」与「没有改动」，
      // 而不是给一个「已保存」的假反馈（用户会以为改动生效了）。
      return { id, unchanged: true };
    }
    run(
      'UPDATE posts SET region_id=?,category_id=?,title=?,content_html=?,content_text=?,status=?,updated_at=?,no=? WHERE id=?',
      [v.regionId, v.categoryId, v.title, html, text, v.status, nowIso(), no, id]
    );
    // 顺序不可换：applyFieldsAndTags 必须在 saveVersion 之前 ——
    // snapshotOf 走 getPost()，快照里的 fields/tags 读的就是这两张表，
    // 先存快照会把改动前的字段/标签写进版本里。
    applyFieldsAndTags(id, payload.fields, payload.tags, userId);
    saveVersion(id, userId);
    audit(userId, '修改文档', 'post', id, { title: v.title });
  } else {
    // opts.imported = { at, from }：来源标记（由文档包导入时写入，供甄别/溯源）
    const imp = opts.imported || null;
    const impAt = imp ? imp.at || nowIso() : null;
    const impFrom = imp ? String(imp.from || '').slice(0, 300) : null;
    // opts.copied = { at, from, originAuthor }：拷贝来源标记（由局域共享拷贝写入）
    //   与 imported 语义不同，可同时存在（先拷贝再导出再导入），互不覆盖
    const cp = opts.copied || null;
    const cpAt = cp ? cp.at || nowIso() : null;
    const cpFrom = cp ? String(cp.from || '').slice(0, 300) : null;
    const cpAuthor = cp ? String(cp.originAuthor || '').slice(0, 100) : null;
    const nid = insert(
      'INSERT INTO posts(region_id,category_id,title,content_html,content_text,status,author_id,created_at,updated_at,no,imported_at,imported_from,copied_at,copied_from,origin_author) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        v.regionId,
        v.categoryId,
        v.title,
        html,
        text,
        v.status,
        userId,
        nowIso(),
        nowIso(),
        no,
        impAt,
        impFrom,
        cpAt,
        cpFrom,
        cpAuthor || (imp ? imp.originAuthor || null : null)
      ]
    );
    applyFieldsAndTags(nid, payload.fields, payload.tags, userId);
    saveVersion(nid, userId);
    audit(userId, '新建文档', 'post', nid, { title: v.title });
    persist();
    return { id: nid };
  }
  persist();
  return { id };
}
/**
 * 查重。
 *
 * 【编辑态必须拿原值比对，否则历史脏数据会把用户永久锁死】
 *   曾经的致命缺陷：编辑一篇已有文档时，只要它的唯一字段值与库里另一篇重复，
 *   无论用户改什么都会被弹窗拦住 —— 因为那个字段值本次根本没动，
 *   把它连同改动一起提交，重跑查重必然又命中同一条冲突。
 *   用户看到的就是「这篇文档永远保存不了」，而冲突又与本次修改毫无关系。
 *   实测复现：文档编号已被另一篇占用，用户只想改个标题，点保存 → 弹窗
 *   「发现字段重复」→ 三个按钮没有一个能达成"保存我的修改"。
 *
 *   修法：payload.originalFields 传入该文档**当前落库的字段值**。
 *   某字段若"提交值 === 原值"，说明本次没碰它，跳过查重
 *   （它若真与别人冲突，那是历史遗留问题，不该拦这次无关的编辑）。
 *   只有"值确实变了"才查重 —— 这才是查重该守的边界。
 *
 *   新建态不传 originalFields，行为与原来完全一致（所有非空值都查）。
 */
function checkDuplicates(payload) {
  const id = payload.id ? parseInt(payload.id, 10) : 0;
  const conflicts = [];
  // 原值只在该文档确实存在时才作为比对基准；id 为 0（新建）时是空对象，等于不启用豁免
  const orig = payload.originalFields && typeof payload.originalFields === 'object' ? payload.originalFields : null;
  // 1) 唯一字段查重（原逻辑：仅对有 unique_field=1 的字段生效）
  const defs = all('SELECT * FROM field_defs WHERE unique_field=1');
  for (const d of defs) {
    const val = String((payload.fields || {})[d.code] || '').trim();
    if (!val) continue;
    // ★ 本次未改动该字段 → 跳过。原值缺失（字段原先为空/不存在）时不豁免：
    //   那属于"这次才填进去的值"，理应受查重约束。
    if (orig && Object.prototype.hasOwnProperty.call(orig, d.code)) {
      const before = String(orig[d.code] == null ? '' : orig[d.code]).trim();
      if (before === val) continue;
    }
    const hit = all(
      'SELECT p.id,p.title FROM post_fields pf JOIN posts p ON p.id=pf.post_id WHERE pf.field_def_id=? AND pf.value=? AND p.id<>?',
      [d.id, val, id]
    );
    for (const h of hit) conflicts.push({ field: d.name, code: d.code, value: val, postId: h.id, postTitle: h.title });
  }
  // 2) 标题撞名：★ Beta.258 由「标题+大区+分类」组合口径改为【全局同名即报】。
  //
  //    【原缺陷】旧实现按 `title=? AND region_id=? AND category_id=?` 查，
  //      只有三者全同才算冲突。实测（_probe258）三种情况全部漏报：
  //        · 跨大区同名（华东 vs 华南）→ conflicts = []
  //        · 同大区不同分类同名（保密 vs 公开）→ conflicts = []
  //      用户诉求是「新建文档全局撞名没查重」—— 同名文档即使归在不同大区，
  //      对使用者而言也是「找起来会撞车」，必须在新建时就提示，而不是事后靠翻列表发现。
  //
  //    【为什么不能只放宽到「同大区」】
  //      组合口径的初衷是防「重复导入同一文档包」，但它把「同名」这件事
  //      降级成了「仅同大区同分类才算」—— 而查重的产品语义本就该是全局唯一性。
  //
  //    【冲突分级】同名但不在同一大区/分类的，语义上弱于「同大区同分类」，
  //      所以用不同的 code（title / title_region_cat）区分，
  //      前端 MergeDialog 据此显示「同名（不同大区）」这类更准确的说明，
  //      用户仍可选择「仍保存为新文档」—— 提示不等于禁止。
  //
  //    【豁免口径不变】标题本次没被改过（originalTitle === title）就整段跳过：
  //      否则编辑一篇历史遗留的同名文档时，无论改什么都会被拦下。
  //      这条与「编辑态原值豁免」同源，是防「文档永远保存不了」的关键，勿动。
  const title = String(payload.title || '').trim();
  const regionId = payload.regionId ? parseInt(payload.regionId, 10) : 0;
  const categoryId = payload.categoryId ? parseInt(payload.categoryId, 10) : 0;
  const titleUnchanged = !!(orig && payload.originalTitle != null && String(payload.originalTitle).trim() === title);
  if (title && !titleUnchanged) {
    // 全局同名：一次查出全部同标题文档，再按「是否同大区同分类」分级。
    // 带上 rname/cname 是为了让弹窗能说清「和谁撞了、在哪撞的」，
    // 只有一个孤零零的标题无法判断该不该合并。
    const hits = all(
      `SELECT p.id, p.title, p.region_id, p.category_id, r.name rname, c.name cname
      FROM posts p LEFT JOIN regions r ON r.id=p.region_id LEFT JOIN categories c ON c.id=p.category_id
      WHERE p.title=? AND p.id<>? AND p.deleted_at IS NULL`,
      [title, id]
    );
    for (const h of hits) {
      const sameScope = regionId > 0 && h.region_id === regionId && (h.category_id || 0) === categoryId;
      conflicts.push({
        // 同大区同分类 = 几乎确定是同一份文档的重复导入，措辞要重；
        // 跨大区/跨分类 = 同名但归属不同，措辞要轻，别让用户误以为系统要强制合并。
        // 只给展示码，文字由 MergeDialog 的 fieldText() 按当前语言翻 ——
        // 冲突描述要在弹窗里给用户看，不能让主进程替渲染层定语言
        field: sameScope ? 'scope' : 'title',
        code: sameScope ? 'title_region_cat' : 'title',
        value: title,
        postId: h.id,
        postTitle: h.title,
        rname: h.rname || '',
        cname: h.cname || ''
      });
    }
  }
  return conflicts;
}
function mergePost({ targetId, draft }, userId, opts = {}) {
  opts = opts || {};
  const target = parseInt(targetId, 10);
  // 归属校验：合并会改写目标文档正文，故需与编辑同等权限
  if (opts.skipOwnerCheck) {
    if (!getPostRaw(target)) throw new Error(i18n.errKey('common.errMergeTargetMissing'));
  } else assertOwnership(target, userId);
  const v = validateDraft(draft);
  const incomingHtml = cleanHtml(draft.contentHtml);
  // raw：合并是把「库里的旧正文」与「新正文」拼起来再整体 extract，
  // 旧正文先 hydrate 成 data: 再 extract 回去是纯浪费（还可能白拼一大串巨串）。
  const old = getPost(target, { raw: true });
  // 合并规则：字段取新值（非空）否则保留旧值；标签取并集；正文追加到原正文之后
  const mergedFields = { ...old.fields };
  for (const [k, val] of Object.entries(draft.fields || {})) {
    if (String(val || '').trim() !== '') mergedFields[k] = String(val).trim().slice(0, 5000);
  }
  // 合并的标签并集也走 normTags：入参 draft.tags 可能来自旧包/外部链路，
  // 与 getPost 读侧过滤（Beta.327）共同保证空名进不了 applyFieldsAndTags。
  const mergedTags = normTags([...(old.tags || []), ...(draft.tags || [])]);
  // 整体过一次 extract：old.content_html 是库里的短链（原样跳过），
  // incomingHtml 里可能带 data: 内联图（搬库）。一次替换覆盖两侧，无需分别处理。
  const mergedHtml = dbImages.extractImages(
    `${old.content_html}<hr><p><strong>${i18n.t('sys.mergeAppendMark', { time: nowIso() })}</strong></p>${incomingHtml}`
  );
  run('UPDATE posts SET title=?,content_html=?,content_text=?,status=?,updated_at=? WHERE id=?', [
    old.title,
    mergedHtml,
    htmlToText(mergedHtml).slice(0, 20000),
    v.status,
    nowIso(),
    target
  ]);
  // 与 savePost 同一顺序口径：先落库（含字段/标签）再存快照，快照才等于合并后的真实状态
  applyFieldsAndTags(target, mergedFields, mergedTags, userId);
  saveVersion(target, userId);
  // 来源标记：合并来自文档包的内容时，为目标文档补打标记（供甄别/溯源）
  if (opts.imported) {
    run('UPDATE posts SET imported_at=?, imported_from=? WHERE id=?', [
      opts.imported.at || nowIso(),
      String(opts.imported.from || '').slice(0, 300),
      target
    ]);
    if (opts.imported.originAuthor) {
      run('UPDATE posts SET origin_author=? WHERE id=?', [String(opts.imported.originAuthor).slice(0, 100), target]);
    }
  }
  // 来源标记：合并来自局域共享拷贝的内容时，为目标文档补打拷贝标记
  if (opts.copied) {
    run('UPDATE posts SET copied_at=?, copied_from=?, origin_author=? WHERE id=?', [
      opts.copied.at || nowIso(),
      String(opts.copied.from || '').slice(0, 300),
      String(opts.copied.originAuthor || '').slice(0, 100) || null,
      target
    ]);
  }
  // 若草稿本身是已存在文档，则删除被合并文档
  if (draft.id && parseInt(draft.id, 10) !== target) deletePost(parseInt(draft.id, 10), userId, true, opts);
  audit(userId, '合并文档', 'post', target, { from: v.title });
  persist();
  return { id: target };
}
function deletePost(id, userId, silent, opts = {}) {
  opts = opts || {};
  const p = (opts.skipOwnerCheck && getPostRaw(id)) || assertOwnership(id, userId);
  // 软删除：仅标记 deleted_at，保留标签/字段/版本，便于回收站恢复
  run('UPDATE posts SET deleted_at=? WHERE id=?', [nowIso(), id]);
  if (!silent) audit(userId, '删除文档（移入回收站）', 'post', id, { title: p.title });
  persist();
}
/** 从回收站恢复：清除 deleted_at，回到正常列表 */
function restoreFromTrash(id, userId) {
  const p = assertOwnership(id, userId);
  if (!p.deleted_at) throw new Error(i18n.errKey('common.errPostNotInTrash'));
  run('UPDATE posts SET deleted_at=NULL WHERE id=?', [id]);
  audit(userId, '恢复文档', 'post', id, { title: p.title });
  persist();
  return { id };
}
/** 彻底删除：物理清除文档及其标签/字段/版本（不可恢复） */
function purgePost(id, userId) {
  const p = assertOwnership(id, userId);
  run('DELETE FROM post_tags WHERE post_id=?', [id]);
  run('DELETE FROM post_fields WHERE post_id=?', [id]);
  run('DELETE FROM post_versions WHERE post_id=?', [id]);
  run('DELETE FROM posts WHERE id=?', [id]);
  // 回收本文档独占的图片：purgeUnusedImages 会重扫 posts + post_versions 的全部引用，
  // 只删真正无引用的行（别的文档/历史版本仍在用的图不受影响）。
  // 清理失败不阻断删除本身（图片行最多是延迟回收，不会误删在用的图）。
  try {
    dbImages.purgeUnusedImages();
  } catch (e) {
    /* 回收失败仅留痕，删除已完成 */
  }
  audit(userId, '彻底删除文档', 'post', id, { title: p.title });
  persist();
}
/** 回收站列表：已软删除文档（按删除时间倒序） */
function listTrash(f = {}) {
  const { limit, offset } = normalizePage(f);
  const rows = all(`SELECT p.id,p.no,p.title,p.status,p.created_at,p.updated_at,p.deleted_at,
      r.name rname, c.name cname, u.name author_name
    FROM posts p JOIN regions r ON r.id=p.region_id LEFT JOIN categories c ON c.id=p.category_id
    LEFT JOIN users u ON u.id=p.author_id
    WHERE p.deleted_at IS NOT NULL
    ORDER BY p.deleted_at DESC LIMIT ${limit} OFFSET ${offset}`);
  const total = get('SELECT COUNT(*) n FROM posts WHERE deleted_at IS NOT NULL').n;
  return { total, rows };
}
/**
 * 版本列表（新→旧），并标出哪一条是「当前版本」。
 *
 * is_current 由 MAX(version_no) 推出，而不是额外存一列状态 ——
 * 因为 saveVersion 保证「最新版本 = 当前落库内容」，MAX 就是当前内容的版本号，
 * 存冗余状态列反而会多一个可能与内容不一致的真相来源（单一数据源）。
 */
function listVersions(postId) {
  const rows = all(
    `SELECT v.id,v.version_no,v.created_at,v.user_id,u.name user_name,length(v.snapshot) size
    FROM post_versions v LEFT JOIN users u ON u.id=v.user_id WHERE v.post_id=? ORDER BY v.version_no DESC`,
    [postId]
  );
  const maxNo = rows.length ? rows[0].version_no : 0;
  return rows.map(r => ({ ...r, is_current: r.version_no === maxNo }));
}

/**
 * 取某个历史版本的完整快照内容（供「预览历史版本」用）。
 *
 * 安全要点：必须同时按 post_id 与 version_id 查，二者是【联合归属】关系。
 * 只按 version_id 查会让 A 文档的版本被挂到 B 文档下预览 ——
 * 攻击面虽小（同库内数据），但会让「这个版本属于哪条文档」的语义失效，
 * 与 restoreVersion 的 `WHERE id=? AND post_id=?` 保持一致。
 *
 * 归属校验：与 restoreVersion 一样先 assertOwnership ——
 * 预览是「读」操作，但历史快照可能含草稿/机密修订内容，
 * 而 listVersions 只给元数据（版本号/时间/大小），二者粒度不同，
 * 因此预览同样限定「文档可改者（作者本人或无主文档）」。
 *
 * 快照在库里是【明文 JSON】（见 saveVersion 的 JSON.stringify(snap)），
 * 故这里无需解密，直接 parse 返回。
 *
 * @returns {{ id, version_no, created_at, user_name, title, region_id, rname, category_id, cname, content_html, status, no, fields, tags }}
 */
function getVersionSnapshot(postId, versionId) {
  // ★ 与 listVersions 保持同一套作者名取法（Beta.230）。
  //   原来这里用 SELECT * 只取 post_versions 自身字段、不 JOIN users，
  //   而 @returns 里却声明了 user_name —— 于是预览弹层的作者恒为「系统」。
  const v = get(
    `SELECT v.*,u.name user_name
    FROM post_versions v LEFT JOIN users u ON u.id=v.user_id
    WHERE v.id=? AND v.post_id=?`,
    [versionId, postId]
  );
  if (!v) throw new Error(i18n.errKey('common.errVersionMissing'));
  const snap = JSON.parse(v.snapshot);
  // ★ Beta.258：把快照里的 region_id / category_id 翻译成名称。
  //   快照只存 id（存名称会导致「大区/分类改名」后历史版本显示新名，与当时的真实状态不符），
  //   但前端要显示「大区：华东 → 华南」这样的差异，只有 id 渲染不出来。
  //   这里按【当前】分类表翻译，并明确注释这是「以今天的名称显示当时的归属」——
  //   若分类已被删除，LEFT JOIN 拿不到名，回落到 `分类 #id`，不静默显示为空。
  const r = get('SELECT name FROM regions WHERE id=?', [snap.region_id || 0]);
  const c = snap.category_id ? get('SELECT name FROM categories WHERE id=?', [snap.category_id]) : null;
  return {
    id: v.id,
    version_no: v.version_no,
    created_at: v.created_at,
    user_id: v.user_id,
    user_name: v.user_name || '',
    title: snap.title,
    region_id: snap.region_id,
    rname: r ? r.name : snap.region_id ? i18n.t('sys.regionFallback', { id: snap.region_id }) : '',
    category_id: snap.category_id,
    cname: c ? c.name : snap.category_id ? i18n.t('sys.categoryFallback', { id: snap.category_id }) : '',
    // 历史快照里存的也是短链（saveVersion 读库即短链），预览/对比前还原成 data:
    content_html: dbImages.hydrateImages(snap.content_html),
    status: snap.status || 'published',
    // no 是 Beta.240 才进快照的；更早的版本 JSON 里没有这个键，取空串兜底
    no: snap.no || '',
    fields: snap.fields || {},
    tags: snap.tags || []
  };
}

function restoreVersion(postId, versionId, userId) {
  assertOwnership(postId, userId);
  const v = get('SELECT * FROM post_versions WHERE id=? AND post_id=?', [versionId, postId]);
  if (!v) throw new Error(i18n.errKey('common.errVersionMissing'));
  const snap = JSON.parse(v.snapshot);
  // ★ 恢复【要】写新版本（Beta.241 重构，修正 Beta.169 的旧口径）。
  //
  //   Beta.169 当时的语义是「恢复是位移不是新增」：不写版本，版本号序列只反映
  //   内容变过几次。代价是恢复到哪一版之后，被覆盖掉的那版内容就永久消失了，
  //   且界面上「当前内容」与任何版本号都对不上。
  //
  //   新语义（配合「标明当前文档是哪个版本」的需求）：
  //   每条版本 = 一个真实落库过的状态，恢复 = 把某个历史状态【重新落库】，
  //   于是它理应获得自己的版本号 —— 最新版本恒等于当前内容，
  //   「当前版本」＝ MAX(version_no)，恢复后该标记前移到新版本。
  //   好处：恢复不再是破坏性的（回退前的内容仍留在历史里，可再恢复回来）。
  //   与 Beta.169 旧需求的差异：「反复恢复同一版本不再累计版本号」已由
  //   saveVersion 的内置去重保证 —— 恢复到已经是当前内容的那一版不会新增版本。
  // 快照里存的是短链（Beta.315 前的存量旧快照可能是 data: 内联）：过一次 extract
  // 幂等归一，顺带把存量内联图搬进 images 表瘦身。
  const restoredHtml = dbImages.extractImages(snap.content_html);
  const text = htmlToText(restoredHtml).slice(0, 20000);
  run(
    'UPDATE posts SET region_id=?,category_id=?,title=?,content_html=?,content_text=?,status=?,updated_at=? WHERE id=?',
    [snap.region_id, snap.category_id, snap.title, restoredHtml, text, snap.status || 'published', nowIso(), postId]
  );
  applyFieldsAndTags(postId, snap.fields, snap.tags, userId);
  saveVersion(postId, userId);
  audit(userId, '恢复历史版本', 'post', postId, { version_no: v.version_no });
  persist();
}

// 草稿列表：在给定筛选下取全部草稿（限定上限，避免一次性拉取过多）
function listDrafts(f = {}) {
  return listPosts({ ...f, status: 'draft', limit: f.limit || 500, offset: 0 });
}

/**
 * 全局文档移交：把当前用户名下全部（未删除）文档转给指定用户。
 * 回收站文档不参与移交（避免把已删除内容一并带过去）。
 * @returns {{ moved:number, to:string }} 移交条数与目标用户名
 */
function transferMyPosts(fromUserId, toUserId) {
  const from = String(fromUserId || '');
  const to = String(toUserId || '');
  if (!from) throw new Error(i18n.errKey('settings.errNotLoggedInTransfer'));
  if (from === to) throw new Error(i18n.errKey('common.errTransferSelf'));
  const target = get('SELECT id,name FROM users WHERE id=?', [to]);
  if (!target) throw new Error(i18n.errKey('common.errTargetUserMissing'));
  const n = countMyPosts(from);
  if (!n) throw new Error(i18n.errKey('common.errNoPostsToTransfer'));
  run('UPDATE posts SET author_id=?, updated_at=? WHERE author_id=? AND deleted_at IS NULL', [to, nowIso(), from]);
  audit(fromUserId, '移交全部文档', 'user', from, { to: target.name, toId: to, count: n });
  persist();
  return { moved: n, to: target.name };
}

module.exports = {
  listPosts,
  postsWithFields,
  countPosts,
  aliveIds,
  listDrafts,
  getPost,
  getPostRaw,
  savePost,
  checkDuplicates,
  mergePost,
  deletePost,
  restoreFromTrash,
  purgePost,
  listTrash,
  listVersions,
  getVersionSnapshot,
  restoreVersion,
  assertOwnership,
  countMyPosts,
  transferMyPosts,
  setPostAuthor,
  normalizePage
};
