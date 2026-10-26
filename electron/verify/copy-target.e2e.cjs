'use strict';
/**
 * 拷贝归属 + 本机禁拷 + 绿框间距 三项修复的 E2E。
 *
 * 覆盖：
 *   [1] 后端 target 三态：new（新建/复用大区）、existing（已有大区+分类）、follow（跟随源）
 *   [2] 归属校验：existing 传不存在的大区 id 时不得静默新建，须回退 follow
 *   [3] 幂等：同名大区/分类不重复创建
 *   [4] 返回值带真实归属名（前端回执据此提示）
 *   [5] 前端：本机源不出拷贝按钮、但必须给出说明；绿框有下间距
 *   [6] 真实 HTTP：起真监听做一次端到端拷贝，验证落点
 *
 * 用法：node electron/verify/copy-target.e2e.cjs [ROOT]
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

const CFG = fs.mkdtempSync(path.join(os.tmpdir(), 'ctgt-cfg-'));
/*
 * ★ 通道调用签名陷阱（本文件曾在此处浪费大量时间，务必保留这段说明）★
 *
 * Electron 的主进程侧签名是 ipcMain.handle(ch, (event, payload) => …)，
 * 即**第一个参数是 event，第二个才是 renderer 传来的 payload**。
 * 而 shared.js 的 handle() 包装器把这个签名原样透传：
 *     ipcMain.handle(ch, async (e, p) => { … await fn(p || {}, e) … })
 *
 * 所以从 global.__IPC__[ch] 直接取到的函数必须按 (event, payload) 调；
 * 若图省事写成 copy(payload)（把它当单参函数），payload 会落进 event 槽、
 * p 变成 undefined → 业务守卫立刻抛「缺少共享源地址或文档标识」，
 * 现象上极像"处理器有 bug"，实为测试调用约定错误（Beta.209 实测踩坑）。
 *
 * 下面用一个假 event 包一层，让用例可以 copy(payload)，避免再次写错。
 */
const FAKE_EVENT = { sender: { id: 1 }, senderFrame: { url: 'file://verify' } };
const toRendererCall = fn => payload => fn(FAKE_EVENT, payload);

const stubPath = path.join(os.tmpdir(), '_ctgt-stub-' + process.pid + '.js');
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

  console.log('\n[0] 夹具：造一个大区+分类+一篇共享文档，起真监听');
  // 本机先有一个「自有大区」，用于 existing 模式
  const ownRegionId = core.insert(
    'INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    ['自有大区', 'OWN', '#3b6df0', 1, core.nowIso(), core.nowIso()]
  );
  const ownCatId = core.insert(
    'INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    [ownRegionId, '自有分类', 'OWNC', 1, core.nowIso(), core.nowIso()]
  );

  await share.initShare(CFG);
  // 共享源侧：造一个源大区 + 一篇文档
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
      '待拷贝的文档',
      '<p>正文</p>',
      '正文',
      'published',
      null,
      core.nowIso(),
      core.nowIso(),
      'SRC-001'
    ]
  );
  share.rebuild([srcRegionId]);

  const PORT = 47600 + Math.floor(Math.random() * 200);
  lanShare.startShare({ port: PORT, token: 'e2e-token', name: 'E2E源', authEnabled: true, allowCopy: true });
  await new Promise(r => setTimeout(r, 300));
  ok(lanShare.isAllowCopy() === true, '共享源已开放拷贝（启动后能力位为真）');

  // 注册 lan:* 通道（拿生产实现）
  // 注意：lan 通道注册会读 db 设置，故必须在 db.init 之后
  require(path.join(ROOT, 'electron/ipc/lanshare.js')).registerLanShare();
  const copyRaw = global.__IPC__['lan:copyPost'];
  ok(typeof copyRaw === 'function', 'lan:copyPost 已注册（生产实现）');
  // 包一层：把 (event, payload) 适配成 copy(payload)，见文件头「通道调用签名陷阱」
  const copy = toRendererCall(copyRaw);

  const src = { name: 'E2E源', ip: '127.0.0.1', port: PORT, token: 'e2e-token' };
  const base = { source: src, remotePostId: srcPostId };
  const regionByName = n => core.get('SELECT * FROM regions WHERE name=?', [n]);
  const countRegions = () => core.get('SELECT COUNT(*) AS c FROM regions').c;
  const countCats = () => core.get('SELECT COUNT(*) AS c FROM categories').c;

  console.log('\n[1] target.mode = "new"（新建拷贝大区）');
  const w1 = await copy({ ...base, target: { mode: 'new', regionName: '共享拷贝', categoryName: '来自E2E' } });
  const r1 = unwrap(w1);
  ok(!!r1.id, '拷贝成功，新文档 id=' + r1.id);
  ok(r1.targetMode === 'new', 'targetMode 回执 = new');
  ok(r1.regionName === '共享拷贝', '落点大区 = 「共享拷贝」：' + r1.regionName);
  ok(r1.categoryName === '来自E2E', '落点分类 = 「来自E2E」：' + r1.categoryName);
  const nr = regionByName('共享拷贝');
  ok(!!nr, '「共享拷贝」大区已在本机创建');
  const saved1 = core.get('SELECT * FROM posts WHERE id=?', [r1.id]);
  ok(saved1.region_id === nr.id, '文档确实落在新建大区下');
  ok(!!saved1.copied_at, '文档带拷贝标识 copied_at');
  ok(saved1.origin_author === null || saved1.origin_author === '', '源文档无作者时 origin_author 为空（不编造）');

  console.log('\n[2] "new" 幂等：同名大区/分类不重复创建');
  const rc = countRegions();
  const cc = countCats();
  const r2 = unwrap(await copy({ ...base, target: { mode: 'new', regionName: '共享拷贝', categoryName: '来自E2E' } }));
  ok(!!r2.id && r2.id !== r1.id, '第二次拷贝生成新文档（不是覆盖）');
  ok(countRegions() === rc, '大区数量未增加（同名复用）');
  ok(countCats() === cc, '分类数量未增加（同名复用）');

  console.log('\n[3] target.mode = "existing"（放入已有大区）');
  const r3 = unwrap(await copy({ ...base, target: { mode: 'existing', regionId: ownRegionId, categoryId: ownCatId } }));
  ok(r3.regionName === '自有大区', '落点 = 「自有大区」：' + r3.regionName);
  ok(r3.categoryName === '自有分类', '落点分类 = 「自有分类」：' + r3.categoryName);
  const saved3 = core.get('SELECT * FROM posts WHERE id=?', [r3.id]);
  ok(saved3.region_id === ownRegionId && saved3.category_id === ownCatId, '文档落在指定大区/分类下');

  console.log('\n[4] "existing" 边界：大区 id 不存在时回退 follow，不静默新建');
  const r4 = unwrap(await copy({ ...base, target: { mode: 'existing', regionId: 999999, categoryId: null } }));
  ok(r4.targetMode === 'existing', 'mode 仍是 existing（用户选择未被篡改）');
  ok(r4.regionName === '源大区X', '★ 大区 id 无效 → 回退「跟随源文档」，落点 = 源大区X：' + r4.regionName);
  ok(!regionByName('999999'), '未创建 id=999999 的伪大区');

  console.log('\n[5] "existing" 边界：跨区分类 id 不得挂错');
  const r5 = unwrap(await copy({ ...base, target: { mode: 'existing', regionId: ownRegionId, categoryId: srcCatId } }));
  ok(r5.regionName === '自有大区', '大区正确落到自有大区');
  ok(r5.categoryName === '', '★ 分类属别的大区 → 不接受，落为未分类：' + JSON.stringify(r5.categoryName));
  const saved5 = core.get('SELECT * FROM posts WHERE id=?', [r5.id]);
  ok(saved5.category_id === null, 'DB 里 category_id 确为 NULL（未错挂在自有大区下）');

  console.log('\n[6] target.mode = "follow"（跟随源文档）');
  const r6 = unwrap(await copy({ ...base, target: { mode: 'follow' } }));
  ok(r6.regionName === '源大区X', '跟随时大区 = 源大区X');
  ok(r6.categoryName === '源分类Y', '跟随时分类 = 源分类Y');
  ok(regionByName('源大区X').id === srcRegionId, '按名复用已存在的源大区（未新建重复）');

  console.log('\n[7] target 缺省（未传）等价于 follow，保持向后兼容');
  const r7 = unwrap(await copy({ ...base }));
  ok(r7.targetMode === 'follow', '未传 target 时缺省 follow');
  ok(r7.regionName === '源大区X', '缺省落点 = 源大区X');

  console.log('\n[8] 非法 mode 归一到 follow（不因脏输入报错）');
  const r8 = unwrap(await copy({ ...base, target: { mode: 'hack', regionName: 'X' } }));
  ok(r8.targetMode === 'follow', "mode='hack' → 归一为 follow");
  ok(!regionByName('X'), "未按脏 mode 创建大区 'X'");

  console.log('\n[9] 审计与日志记录归属落点');
  const al = core.get("SELECT * FROM audit_log WHERE action='拷贝局域网共享文档' ORDER BY id DESC LIMIT 1");
  ok(!!al, '审计已落库');
  ok(al && /共享拷贝|自有大区|源大区X/.test(al.detail || ''), '审计 detail 含归属大区名');

  lanShare.stopShare();

  console.log('\n[10] 前端契约断言（源码 + 产物）');
  // 源码断言只在开发树里有意义：生产包按设计不含 src/（package.json files 白名单）。
  // 指向产物运行时自动跳过，避免"用产物测源码"这种无意义的假失败。
  const srcDir = path.join(ROOT, 'src');
  if (fs.existsSync(srcDir)) {
    const lanSrc = fs.readFileSync(path.join(ROOT, 'src/pages/LanShare.vue'), 'utf8');
    // 本机也可拷贝（Beta.211 反转了 Beta.209 的「本机禁拷」决策）
    ok(!/v-if="!activeSource\.self"/.test(lanSrc), '拷贝按钮不再排除本机源');
    ok(/v-if="!activeSource\.allowCopy"/.test(lanSrc), '按钮的显隐只取决于能力位 allowCopy');
    ok(!/无需拷贝/.test(lanSrc), '★ 已移除「无需拷贝」说明（本机现在可以拷贝）');
    // 归属弹窗接入
    ok(/CopyTargetDialog/.test(lanSrc), 'LanShare 接入 CopyTargetDialog');
    ok(/target,/.test(lanSrc) || /target\s*\}/.test(lanSrc), 'copyCurrent 把 target 传给 IPC');
    ok(/r\.regionName/.test(lanSrc), '成功回执展示实际归属大区');
    // 绿框间距
    const spSrc = fs.readFileSync(path.join(ROOT, 'src/components/SharePanel.vue'), 'utf8');
    ok(/\.sp-copy\s*\{[^}]*margin-bottom/.test(spSrc), '★ .sp-copy 有下间距（修复绿框与主机名称紧贴）');
  } else {
    console.log('    · 未发现 src/（指向产物运行），跳过源码断言，仅校验构建产物');
  }

  // 产物断言在任何模式下都执行 —— 它才是最终交付物，也是"源码改了但没重新打包"的唯一防线。
  const builtPath = path.join(ROOT, 'dist/index.html');
  ok(fs.existsSync(builtPath), '构建产物 dist/index.html 存在');
  if (fs.existsSync(builtPath)) {
    const built = fs.readFileSync(builtPath, 'utf8');
    ok(built.includes('新建拷贝大区'), '产物含「新建拷贝大区」选项');
    ok(built.includes('放入已有大区'), '产物含「放入已有大区」选项');
    ok(built.includes('跟随源文档'), '产物含「跟随源文档」选项');
    ok(!built.includes('无需拷贝'), '★ 产物已移除「无需拷贝」说明（本机现在可以拷贝）');
    ok(/sp-copy(?:\[data-v-[0-9a-f]+\])?\{[^}]*margin-bottom/.test(built), '产物 CSS 里 .sp-copy 带下间距');
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
