'use strict';
/**
 * 根路径说明页端到端：起真实 HTTP 服务，用真实 fetch 打真实端口。
 *
 * 【起因】用户拿浏览器访问 `http://<ip>:47373/`，看到 `{"error":"not found"}`，
 * 以为服务坏了。真相相反 —— 那个 JSON 恰恰证明服务活着，只是局域共享本来就是
 * 纯 API 服务、没有网页前端（共享内容由「文档盒」客户端自己拉）。
 *
 * 【改法】给根路径单独一支，返回一张人话说明页；其余未知路径保持 404 JSON，
 * 不给扫描器「本端口有网页」的错觉。
 *
 * 【为什么不能只做静态断言】路由分支的顺序、Content-Type 的实际取值、
 * 以及「非 /api/ 的其它路径仍须 404」这三件事，只有起了真服务才验得准：
 * 写在源码里看着对、实际被前面的守卫截胡或响应头被覆盖，静态分析抓不到。
 *
 * 用法：node electron/verify/lan-root-page.e2e.cjs [ROOT]
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

const CFG = fs.mkdtempSync(path.join(os.tmpdir(), 'repro-cfg-root-'));
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'repro-data-root-'));
const PORT = 47413;

const stubPath = path.join(os.tmpdir(), '_repro-stub-root-' + process.pid + '.js');
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

async function main() {
  const db = require(path.join(ROOT, 'electron/db'));
  const keystore = require(path.join(ROOT, 'electron/keystore'));
  const laneShare = require(path.join(ROOT, 'electron/services/lan-share'));
  const pkgVersion = require(path.join(ROOT, 'package.json')).version;

  console.log('\n[0] 建库并开启共享');
  await db.init(DATA);
  db.seed();
  keystore.writeDataDir(DATA);
  const core = require(path.join(ROOT, 'electron/db/core'));
  const rid = core.insert('INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
    '测试大区',
    'T',
    '#8a63d2',
    1,
    core.nowIso(),
    core.nowIso()
  ]);
  // ★ 端口刻意用非默认值：说明页若硬编码 47373，这里就会露馅
  db.setSetting('lan.enabled', '1');
  db.setSetting('lan.port', String(PORT));
  db.setSetting('lan.token', 'TK-ROOT-PAGE');
  db.setSetting('lan.auth', '1');
  db.setSetting('lan.sharedRegions', JSON.stringify([rid]));

  console.log('\n[1] 启动真实共享服务');
  const share = require(path.join(ROOT, 'electron/db/share'));
  await share.initShare(DATA);
  share.rebuild([rid]);
  laneShare.startShare({
    port: PORT,
    token: 'TK-ROOT-PAGE',
    name: '测试主机',
    authEnabled: true,
    allowCopy: false
  });
  await new Promise(r => setTimeout(r, 600));

  console.log('\n[2] 根路径 / —— 必须是 200 + HTML 说明页');
  let res = null,
    text = '',
    ctype = '';
  try {
    res = await fetch(`http://127.0.0.1:${PORT}/`);
    ctype = res.headers.get('content-type') || '';
    text = await res.text();
  } catch (e) {
    console.log('    请求异常：' + e.message);
  }
  ok(res && res.status === 200, `根路径返回 200（实得 ${res && res.status}）`);
  ok(/text\/html/.test(ctype), `Content-Type 为 text/html（实得 ${ctype || '(空)'}）`);
  ok(/<html/i.test(text) && /文档盒/.test(text), '响应体是说明页 HTML，含产品名');
  ok(/服务是正常的/.test(text), '★ 页面开宗明义告知「服务是正常的」——这正是原始误判要消除的');
  ok(!/"error"\s*:\s*"not found"/.test(text), '★ 根路径不再返回 {"error":"not found"}（用户看到的原文已消失）');
  ok(text.includes(pkgVersion), `★ 页面版本号跟着 package.json 走（${pkgVersion}）——硬编码会在发版后说假话`);
  ok(text.includes(String(PORT)), `★ 页面端口来自 lan.port 设置（${PORT}），非硬编码默认值`);
  ok(!text.includes('TK-ROOT-PAGE'), '★ 页面不含访问令牌（无凭证的浏览器场景，绝不能把令牌页面上发出去）');

  // ★ 模板字符串必须完整：反引号里出现裸双引号会提前截断字符串，
  //   残余内容被当 JS 表达式拼接，页面上就会冒出字面的 \n 和游离引号（实测踩到）。
  const styleEnd = text.indexOf('</style>');
  const visible = text.slice(styleEnd > 0 ? styleEnd + 8 : 0);
  ok(!/\\n/.test(visible), '★ 可见正文中无字面 \\n（模板字符串未被裸双引号截断）');
  // 去掉标签与正常换行后，正文首字符不应是游离引号
  const firstChar = visible.replace(/^[\s>]*/, '').charAt(0);
  ok(firstChar !== '"' && firstChar !== "'", `★ 正文不以游离引号开头（实得 ${JSON.stringify(firstChar)}）`);
  // <style> 块自身若被污染，CSS 里会出现字面 \n
  const styleBlock = text.slice(text.indexOf('<style>'), styleEnd);
  ok(!/\\n/.test(styleBlock), '★ <style> 块内也无字面 \\n（CSS 未被换行污染）');

  // ★ charset 声明必须真的有效 ★
  //   浏览器只认 charset=utf-8（无引号）或 charset="utf-8"（双引号）。
  //   charset='utf-8' 不是合法 token；写成 &#39;utf-8&#39; 更糟 ——
  //   实体在属性值里展开成字面单引号，DOM 里变成 charset="'utf-8'"，照样不认。
  ok(/<meta charset=(utf-8|"utf-8")>/i.test(text), '★ charset 用浏览器认得的写法（带引号/实体的写法等同于没声明）');
  ok(!/charset=['"]/.test(text) && !/&#39;/.test(text), 'charset 未使用无效的单引号或实体写法');
  // 中文必须能按 UTF-8 正确往返（乱码的典型形态是 U+FFFD 替换字符）
  ok(!/\uFFFD/.test(text), '★ 响应文本中无替换字符 U+FFFD（中文未乱码）');
  ok(text.includes('访问令牌'), '★ 「访问令牌」一词完整可读（charset 生效的直接证据）');

  // ★ 不得使用内联 <style> ★
  //   Electron 渲染进程带 CSP default-src 'self'，内联样式会被拒绝执行
  //   （控制台报 Refused to apply inline style），页面退化成白底黑字。
  //   提示页只用语义标签即可，不为它放宽产品既有的安全策略。
  ok(!/<style[\s>]/i.test(text), '★ 说明页不含内联 <style>（会被 CSP default-src self 拒绝）');
  ok(!/style\s*=\s*['"]/i.test(text), '说明页不含行内 style 属性（同样受 style-src 约束）');

  console.log('\n[3] 反证：认不出的路径仍须 404 JSON（不能给扫描器「有网页」的错觉）');
  for (const probePath of ['/index.html', '/admin', '/../etc/passwd', '/robots.txt']) {
    let r = null,
      j = null;
    try {
      r = await fetch(`http://127.0.0.1:${PORT}${probePath}`);
      const t = await r.text();
      try {
        j = JSON.parse(t);
      } catch (e) {}
    } catch (e) {}
    ok(r && r.status === 404 && j && j.error === 'not found', `${probePath} → 404 JSON（实得 ${r && r.status}）`);
  }

  console.log('\n[4] 对照：探针路由与 API 路由行为不变');
  let hv = null;
  try {
    hv = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
  } catch (e) {}
  ok(hv && hv.ok === true, '/health 仍返回 200 探针');
  let av = null;
  try {
    av = await (await fetch(`http://127.0.0.1:${PORT}/api/version`)).json();
  } catch (e) {}
  ok(av && av.ok === true, '/api/version 仍 200');
  // 无令牌访问 /api/* 仍须 401 —— 根路径开口子不得顺手放过 API
  let un = null;
  try {
    un = await fetch(`http://127.0.0.1:${PORT}/api/regions`);
  } catch (e) {}
  ok(un && un.status === 401, '★ 无令牌访问 /api/regions 仍 401（加说明页没有放松任何 API 鉴权）');
  // 带令牌必须通 —— 证明 401 是令牌拦的，不是路由坏了
  let wt = null;
  try {
    wt = await (await fetch(`http://127.0.0.1:${PORT}/api/regions?token=TK-ROOT-PAGE`)).json();
  } catch (e) {}
  ok(
    wt && wt.ok === true && Array.isArray(wt.data),
    '★ 带正确令牌后 /api/regions 正常返回（证明上一条的 401 确由令牌造成）'
  );

  console.log('\n[5] 安全底线：全程不带跨域许可');
  let corsRes = null;
  try {
    corsRes = await fetch(`http://127.0.0.1:${PORT}/`);
  } catch (e) {}
  ok(
    corsRes && !corsRes.headers.get('access-control-allow-origin'),
    '★ 根路径响应也不带 Access-Control-Allow-Origin（任意网页读不到本服务）'
  );

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
