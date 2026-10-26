'use strict';
/**
 * 迁移：目标目录落在源目录**内部**时的「原地移入」（Beta.212）。
 *
 * 【真实事故】用户从旧结构 `D:\文档盒 Archbox`（archive.db 直接在这层）
 * 迁到同盘新结构，目标 = `D:\文档盒 Archbox\data`，恰好是源的子目录。原实现走
 *   fsp.cp(from, dir, { recursive: true })
 * 被 Windows 直接拒绝：
 *   EINVAL (cannot copy \\?\D:\文档盒 Archbox to a subdirectory of self
 *           \\?\D:\文档盒 Archbox\data)
 * 把一个目录递归复制进它自己的子目录在语义上就不成立（会无限递归），
 * 但用户意图完全正当（"把数据收进 data 子文件夹"），不能报错了事。
 *
 * 【为什么必须真跑】路径包含关系依赖平台解析（Windows 盘符 / 反斜杠 / \\?\ 前缀），
 * 纯静态断言证明不了；且"搬完数据还在不在"只能看盘。故本测试起真实模块、
 * 走真实 storage:choose 处理器，最后**逐文件核对盘上落点**。
 *
 * 用法：node electron/verify/storage-nested-move.e2e.cjs [ROOT]
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

const CFG = fs.mkdtempSync(path.join(os.tmpdir(), 'nested-cfg-'));
// PICK 模拟用户的 D:\ —— 旧结构落在 PICK/文档盒 Archbox，新结构落在 PICK/文档盒 Archbox/data
const PICK = fs.mkdtempSync(path.join(os.tmpdir(), 'nested-pick-'));

const stubPath = path.join(os.tmpdir(), '_nested-stub-' + process.pid + '.js');
fs.writeFileSync(
  stubPath,
  `
const path = require('path')
const CFG = ${JSON.stringify(CFG)}
const PICK = ${JSON.stringify(PICK)}
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
  dialog: {
    showOpenDialog: async () => ({ canceled: false, filePaths: [PICK] }),
    showSaveDialog: async () => ({ canceled: true, filePath: '' })
  },
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
  const { APP_DIR_NAME, DATA_SUBDIR } = require(path.join(ROOT, 'electron/services/appinfo'));

  console.log('\n[0] 构造「旧结构」：archive.db 直接躺在 <PICK>/文档盒 Archbox/（少 data 一层）');
  const oldDir = path.join(PICK, APP_DIR_NAME);
  fs.mkdirSync(oldDir, { recursive: true });
  // 先用真实模块建一个**真的** SQLite 库（假字节会被 sql.js 拒绝：file is not a database），
  // 再补上其它数据文件的替身。
  await db.init(oldDir);
  db.seed();
  keystore.writeDataDir(oldDir);
  const seed = {
    'archive.db.sig': 'SIG-BYTES',
    'share.db': 'SHARE-BYTES',
    'lan-visitors.json': '[]',
    'lan-copies.json': '[{"probe":true}]'
  };
  for (const [k, v] of Object.entries(seed)) fs.writeFileSync(path.join(oldDir, k), v);
  ok(fs.existsSync(path.join(oldDir, 'archive.db')), '旧结构 archive.db 就位：' + oldDir);
  ok(keystore.readDataDir() === oldDir, '当前数据目录 = 旧结构目录');

  console.log('\n[1] 走真实 storage:choose 处理器（对话框替身返回 PICK = 同盘）');
  const { registerStorage } = require(path.join(ROOT, 'electron/ipc/storage.js'));
  registerStorage();
  const choose = global.__IPC__['storage:choose'];
  ok(typeof choose === 'function', 'storage:choose 已注册（生产实现）');

  const raw = await choose(FAKE_EVENT);
  ok(raw && raw.ok === true, '★ 迁移成功（不再抛 EINVAL）：' + JSON.stringify(raw && (raw.error || 'ok')));
  const res = unwrap(raw);

  const newDir = path.join(PICK, APP_DIR_NAME, DATA_SUBDIR);
  ok(res && res.dataDir === newDir, `返回路径 = 「${newDir}」`);

  console.log('\n[2] ★ 核心：数据确实被移入 data/ 子目录（逐文件核对）');
  const allFiles = ['archive.db', ...Object.keys(seed)];
  for (const f of allFiles) {
    ok(fs.existsSync(path.join(newDir, f)), `「${f}」已移入 data/`);
  }
  ok(fs.statSync(path.join(newDir, 'archive.db')).size > 0, 'archive.db 非空（是真实库文件）');
  ok(
    fs.readFileSync(path.join(newDir, 'lan-copies.json'), 'utf8').includes('probe'),
    '非白名单文件 lan-copies.json 内容原样搬入（逐文件枚举，未漏）'
  );

  console.log('\n[3] 旧位置不再残留数据文件（同目录树下是 move 不是 copy）');
  // 注意：旧目录本身会作为「文档盒 Archbox」保留（因为 data/ 就在它里面），
  // 但它下面不该再有数据文件 —— 否则等于数据凭空翻倍。
  for (const f of allFiles) {
    ok(!fs.existsSync(path.join(oldDir, f)), `★ 旧位置不再残留「${f}」`);
  }

  console.log('\n[4] 没有把 data/ 自己搬进 data/（自嵌套防护）');
  ok(
    !fs.existsSync(path.join(newDir, DATA_SUBDIR)),
    `★ 未生成嵌套的 ${DATA_SUBDIR}/${DATA_SUBDIR}（listFiles 已排除目标自身）`
  );

  console.log('\n[5] 指针与运行库已切到新目录');
  ok(keystore.readDataDir() === newDir, 'storage.json 指针 = 新目录');
  ok(db.dataDirPath() === newDir, 'db.dataDirPath() = 新目录');
  ok(db.checkWritable() === true, '新目录可写');

  console.log('\n[6] 再迁一次：此时当前目录已是新结构，选同一个 PICK 应被「相同」守卫拦下');
  const again = await choose(FAKE_EVENT);
  ok(again && again.ok === false, '第二次迁移被拦下');
  ok(
    /相同/.test(String(again && (again.message || again.error || ''))),
    '拒绝理由 = 新目录与当前目录相同：' + (again && (again.message || again.error))
  );
  ok(fs.existsSync(path.join(newDir, 'archive.db')), '守卫拦下后数据安然无恙');

  console.log('\n[7] 静态契约：迁移分支顺序正确（子目录上移 → 根目录白名单 → 整目录复制）');
  const srcDir = path.join(ROOT, 'src');
  const storSrc = fs.readFileSync(path.join(ROOT, 'electron/ipc/storage.js'), 'utf8');
  ok(/destInsideSrc/.test(storSrc), '已引入 destInsideSrc 判断');
  ok(/listFiles\(from\)/.test(storSrc), '原地移入走 datadir.listFiles(from) 递归枚举');
  ok(/DATA_SUBDIR\)\s*continue|rel === DATA_SUBDIR/.test(storSrc), '移入时排除目标目录自身');
  const iNested = storSrc.indexOf('if (destInsideSrc)');
  const iRoot = storSrc.indexOf('} else if (fromAbs === path.parse(fromAbs).root)');
  // ★ 必须匹配带 await 的**代码行**：注释里也出现过同样的字面量（说明为何不能用 cp），
  //   直接 indexOf('fsp.cp(from, dir') 会命中注释，得到错误的位置（本测试踩过）。
  const iCp = storSrc.indexOf('await fsp.cp(from, dir');
  ok(iNested > -1 && iRoot > -1 && iCp > -1, `三处分支均已定位（${iNested} / ${iRoot} / ${iCp}）`);
  ok(iNested < iRoot && iRoot < iCp, '分支顺序：destInsideSrc → 根目录白名单 → 整目录复制');
  void srcDir;

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
