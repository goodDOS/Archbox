'use strict';
/**
 * 本机自拷（Beta.211）：反转 Beta.209 的「禁止本机自拷」决策，改为本机也可拷贝。
 *
 * 为什么要单独一套：
 *   copy-target.e2e 覆盖的是「归属三态」；本机自拷多出一条此前从未走过的真实链路——
 *   源与目标是同一个库、同一条 127.0.0.1 回环。必须用**真监听 + 真 HTTP + 真 IPC**跑一遍，
 *   而不是断言几句源码文本（那是「38/38 全绿但功能没生效」的老坑）。
 *
 * 覆盖：
 *   [0] 夹具：本机共享源 + 一篇文档
 *   [1] 本机自拷真实成功（HTTP 回环 → 落本机库）
 *   [2] 副本带拷贝标识，且是**新行**而非覆盖原文档
 *   [3] 归属三态在本机自拷下同样生效
 *   [4] 能力位：关闭拷贝时被拒（与远端同口径）
 *   [5] 上报不污染「访客/被拷排行」统计（本机自流量须被 isSelfIp 排除）
 *   [6] 前端契约：按钮不再排除本机源
 *
 * 用法：node electron/verify/local-selfcopy.e2e.cjs [ROOT]
 */
const path = require('path');
const Module = require('module');
const os = require('os');
const fs = require('fs');

const ROOT = process.argv[2] || path.join(__dirname, '..', '..');

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

const CFG = fs.mkdtempSync(path.join(os.tmpdir(), 'selfcopy-cfg-'));
const stubPath = path.join(os.tmpdir(), '_selfcopy-stub-' + process.pid + '.js');
fs.writeFileSync(
  stubPath,
  `
const path = require('path')
const CFG = ${JSON.stringify(CFG)}
global.__IPC__ = {}
module.exports = {
  app: { getPath: (k) => path.join(CFG, k), getName: () => '文档盒 Archbox', getVersion: () => 'test',
    isPackaged: false, whenReady: () => Promise.resolve(), on: () => {}, quit: () => {} },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showSaveDialog: async () => ({ canceled: true, filePath: '' }) },
  shell: { openPath: async () => '' },
  BrowserWindow: function () {},
  ipcMain: { handle: (ch, fn) => { global.__IPC__[ch] = fn }, on: () => {} }
}
`
);
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'electron') return stubPath;
  return origResolve.call(this, req, ...rest);
};

/*
 * ★ 通道调用签名陷阱（同 copy-target.e2e）★
 * Electron 侧签名为 ipcMain.handle(ch, (event, payload) => …)，含 shared.handle 包装器：
 *     ipcMain.handle(ch, async (e, p) => { … await fn(p || {}, e) })
 * 故从 global.__IPC__ 取到的函数必须按 (event, payload) 调。
 * 写成 copy(payload) 会让 payload 落进 event 槽、p 变 undefined → 业务守卫误报。
 */
const FAKE_EVENT = { sender: { id: 1 }, senderFrame: { url: 'file://verify' } };
const toRendererCall = fn => payload => fn(FAKE_EVENT, payload);
const unwrap = w => (w && 'data' in w ? w.data : w);

async function main() {
  const db = require(path.join(ROOT, 'electron/db'));
  const core = require(path.join(ROOT, 'electron/db/core'));
  const share = require(path.join(ROOT, 'electron/db/share'));
  const lanShare = require(path.join(ROOT, 'electron/services/lan-share'));

  const dataDir = path.join(CFG, 'userData', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  await db.init(dataDir);
  db.seed();

  console.log('[0] 夹具：本机共享源 + 一篇文档（起真监听）');
  await share.initShare(CFG);
  const srcRegionId = core.insert(
    'INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    ['源大区X', 'SRC', '#8a63d2', 2, core.nowIso(), core.nowIso()]
  );
  const srcCatId = core.insert(
    'INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    [srcRegionId, '源分类Y', 'SRCY', 2, core.nowIso(), core.nowIso()]
  );
  const srcPostId = core.insert(
    'INSERT INTO posts(region_id,category_id,title,content_html,content_text,status,author_id,created_at,updated_at,no) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [
      srcRegionId,
      srcCatId,
      '本机待拷文档',
      '<p>正文</p>',
      '正文',
      'published',
      null,
      core.nowIso(),
      core.nowIso(),
      'SELF-001'
    ]
  );
  share.rebuild([srcRegionId]);

  const PORT = 47800 + Math.floor(Math.random() * 200);
  lanShare.startShare({ port: PORT, token: 'self-token', name: '本机共享', authEnabled: true, allowCopy: true });
  await new Promise(r => setTimeout(r, 300));
  ok(lanShare.isAllowCopy() === true, '本机共享已开放拷贝');

  // 本机源用的地址就是回环 —— 与前端 localSrc 完全一致（ip=127.0.0.1, port=status.port）
  const src = { name: '本机共享', ip: '127.0.0.1', port: PORT, token: 'self-token' };
  const base = { source: src, remotePostId: srcPostId };

  require(path.join(ROOT, 'electron/ipc/lanshare.js')).registerLanShare();
  const copy = toRendererCall(global.__IPC__['lan:copyPost']);
  ok(typeof global.__IPC__['lan:copyPost'] === 'function', 'lan:copyPost 已注册（生产实现）');

  const countPosts = () => core.get('SELECT COUNT(*) AS c FROM posts').c;
  const regionByName = n => core.get('SELECT * FROM regions WHERE name=?', [n]);

  console.log('\n[1] ★ 本机自拷真实成功（127.0.0.1 回环 → 落本机库）');
  const before = countPosts();
  const r1 = unwrap(await copy({ ...base, target: { mode: 'new', regionName: '本机副本', categoryName: '自拷' } }));
  ok(!!r1.id, '本机自拷返回新文档 id=' + r1.id);
  ok(countPosts() === before + 1, '文档数 +1（真的落库了）');
  ok(r1.regionName === '本机副本', '落点大区 = 「本机副本」：' + r1.regionName);

  console.log('\n[2] 副本是**新行**且带拷贝标识（不覆盖原文档）');
  ok(r1.id !== srcPostId, '★ 副本 id 与源文档不同（不是原地覆盖）');
  const orig = core.get('SELECT * FROM posts WHERE id=?', [srcPostId]);
  ok(!!orig, '源文档仍在');
  ok(orig.title === '本机待拷文档', '源文档内容未被改动');
  ok(!orig.copied_at, '源文档没有被误标为「副本」');
  const saved = core.get('SELECT * FROM posts WHERE id=?', [r1.id]);
  ok(!!saved.copied_at, '★ 副本带拷贝标识 copied_at');
  ok(String(saved.no || '') !== String(orig.no || ''), '副本另分配文档编号（未与源编号撞车）');

  console.log('\n[3] 归属三态在本机自拷下同样生效');
  const r2 = unwrap(await copy({ ...base, target: { mode: 'follow' } }));
  ok(r2.regionName === '源大区X', 'follow → 跟随源大区X：' + r2.regionName);
  ok(r2.categoryName === '源分类Y', 'follow → 跟随源分类Y：' + r2.categoryName);
  const r3 = unwrap(await copy({ ...base, target: { mode: 'existing', regionId: 999999, categoryId: null } }));
  ok(r3.regionName === '源大区X', '★ existing 传无效 id → 回退 follow（本机路径同样不静默新建）');
  ok(!regionByName('999999'), '未创建伪大区');

  console.log('\n[4] 能力位：关闭拷贝后本机自拷同样被拒（与远端同口径）');
  lanShare.stopShare();
  lanShare.startShare({ port: PORT, token: 'self-token', name: '本机共享', authEnabled: true, allowCopy: false });
  await new Promise(r => setTimeout(r, 300));
  ok(lanShare.isAllowCopy() === false, '已关闭拷贝能力位');
  const w4 = await copy({ ...base, target: { mode: 'follow' } });
  ok(w4 && w4.ok === false, '关闭后拷贝被拒');
  ok(/未开放文档拷贝/.test(String((w4 && w4.error) || '')), '拒绝理由 = 未开放文档拷贝：' + (w4 && w4.error));

  console.log('\n[5] 本机自流量对统计的影响（口径差异是刻意的）');
  // 访客/浏览量：排除本机 IP（lanVisitorStats / visitorRank 口径）——
  // 本机自浏览不是「有客人来访」，计入会让「今日访客 0」与「127.0.0.1 访问 N 次」自相矛盾。
  const stats = lanShare.lanVisitorStats(7);
  ok(stats.visitor7 === 0, '★ 近 7 日访客数 = 0（127.0.0.1 自流量被 isSelfIp 排除）：' + stats.visitor7);
  ok(stats.postView7 === 0, '★ 近 7 日文档浏览 = 0（同上）：' + stats.postView7);

  // 被拷排行：**计入**本机自拷（用户决策 Beta.211）——
  // 自拷同样是有效的业务动作（确实产生了一份带拷贝标识的副本），
  // 故 copyRank 刻意不排除本机 IP，与 visitorRank 口径不同。这是有意为之，不是漏改。
  const rank = lanShare.copyRank(20);
  ok(Array.isArray(rank), 'copyRank 返回数组');
  ok(rank.length >= 1, '★ 被拷排行**计入**本机自拷（用户决策）：条目数 ' + rank.length);
  const selfRow = rank.find(r => r.postId === srcPostId);
  ok(!!selfRow, '源文档出现在被拷排行中');
  ok(selfRow && selfRow.count >= 1, '被拷次数 ≥ 1：' + (selfRow && selfRow.count));
  ok(
    selfRow && selfRow.actors.length >= 1,
    '拷贝者集合非空（用于甄别是谁拷的）：' + JSON.stringify(selfRow && selfRow.actors)
  );

  lanShare.stopShare();

  console.log('\n[6] 前端契约：按钮不再排除本机源');
  const srcDir = path.join(ROOT, 'src');
  if (fs.existsSync(srcDir)) {
    const lanSrc = fs.readFileSync(path.join(ROOT, 'src/pages/LanShare.vue'), 'utf8');
    ok(!/v-if="!activeSource\.self"/.test(lanSrc), '★ 拷贝按钮不再 v-if 排除本机源');
    ok(/v-if="!activeSource\.allowCopy"/.test(lanSrc), '按钮显隐只看能力位 allowCopy');
    ok(!/无需拷贝/.test(lanSrc), '「无需拷贝」说明已移除');
    const probeBody = (lanSrc.match(/async function probeAllowCopy[\s\S]*?\n\}/) || [''])[0];
    ok(probeBody.length > 0, 'probeAllowCopy 函数体已定位（断言前提）');
    // ★ Beta.213 起本机源**应当**短路 —— 但短路到 status.allowCopy（与设置同源），
    //   而不是像 Beta.209 那样 `return` 掉、把能力位钉死为 false。
    //   区分点：短路后必须赋值 allowCopy，且取值来自 status（本机共享状态）。
    ok(
      /if \(s\.self\)\s*\{\s*s\.allowCopy = !!status\.allowCopy/.test(probeBody),
      '★ 本机源短路到 status.allowCopy（本机设置即真相，不再打多余回环）'
    );
    ok(/A\.lanRequest/.test(probeBody), '远端源仍走 /api/version 免鉴权探针');
  } else {
    console.log('    · 未发现 src/（指向产物运行），跳过源码断言');
  }

  console.log(`\n=========== ${pass} 通过 / ${fail} 失败 ===========`);
  try {
    fs.unlinkSync(stubPath);
  } catch (e) {}
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error('崩溃:', (e && e.stack) || e);
  process.exit(2);
});
