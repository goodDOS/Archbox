'use strict';
/**
 * 数据目录迁移：新建文件夹名必须是「文档盒 Archbox」。
 *
 * 【为什么必须功能验证，不能只做静态断言】
 * 本次事故的本质是「静态看代码像对的，跑起来目录名却是错的」——
 * 静态断言只能证明源码里没有 'Archbox' 字面量，证明不了**真实迁移后盘上的目录名**。
 * 故这里起真实模块、走真实 storage:choose 处理器（对话框用替身返回临时目录），
 * 然后**看盘上实际生成了什么文件夹**。
 *
 * 运行：node electron/verify/storage-dirname.e2e.cjs [ROOT]
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

const CFG = fs.mkdtempSync(path.join(os.tmpdir(), 'dirname-cfg-'));
const PICK = fs.mkdtempSync(path.join(os.tmpdir(), 'dirname-pick-'));

// Electron 替身。ipcMain.handle 把真实 handler 收进 global.__IPC__，
// 这样我们跑的是**生产代码本身**，而不是复制一份逻辑来测。
const stubPath = path.join(os.tmpdir(), '_esub-' + process.pid + '.js');
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

async function main() {
  console.log('\n[i] 夹具');
  console.log('  配置根:   ' + CFG);
  console.log('  拟选目录: ' + PICK);

  const { APP_DIR_NAME, APP_NAME, DATA_SUBDIR } = require(path.join(ROOT, 'electron/services/appinfo'));
  console.log('\n[1] appinfo 单一数据源');
  ok(APP_NAME === '文档盒 Archbox', `APP_NAME = 「${APP_NAME}」`);
  ok(APP_DIR_NAME === '文档盒 Archbox', `APP_DIR_NAME = 「${APP_DIR_NAME}」`);
  ok(DATA_SUBDIR === 'data', `DATA_SUBDIR = 「${DATA_SUBDIR}」`);

  const db = require(path.join(ROOT, 'electron/db'));
  const keystore = require(path.join(ROOT, 'electron/keystore'));

  // db.init(dir) 直接在 dir 下建库；而默认数据目录是新根下的 userData/data。
  // 必须让两者一致，否则迁移时读到的「当前目录」与初始化目录对不上。
  const dataDir0 = keystore.readDataDir();
  fs.mkdirSync(dataDir0, { recursive: true });
  await db.init(dataDir0);
  db.seed();
  keystore.writeDataDir(dataDir0);

  console.log('\n[2] 初始数据目录');
  const before = keystore.readDataDir();
  ok(fs.existsSync(before), `数据目录已建: ${before}`);
  ok(fs.existsSync(path.join(before, 'archive.db')), 'archive.db 存在');
  // 造两个「非白名单 / 白名单」文件，验证整目录迁移
  fs.writeFileSync(path.join(before, 'lan-copies.json'), JSON.stringify([{ probe: true }]));
  fs.writeFileSync(path.join(before, 'share.db'), 'SHARE-DB-PLACEHOLDER');

  console.log('\n[3] 走真实 IPC 处理器执行迁移');
  const { registerStorage } = require(path.join(ROOT, 'electron/ipc/storage.js'));
  registerStorage();
  const choose = global.__IPC__['storage:choose'];
  ok(typeof choose === 'function', 'storage:choose 已注册（拿到生产实现本身）');

  // handle() 统一把结果包成 { ok, data }（见 ipc/shared.js），故此处取 .data
  const raw = await choose();
  const res = raw && raw.data;
  ok(!!(res && res.dataDir), '迁移返回 dataDir: ' + (res && res.dataDir));

  console.log('\n[4] ★ 核心断言：盘上实际生成的文件夹层级 ★');
  // 迁移目标 = <所选目录>/文档盒 Archbox/data（两层），与默认数据目录结构一致。
  // 曾经只拼到 <所选目录>/文档盒 Archbox，archive.db 少了 data 这一层，
  // 于是「迁移前 …\data\archive.db、迁移后 …\archive.db」两种结构并存（用户实测反馈）。
  const expect = path.join(PICK, '文档盒 Archbox', DATA_SUBDIR);
  ok(res.dataDir === expect, `返回路径 = 「${expect}」`);
  ok(fs.existsSync(expect), `盘上确实存在「${expect}」`);
  // 名下不得把 archive.db 直接留在「文档盒 Archbox」层（少 data 的旧形态）
  const noDataLayer = path.join(PICK, '文档盒 Archbox');
  ok(
    !fs.existsSync(path.join(noDataLayer, 'archive.db')),
    `★ 「${noDataLayer}」下没有裸的 archive.db（data 层未被省略）`
  );
  const oldWrong = path.join(PICK, 'Archbox');
  ok(!fs.existsSync(oldWrong), `★ 未生成旧名目录「${oldWrong}」（Beta.208 修复的核心）`);
  ok(path.basename(expect) === DATA_SUBDIR, `末级目录 === DATA_SUBDIR（${DATA_SUBDIR}）`);
  ok(path.basename(path.dirname(expect)) === APP_DIR_NAME, `上一级 === APP_DIR_NAME（${APP_DIR_NAME}）`);
  ok(APP_DIR_NAME.includes(' '), '目录名含空格（与 app.setName 的产品名逐字一致）');
  // 与「默认数据目录」结构同源：都是 <某目录>/data/archive.db
  ok(DATA_SUBDIR === 'data', `DATA_SUBDIR 常量 = data（与 keystore 兜底同源）`);

  console.log('\n[5] 迁移内容完整性');
  ok(fs.existsSync(path.join(expect, 'archive.db')), 'archive.db 已迁移');
  ok(fs.existsSync(path.join(expect, 'archive.db.sig')), 'archive.db.sig 已迁移');
  ok(fs.existsSync(path.join(expect, 'lan-copies.json')), '非白名单文件 lan-copies.json 一并带走（整目录迁移）');
  ok(fs.existsSync(path.join(expect, 'share.db')), 'share.db 一并带走');
  ok(fs.existsSync(path.join(before, 'archive.db')), '原目录保留 archive.db 作备份');

  console.log('\n[6] 指针已指向新目录');
  ok(keystore.readDataDir() === expect, 'storage.json 指针 = 新目录');
  ok(db.dataDirPath() === expect, `运行库已切到新目录（db.dataDirPath）`);

  console.log('\n[7] 重复迁移到同一目录被守卫拦下（防原地递归复制）');
  // 替身始终返回同一个 PICK，此时当前目录已是 PICK/文档盒 Archbox，故应触发「相同」守卫。
  // handle() 捕获异常后返回 { ok:false, message }，故断言在 message 上。
  const again = await choose();
  ok(again && again.ok === false, '第二次迁移未成功（被守卫拦下）');
  ok(
    /相同/.test(String(again && (again.message || again.error || ''))),
    '拒绝理由为「新目录与当前目录相同」：' + (again && (again.message || again.error))
  );
  // 且没有因为「整目录复制到自身子目录」而把数据搞坏
  ok(fs.existsSync(path.join(expect, 'archive.db')), '守卫拦下后原数据安然无恙');

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
