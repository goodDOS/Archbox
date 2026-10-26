/**
 * E2E：文档包「口令加密」往返链路冒烟（设口令导出 → 探测加密 → 错口令拒绝 → 正口令导入 → 验签）。
 *
 * 直接调用 services 层（不经 Electron 主进程 / GUI），验证真实数据流：
 *   1) 构造内存库，写入种子文档
 *   2) 设口令导出 → 包内 checksums.json 应为 PACKENC1 加密容器（packEncrypted=true）
 *   3) 不传口令导入 → 必须拒绝（缺口令）
 *   4) 错口令导入 → 必须拒绝（解密失败）
 *   5) 正口令导入到干净库 → 成功落库 + origin.protected=true（验签通过）
 *   6) 篡改加密包 → 必须拒绝（完整性 / 解密失败）
 *
 * 这是「导出 → 设口令 → 导入 → 输口令 → 验签」核心链路的可复现回归，
 * 纯 Node 可独立运行，纳入 npm test 常规清单（区别于需要 Electron 环境的 .e2e.cjs）。
 *
 * 运行：node electron/verify/pack-password-e2e.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-pass-e2e-'));
console.log('tmp =', tmp);

const core = require(path.join(ROOT, 'electron/db/core.js'));
const db = require(path.join(ROOT, 'electron/db.js'));
const archpack = require(path.join(ROOT, 'electron/services/archpack.js'));
const packProtect = require(path.join(ROOT, 'electron/services/pack-protect.js'));
const zipRead = require(path.join(ROOT, 'electron/services/zip-read.js'));
const zipBackup = require(path.join(ROOT, 'electron/services/zip-backup.js'));
// 数据库 .sig 仍由 packSign 签名，测试需注入稳定密钥避免报错
const packSign = require(path.join(ROOT, 'electron/services/pack-sign.js'));
packSign.configure({ privateKeyPem: packSign.generateKeyPair().privateKeyPem });

const PASSWORD = 'smoke-pass-123';

/* ---------- 1) 源库：写入种子数据 ---------- */
console.log('\n[1] 源库准备');
const srcDir = path.join(tmp, 'src');
await core.init(srcDir);
db.seed();
const uid = (db.listUsers()[0] && db.listUsers()[0].id) || 'u1';
const regions = db.listRegions();
const regionId = (regions[0] && regions[0].id) || null;
if (!regionId) throw new Error('种子大区缺失，无法继续');
db.savePost(
  {
    title: '口令往返-源文档',
    regionId,
    categoryId: null,
    fields: {},
    tags: ['pass'],
    contentHtml: '<p>password roundtrip</p>',
    status: 'published'
  },
  uid
);
ok(db.countPosts({}) > 0, '源库写入种子文档成功');

/* ---------- 2) 设口令导出 → 探测加密 ---------- */
console.log('\n[2] 设口令导出');
const packBuf = await archpack.buildZipPack(db, {}, PASSWORD);
ok(Buffer.isBuffer(packBuf) && packBuf.length > 0, `设口令导出成功（${packBuf.length} 字节）`);

const entries = zipRead.extractStoreChecked(packBuf, 'E2E');
const csRaw = entries['checksums.json'];
ok(Buffer.isBuffer(csRaw), '包内含 checksums.json');
ok(packProtect.isEncrypted(csRaw), 'checksums.json 是 PACKENC1 口令加密容器（设口令生效）');
ok(csRaw.subarray(0, 8).equals(Buffer.from('PACKENC1')), '加密容器魔数 PACKENC1 正确');
ok(archpack.packEncrypted(packBuf) === true, 'packEncrypted 探测返回 true');

/* ---------- 3) 不传口令 → 拒绝 ---------- */
console.log('\n[3] 缺口令导入');
const packPath = path.join(tmp, 'p.archboxpack');
fs.writeFileSync(packPath, packBuf);
let noPassErr = null;
try {
  await archpack.openPackFile(packPath);
} catch (e) {
  noPassErr = e;
}
ok(!!noPassErr, '不传口令被拒绝：' + (noPassErr && noPassErr.message));

/* ---------- 4) 错口令 → 拒绝 ---------- */
console.log('\n[4] 错口令导入');
let badPassErr = null;
try {
  await archpack.openPackFile(packPath, 'wrong-pass');
} catch (e) {
  badPassErr = e;
}
ok(!!badPassErr, '错口令被拒绝：' + (badPassErr && badPassErr.message));

/* ---------- 5) 正口令导入 → 落库 + 验签 ---------- */
console.log('\n[5] 正口令导入');
core.closeDb();
const dstDir = path.join(tmp, 'dst');
await core.init(dstDir);
const opened = await archpack.openPackFile(packPath, PASSWORD);
ok(opened && opened.data && opened.data.magic === archpack.MAGIC, '正口令打开 v3 包成功');
ok(opened && opened.origin && opened.origin.protected === true, 'origin.protected=true（口令保护验签通过）');
ok(opened && opened.encrypted === true, 'openPackFile 返回 encrypted=true');

const summary = await archpack.applyPackImport({ data: opened.data, assetBuf: null, strategy: 'nodedup', userId: uid });
ok(summary.created > 0, `正口令导入新建 ${summary.created} 篇`);
const imported = db.listPosts({ limit: 100000 }).filter(r => r.imported_at);
ok(imported.length === summary.created, '落库文档带 imported_at 标记');
ok(
  imported.some(r => r.title === '口令往返-源文档'),
  '导入内容含源文档（验签后数据可信）'
);

/* ---------- 6) 篡改加密包 → 拒绝 ---------- */
console.log('\n[6] 篡改加密包');
// 直接翻转 checksums.json 密文的一个字节（保持 PACKENC1 头不变，破坏密文/GCM tag）
const manifestBuf = entries['manifest.json'];
const csBuf = Buffer.from(csRaw);
csBuf[csBuf.length - 1] ^= 0xff; // 破坏 GCM tag 最后一字节
const tamperedZip = zipBackup.buildZip([
  { absPath: null, relPath: 'manifest.json', buffer: manifestBuf },
  { absPath: null, relPath: 'checksums.json', buffer: csBuf }
]);
const tamperedPath = path.join(tmp, 'tampered.archboxpack');
fs.writeFileSync(tamperedPath, tamperedZip);
let tamperErr = null;
try {
  await archpack.openPackFile(tamperedPath, PASSWORD);
} catch (e) {
  tamperErr = e;
}
ok(!!tamperErr, '篡改加密包被拒绝（GCM 认证失败 / 完整性校验失败）：' + (tamperErr && tamperErr.message));
ok(db.countPosts({}) === summary.created, `篡改包未污染数据库（仍为 ${summary.created} 条）`);

core.closeDb();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
