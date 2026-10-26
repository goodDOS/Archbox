/**
 * E2E：局域共享文档「拷贝」功能 + 作者元信息
 *
 * 走**真实 HTTP**（不 mock fetch），两台「机器」用两个临时数据目录模拟：
 *   A = 共享源（跑真实 startShare，监听回环随机端口）
 *   B = 接受方（另一套临时数据目录）
 *
 * 验证链路：
 *   1) 源主机 share.db 的文档带 author_name（副本库冗余作者名）
 *   2) 源主机 allowCopy 关闭时：/api/version 能力位 false，拷贝被拒
 *   3) 打开 allowCopy：拷贝成功 → B 主库落 copied_at/copied_from/origin_author
 *   4) 源主机 copyLog 收到上报（谁/何时/哪篇），copyRank 次数正确
 *   5) 二次拷贝 → copyRank.count = 2
 *   6) 令牌错误 → 401
 *   7) 来源筛选 origin='copy' / 'import' / 'local' 三者互斥
 *   8) 导出文档包带 authorName + manifest.data.authors
 */
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log('  ✓ ' + m);
  } else {
    fail++;
    console.log('  ✗ ' + m);
  }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lan-copy-'));
console.log('tmp =', tmp);

const core = require(path.join(ROOT, 'electron/db/core.js'));
const db = require(path.join(ROOT, 'electron/db.js'));
const shareDb = require(path.join(ROOT, 'electron/db/share.js'));
const archpack = require(path.join(ROOT, 'electron/services/archpack.js'));

/* 主进程之外的进程没有 electron.app，keystore/logger 需要打桩 */
const Module = require('module');
const origResolve = Module._resolveFilename;
const STUB = path.join(tmp, 'electron-stub.js');
const stubTargets = new Set(['electron', 'electron/main', 'electron.js']);
fs.writeFileSync(
  STUB,
  `module.exports = {
  app: {
    getPath: () => ${JSON.stringify(path.join(tmp, 'userData'))},
    getVersion: () => 'e2e',
    getName: () => 'e2e',
    setName: () => {},
    isPackaged: false,
    on: () => {}, whenReady: () => Promise.resolve(), quit: () => {}
  },
  ipcMain: { handle: () => {}, on: () => {} },
  shell: { openPath: () => {}, showItemInFolder: () => {} },
  dialog: { showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }) },
  BrowserWindow: class { constructor(){} loadFile(){} on(){} },
  session: { defaultSession: { webRequest: { onBeforeSendHeaders: () => {} } } }
}`
);
Module._resolveFilename = function (request, ...rest) {
  if (stubTargets.has(request)) return STUB;
  return origResolve.call(this, request, ...rest);
};

const lanShare = require(path.join(ROOT, 'electron/services/lan-share.js'));

const PORT = 47000 + Math.floor(Math.random() * 1000);
const TOKEN = 'e2e-token-0123456789';

/* ---------- 1) 源主机：建库 + 种子 + 一篇带作者的文档 ---------- */
console.log('\n[1] 源主机准备');
const srcDir = path.join(tmp, 'src');
await core.init(srcDir);
db.seed();
// 建一个明确的作者，使 author_name 非空可断言（createUser 强制 3 组安全问答）
try {
  db.createUser('源作者甲', '', 'e2e-pass', [
    { q: 'q1', a: 'a1' },
    { q: 'q2', a: 'a2' },
    { q: 'q3', a: 'a3' }
  ]);
} catch (e) {
  /* 已存在则忽略 */
}
const users = db.listUsers();
const author = users.find(u => u.name === '源作者甲') || users[0];
if (!author) throw new Error('种子用户缺失，无法继续');
const authorId = author.id;
const regionId = db.listRegions()[0].id;
const regionName = db.listRegions()[0].name;
const categoryId = db.listCategories(regionId)[0] ? db.listCategories(regionId)[0].id : null;

const saved = db.savePost(
  {
    title: 'E2E-拷贝源文档',
    regionId,
    categoryId,
    fields: {},
    tags: ['e2e'],
    contentHtml: '<p>copy me</p>',
    status: 'published'
  },
  authorId
);
const srcPostId = saved.id;
const postRow = db.getPostRaw(srcPostId);
ok(postRow.author_id === authorId, `源文档归属已设置（author_id=${authorId}）`);

/* ---------- 2) 副本库：重建后带出 author_name ---------- */
console.log('\n[2] 副本库冗余作者名');
await shareDb.initShare(srcDir);
shareDb.rebuild([regionId]);
const sPosts = shareDb.listPosts({ limit: 100 });
const sHit = sPosts.find(p => p.id === srcPostId);
ok(!!sHit, '副本库已包含该文档');
ok(sHit && sHit.author_name === '源作者甲', `副本库 author_name = ${sHit && sHit.author_name}`);
const sOne = shareDb.getPost(srcPostId);
ok(sOne && sOne.author_name === '源作者甲', 'getPost 也带出 author_name');
ok(sOne && sOne.no === postRow.no, `getPost 带出文档编号 no=${sOne && sOne.no}`);

/* ---------- 3) 启共享（allowCopy 关）→ 能力位 false ---------- */
console.log('\n[3] allowCopy 关闭态');
lanShare.startShare({ port: PORT, token: TOKEN, name: 'E2E源', authEnabled: true, allowCopy: false });
await new Promise(r => setTimeout(r, 250));
const base = `http://127.0.0.1:${PORT}`;
const getJson = async p => {
  const res = await fetch(`${base}${p}${p.includes('?') ? '&' : '?'}token=${TOKEN}`);
  return { status: res.status, json: await res.json().catch(() => null) };
};
const v1 = await getJson('/api/version');
ok(
  v1.status === 200 && v1.json.allowCopy === false,
  `/api/version allowCopy=false（实际 ${v1.json && v1.json.allowCopy}）`
);

const cr1 = await fetch(`${base}/api/copy-report?token=${TOKEN}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ postId: srcPostId, postTitle: 'x' })
});
ok(cr1.status === 403, `关闭时上报被拒 403（实际 ${cr1.status}）`);

/* ---------- 4) 打开 allowCopy → 能力位 true ---------- */
console.log('\n[4] allowCopy 开启态');
lanShare.setAllowCopy(true);
const v2 = await getJson('/api/version');
ok(v2.json.allowCopy === true, `/api/version allowCopy=true（实际 ${v2.json && v2.json.allowCopy}）`);

/* 令牌错误 → 401（注：/api/version 是刻意的免鉴权能力探针，仅暴露版本与能力位，
 *  不含任何文档数据，故此处用文档接口验证 401） */
const badPost = await fetch(`${base}/api/post/${srcPostId}?token=wrong-token`);
ok(badPost.status === 401, `令牌错误 → 401（实际 ${badPost.status}）`);
const noToken = await fetch(`${base}/api/regions`);
ok(noToken.status === 401, `无令牌访问数据接口 → 401（实际 ${noToken.status}）`);

/* ---------- 5) 取文档（模拟接受方） ---------- */
console.log('\n[5] 接受方拉取');
const got = await getJson('/api/post/' + srcPostId);
ok(got.status === 200 && got.json.ok, 'GET /api/post/:id 正常');
const rp = got.json.data;
ok(rp && rp.author_name === '源作者甲', `远端文档带 author_name（实际 ${rp && rp.author_name}）`);

/* ---------- 6) 写入接受方主库（真实 db.savePost + copied） ---------- */
console.log('\n[6] 接受方落库并校验拷贝标识');
core.closeDb();
const dstDir = path.join(tmp, 'dst');
await core.init(dstDir);
db.seed();
const dstRegion = db.listRegions()[0];
const dstUserId = (db.listUsers()[0] || {}).id || 'u-dst';

const from = `E2E源@127.0.0.1:${PORT}`;
const copiedAt = db.nowIso();
const newId = db.savePost(
  {
    title: rp.title,
    regionId: dstRegion.id,
    categoryId: null,
    fields: {},
    tags: (rp.tags || []).map(t => t.name).filter(Boolean),
    contentHtml: rp.content_html,
    status: 'published'
  },
  dstUserId,
  { skipOwnerCheck: true, copied: { at: copiedAt, from, originAuthor: rp.author_name } }
).id;

const copiedRow = db.getPostRaw(newId);
ok(!!copiedRow.copied_at, `copied_at 已落库：${copiedRow.copied_at}`);
ok(copiedRow.copied_from === from, `copied_from = ${copiedRow.copied_from}`);
ok(copiedRow.origin_author === '源作者甲', `origin_author = ${copiedRow.origin_author}`);
ok(copiedRow.imported_at == null, '拷贝文档未被误标为「导入」（两套标识互不污染）');
ok(copiedRow.author_id === dstUserId, `本机归属为当前用户（${copiedRow.author_id}）`);

/* ---------- 7) 上报 → 源主机 copyLog / copyRank ---------- */
console.log('\n[7] 上报与被拷记录');
const report = async title =>
  fetch(`${base}/api/copy-report?token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      host: '接受方B',
      operator: '接受方B',
      postId: srcPostId,
      postTitle: title,
      no: postRow.no,
      regionId,
      regionName
    })
  });
const r1 = await report('E2E-拷贝源文档');
ok(r1.status === 200, `上报成功 200（实际 ${r1.status}）`);
const cl = lanShare.getCopyLog();
ok(cl.length === 1, `copyLog 落 1 条（实际 ${cl.length}）`);
const e0 = cl[0];
ok(e0.postId === srcPostId, `记录 postId=${e0.postId}`);
ok(e0.postTitle === 'E2E-拷贝源文档', `记录 postTitle=${e0.postTitle}`);
ok(e0.host === '接受方B', `记录拷贝者 host=${e0.host}`);
ok(!!e0.ts && /\d{4}-\d{2}-\d{2}/.test(e0.ts), `记录含本地时间戳 ${e0.ts}`);
ok(e0.regionName === regionName, `记录大区名=${e0.regionName}`);

let rank = lanShare.copyRank(20);
ok(rank.length === 1 && rank[0].count === 1, `copyRank 次数=1（实际 ${rank[0] && rank[0].count}）`);
ok(rank[0].postId === srcPostId && rank[0].actors.includes('接受方B'), 'copyRank 含拷贝者集合');

/* 二次拷贝 → count=2 */
await report('E2E-拷贝源文档');
rank = lanShare.copyRank(20);
ok(rank[0].count === 2, `二次拷贝后 copyRank 次数=2（实际 ${rank[0].count}）`);
ok(typeof rank[0].firstTs === 'string' && typeof rank[0].lastTs === 'string', 'copyRank 含首次/最近时间');

/* 非法 body → 400，且不污染记录 */
const badBody = await fetch(`${base}/api/copy-report?token=${TOKEN}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: 'not-json'
});
ok(badBody.status === 400, `非法 JSON 被拒 400（实际 ${badBody.status}）`);

/* GET 上报路由 → 405 */
const getReport = await fetch(`${base}/api/copy-report?token=${TOKEN}`);
ok(getReport.status === 405, `GET /api/copy-report → 405（实际 ${getReport.status}）`);

/* 只读路由仍拒绝 POST（写入口收敛） */
const postPosts = await fetch(`${base}/api/posts?token=${TOKEN}`, { method: 'POST' });
ok(postPosts.status === 405, `POST /api/posts → 405（写入口仅 copy-report）`);

/* ---------- 8) 来源筛选互斥 ---------- */
console.log('\n[8] 来源筛选枚举');
const byCopy = db.listPosts({ origin: 'copy', limit: 9999 });
const byImport = db.listPosts({ origin: 'import', limit: 9999 });
const byLocal = db.listPosts({ origin: 'local', limit: 9999 });
ok(
  byCopy.some(p => p.id === newId),
  'origin=copy 命中拷贝文档'
);
ok(!byCopy.some(p => p.copied_at == null), 'origin=copy 结果全部有 copied_at');
ok(!byLocal.some(p => p.id === newId), 'origin=local 不含拷贝文档');
ok(
  byLocal.every(p => !p.copied_at && !p.imported_at),
  'origin=local 结果全部为纯粹本机自建'
);
ok(byImport.length === 0, `origin=import 无命中（本库无导入文档，实际 ${byImport.length}）`);

/* ---------- 9) 导出文档包带作者元信息 ---------- */
console.log('\n[9] 文档包作者元信息');
core.closeDb();
const exDir = path.join(tmp, 'ex');
await core.init(exDir);
db.seed();
// 干净库里没有用户（seed 只建大区/分类/标签），显式建一个作者
db.createUser('导出作者乙', '', 'e2e-pass', [
  { q: 'q1', a: 'a1' },
  { q: 'q2', a: 'a2' },
  { q: 'q3', a: 'a3' }
]);
const exAuthor = db.listUsers().find(u => u.name === '导出作者乙') || db.listUsers()[0];
const exRegion = db.listRegions()[0];
db.savePost(
  {
    title: 'E2E-带作者导出',
    regionId: exRegion.id,
    categoryId: null,
    fields: {},
    tags: [],
    contentHtml: '<p>a</p>',
    status: 'published'
  },
  exAuthor.id
);
const packBuf = await archpack.buildZipPack(db, {});
const zipRead = require(path.join(ROOT, 'electron/services/zip-read.js'));
const entries = zipRead.extractStoreChecked(packBuf, 'E2E ');
const manifest = JSON.parse(entries['manifest.json'].toString('utf8'));
const p0 = manifest.data.posts[0];
ok(!!p0.authorName, `manifest 条目带 authorName=${p0.authorName}`);
ok(p0.author === exAuthor.id, `manifest 条目带 author id=${p0.author}`);
ok(
  manifest.data.authors && manifest.data.authors[exAuthor.id] === p0.authorName,
  `manifest.data.authors 快照表正确：${JSON.stringify(manifest.data.authors)}`
);

/* ---------- 10) 导入包 → origin_author 还原 ---------- */
console.log('\n[10] 导入还原原作者');
const packPath = path.join(tmp, 'author.archboxpack');
fs.writeFileSync(packPath, packBuf);
core.closeDb();
const impDir = path.join(tmp, 'imp');
await core.init(impDir);
db.seed();
db.createUser('导入者丙', '', 'e2e-pass', [
  { q: 'q1', a: 'a1' },
  { q: 'q2', a: 'a2' },
  { q: 'q3', a: 'a3' }
]);
const impUser = db.listUsers().find(u => u.name === '导入者丙') || db.listUsers()[0];
const opened = await archpack.openPackFile(packPath);
const applied = await archpack.applyPackImport({
  data: opened.data,
  assetBuf: null,
  strategy: 'nodedup',
  userId: impUser.id
});
ok(applied.created >= 1, `导入新建 ${applied.created} 篇`);
const impRows = db.listPosts({ origin: 'import', limit: 99 });
ok(impRows.length >= 1, 'origin=import 命中导入文档');
// 注：包里 9 篇只有 1 篇是本次显式署名保存的，其余 8 篇来自 db.seed()，其 author_id 本就为空，
// 故不能「全部命中」——按包内 authorName 非空的条目数对齐断言
const expectAuthored = manifest.data.posts.filter(x => x.authorName).length;
const impAll = impRows.map(r => db.getPostRaw(r.id));
const withAuthor = impAll.filter(r => r.origin_author === p0.authorName);
ok(
  expectAuthored >= 1 && withAuthor.length === expectAuthored,
  `包内 ${expectAuthored} 篇有署名 → 导入后 ${withAuthor.length} 篇 origin_author 还原为「${p0.authorName}」`
);
ok(
  impAll.every(r => !!r.imported_at && !!r.imported_from),
  '导入文档均带 imported 标识'
);

/* ---------- 收尾 ---------- */
lanShare.stopShare();
core.closeDb();
try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch (e) {}

console.log(`\n=== lan-copy.e2e: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
