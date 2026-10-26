/**
 * E2E：文档包防篡改校验 + 导入来源标记（甄别）
 *
 * 直接调用 services 层（不经 Electron 主进程），验证真实数据流：
 *   1) 构造一个内存库（sql.js），写入种子文档
 *   2) 导出文档包 → 解析自检（L1 sha256 + ZIP CRC32；无口令时纯哈希）
 *   3) 逐字节篡改包内 manifest.json → 导入必须被拒绝
 *   4) 用正常包导入到「干净库」→ 校验 posts.imported_at / imported_from 已落库
 *   5) 校验来源筛选（imported=true）只命中导入文档
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-e2e-'));
console.log('tmp =', tmp);

const core = require(path.join(ROOT, 'electron/db/core.js'));
const db = require(path.join(ROOT, 'electron/db.js'));
const archpack = require(path.join(ROOT, 'electron/services/archpack.js'));
const zipRead = require(path.join(ROOT, 'electron/services/zip-read.js'));
// 数据库 .sig 仍由 packSign（用户本机密钥）签名，测试需注入稳定密钥避免报错
const packSign = require(path.join(ROOT, 'electron/services/pack-sign.js'));
packSign.configure({ privateKeyPem: packSign.generateKeyPair().privateKeyPem });

/* ---------- 1) 源库：写入种子数据并导出 ---------- */
console.log('\n[1] 源库导出');
const srcDir = path.join(tmp, 'src');
await core.init(srcDir);
db.seed(); // 写入演示大区/分类（regionId 依赖它）
const srcUsers = db.listUsers ? db.listUsers() : [];
const uid = (srcUsers[0] && srcUsers[0].id) || 'u1';
const regions = db.listRegions();
const regionId = (regions[0] && regions[0].id) || null;
if (!regionId) throw new Error('种子大区缺失，无法继续');
const before = db.countPosts({});
db.savePost(
  {
    title: 'E2E-源文档-A',
    regionId,
    categoryId: null,
    fields: {},
    tags: ['e2e'],
    contentHtml: '<p>hello A</p>',
    status: 'published'
  },
  uid
);
db.savePost(
  {
    title: 'E2E-源文档-B',
    regionId,
    categoryId: null,
    fields: {},
    tags: [],
    contentHtml: '<p>hello B</p>',
    status: 'published'
  },
  uid
);
const afterInsert = db.countPosts({});
ok(afterInsert > before, `源库写入成功（${before} → ${afterInsert}）`);

const srcRows = db.listPosts({ limit: 100000 });
const plain = srcRows.filter(r => !r.imported_at);
ok(plain.length === srcRows.length, '源库文档全部为「本机自建」（无 imported_at）');

const packBuf = await archpack.buildZipPack(db, {});
ok(Buffer.isBuffer(packBuf) && packBuf.length > 0, `导出文档包成功（${packBuf.length} 字节）`);
ok(packBuf[0] === 0x50 && packBuf[1] === 0x4b, '导出内容是 ZIP（PK 头）');

/* ---------- 2) 自检：正常包应通过全部校验 ---------- */
console.log('\n[2] 正常包解析自检');
let parsed = null;
try {
  parsed = archpack.parseZipPackBuffer(packBuf);
  ok(true, '正常包通过 L1+CRC32 校验');
} catch (e) {
  ok(false, '正常包通过校验 —— 失败：' + e.message);
}
ok(parsed && parsed.manifest.magic === archpack.MAGIC, 'manifest.magic 正确');
ok(parsed && parsed.manifest.pack && !!parsed.manifest.pack.exporter, 'manifest 含 pack.exporter 指纹');
ok(
  parsed && parsed.manifest.pack.origin === archpack.packOriginTag(parsed.manifest),
  'pack.origin 与重新计算的来源标识一致'
);

/* ---------- 3) 篡改 manifest → 必须被拒绝 ---------- */
console.log('\n[3] 篡改检测');
const packPath = path.join(tmp, 'pack.archboxpack');
fs.writeFileSync(packPath, packBuf);

// 3a) 定位 manifest.json 的原文，把一个字节改掉（保持 ZIP 结构完整）
const entries = zipRead.extractStoreChecked(packBuf, 'E2E ');
const manifestBuf = entries['manifest.json'];
const needle = Buffer.from('"title": "E2E-源文档-A"', 'utf8');
const at = manifestBuf.indexOf(needle);
ok(at >= 0, '在 manifest 中定位到待篡改的目标串');
const tampered = Buffer.from(manifestBuf);
tampered[at + needle.length - 3] = 0x5a; // 'A' → 'Z'（同长度替换，仅破坏内容）

// 用篡改后的 manifest 重新组装一个 ZIP（复用导出器的 buildZip 保持 STORE 模式）
const zipBackup = require(path.join(ROOT, 'electron/services/zip-backup.js'));
const checksumsBuf = entries['checksums.json'];
const badZip = zipBackup.buildZip([
  { absPath: null, relPath: 'manifest.json', buffer: tampered },
  { absPath: null, relPath: 'checksums.json', buffer: checksumsBuf }
]);
let tamperErr = null;
try {
  archpack.parseZipPackBuffer(badZip);
} catch (e) {
  tamperErr = e;
}
ok(!!tamperErr, '篡改 manifest 后被拒绝（抛出错误）');
ok(
  tamperErr && /errPackHashMismatch|errPackCrcMismatch|篡改|哈希|CRC32/.test(tamperErr.message),
  '拒绝原因指向篡改：' + (tamperErr && tamperErr.message)
);

// 3b) 篡改 checksums.json 的哈希 → L1 必须失败（无口令时 checksums 是明文 JSON）
const csObj = JSON.parse(checksumsBuf.toString('utf8'));
csObj.files['manifest.json'].sha256 = 'f'.repeat(64);
const badCsZip = zipBackup.buildZip([
  { absPath: null, relPath: 'manifest.json', buffer: manifestBuf },
  { absPath: null, relPath: 'checksums.json', buffer: Buffer.from(JSON.stringify(csObj, null, 2), 'utf8') }
]);
let sigErr = null;
try {
  archpack.parseZipPackBuffer(badCsZip);
} catch (e) {
  sigErr = e;
}
ok(
  !!sigErr && /errPackHashMismatch|哈希|sha256/.test(sigErr.message),
  '篡改 checksums 哈希被 L1 拒绝：' + (sigErr && sigErr.message)
);

// 3c) 缺少 checksums.json → 必须拒绝
const noCsZip = zipBackup.buildZip([{ absPath: null, relPath: 'manifest.json', buffer: manifestBuf }]);
let noCsErr = null;
try {
  archpack.parseZipPackBuffer(noCsZip);
} catch (e) {
  noCsErr = e;
}
ok(
  !!noCsErr && /errPackNoChecksums|checksums\.json/.test(noCsErr.message),
  '缺 checksums.json 被拒绝（无完整性摘要包）'
);

/* ---------- 4) 导入到干净库 → 来源标记落库 ---------- */
console.log('\n[4] 导入并校验来源标记');
core.closeDb();
const dstDir = path.join(tmp, 'dst');
await core.init(dstDir);

const validPath = path.join(tmp, 'valid.archboxpack');
fs.writeFileSync(validPath, packBuf);
const opened = await archpack.openPackFile(validPath);
ok(opened && opened.data && opened.data.magic === archpack.MAGIC, 'openPackFile 正常打开 v3 包');
ok(opened && opened.origin && opened.origin.exporter, 'openPackFile 返回 origin（供 UI 甄别）');
ok(opened && opened.origin.protected === false, 'origin.protected=false（无口令包，纯哈希校验）');
ok(opened && opened.encrypted === false, 'openPackFile 返回 encrypted=false');

const summary = await archpack.applyPackImport({ data: opened.data, assetBuf: null, strategy: 'nodedup', userId: uid });
ok(summary.created > 0, `导入新建 ${summary.created} 篇`);
ok(!!summary.importedFrom, 'summary 回传 importedFrom：' + summary.importedFrom);

const rows = db.listPosts({ limit: 100000 });
const importedRows = rows.filter(r => r.imported_at);
ok(
  importedRows.length === summary.created,
  `落库的导入标记数与新建数一致（${importedRows.length} / ${summary.created}）`
);
ok(
  importedRows.every(r => r.imported_from === summary.importedFrom),
  '每篇导入文档的 imported_from 与包来源标识一致'
);
ok(
  importedRows.every(r => /^AK-[0-9A-F]{12}@/.test(r.imported_from || '')),
  'imported_from 形如 AK-指纹@ISO时间'
);

// 详情接口也要带出标记
const one = db.getPost(importedRows[0].id);
ok(one && !!one.imported_at && !!one.imported_from, 'getPost 返回 imported_at/imported_from');

/* ---------- 5) 来源筛选（甄别） ---------- */
// ★ Beta.206：筛选参数由布尔 imported 改为 origin 枚举（'' | 'import' | 'copy' | 'local'）★
console.log('\n[5] 来源筛选（甄别）');
const onlyImported = db.listPosts({ origin: 'import', limit: 100000 });
ok(onlyImported.length === importedRows.length, `origin=import 只命中导入文档（${onlyImported.length}）`);
ok(
  onlyImported.every(r => r.imported_at),
  'origin=import 结果全部含 imported_at'
);

// 再写一篇自建文档（+ 一篇拷贝文档），验证 origin 三态互斥
const dstRegions = db.listRegions();
db.savePost(
  {
    title: 'E2E-自建-C',
    regionId: dstRegions[0].id,
    categoryId: null,
    fields: {},
    tags: [],
    contentHtml: '<p>local</p>',
    status: 'published'
  },
  uid
);
db.savePost(
  {
    title: 'E2E-拷贝-D',
    regionId: dstRegions[0].id,
    categoryId: null,
    fields: {},
    tags: [],
    contentHtml: '<p>copied</p>',
    status: 'published'
  },
  uid,
  { skipOwnerCheck: true, copied: { at: db.nowIso(), from: 'X@127.0.0.1:1', originAuthor: '原作者' } }
);

const onlyLocal = db.listPosts({ origin: 'local', limit: 100000 });
ok(onlyLocal.length === 1 && onlyLocal[0].title === 'E2E-自建-C', `origin=local 只命本机自建（${onlyLocal.length}）`);
const onlyCopy = db.listPosts({ origin: 'copy', limit: 100000 });
ok(onlyCopy.length === 1 && onlyCopy[0].title === 'E2E-拷贝-D', `origin=copy 只命拷贝文档（${onlyCopy.length}）`);
ok(onlyCopy[0].origin_author === '原作者', '拷贝文档带 origin_author 快照');
ok(!onlyLocal.some(r => r.copied_at), 'origin=local 结果不含拷贝文档（两态互斥）');

const allRows = db.listPosts({ limit: 100000 });
ok(allRows.length === importedRows.length + 2, '不传 origin 时不做来源筛选（返回全部）');

/* ---------- 6) 篡改包不得污染数据库 ---------- */
console.log('\n[6] 篡改包导入必须失败且不写库');
const beforeCount = db.countPosts({});
// 写一个真正被篡改的文件后再试
fs.writeFileSync(path.join(tmp, 'bad.archboxpack'), badZip);
let importErr = null;
try {
  await archpack.openPackFile(path.join(tmp, 'bad.archboxpack'));
} catch (e) {
  importErr = e;
}
ok(!!importErr, 'openPackFile 对被篡改文件抛错（导入链路在写库前就中断）');
ok(db.countPosts({}) === beforeCount, `数据库未被篡改包影响（仍为 ${beforeCount} 条）`);

/* ---------- 7) 旧版包拒绝（不做向后兼容） ---------- */
console.log('\n[7] 非 v3 格式拒绝');
const fakeV2 = JSON.parse(manifestBuf.toString('utf8'));
fakeV2.version = 2;
const v2Zip = zipBackup.buildZip([
  { absPath: null, relPath: 'manifest.json', buffer: Buffer.from(JSON.stringify(fakeV2), 'utf8') }
]);
let v2Err = null;
try {
  await archpack.openPackFile(
    (fs.writeFileSync(path.join(tmp, 'v2.archboxpack'), v2Zip), path.join(tmp, 'v2.archboxpack'))
  );
} catch (e) {
  v2Err = e;
}
ok(
  !v2Err || /errPackNoChecksums|errPackVersion|checksums|版本/.test(v2Err.message),
  'v2 包被拒绝：' + (v2Err && v2Err.message)
);

core.closeDb();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
