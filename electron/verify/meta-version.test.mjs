/**
 * 元数据版本与快照/对比显示（Beta.258）单测 —— 纯 Node，真实 db 层 + 真实 postDiff 算法。
 *
 * 用户需求：「更改大区、分类、标签等元数据也应算新版本，并在快照与对比里显示出来」
 *
 * 运行：node electron/verify/meta-version.test.mjs
 */
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;

const { buildPostDiff, diffMeta } = await import('../../src/utils/postDiff.js');

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-ver-'));
const db = require(path.join(ROOT, 'electron/db.js'));
await db.init(dir);

const user = db.createUser('元数据测试员', 'A-FAKE-MAC-META01', 'pw123456', [
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

const HTML = '<p>第一段正文内容</p><p>第二段正文内容</p>';
const post = db.savePost(
  {
    title: '元数据版本测试文档',
    regionId: R_HD,
    categoryId: C_BM,
    no: 'HD-BM-2026-0001',
    contentHtml: HTML,
    fields: {},
    tags: ['初始']
  },
  uid
);

const vCount = () => db.listVersions(post.id).length;

// ═══ 一、元数据改动必须算新版本 ═══
{
  const v0 = vCount();
  db.savePost(
    {
      id: post.id,
      title: '元数据版本测试文档',
      regionId: R_HD,
      categoryId: C_BM,
      no: 'HD-BM-2026-0001',
      contentHtml: HTML,
      fields: {},
      tags: ['初始', '新增']
    },
    uid
  );
  const v1 = vCount();
  ok(v1 === v0 + 1, `★ 1. 只加标签 → 算新版本（${v0} → ${v1}）`);
}
{
  const v1 = vCount();
  db.savePost(
    {
      id: post.id,
      title: '元数据版本测试文档',
      regionId: R_HD,
      categoryId: C_GK,
      no: 'HD-BM-2026-0001',
      contentHtml: HTML,
      fields: {},
      tags: ['初始', '新增']
    },
    uid
  );
  const v2 = vCount();
  ok(v2 === v1 + 1, `★ 2. 只改分类（${C_BM} → ${C_GK}，正文一字未动）→ 算新版本（${v1} → ${v2}）`);
}
{
  const v2 = vCount();
  db.savePost(
    {
      id: post.id,
      title: '元数据版本测试文档',
      regionId: R_HN,
      categoryId: null,
      no: 'HD-BM-2026-0001',
      contentHtml: HTML,
      fields: {},
      tags: ['初始', '新增']
    },
    uid
  );
  const v3 = vCount();
  ok(v3 === v2 + 1, `★ 3. 只改大区（${R_HD} → ${R_HN}）→ 算新版本（${v2} → ${v3}）`);
}
{
  // 真的什么都没改 → 不应产生新版本（这条不能被上面的修复破坏）
  const v3 = vCount();
  const r = db.savePost(
    {
      id: post.id,
      title: '元数据版本测试文档',
      regionId: R_HN,
      categoryId: null,
      no: 'HD-BM-2026-0001',
      contentHtml: HTML,
      fields: {},
      tags: ['初始', '新增']
    },
    uid
  );
  const v4 = vCount();
  ok(v4 === v3 && r.unchanged === true, `4. 真的无改动 → 不产生新版本（${v3} → ${v4}，unchanged=${r.unchanged}）`);
}

// ═══ 二、快照必须带归属名称（否则前端渲染不出「大区：华东 → 华南」）═══
{
  const vers = db.listVersions(post.id);
  const snap = db.getVersionSnapshot(post.id, vers[vers.length - 1].id);
  ok(snap.rname === '华东', `★ 5. 最早版本快照带 rname=华东（实际 ${snap.rname}）`);
  ok(snap.cname === '保密', `5b. 最早版本快照带 cname=保密（实际 ${snap.cname}）`);
  ok(snap.no === 'HD-BM-2026-0001', `5c. 快照带编号（实际 ${snap.no}）`);

  const cur = db.getVersionSnapshot(post.id, vers[0].id);
  ok(cur.rname === '华南', `★ 5d. 最新版本快照 rname=华南（实际 ${cur.rname}）`);
  ok(
    cur.cname === '' || cur.cname == null,
    `5e. 未分类时 cname 为空而非 undefined（实际 ${JSON.stringify(cur.cname)}）`
  );
}

// ═══ 三、diffMeta 必须能看出大区/分类/编号变化 ═══
{
  const vers = db.listVersions(post.id);
  const oldSnap = db.getVersionSnapshot(post.id, vers[vers.length - 1].id);
  const cur = db.getPost(post.id);
  const newSnap = {
    title: cur.title,
    status: cur.status,
    fields: cur.fields,
    tags: cur.tags,
    region_id: cur.region_id,
    rname: cur.rname,
    category_id: cur.category_id,
    cname: cur.cname,
    no: cur.no
  };
  const diff = buildPostDiff(oldSnap.content_html, cur.content_html, { oldSnap, newSnap });
  const labels = diff.meta.map(m => m.label);
  ok(labels.includes('post.regionLabel'), `★ 6. diffMeta 含「大区」差异行（i18n key）：${JSON.stringify(labels)}`);
  ok(labels.includes('post.categoryLabel'), `6b. diffMeta 含「分类」差异行（i18n key）：${JSON.stringify(labels)}`);

  const regionRow = diff.meta.find(m => m.label === 'post.regionLabel');
  ok(
    regionRow.old === '华东' && regionRow.new === '华南',
    `★ 6c. 大区行显示名称而非 id：${regionRow.old} → ${regionRow.new}`
  );
  const catRow = diff.meta.find(m => m.label === 'post.categoryLabel');
  ok(
    catRow.old === '保密' && (catRow.new === '未分类' || catRow.new === ''),
    `6d. 分类行显示名称：${catRow.old} → ${JSON.stringify(catRow.new)}`
  );
  ok(diff.identical === false, '★ 6e. ★ 只改元数据时 identical 必须为 false（旧实现会误报「完全一致」）');
  ok(
    diff.stats.change === 0 && diff.stats.insert === 0 && diff.stats.delete === 0,
    `6f. 正文统计仍全为 0（证明差异纯粹来自元数据）：${JSON.stringify(diff.stats)}`
  );
}

// ── 3b. 只改元数据、正文一字未动：diffMeta 单独调用也要报出差异 ──
{
  const rows = diffMeta(
    {
      title: 'T',
      region_id: 1,
      rname: '华东',
      category_id: 2,
      cname: '保密',
      no: 'A-1',
      fields: {},
      tags: ['x'],
      status: 'published'
    },
    {
      title: 'T',
      region_id: 9,
      rname: '华南',
      category_id: null,
      cname: '',
      no: 'B-2',
      fields: {},
      tags: ['x'],
      status: 'published'
    }
  );
  const lbl = rows.map(r => r.label);
  ok(
    lbl.join(',') === 'post.regionLabel,post.categoryLabel,post.docNo',
    `★ 7. 仅元数据变化时 diffMeta 精确报出三行（i18n key）：${JSON.stringify(lbl)}`
  );
}

// ── 3c. 缺 rname/cname 时回落到 id，不崩 ──
{
  const rows = diffMeta(
    { title: 'T', region_id: 1, category_id: 2, fields: {}, tags: [], status: 'published' },
    { title: 'T', region_id: 9, category_id: 3, fields: {}, tags: [], status: 'published' }
  );
  const r = rows.find(x => x.label === 'post.regionLabel');
  ok(r && r.old === '1' && r.new === '9', `8. 无 rname 时回落 id 比较，不崩：${r && r.old} → ${r && r.new}`);
}

// ── 3d. 大区/分类/编号都没动 → 不产生多余差异行 ──
{
  const rows = diffMeta(
    {
      title: 'T',
      region_id: 1,
      rname: '华东',
      category_id: 2,
      cname: '保密',
      no: 'A-1',
      fields: {},
      tags: [],
      status: 'published'
    },
    {
      title: 'T',
      region_id: 1,
      rname: '华东',
      category_id: 2,
      cname: '保密',
      no: 'A-1',
      fields: {},
      tags: [],
      status: 'published'
    }
  );
  ok(rows.length === 0, `9. 归属/编号均未变 → 不产生差异行（实得 ${rows.length}）`);
}

db.closeDb();
fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
