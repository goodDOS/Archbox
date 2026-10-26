'use strict';
/**
 * 能力位端到端：开启拷贝权限后，本机源与远端源都能正确探到「已开放拷贝」（Beta.213）。
 *
 * 【真实事故】用户开启「允许他人拷贝文档」后，打开本机源里的一篇文档，
 * 「拷贝到本机」按钮仍是灰的，并显示「该共享源未开放拷贝」。
 *
 * 【根因】响应信封不一致：
 *   · 所有 /api/* 路由都回 `{ ok:true, data }`，客户端（ipc/lanshare.js 的 lan:request）
 *     统一解包 `json.data`；
 *   · 唯独 /api/version 把能力位平铺在顶层（ok/app/version/allowCopy），没有 data 字段；
 *   · 于是 lanRequest 返回 undefined → 前端 `v.allowCopy` = undefined → 按钮置灰。
 *   同一个错位还让 lan:copyPost 的 reqJson 读 `cap.allowCopy` 得到 undefined，
 *   把真实拷贝也误判为「未开放拷贝」。
 *
 * 【为什么既有测试没抓到】local-selfcopy 只验证了「服务端能力位真的开着」
 * （lanShare.isAllowCopy()）与「前端源码里按钮不再排除本机源」，
 * 唯独没有把两者之间的**通道**接起来跑一遍。本测试专补这一环：
 * 起真实 HTTP 服务 → 走真实 lan:request IPC → 按前端同款方式读取能力位。
 *
 * 用法：node electron/verify/api-version-envelope.e2e.cjs [ROOT]
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

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

const CFG = fs.mkdtempSync(path.join(os.tmpdir(), 'repro-cfg-'));
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'repro-data-'));

const stubPath = path.join(os.tmpdir(), '_repro-stub-' + process.pid + '.js');
fs.writeFileSync(
  stubPath,
  `
const path = require('path')
const CFG = ${JSON.stringify(CFG)}
const DATA = ${JSON.stringify(DATA)}
global.__IPC__ = {}
module.exports = {
  app: {
    getPath: (k) => path.join(CFG, k),
    getName: () => '文档盒 Archbox',
    getVersion: () => 'test',
    isPackaged: false,
    whenReady: () => Promise.resolve(),
    on: () => {}, quit: () => {}
  },
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

const FAKE_EVENT = { sender: { id: 1 }, senderFrame: { url: 'file://verify' } };
const unwrap = w => (w && 'data' in w ? w.data : w);

async function main() {
  const db = require(path.join(ROOT, 'electron/db'));
  const keystore = require(path.join(ROOT, 'electron/keystore'));
  const laneShare = require(path.join(ROOT, 'electron/services/lan-share'));

  console.log('\n[0] 建库并开启共享 + 开启拷贝');
  await db.init(DATA);
  db.seed();
  keystore.writeDataDir(DATA);
  // 造一个大区供共享
  const core = require(path.join(ROOT, 'electron/db/core'));
  const rid = core.insert('INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
    '测试大区',
    'T',
    '#8a63d2',
    1,
    core.nowIso(),
    core.nowIso()
  ]);
  db.setSetting('lan.enabled', '1');
  db.setSetting('lan.port', '47399');
  db.setSetting('lan.token', 'TK-REPRO');
  db.setSetting('lan.auth', '1');
  db.setSetting('lan.sharedRegions', JSON.stringify([rid]));
  db.setSetting('lan.allowCopy', '1'); // ★ 用户已开启拷贝权限
  ok(db.getSetting('lan.allowCopy') === '1', 'lan.allowCopy 已置为 1');

  console.log('\n[1] 启动真实共享（模拟 restartShare 的入参）');
  const share = require(path.join(ROOT, 'electron/db/share'));
  await share.initShare(DATA);
  share.rebuild([rid]);
  laneShare.startShare({
    port: 47399,
    token: 'TK-REPRO',
    name: '测试主机',
    authEnabled: true,
    allowCopy: true // ★ 与 isAllowCopy() 同源
  });
  await new Promise(r => setTimeout(r, 600));
  ok(laneShare.isAllowCopy() === true, 'lan-share 运行时能力位 allowCopy = true');

  console.log('\n[2] /api/version 原始响应：必须是标准信封 { ok, data }');
  let v = null,
    err = null;
  try {
    const res = await fetch('http://127.0.0.1:47399/api/version');
    v = await res.json();
  } catch (e) {
    err = e;
  }
  ok(!err, '回环 /api/version 可访问' + (err ? '：' + err.message : ''));
  ok(v && v.ok === true, '顶层 ok = true');
  ok(v && v.data && typeof v.data === 'object', '★ 顶层带 data 信封（客户端统一解包 json.data）');
  ok(
    v && v.data && v.data.allowCopy === true,
    '★ data.allowCopy = ' + (v && v.data && v.data.allowCopy) + '（信封修好后才拿得到）'
  );
  // 兼容性：老客户端直接读顶层也能继续工作
  ok(v && v.allowCopy === true, '顶层仍保留 allowCopy（curl 自查 / 老客户端兼容）');
  ok(v && typeof v.version === 'string' && v.version.length > 0, '顶层 version 字段仍在：' + (v && v.version));

  console.log('\n[3] ★ 走前端同款通道 lan:request —— 事故就在这一环');
  const { registerLanShare } = require(path.join(ROOT, 'electron/ipc/lanshare.js'));
  registerLanShare();
  const lanRequest = global.__IPC__['lan:request'];
  ok(typeof lanRequest === 'function', 'lan:request 已注册');
  // 前端调用形态：fn(FAKE_EVENT, payload)
  let probe = null,
    probeErr = null;
  try {
    probe = unwrap(
      await lanRequest(FAKE_EVENT, {
        url: 'http://127.0.0.1:47399/api/version',
        token: ''
      })
    );
  } catch (e) {
    probeErr = e;
  }
  ok(!probeErr, 'lan:request 回环探针不抛异常' + (probeErr ? '：' + probeErr.message : ''));
  ok(probe !== undefined, '★ lan:request 返回的不是 undefined（信封校验生效）');
  ok(
    probe && probe.allowCopy === true,
    '★ 经 lan:request 拿到的 allowCopy=' +
      (probe && probe.allowCopy) +
      (probe && probe.allowCopy !== true ? '  ← 前端会据此显示「该共享源未开放拷贝」' : '')
  );
  // 前端 probeAllowCopy 的原式判定：s.allowCopy = !!(v && v.allowCopy)
  ok(!!(probe && probe.allowCopy) === true, '★ 前端式判定 !!(v && v.allowCopy) 为 true → 按钮可点');

  console.log('\n[4] 反证：关掉拷贝后探针必须变 false（证明能力位确实是活的）');
  laneShare.setAllowCopy(false);
  let v2 = null,
    p2 = null;
  try {
    v2 = await (await fetch('http://127.0.0.1:47399/api/version')).json();
  } catch (e) {}
  ok(v2 && v2.data && v2.data.allowCopy === false, '关闭后 data.allowCopy=false（能力位可实时切换）');
  try {
    p2 = unwrap(await lanRequest(FAKE_EVENT, { url: 'http://127.0.0.1:47399/api/version', token: '' }));
  } catch (e) {}
  ok(!!(p2 && p2.allowCopy) === false, '★ 关闭后前端式判定为 false → 按钮置灰（不会误开放）');
  laneShare.setAllowCopy(true);

  laneShare.stopShare();
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
