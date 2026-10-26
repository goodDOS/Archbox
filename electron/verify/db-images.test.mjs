/**
 * 图片库（Beta.315）单测 —— 纯 Node，直接驱动真实 db 层（sql.js），不依赖 Electron。
 *
 * 覆盖：extract/hydrate/去重/幂等/超限/坏链、savePost/mergePost/restoreVersion/
 * getPost/getVersionSnapshot 全链路、purgePost 图片回收（含被历史版本占用的图不误删）。
 *
 * 运行：node electron/verify/db-images.test.mjs
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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-images-'));
const db = require(path.join(ROOT, 'electron/db.js'));
const dbImages = require(path.join(ROOT, 'electron/services/db-images.js'));
// 断言 images 表原始行用 core 的查询助手（与 db.js 同一单例；db.js 按设计不外泄内部助手）
const core = require(path.join(ROOT, 'electron/db/core.js'));
const qAll = (sql, params = []) => core.all(sql, params);
await db.init(dir);

const user = db.createUser('图片测试员', 'A-FAKE-MAC-IMG01', 'pw123456', [
  { q: 'q1', a: 'a1' },
  { q: 'q2', a: 'a2' },
  { q: 'q3', a: 'a3' }
]);
const uid = user.id;
db.saveRegion({ name: '图区', code: 'IMG', color: '#3b6df0' }, uid);
const R = db.listRegions().find(r => r.name === '图区').id;

// 两张不同的 1x1 图（png 与 gif），内容不同 → sha256 不同
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const GIF_B64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const pngData = `data:image/png;base64,${PNG_B64}`;
const gifData = `data:image/gif;base64,${GIF_B64}`;

/* ── 1. extract：data: → 入库 + 短链 ── */
{
  const html = `<p>看图</p><img src="${pngData}" alt="图一"><p>完</p>`;
  const out = dbImages.extractImages(html);
  const rows = qAll('SELECT * FROM images');
  ok(rows.length === 1, `1. data: 图片搬进 images 表：实得 ${rows.length} 行`);
  ok(
    out.indexOf('archbox-img://1') > -1 && out.indexOf('data:image/png') === -1,
    '1b. 正文只剩 archbox-img:// 短链，无 data: 残留'
  );
  ok(rows[0].mime === 'image/png' && rows[0].bytes > 0 && rows[0].data === PNG_B64, '1c. mime/bytes/base64 本体正确');
  ok(/alt="图一"/.test(out), '1d. img 其余属性（alt）保留');
}

/* ── 2. extract 幂等 + 短链/外链/非图片 data: 原样 ── */
{
  const once = dbImages.extractImages(`<img src="${gifData}">`);
  const twice = dbImages.extractImages(once);
  ok(once === twice, '2. 二次 extract 结果不变（幂等）');
  const ext = dbImages.extractImages('<img src="https://example.com/a.png"><img src="archbox-img://1"><p>无图</p>');
  ok(
    ext === '<img src="https://example.com/a.png"><img src="archbox-img://1"><p>无图</p>',
    '2b. 外链 / 既有短链 / 无图正文原样返回'
  );
  const nonImg = dbImages.extractImages('<img src="data:application/pdf;base64,AAAA">');
  ok(nonImg.indexOf('data:application/pdf') > -1, '2c. 非图片 data: 不搬库，原样保留');
  const empty = dbImages.extractImages('');
  ok(empty === '', '2d. 空串安全');
}

/* ── 3. 去重：同图两处引用只存一行 ── */
{
  // 此时表里已有 test1 的 png 与 test2 的 gif 两行；再插两次同一张 png → 行数不变
  const before = qAll('SELECT id FROM images').length;
  dbImages.extractImages(`<img src="${pngData}"><img src="${pngData}">`);
  const after = qAll('SELECT id FROM images').length;
  ok(before === 2 && after === 2, `3. 同一张图（内容相同）重复引用 → 不新增行（sha256 去重）：${before} → ${after}`);
}

/* ── 4. 单引号 / 无引号 src 也能提取 ── */
{
  const out = dbImages.extractImages(`<img src='${gifData}' alt='x'>`);
  ok(out.indexOf(`archbox-img://`) > -1 && out.indexOf('data:image/gif') === -1, '4. 单引号 src 正常提取');
  const out2 = dbImages.extractImages(`<img src=${pngData}>`);
  ok(out2.indexOf('archbox-img://') > -1, '4b. 无引号 src 正常提取');
}

/* ── 5. hydrate：短链 → data:，往返一致 ── */
{
  const html = `<p>图</p><img src="archbox-img://1" alt="图一">`;
  const out = dbImages.hydrateImages(html);
  ok(out.indexOf(pngData) > -1, '5. 短链还原为原 data: URI');
  const noLink = dbImages.hydrateImages('<p>plain</p>');
  ok(noLink === '<p>plain</p>', '5b. 不含短链快路径原样返回');
  const missing = dbImages.hydrateImages('<img src="archbox-img://99999"><p>x</p>');
  ok(
    missing.indexOf('archbox-img://') === -1 && missing.indexOf('<img') === -1,
    '5c. 查不到的 id → 摘掉 img 标签（不留裂图/死链）'
  );
  const bad = dbImages.hydrateImages('<img src="archbox-img://abc">');
  ok(bad.indexOf('archbox-img://') === -1, '5d. 非法 id → 同样摘除');
}

/* ── 6. savePost/getPost 全链路：库里短链、出库 data: ── */
{
  const pid = db.savePost(
    {
      title: '带图文档',
      regionId: R,
      categoryId: null,
      contentHtml: `<p>正文</p><img src="${pngData}" alt="示例"><p>尾</p>`,
      fields: {},
      tags: [],
      status: 'published'
    },
    uid
  ).id;
  const raw = db.getPostRaw(pid);
  ok(
    raw.content_html.indexOf('archbox-img://') > -1 && raw.content_html.indexOf('data:') === -1,
    '6. 落库正文只含短链'
  );
  ok(raw.content_text.indexOf('正文') > -1, '6b. content_text 仍正常提取纯文本');
  const full = db.getPost(pid);
  ok(full.content_html.indexOf(pngData) > -1, '6c. getPost 出库还原 data:（编辑器零改动）');
  // 无改动保存：sameSnapshot 比对（两侧都是短链）必须判等，不得刷版本
  const before = db.listVersions(pid).length;
  db.savePost(
    {
      id: pid,
      title: '带图文档',
      regionId: R,
      categoryId: null,
      contentHtml: full.content_html,
      fields: {},
      tags: [],
      status: 'published'
    },
    uid
  );
  ok(db.listVersions(pid).length === before, '6d. 提交 hydrate 后的 HTML 再保存 → 判「无改动」，不刷版本');
}

/* ── 7. 版本快照存短链；getVersionSnapshot 还原 ── */
{
  const pid = db.savePost(
    { title: '版本图文档', regionId: R, categoryId: null, contentHtml: `<img src="${gifData}">`, fields: {}, tags: [] },
    uid
  ).id;
  const vs = db.listVersions(pid);
  const snapRow = qAll('SELECT snapshot FROM post_versions WHERE id=?', [vs[0].id])[0];
  ok(snapRow.snapshot.indexOf('archbox-img://') > -1, '7. 版本快照里存的是短链（快照同步瘦身）');
  const snap = db.getVersionSnapshot(pid, vs[0].id);
  ok(snap.content_html.indexOf(gifData) > -1, '7b. 历史版本预览还原 data:');
  // 改内容 → 新版本 → 恢复旧版本，图片链路仍通
  db.savePost(
    { id: pid, title: '版本图文档', regionId: R, categoryId: null, contentHtml: '<p>图删了</p>', fields: {}, tags: [] },
    uid
  );
  db.restoreVersion(pid, vs[0].id, uid);
  const restored = db.getPost(pid);
  ok(restored.content_html.indexOf(gifData) > -1, '7c. 恢复历史版本后图片仍可还原');
}

/* ── 8. mergePost：合并进来的 data: 图也入库 ── */
{
  const t = db.savePost(
    { title: '合并目标', regionId: R, categoryId: null, contentHtml: '<p>旧</p>', fields: {}, tags: [] },
    uid
  ).id;
  db.mergePost(
    {
      targetId: t,
      draft: {
        title: '合并源',
        regionId: R,
        categoryId: null,
        contentHtml: `<img src="${pngData}">`,
        fields: {},
        tags: []
      }
    },
    uid
  );
  const raw = db.getPostRaw(t);
  ok(
    raw.content_html.indexOf('archbox-img://') > -1 && raw.content_html.indexOf('data:') === -1,
    '8. mergePost 合并进来的内联图也提取为短链'
  );
  ok(db.getPost(t).content_html.indexOf(pngData) > -1, '8b. 合并后 getPost 仍还原出图片');
}

/* ── 9. purgePost 图片回收：独占图删掉、共用图与历史版本占用的图保留 ── */
{
  // 用一张全新的图（与前面各测试的图都不同），以「行数差值」判定，不受前面文档影响
  const soloImg = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhQGAhKmMIQAAAABJRU5ErkJggg==';
  const soloData = `data:image/png;base64,${soloImg}`;
  const before = qAll('SELECT id FROM images').length;
  const solo = db.savePost(
    {
      title: '独占图文档',
      regionId: R,
      categoryId: null,
      contentHtml: `<img src="${soloData}">`,
      fields: {},
      tags: []
    },
    uid
  ).id;
  const shared = db.savePost(
    {
      title: '共用图文档',
      regionId: R,
      categoryId: null,
      contentHtml: `<img src="${soloData}">`,
      fields: {},
      tags: []
    },
    uid
  ).id;
  ok(qAll('SELECT id FROM images').length === before + 1, '9. 两篇共用同一张新图 → 只新增 1 行（去重）');
  // 先给 shared 建一个带图的历史版本，再把图从正文删掉：该图只被历史版本引用
  db.savePost(
    {
      id: shared,
      title: '共用图文档',
      regionId: R,
      categoryId: null,
      contentHtml: `<img src="${soloData}">`,
      fields: {},
      tags: []
    },
    uid
  );
  db.savePost(
    {
      id: shared,
      title: '共用图文档',
      regionId: R,
      categoryId: null,
      contentHtml: '<p>清空</p>',
      fields: {},
      tags: []
    },
    uid
  );
  // 彻底删除 solo：它的引用消失，但 shared 的历史版本仍引用该图 → 必须保留
  db.deletePost(solo, uid, true);
  db.purgePost(solo, uid);
  ok(
    qAll('SELECT id FROM images').length === before + 1,
    '9b. 彻底删除独占图文档 → 图仍被 shared 的历史版本占用，不误删'
  );
  // 再彻底删除 shared：引用全消失 → 回收
  db.deletePost(shared, uid, true);
  db.purgePost(shared, uid);
  ok(qAll('SELECT id FROM images').length === before, '9c. 最后一篇（含其全部历史版本）删除 → 图片行回收');
}

/* ── 10. 超限 data: 不搬库（与 img:upload 20MB 口径一致，不静默丢图） ── */
{
  // 上限按【解码后的字节数】判定（与 img:upload 的 buf.length 同口径）：
  // base64 每 4 字符 ≈ 3 字节，取 28MB 的 base64 串 → 解码约 21MB，稳超 20MB。
  const big = 'A'.repeat(28 * 1024 * 1024);
  const html = `<img src="data:image/png;base64,${big}">`;
  const out = dbImages.extractImages(html);
  ok(out === html, '10. 超大 data: 原样保留（不搬库、不丢图，保存后由下次正常链路处理）');
}

/* ── 11. 文档包往返：导出自包含（data:），导入后重新入库为短链 ── */
{
  const archpack = require(path.join(ROOT, 'electron/services/archpack.js'));
  db.savePost(
    { title: '打包图文档', regionId: R, categoryId: null, contentHtml: `<img src="${pngData}">`, fields: {}, tags: [] },
    uid
  );
  const buf = await archpack.buildZipPack(db, { regionId: R });
  const { manifest } = archpack.parseZipPackBuffer(buf);
  const packed = manifest.data.posts.find(p => p.title === '打包图文档');
  ok(
    !!packed && packed.contentHtml.indexOf(pngData) > -1,
    '11. 文档包 manifest 里是 data:（自包含：对方没有我们的 images 表也能看）'
  );
  await archpack.applyPackImport({ data: manifest, strategy: 'nodedup', userId: uid });
  const imported = qAll("SELECT * FROM posts WHERE title='打包图文档' ORDER BY id DESC")[0];
  ok(
    imported && imported.content_html.indexOf('archbox-img://') > -1,
    '11b. 导入后正文重新变成短链（图片已进本库 images 表）'
  );
  const back = db.getPost(imported.id);
  ok(back.content_html.indexOf(pngData) > -1, '11c. 导入文档出库仍还原出图片');
}

/* ── 12. 图片清单（Beta.322 · 设置-数据清洗「图片文件」板块）──
 *
 * 用户要的是「列出全部图片、编号、上传时间，以及被哪些文档引用」，
 * 本质是为了判断「这张图能不能清」。所以这个接口的口径必须与回收口径**完全一致**：
 *   正文 posts.content_html + 历史版本 post_versions.snapshot。
 * ★ 关键：历史版本引用的图必须算「在用」★
 *   只在历史里出现的图若被清单标成「无引用」，用户就会放心清掉，
 *   之后恢复那个版本时图片直接消失 —— 这是本段最重要的一条断言。
 */
{
  // 干净起盘：前面各段已经产生了一堆图片与文档，这里重新数一遍基线
  const inv0 = dbImages.buildImageInventory({ size: 200 });
  const baseIds = inv0.rows.map(r => r.id);

  // 新文档：正文带一张新图（PNG 换个 alt 不会换内容 → 用 GIF 之外再造一个不同内容的 png）
  const PNG2 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const png2 = `data:image/png;base64,${PNG2}`;
  db.saveRegion({ name: '清区', code: 'CLN', color: '#e8910c' }, uid);
  const R2 = db.listRegions().find(r => r.name === '清区').id;
  const post = db.savePost(
    {
      title: '清单测试文档',
      regionId: R2,
      categoryId: null,
      contentHtml: `<p>图</p><img src="${png2}">`,
      status: 'published'
    },
    uid
  );
  const pid = post.id || post;

  const inv1 = dbImages.buildImageInventory({ size: 200 });
  const newRow = inv1.rows.find(r => !baseIds.includes(r.id));
  ok(!!newRow, '12a. 新插入的图片出现在清单里');
  ok(/^IMG-\d{4}$/.test(newRow.no), `12b. 编号格式为 IMG-0000（实得 ${newRow.no}）`);
  ok(!!newRow.created_at && /^\d{4}-\d{2}-\d{2}/.test(newRow.created_at), '12c. 上传时间存在且为 ISO 日期');
  ok(newRow.ext === 'png' && newRow.mime === 'image/png', '12d. 类型/mime 正确');
  ok(newRow.bytes > 0, '12e. 大小大于 0');
  ok(newRow.postCount === 1 && newRow.refs[0].postId === pid, '12f. 被引用的文档能追到具体哪一篇');
  ok(newRow.refs[0].title === '清单测试文档', '12g. 引用项带文档标题（用户要据此判断要不要）');
  ok(newRow.usedInBody === true, '12h. 正文引用标记为 usedInBody');
  /* 保存文档时 saveVersion 会同步写一版，所以正文引用这条一定也带 v1 —— 这是真实情况，
     断言的是「inBody 标记为真」，而不是「没有版本号」（后者是错误预期，见 addRef 注释）。 */
  ok(newRow.refs[0].inBody === true, '12i. 该条引用自身标了 inBody（按文档粒度）');

  /* 删掉正文里的图 → 只剩历史版本引用 */
  db.savePost(
    {
      id: pid,
      title: '清单测试文档',
      regionId: R2,
      categoryId: null,
      contentHtml: '<p>图没了</p>',
      status: 'published'
    },
    uid
  );
  const inv2 = dbImages.buildImageInventory({ size: 200 });
  const histRow = inv2.rows.find(r => r.id === newRow.id);
  ok(!!histRow, '12j. 正文删图后图片行仍在（未被即时回收）');
  ok(histRow.postCount === 1 && histRow.usedInBody === false, '12k. 此时标为「仅历史版本在用」');
  ok(histRow.refs[0].versionNos.length > 0, `12l. 列出是哪几版在引（实得 v${histRow.refs[0].versionNos.join(',v')}）`);
  ok(histRow.refs[0].versionNos.includes(1), '12m. 首版（含图的那一版）被列出');

  /* ★ 核心：历史版本引用 = 在用 → 不能被清 ★ */
  const stat = dbImages.imageStatistics();
  const inv2b = dbImages.buildImageInventory({ size: 200 });
  ok(
    inv2b.summary.unused === stat.stale,
    `12n. 清单的「无引用」数 = 回收预检的可清理数（清单 ${inv2b.summary.unused} / 预检 ${stat.stale}）`
  );
  const stillThere = qAll('SELECT id FROM images WHERE id=?', [newRow.id]);
  ok(stillThere.length === 1, '12o. 仅历史引用的图未被回收');
  dbImages.purgeUnusedImages();
  const afterPurge = qAll('SELECT id FROM images WHERE id=?', [newRow.id]);
  ok(afterPurge.length === 1, '12p. 跑一次清理后，仅历史引用的图依然在（历史版本的图算在用）');

  /* 分页 */
  const p1 = dbImages.buildImageInventory({ page: 1, size: 1 });
  const p2 = dbImages.buildImageInventory({ page: 2, size: 1 });
  ok(p1.rows.length === 1 && p2.rows.length === 1, '12q. size=1 时每页一行');
  ok(p1.rows[0].id !== p2.rows[0].id, '12r. 第 1、2 页不是同一行');
  ok(p1.pages === p1.total && p1.total === inv2.total, '12s. 总页数与总数自洽');

  /* 筛选 */
  const onlyUnused = dbImages.buildImageInventory({ size: 200, only: 'unused' });
  ok(
    onlyUnused.rows.every(r => r.postCount === 0),
    '12t. only=unused 只返回无引用的图'
  );
  ok(onlyUnused.total === inv2.summary.unused, '12u. 筛选后的 total 与汇总里的 unused 一致');
  const byId = dbImages.buildImageInventory({ size: 200, q: String(newRow.id) });
  ok(byId.rows.length === 1 && byId.rows[0].id === newRow.id, '12v. 按编号搜索命中唯一条目');
  const byType = dbImages.buildImageInventory({ size: 200, q: 'gif' });
  ok(
    byType.rows.every(r => r.mime === 'image/gif'),
    '12w. 按类型搜索只返回该类型'
  );

  /* 汇总不受筛选影响（口径说明：汇总永远是全库） */
  ok(
    onlyUnused.summary.total === inv2.summary.total,
    `12x. 汇总的「总张数」不随筛选变化（${onlyUnused.summary.total}）`
  );

  /* 单张取图 */
  const uri = dbImages.imageDataUri(newRow.id);
  ok(uri && uri.startsWith('data:image/png;base64,'), '12y. 按 id 能取回单张 data URI（缩略图/预览用）');
  ok(dbImages.imageDataUri(999999) === null, '12z. 不存在的 id 返回 null（不抛错）');
}

db.closeDb();
fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
