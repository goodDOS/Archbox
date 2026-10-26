/**
 * 数据目录契约 + 全量备份的单测（纯 Node，不依赖 Electron）。
 *
 * 背景：share.db 曾在「迁移白名单」与「备份」两处被漏掉两次——根因是数据目录
 * 文件清单被各功能各写一遍。本测试锁死单一数据源（services/datadir.js）与
 * zip-backup.backupAll 的行为契约，防止回归。
 *
 * 运行：node electron/verify/datadir-backup.test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const datadir = require('../services/datadir.js');
const zipBackup = require('../services/zip-backup.js');
// 备份改用「可选口令加密」：无口令时 checksums 纯哈希，不再依赖 packSign 签名
// （口令保护由 zip-backup.backupAll(dataDir, pass) 的可选参数承担）

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

// ---------- 1. 契约：核心数据文件名齐全 ----------
console.log('[1] datadir.coreFileNames 契约');
const names = datadir.coreFileNames();
ok(names.includes('archive.db'), '含 archive.db');
ok(names.includes('archive.db.sig'), '含 archive.db.sig');
ok(names.includes('share.db'), '含 share.db（曾经被漏掉的文件）');
ok(names.includes('lan-visitors.json'), '含 lan-visitors.json');

// ---------- 2. listFiles 递归收集 + 跳过探针 ----------
console.log('[2] datadir.listFiles 递归收集');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archbox-datadir-'));
fs.writeFileSync(path.join(tmp, 'archive.db'), Buffer.from('DB-BYTES'));
fs.writeFileSync(path.join(tmp, 'archive.db.sig'), '{"sha256":"x"}');
fs.writeFileSync(path.join(tmp, 'share.db'), Buffer.from('SHARE-BYTES'));
fs.writeFileSync(path.join(tmp, 'lan-visitors.json'), '[]');
fs.writeFileSync(path.join(tmp, '.write_probe'), 'ok'); // 应被跳过
fs.mkdirSync(path.join(tmp, 'sub'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'sub', 'nested.dat'), 'n');
const listed = datadir.listFiles(tmp);
ok(listed.includes('archive.db'), '列出 archive.db');
ok(listed.includes('share.db'), '列出 share.db');
ok(listed.includes('sub/nested.dat'), '递归列出子目录文件（相对路径 / 分隔）');
ok(!listed.includes('.write_probe'), '跳过 .write_probe 探针');

// ---------- 3. backupAll：打包目录下全部数据文件 ----------
console.log('[3] zip-backup.backupAll 覆盖全部数据文件');
const zipBuf = zipBackup.backupAll(tmp);
ok(Buffer.isBuffer(zipBuf) && zipBuf.length > 0, '生成非空 ZIP');
ok(zipBuf[0] === 0x50 && zipBuf[1] === 0x4b, 'ZIP 特征头 PK');

// 自校验：解包 + L1 哈希 + CRC32 全通过（无口令时纯哈希）
const v = zipBackup.verifyBackupZip(zipBuf);
ok(v.ok === true, '备份自校验通过（' + (v.reason || 'ok') + '）');
ok(v.encrypted === false, '无口令备份未加密（encrypted=false）');

// 关键：备份内必须含 share.db（回归防护）
const text = zipBuf.toString('latin1');
ok(text.includes('share.db'), '备份条目含 share.db');
ok(text.includes('archive.db'), '备份条目含 archive.db');
ok(text.includes('lan-visitors.json'), '备份条目含 lan-visitors.json');
ok(text.includes('checksums.json'), '备份含完整性摘要 checksums.json');

// ---------- 4. 篡改检测：改动内容后校验失败 ----------
console.log('[4] 篡改检测');
const tampered = Buffer.from(zipBuf);
// 找到 share.db 的载荷字节并翻转一位（store 模式明文可搜）
const needle = Buffer.from('SHARE-BYTES');
const pos = tampered.indexOf(needle);
if (pos >= 0) {
  tampered[pos] = tampered[pos] ^ 0xff;
  const vt = zipBackup.verifyBackupZip(tampered);
  ok(vt.ok === false, '篡改 share.db 内容后校验失败（' + (vt.reason || '') + '）');
} else {
  ok(false, '未能在备份中定位 share.db 载荷（测试夹具问题）');
}

fs.rmSync(tmp, { recursive: true, force: true });

// ---------- 5. assertWritable / canWrite 契约 ----------
console.log('[5] datadir.assertWritable / canWrite');
ok(
  datadir.PROBE_NAMES.includes('.write_test') && datadir.PROBE_NAMES.includes('.write_probe'),
  'PROBE_NAMES 收录历史两个探针名（.write_test / .write_probe）'
);

const wtmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archbox-writable-'));
// 可写目录：不抛错、留下零残留探针
let threw = false;
try {
  datadir.assertWritable(wtmp, '数据目录');
} catch (e) {
  threw = true;
}
ok(!threw, '可写目录 assertWritable 不抛错');
ok(fs.readdirSync(wtmp).length === 0, 'assertWritable 清理探针，无残留文件');
ok(datadir.canWrite(wtmp) === true, 'canWrite 对可写目录返回 true');

// 不存在的多级目录：assertWritable 会 mkdir -p 后成功
const deep = path.join(wtmp, 'a', 'b', 'c');
let threw2 = false;
try {
  datadir.assertWritable(deep, '数据目录');
} catch (e) {
  threw2 = true;
}
ok(!threw2 && fs.existsSync(deep), 'assertWritable 自动创建多级目录');

// 不可写目录（用一个文件充当目录，mkdir 必失败）
const asFile = path.join(wtmp, 'not-a-dir');
fs.writeFileSync(asFile, 'x');
let msg = '';
try {
  datadir.assertWritable(asFile, '目标数据目录');
} catch (e) {
  msg = e.message;
}
// Beta.271：文案改抛 i18n key（common.errDirNotWritable|{...}），label 落在参数里。
// 这里断「key 正确 + label 作为参数带上」，渲染层 errText 会把它翻成
// 「目标数据目录不可写：<dir>（<reason>）……」。
ok(
  /^common\.errDirNotWritable\|/.test(msg) && msg.includes('"label":"目标数据目录"'),
  'assertWritable 不可写时抛出带 label 的 i18n 错误：' + msg
);
ok(datadir.canWrite(asFile) === false, 'canWrite 对不可写路径返回 false');

fs.rmSync(wtmp, { recursive: true, force: true });

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
