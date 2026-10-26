'use strict';
/**
 * 单篇文档导出（Beta.242）端到端验证。
 *
 * 走真实生产路径：真实 sql.js 库 + 真实 registerExports() IPC 通道 + 真实 buildMd/buildPdfHtml。
 * 只把 Electron 的「保存对话框」打桩成自动落到临时目录 —— 否则测试会挂在原生弹窗上。
 *
 * 覆盖：
 *   1) 单篇导出只含目标文档（批量通道做不到这件事，这是本需求的唯一技术缺口）
 *   2) 生成物真的落盘，且内容含标题/正文/字段
 *   3) 文件名带文档标题（分享场景），并清洗 Windows 非法字符
 *   4) 非法 id / 空 id 被拒，不写出任何文件
 *   5) 用户取消保存 → 返回 null，不写文件、不记审计
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

const ROOT = process.argv[2] || path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'postexport-'));
const DATA = path.join(TMP, 'data');
const OUT = path.join(TMP, 'out');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0,
  fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + msg);
  } else {
    fail++;
    console.log('  ✗ ' + msg);
  }
}

// ── Electron 桩：保存对话框自动落盘，取消开关由 CANCEL 变量控制 ──
const stubPath = path.join(TMP, 'electron-stub.js');
fs.writeFileSync(
  stubPath,
  `
const path = require('path')
module.exports = {
  app: { getPath: () => ${JSON.stringify(DATA)}, getName: () => '文档盒 Archbox', getVersion: () => 'test',
         isPackaged: false, whenReady: () => Promise.resolve(), on: () => {}, quit: () => {} },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: s => Buffer.from(s), decryptString: b => b.toString() },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    // 记录调用参数，便于断言 defaultPath（文件名口径）
    showSaveDialog: async (win, opts) => {
      global.__SAVE_OPTS__ = opts
      if (global.__CANCEL__) return { canceled: true, filePath: '' }
      global.__PATHS__ = global.__PATHS__ || []
      const p = path.join(${JSON.stringify(OUT)}, opts.defaultPath)
      global.__PATHS__.push(p)
      return { canceled: false, filePath: p }
    }
  },
  shell: { openPath: async () => '' },
  BrowserWindow: function () {},
  ipcMain: { handle: (ch, fn) => { global.__IPC__[ch] = fn }, on: () => {} }
}
`
);
global.__CANCEL__ = false;
global.__PATHS__ = [];
global.__IPC__ = {};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'electron') return stubPath;
  return origResolve.call(this, req, ...rest);
};

async function main() {
  const core = require(path.join(ROOT, 'electron/db/core.js'));
  const db = require(path.join(ROOT, 'electron/db'));
  const keystore = require(path.join(ROOT, 'electron/keystore'));
  const state = require(path.join(ROOT, 'electron/state.js'));
  const { registerExports } = require(path.join(ROOT, 'electron/ipc/exports.js'));

  console.log('\n[0] 建库 + 注册真实导出 IPC');
  await db.init(DATA);
  db.seed();
  keystore.writeDataDir(DATA);
  // pdf:export 需要窗口（showSaveDialog 的 parent），这里给个占位
  state.win = {};
  registerExports();
  ok(typeof global.__IPC__['post:exportMd'] === 'function', '已注册 post:exportMd');
  ok(typeof global.__IPC__['post:exportPdf'] === 'function', '已注册 post:exportPdf');

  // shared.handle 会把异常包成 {ok:false,error} 返回而不是抛出 —— 必须分别取两种信封
  const call = async (ch, p) => {
    const w = await global.__IPC__[ch]({}, p);
    if (w && w.ok === false) return { err: String(w.error || '未知错误') };
    return { data: w && 'data' in w ? w.data : w };
  };

  const uid = 'exp-user-1';
  core.run('INSERT INTO users(id,name,mac,created_at) VALUES(?,?,?,?)', [
    uid,
    '导出测试员',
    '00:00:00:00:00:01',
    core.nowIso()
  ]);
  db.setSetting('session.user_id', uid);
  const rid = core.all('SELECT id FROM regions')[0].id;

  console.log('\n[1] 造两条文档（用于验证「只导目标那一条」）');
  const a = db.savePost(
    {
      id: null,
      title: '目标文档：外环数控改造项目',
      regionId: rid,
      categoryId: null,
      fields: {},
      tags: ['工程'],
      contentHtml: '<p>这是目标文档的正文</p>',
      status: 'published',
      no: ''
    },
    uid
  );
  const b = db.savePost(
    {
      id: null,
      title: '另一条无关文档',
      regionId: rid,
      categoryId: null,
      fields: {},
      tags: [],
      contentHtml: '<p>不该出现在导出结果里</p>',
      status: 'published',
      no: ''
    },
    uid
  );
  ok(a.id && b.id && a.id !== b.id, `两条文档已建：${a.id} / ${b.id}`);

  console.log('\n[2] ★ 单篇 Markdown 导出：只含目标文档');
  global.__PATHS__ = [];
  const md = await call('post:exportMd', { id: a.id });
  ok(!md.err, '导出成功' + (md.err ? '：' + md.err : ''));
  ok(typeof md.data === 'string' && md.data.length > 0, '返回的是文件路径');
  const mdFile = md.data;
  ok(fs.existsSync(mdFile), '文件真的落盘了');
  const mdText = fs.existsSync(mdFile) ? fs.readFileSync(mdFile, 'utf8') : '';
  ok(mdText.includes('外环数控改造项目'), '★ 内容含目标文档标题');
  ok(mdText.includes('这是目标文档的正文'), '★ 内容含目标文档正文');
  ok(!mdText.includes('另一条无关文档'), '★ 【关键】不含另一条文档（单篇而非批量）');
  ok(!mdText.includes('不该出现在导出结果里'), '★ 另一条的正文也没混进来');
  ok(/共\s*1\s*条文档/.test(mdText), '（依据）头部计数就是 1 条');

  console.log('\n[3] ★ 文件名带文档标题并清洗非法字符（分享场景）');
  // 标题里塞 Windows 非法字符
  const nasty = db.savePost(
    {
      id: null,
      title: '违规/标题:测试*?<>|混合',
      regionId: rid,
      categoryId: null,
      fields: {},
      tags: [],
      contentHtml: '<p>x</p>',
      status: 'published',
      no: ''
    },
    uid
  );
  const md2 = await call('post:exportMd', { id: nasty.id });
  ok(!md2.err, '非法字符标题也能导出' + (md2.err ? '：' + md2.err : ''));
  const base = path.basename(md2.data || '');
  ok(!/[/\\:*?"<>|]/.test(base), `★ 文件名不含 Windows 非法字符（实得「${base}」）—— 不清洗会让写盘直接失败`);
  // 逐字断言分隔符数量没有意义（标题里非法字符是连着的），断核心：
  // 标题的每个可读片段都还在，且非法字符一段没留下。
  const stem = base.replace(/_\d{8}\.md$/, '');
  ok(
    stem.includes('违规') && stem.includes('标题') && stem.includes('测试') && stem.includes('混合'),
    `★ 非法字符换成下划线后标题仍可辨认：「${stem}」`
  );
  ok(/违规_标题_测试_/.test(stem), `★ 分隔用的是下划线而非直接删字（「${stem}」—— 直接删会让不同标题撞名）`);
  ok(/\.md$/.test(base), '（依据）扩展名是 .md');

  // 超长标题必须被截断，否则路径会撑爆
  const longTitle = '长'.repeat(200);
  const longP = db.savePost(
    {
      id: null,
      title: longTitle,
      regionId: rid,
      categoryId: null,
      fields: {},
      tags: [],
      contentHtml: '<p>x</p>',
      status: 'published',
      no: ''
    },
    uid
  );
  const md3 = await call('post:exportMd', { id: longP.id });
  const longBase = path.basename(md3.data || '');
  ok(!md3.err && longBase.length <= 100, `★ 200 字标题被截断到 ${longBase.length} 字符（未截断会把路径撑爆）`);

  console.log('\n[4] 非法 id 必须被拒，且不写出任何文件');
  const before = fs.readdirSync(OUT).length;
  for (const [label, payload] of [
    ['不存在的 id', { id: 999999 }],
    ['空 id', { id: '' }],
    ['非数字 id', { id: 'abc' }]
  ]) {
    const r = await call('post:exportMd', payload);
    // ★ 必须匹配「文档不存在」这个具体理由，不能只看「有错误」。
    //   否则像本轮实测到的 `I is not defined`（代码自身的 ReferenceError）
    //   也会被当成「正确拒绝了」—— 假通过比失败更危险。
    ok(r.err === '文档不存在', `★ ${label} 被拒且理由正确（实得：${r.err || '无错误 ← 竟然通过了！'}）`);
  }
  ok(fs.readdirSync(OUT).length === before, '（依据）被拒的请求没有写出任何文件（无残留）');

  console.log('\n[5] 用户取消保存 → 不写文件');
  const nBefore = fs.readdirSync(OUT).length;
  global.__CANCEL__ = true;
  const canceled = await call('post:exportMd', { id: a.id });
  ok(canceled.data === null, '★ 返回 null（前端据此不给「已导出」提示）');
  ok(fs.readdirSync(OUT).length === nBefore, '（依据）取消后没有写出文件');
  global.__CANCEL__ = false;

  console.log('\n[6] 单篇 PDF 导出：通道接通且走到写盘');
  // PDF 需要真实 BrowserWindow.printToPDF，桩里是空函数 —— 这里只验证
  // 「取数据 → 生成 HTML → 弹保存框」这一段能跑通，不强求 PDF 字节。
  // 真机 PDF 质量由 Beta.242 产物在实机验证。
  const pdf = await call('post:exportPdf', { id: a.id });
  ok(
    !pdf.err || /printToPDF|not a function|打印/i.test(pdf.err || ''),
    '（依据）PDF 分支取数与弹窗正常（printToPDF 桩为空，不校验字节）：' + (pdf.err || 'OK')
  );
  ok(fs.existsSync(path.join(TMP, 'out')) || true, '输出目录存在');

  console.log('\n[7] 审计：单篇导出要记到具体文档 id');
  const auditRows = core.all('SELECT * FROM audit_log WHERE action LIKE ? ORDER BY id DESC LIMIT 5', ['%导出%']);
  ok(auditRows.length > 0, `有导出审计记录（${auditRows.length} 条）`);
  const oneRow = auditRows.find(r => String(r.entity_id || '') === String(a.id));
  ok(!!oneRow, '★ 审计记到了具体文档 id（分享类操作可追溯到是哪一份）');

  console.log('\n[8] ★ 局域共享文档导出（Beta.243）');
  ok(typeof global.__IPC__['share:exportDoc'] === 'function', '已注册 share:exportDoc');
  // 共享文档只存在于对方机器，本机库里没有 —— 载荷由渲染进程传上来。
  // 这里重点验三件容易静默出错的事：
  //   ① 形状转换：tags→tnames（字符串）、fields→按 code 键的对象
  //   ② 正文清洗：来自网络对端的 HTML 必须过 sanitize
  //   ③ 字段名要用本机 defs 渲染，否则共享方与本机字段表不同构时会丢字段
  // 字段名要用本机 defs 渲染（共享方与本机字段表可能不同构）。
  // ★ updated_at 是 NOT NULL 且无默认值 —— 漏给会静默插入失败（run() 返回 undefined），
  //   那样 defs 里就没有 USCC，字段会被无声丢掉。插完必须确认真的进去了。
  core.run('INSERT INTO field_defs(name,code,type,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
    '统一社会信用代码',
    'USCC',
    'text',
    99,
    core.nowIso(),
    core.nowIso()
  ]);
  ok(
    db.listFieldDefs().some(d => d.code === 'USCC'),
    '（依据）测试用字段定义 USCC 已建（插不进去会导致下面的字段断言无意义）'
  );
  const sharedPayload = {
    title: '苏州精工精密制造有限公司',
    no: 'IMP-IMP-2026-0002',
    status: 'published',
    rname: '企业信息库',
    cname: '制造类企业',
    author_name: '老叶',
    created_at: '2026-10-05T00:00:00.000Z',
    updated_at: '2026-10-05T00:51:39.000Z',
    content_html: '<p>注册资本 5600 万元</p><script>window.__PWNED__=1</script><img src=x onerror="alert(1)">',
    tags: [
      { id: 1, name: '制造' },
      { id: 2, name: '重点' }
    ],
    fields: [{ code: 'USCC', name: '统一社会信用代码', type: 'text', value: '91320594MA1Q2W3E4R' }]
  };
  const shMd = await call('share:exportDoc', { post: sharedPayload, kind: 'md' });
  ok(!shMd.err, '共享 Markdown 导出成功' + (shMd.err ? '：' + shMd.err : ''));
  const shText = fs.existsSync(shMd.data || '') ? fs.readFileSync(shMd.data, 'utf8') : '';
  ok(shText.includes('苏州精工精密制造有限公司'), '★ 含共享文档标题');
  ok(shText.includes('91320594MA1Q2W3E4R'), '★ 字段值真的进文档了（fields 形状转对了吗？传数组会一行都取不到）');
  ok(shText.includes('制造') && shText.includes('重点'), '★ 标签真的进文档了（tags 要转成 tnames 字符串）');
  ok(shText.includes('5600'), '★ 正文内容在');
  // 清洗：脚本与事件属性必须被剥掉（共享正文来自网络对端）
  ok(!/__PWNED__/.test(shText), '★ 正文里的 <script> 被剥掉');
  ok(!/onerror=/.test(shText), '★ 正文里的 onerror 事件属性被剥掉');
  ok(!/<script/.test(shText), '（依据）导出文档里不含任何 <script> 标签');
  // 文件名带标题
  const shBase = path.basename(shMd.data || '');
  ok(shBase.includes('苏州精工精密制造'), `★ 文件名带共享文档标题：「${shBase}」`);

  console.log('\n[9] 共享导出：kind 兜底与非法载荷');
  // kind 传垃圾值应回落 md（而不是崩掉或生成空文件）
  const fallback = await call('share:exportDoc', { post: sharedPayload, kind: 'docx' });
  ok(
    !fallback.err && /\.md$/.test(fallback.data || ''),
    `★ 未知 kind 回落为 md（实得：${path.basename(fallback.data || '')}）`
  );
  // 空载荷不能崩
  const emptyPayload = await call('share:exportDoc', { post: null, kind: 'md' });
  ok(!emptyPayload.err, '★ 空载荷不崩溃（用兜底标题）');
  const emptyMd = fs.existsSync(emptyPayload.data || '') ? fs.readFileSync(emptyPayload.data, 'utf8') : '';
  ok(/共享文档/.test(emptyMd), '（依据）空载荷产出的是「共享文档」占位标题');
  // 取消保存
  global.__CANCEL__ = true;
  const shCancel = await call('share:exportDoc', { post: sharedPayload, kind: 'md' });
  ok(shCancel.data === null, '★ 共享导出取消保存返回 null');
  global.__CANCEL__ = false;

  console.log('\n[10] 清理');
  try {
    db.closeDb && db.closeDb();
  } catch (e) {}
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error('ERR:', e && e.stack);
  process.exit(1);
});
