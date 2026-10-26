'use strict';
/**
 * 大区 / 分类 / 标签 / 自定义字段：CRUD 与约束
 * 依赖 core 的查询助手与审计。
 */
const core = require('./core');
const i18n = require('../i18n');

const { all, get, run, insert, audit, persist, nowIso } = core;

/* ---------------- 大区 / 分类 / 标签 ---------------- */
function listRegions() {
  return all(`SELECT r.*,
    (SELECT COUNT(*) FROM categories c WHERE c.region_id=r.id) cat_count,
    (SELECT COUNT(*) FROM posts p WHERE p.region_id=r.id AND p.deleted_at IS NULL) post_count
    FROM regions r ORDER BY r.sort, r.id`);
}
function saveRegion(p, userId) {
  const name = String(p.name || '').trim();
  if (!name || name.length > 40) throw new Error(i18n.errKey('common.errRegionNameRule'));
  const code = String(p.code || '')
    .trim()
    .slice(0, 20);
  if (!code) throw new Error(i18n.errKey('common.errRegionCodeRequired'));
  // ★ 代码查重（Beta.215）★
  //   大区/分类/自定义字段三类「代码」都用作展示与导出标识，重码后无法互相区分，
  //   用户要求三类一律查重。id<>? 让「编辑自己」不算冲突（否则一保存就自撞）。
  //   注意：查重必须在 INSERT/UPDATE 之前，且走的是与字段定义同一个模式，
  //   不依赖数据库层的 UNIQUE 约束（老库可能已有重码，加约束会直接起不来）。
  if (get('SELECT id FROM regions WHERE code=? AND id<>?', [code, p.id || 0]))
    throw new Error(i18n.errKey('common.errRegionCodeTaken', { code }));
  const color = /^#[0-9a-fA-F]{6}$/.test(p.color || '') ? p.color : '#3b6df0';
  const sort = Math.max(0, Math.min(9999, parseInt(p.sort || 0, 10) || 0));
  if (p.id) {
    run('UPDATE regions SET name=?,code=?,color=?,sort=?,updated_at=? WHERE id=?', [
      name,
      code,
      color,
      sort,
      nowIso(),
      p.id
    ]);
    audit(userId, '修改大区', 'region', p.id, { name });
  } else {
    const id = insert('INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
      name,
      code,
      color,
      sort,
      nowIso(),
      nowIso()
    ]);
    audit(userId, '新建大区', 'region', id, { name });
  }
  persist();
}
function deleteRegion(id, userId) {
  const c = get(
    'SELECT (SELECT COUNT(*) FROM categories WHERE region_id=?) cats,(SELECT COUNT(*) FROM posts WHERE region_id=?) posts',
    [id, id]
  );
  if (c.cats > 0 || c.posts > 0) throw new Error(i18n.errKey('common.errRegionNotEmpty'));
  run('DELETE FROM regions WHERE id=?', [id]);
  audit(userId, '删除大区', 'region', id, {});
  persist();
}
function listCategories(regionId) {
  const sql = `SELECT c.*, r.name region_name,
    (SELECT COUNT(*) FROM posts p WHERE p.category_id=c.id AND p.deleted_at IS NULL) post_count
    FROM categories c JOIN regions r ON r.id=c.region_id`;
  return regionId
    ? all(sql + ' WHERE c.region_id=? ORDER BY c.sort,c.id', [regionId])
    : all(sql + ' ORDER BY c.region_id,c.sort,c.id');
}
function saveCategory(p, userId) {
  const name = String(p.name || '').trim();
  if (!name || name.length > 40) throw new Error(i18n.errKey('common.errCatNameRule'));
  const regionId = parseInt(p.region_id, 10);
  if (!regionId || !get('SELECT id FROM regions WHERE id=?', [regionId]))
    throw new Error(i18n.errKey('common.errCatRegionInvalid'));
  const code = String(p.code || '')
    .trim()
    .slice(0, 20);
  if (!code) throw new Error(i18n.errKey('common.errCatCodeRequired'));
  // ★ 分类代码查重（Beta.215）：与 saveRegion / saveFieldDef 同一套语义
  if (get('SELECT id FROM categories WHERE code=? AND id<>?', [code, p.id || 0]))
    throw new Error(i18n.errKey('common.errCatCodeTaken', { code }));
  const sort = parseInt(p.sort || 0, 10) || 0;
  if (p.id) {
    run('UPDATE categories SET region_id=?,name=?,code=?,sort=?,updated_at=? WHERE id=?', [
      regionId,
      name,
      code,
      sort,
      nowIso(),
      p.id
    ]);
    audit(userId, '修改分类', 'category', p.id, { name });
  } else {
    const id = insert('INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
      regionId,
      name,
      code,
      sort,
      nowIso(),
      nowIso()
    ]);
    audit(userId, '新建分类', 'category', id, { name });
  }
  persist();
}
function deleteCategory(id, userId) {
  const c = get('SELECT COUNT(*) n FROM posts WHERE category_id=?', [id]);
  if (c.n > 0) throw new Error(i18n.errKey('common.errCatNotEmpty'));
  run('DELETE FROM categories WHERE id=?', [id]);
  audit(userId, '删除分类', 'category', id, {});
  persist();
}
/* 空名（含纯空白）标签的判据：tags.name 是 NOT NULL UNIQUE，TRIM 后为空即历史脏数据。
 * 现行写入链（resolveTagIds / saveTag）都拦空名，脏行只可能来自旧版本，故只需清洗无需迁移。
 * 两条判据只差表别名——join 查询里必须限定 t.name，单表查询用裸 name，不玩字符串替换。 */
const EMPTY_TAG_BARE = "TRIM(name)=''";
const EMPTY_TAG_ALIASED = "TRIM(t.name)=''";
function listTags() {
  // 读侧过滤空名：存量脏行不再冒到标签管理页 / 标签云弹窗（Beta.327）。
  // 删不掉又看得见的空行正是用户报「空标签」的现场，彻底清净靠「数据清洗 · 空标签」。
  return all(
    `SELECT t.*, (SELECT COUNT(*) FROM post_tags pt WHERE pt.tag_id=t.id) post_count FROM tags t WHERE NOT ${EMPTY_TAG_BARE} ORDER BY post_count DESC, t.id`
  );
}
/** 空标签预检：有多少空名标签行、牵连多少条文档关联（供清洗界面如实展示） */
function emptyTagStats() {
  const empty = get(`SELECT COUNT(*) n FROM tags WHERE ${EMPTY_TAG_BARE}`).n;
  const linked = get(`SELECT COUNT(*) n FROM post_tags pt JOIN tags t ON t.id=pt.tag_id WHERE ${EMPTY_TAG_ALIASED}`).n;
  return { empty, linked };
}
/** 空标签清洗：先断文档关联再删标签行，返回删除的标签行数。
 *  与 dbImages.purgeUnusedImages 同构：不在这里 persist/audit ——
 *  清洗的落盘与审计由 IPC 层（cleanup:run）统一调度，避免同一次清洗两条审计。 */
function purgeEmptyTags() {
  const before = emptyTagStats();
  run(`DELETE FROM post_tags WHERE tag_id IN (SELECT id FROM tags WHERE ${EMPTY_TAG_BARE})`);
  run(`DELETE FROM tags WHERE ${EMPTY_TAG_BARE}`);
  return before.empty;
}
function resolveTagIds(names, userId) {
  const ids = [];
  for (const raw of (names || []).slice(0, 20)) {
    const name = String(raw || '')
      .trim()
      .slice(0, 20);
    if (!name) continue;
    let t = get('SELECT id FROM tags WHERE name=?', [name]);
    if (!t) {
      t = { id: insert('INSERT INTO tags(name,created_at) VALUES(?,?)', [name, nowIso()]) };
      audit(userId, '自动新建标签', 'tag', t.id, { name });
    }
    ids.push(t.id);
  }
  return [...new Set(ids)];
}
function saveTag(p, userId) {
  const name = String(p.name || '').trim();
  if (!name || name.length > 20) throw new Error(i18n.errKey('common.errTagNameRule'));
  if (get('SELECT id FROM tags WHERE name=? AND id<>?', [name, p.id || 0]))
    throw new Error(i18n.errKey('common.errTagExists'));
  if (p.id) {
    run('UPDATE tags SET name=? WHERE id=?', [name, p.id]);
    audit(userId, '修改标签', 'tag', p.id, { name });
  } else {
    const id = insert('INSERT INTO tags(name,created_at) VALUES(?,?)', [name, nowIso()]);
    audit(userId, '新建标签', 'tag', id, { name });
  }
  persist();
}
function deleteTag(id, userId) {
  run('DELETE FROM post_tags WHERE tag_id=?', [id]);
  run('DELETE FROM tags WHERE id=?', [id]);
  audit(userId, '删除标签', 'tag', id, {});
  persist();
}

/* ---------------- 自定义字段 ---------------- */
const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'url'];
function listFieldDefs() {
  return all(
    `SELECT *, (SELECT COUNT(*) FROM post_fields pf WHERE pf.field_def_id = field_defs.id) AS post_count FROM field_defs ORDER BY sort,id`
  ).map(d => ({
    ...d,
    options: d.options ? String(d.options).split('|').filter(Boolean) : [],
    required: !!d.required,
    unique_field: !!d.unique_field,
    post_count: d.post_count || 0
  }));
}
function saveFieldDef(p, userId) {
  const name = String(p.name || '').trim();
  const code = String(p.code || '').trim();
  if (!name || name.length > 30) throw new Error(i18n.errKey('common.errFieldNameRule'));
  if (!/^[A-Za-z][A-Za-z0-9_]{0,19}$/.test(code)) throw new Error(i18n.errKey('common.errFieldCodeRule'));
  if (!FIELD_TYPES.includes(p.type)) throw new Error(i18n.errKey('common.errFieldTypeInvalid'));
  if (get('SELECT id FROM field_defs WHERE code=? AND id<>?', [code, p.id || 0]))
    throw new Error(i18n.errKey('common.errFieldCodeTaken', { code }));
  const options =
    p.type === 'select'
      ? String(p.options || '')
          .split(/[|,，]/)
          .map(s => s.trim())
          .filter(Boolean)
          .slice(0, 20)
          .join('|')
      : '';
  const sort = parseInt(p.sort || 0, 10) || 0;
  if (p.id) {
    run(
      'UPDATE field_defs SET name=?,code=?,type=?,options=?,required=?,unique_field=?,sort=?,updated_at=? WHERE id=?',
      [name, code, p.type, options, p.required ? 1 : 0, p.unique_field ? 1 : 0, sort, nowIso(), p.id]
    );
    audit(userId, '修改字段定义', 'field', code, { name, type: p.type });
  } else {
    insert(
      'INSERT INTO field_defs(name,code,type,options,required,unique_field,sort,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
      [name, code, p.type, options, p.required ? 1 : 0, p.unique_field ? 1 : 0, sort, nowIso(), nowIso()]
    );
    audit(userId, '新建字段定义', 'field', code, { name, type: p.type });
  }
  persist();
}
function deleteFieldDef(id, userId) {
  const d = get('SELECT * FROM field_defs WHERE id=?', [id]);
  if (!d) throw new Error(i18n.errKey('common.errFieldMissing'));
  const used = get('SELECT COUNT(*) n FROM post_fields WHERE field_def_id=?', [id]);
  if (used.n > 0) throw new Error(i18n.errKey('common.errFieldInUse', { name: d.name, n: used.n }));
  run('DELETE FROM field_defs WHERE id=?', [id]);
  audit(userId, '删除字段定义', 'field', d.code, {});
  persist();
}

module.exports = {
  listRegions,
  saveRegion,
  deleteRegion,
  listCategories,
  saveCategory,
  deleteCategory,
  listTags,
  resolveTagIds,
  saveTag,
  deleteTag,
  emptyTagStats,
  purgeEmptyTags,
  listFieldDefs,
  saveFieldDef,
  deleteFieldDef
};
