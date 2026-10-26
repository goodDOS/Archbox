/**
 * 重复文档查重（Beta.258）单测 —— 纯 Node，直接驱动真实 db 层（sql.js），不依赖 Electron。
 *
 * 运行：node electron/verify/dup-title.test.mjs
 */
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + msg);
  } else {
    fail++;
    console.error('  ✗ ' + msg);
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dup-title-'));
const db = require(path.join(ROOT, 'electron/db.js'));
await db.init(dir);

const user = db.createUser('查重测试员', 'A-FAKE-MAC-DUP01', 'pw123456', [
  { q: 'q1', a: 'a1' },
  { q: 'q2', a: 'a2' },
  { q: 'q3', a: 'a3' }
]);
const uid = user.id;

db.saveRegion({ name: '华东', code: 'HD', color: '#3b6df0' }, uid);
db.saveRegion({ name: '华南', code: 'HN', color: '#22c55e' }, uid);
const regions = db.listRegions();
const R_HD = regions.find(r => r.name === '华东').id;
const R_HN = regions.find(r => r.name === '华南').id;
db.saveCategory({ name: '保密', code: 'BM', region_id: R_HD }, uid);
db.saveCategory({ name: '公开', code: 'GK', region_id: R_HD }, uid);
const cats = db.listCategories(R_HD);
const C_BM = cats.find(c => c.code === 'BM').id;
const C_GK = cats.find(c => c.code === 'GK').id;

// ── 1. 基线：同大区同分类同名必须报冲突（这是旧口径唯一能覆盖的场景，不能回归）──
const p1 = db.savePost(
  {
    title: '苏州精工精密制造有限公司',
    regionId: R_HD,
    categoryId: C_BM,
    contentHtml: '<p>甲</p>',
    fields: {},
    tags: []
  },
  uid
);

{
  const dup = db.checkDuplicates({
    id: 0,
    fields: {},
    title: '苏州精工精密制造有限公司',
    regionId: R_HD,
    categoryId: C_BM
  });
  ok(dup.length === 1 && dup[0].code === 'title_region_cat', '1. 同大区同分类同名 → 报冲突且分级为 title_region_cat');
  ok(
    dup[0].rname === '华东' && dup[0].cname === '保密',
    `1b. ★ 冲突带归属名称（rname/cname）供弹窗说明「撞在哪」：${dup[0].rname} / ${dup[0].cname}`
  );
}

// ── 2. ★ 跨大区同名（旧口径漏报，本次修复核心）──
{
  const dup = db.checkDuplicates({
    id: 0,
    fields: {},
    title: '苏州精工精密制造有限公司',
    regionId: R_HN,
    categoryId: null
  });
  ok(dup.length === 1, `★ 2. 跨大区同名 → 报冲突（旧口径返回 []，实测漏报）：${JSON.stringify(dup.map(d => d.code))}`);
  ok(dup[0] && dup[0].code === 'title', '2b. 跨大区分级为 title（弱于同大区，措辞要区别对待）');
  ok(dup[0] && dup[0].rname === '华东', '2c. 跨大区冲突里 rname 指向「对方」所属大区：' + (dup[0] && dup[0].rname));
}

// ── 3. ★ 同大区不同分类同名（旧口径漏报）──
{
  const dup = db.checkDuplicates({
    id: 0,
    fields: {},
    title: '苏州精工精密制造有限公司',
    regionId: R_HD,
    categoryId: C_GK
  });
  ok(
    dup.length === 1 && dup[0].code === 'title',
    `★ 3. 同大区不同分类同名 → 报冲突（旧口径返回 []）：${JSON.stringify(dup.map(d => d.code))}`
  );
}

// ── 4. 编辑自己不算撞名（id<>? 排除自身）──
{
  const dup = db.checkDuplicates({
    id: p1.id,
    fields: {},
    title: '苏州精工精密制造有限公司',
    regionId: R_HD,
    categoryId: C_BM,
    originalFields: {},
    originalTitle: '苏州精工精密制造有限公司'
  });
  ok(dup.length === 0, '4. 编辑态且标题未改 → 豁免（否则历史脏数据会把用户永久锁死）');
}

// ── 5. 编辑态改了标题 → 必须参与查重（豁免只对「没改」生效）──
{
  db.savePost(
    {
      id: p1.id,
      title: '苏州精工精密制造有限公司',
      regionId: R_HD,
      categoryId: C_BM,
      contentHtml: '<p>甲</p>',
      fields: {},
      tags: []
    },
    uid
  );
  const p2 = db.savePost(
    {
      title: '苏州精工精密制造有限公司',
      regionId: R_HN,
      categoryId: null,
      contentHtml: '<p>乙</p>',
      fields: {},
      tags: []
    },
    uid
  );
  const dup5 = db.checkDuplicates({
    id: p2.id,
    fields: {},
    title: '苏州精工精密制造有限公司',
    regionId: R_HN,
    categoryId: null,
    originalFields: {},
    originalTitle: '完全不同的旧标题'
  });
  ok(
    dup5.length === 1 && dup5[0].postId === p1.id,
    `5. ★ 编辑态标题被改过 → 参与查重且排除自身（命中 p${p1.id}，未命中自身 p${p2.id}）`
  );
}

// ── 6. 已删除（回收站里）的同名文档不算冲突 ──
{
  const tmp = db.savePost(
    {
      title: '待删除的同名文档',
      regionId: R_HD,
      categoryId: C_BM,
      contentHtml: '<p>丙</p>',
      fields: {},
      tags: []
    },
    uid
  );
  db.deletePost(tmp.id, uid);
  const dup = db.checkDuplicates({ id: 0, fields: {}, title: '待删除的同名文档', regionId: R_HD, categoryId: C_BM });
  ok(dup.length === 0, '6. 回收站里的同名文档不报冲突（deleted_at IS NULL 过滤生效）');
}

// ── 7. 多个同名 → 全部报出（不是一个 get() 只取一条）──
{
  const t = '三处同名文档';
  const ids = [];
  ids.push(
    db.savePost({ title: t, regionId: R_HD, categoryId: C_BM, contentHtml: '<p>1</p>', fields: {}, tags: [] }, uid).id
  );
  ids.push(
    db.savePost({ title: t, regionId: R_HN, categoryId: null, contentHtml: '<p>2</p>', fields: {}, tags: [] }, uid).id
  );
  ids.push(
    db.savePost({ title: t, regionId: R_HD, categoryId: C_GK, contentHtml: '<p>3</p>', fields: {}, tags: [] }, uid).id
  );
  const dup = db.checkDuplicates({ id: 0, fields: {}, title: t, regionId: R_HN, categoryId: null });
  ok(dup.length === 3, `★ 7. 三处同名 → 全部报出（旧口径只 get() 一条，会漏）：实得 ${dup.length} 条`);
  const kinds = dup.map(d => d.code).sort();
  ok(
    kinds.filter(k => k === 'title_region_cat').length === 1 && kinds.filter(k => k === 'title').length === 2,
    '7b. 分级正确：同大区同分类 1 条 + 同名不同档 2 条 → ' + JSON.stringify(kinds)
  );
}

// ── 8. 标题查重不依赖 regionId（旧的 `title && regionId` 守卫已移除）──
{
  const dup = db.checkDuplicates({ id: 0, fields: {}, title: '三处同名文档' });
  ok(dup.length === 3, `★ 8. 不传 regionId 仍能查重（旧口径 regionId 缺失就整段跳过）：实得 ${dup.length} 条`);
}

// ── 9. 空标题不查重 ──
{
  const dup = db.checkDuplicates({ id: 0, fields: {}, title: '   ', regionId: R_HD, categoryId: C_BM });
  ok(dup.length === 0, '9. 空标题不参与查重');
}

db.closeDb();
fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
