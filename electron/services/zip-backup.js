'use strict';
/**
 * 极简 ZIP 打包器（STORE 模式，无压缩依赖）
 * - 生成标准 ZIP 文件，兼容 Windows 资源管理器 / 7-Zip / WinRAR
 * - 不引入额外 npm 依赖，纯 Node.js
 * - 适用于全量备份场景（打包数据目录下全部数据文件，见 services/datadir.js）
 */
const fs = require('fs');
const path = require('path');
const releaseSign = require('./release-sign');
const packProtect = require('./pack-protect');
const datadir = require('./datadir');
const zipRead = require('./zip-read');

// CRC32 归一：复用 release-sign 的实现（此前本文件与 pack-sign 各写了一份
// 完全相同的 CRC_TABLE + crc32，属「殊途同归」重复，删本地副本改引用）。
const i18n = require('../i18n');
const crc32 = releaseSign.crc32;

/** DOS 时间/日期转换 */
function dosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

/**
 * 打包为 ZIP 文件
 * @param {Array<{absPath, relPath}>} files
 * @returns {Buffer} ZIP 文件内容
 */
function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const { time: dosTime, date: dosDate } = dosDateTime(now);

  for (const f of files) {
    const data = f.buffer ? f.buffer : fs.readFileSync(f.absPath);
    const crc = crc32(data);
    const nameBuf = Buffer.from(f.relPath.replace(/\\/g, '/'), 'utf8');
    const nameLen = nameBuf.length;
    const extraLen = 0;

    // Local file header (30 bytes + name + extra)
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0); // signature
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0, 6); // flags
    lfh.writeUInt16LE(0, 8); // compression: 0=store
    lfh.writeUInt16LE(dosTime, 10);
    lfh.writeUInt16LE(dosDate, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(data.length, 18); // compressed size
    lfh.writeUInt32LE(data.length, 22); // uncompressed size
    lfh.writeUInt16LE(nameLen, 26);
    lfh.writeUInt16LE(extraLen, 28);
    chunks.push(Buffer.concat([lfh, nameBuf, data]));
    const localHeaderSize = 30 + nameLen + extraLen + data.length;

    // Central directory header (46 bytes + name + extra + comment)
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0); // signature
    cdh.writeUInt16LE(20, 4); // version made by
    cdh.writeUInt16LE(20, 6); // version needed
    cdh.writeUInt16LE(0, 8); // flags
    cdh.writeUInt16LE(0, 10); // compression
    cdh.writeUInt16LE(dosTime, 12);
    cdh.writeUInt16LE(dosDate, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(data.length, 20); // compressed
    cdh.writeUInt32LE(data.length, 24); // uncompressed
    cdh.writeUInt16LE(nameLen, 28);
    cdh.writeUInt16LE(0, 30); // extra len
    cdh.writeUInt16LE(0, 32); // comment len
    cdh.writeUInt16LE(0, 34); // disk number
    cdh.writeUInt16LE(0, 36); // internal attrs
    cdh.writeUInt32LE(0, 38); // external attrs
    cdh.writeUInt32LE(offset, 42); // local header offset
    central.push(Buffer.concat([cdh, nameBuf]));
    offset += localHeaderSize;
  }

  // End of central directory (22 bytes + comment)
  const cdBuf = Buffer.concat(central);
  const cdOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(files.length, 8); // entries on this disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(cdBuf.length, 12); // central dir size
  eocd.writeUInt32LE(cdOffset, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([...chunks, cdBuf, eocd]);
}

/**
 * 全量备份：把数据目录下的全部数据文件打包为 ZIP（含完整性校验摘要）
 *
 * ★ 为什么要递归整目录而不是只打包 archive.db ★
 *   数据目录里不止数据库一个文件（见 services/datadir.js 的数据目录契约）：
 *   还有局域网共享镜像库 share.db、访客记录 lan-visitors.json，以及未来版本
 *   可能新增的数据文件。只备份 archive.db 会在恢复后丢失这些数据。
 *   这里通过 datadir.listFiles 递归收集，与迁移策略「整目录优先」同源。
 *   （加密库的 archive.db 已是密文，备份即密文；.sig 一并带走。）
 * @param {string} dataDir 数据目录
 * @param {string} [pass] 可选口令；提供则 checksums.json 用口令加密（L2 防伪造）
 * @returns {Buffer} ZIP 文件内容
 */
function backupAll(dataDir, pass) {
  const files = datadir.listFiles(dataDir).map(rel => ({ absPath: path.join(dataDir, rel), relPath: rel }));
  // 完整性（L1 哈希 + CRC32）：对包内每个真实文件计算 sha256+crc32；
  // 提供口令时整体加密（L2 防伪造），否则仅哈希（L1 防损坏）
  const fileSums = {};
  for (const f of files) {
    const buf = fs.readFileSync(f.absPath);
    fileSums[f.relPath] = { sha256: releaseSign.sha256(buf), crc32: releaseSign.crc32(buf) };
  }
  const checksums = {
    algorithm: 'sha256+crc32',
    scope: 'db-backup',
    protection: pass ? 'password' : 'hash',
    protectedAt: { ts: Date.now() },
    files: fileSums
  };
  const checksumsPlain = JSON.stringify(checksums, null, 2);
  files.push({
    absPath: null,
    relPath: 'checksums.json',
    buffer: pass ? packProtect.encryptChecksums(checksumsPlain, pass) : Buffer.from(checksumsPlain, 'utf8')
  });
  return buildZip(files);
}

/**
 * 校验全量备份 zip 的完整性（L1 哈希 + 每 entry CRC32；可选 L2 口令解密）
 * @param {Buffer} buf ZIP 备份内容
 * @param {string} [pass] 可选口令；checksums 为加密容器时必填
 * @returns {{ok:boolean, reason?:string, encrypted?:boolean}}
 */
function verifyBackupZip(buf, pass) {
  const files = {};
  for (const e of zipRead.listStoreEntries(buf)) {
    // 逐 entry CRC32 校验（损坏则返回失败而非抛错，保持本函数「返回结果对象」的契约）
    if (crc32(e.data) !== e.crcStored)
      return { ok: false, reason: i18n.errKey('common.errBackupCrcBad', { name: e.name }) };
    files[e.name] = Buffer.from(e.data);
  }
  const chkRaw = files['checksums.json'];
  if (!chkRaw) return { ok: false, reason: i18n.errKey('common.errBackupNoChecksums') };

  // checksums 为口令加密容器时，必须提供口令解密（L2 防伪造）
  const encrypted = packProtect.isEncrypted(chkRaw);
  let signed;
  try {
    signed = encrypted ? JSON.parse(packProtect.decryptChecksums(chkRaw, pass)) : JSON.parse(chkRaw.toString('utf8'));
  } catch (e) {
    return { ok: false, reason: e.message, encrypted };
  }

  // L1：对包内每个真实文件（除 checksums.json 自身）比对 sha256 + crc32 与摘要一致
  for (const [name, data] of Object.entries(files)) {
    if (name === 'checksums.json') continue;
    const entry = signed.files && signed.files[name];
    if (!entry) return { ok: false, reason: i18n.errKey('common.errBackupEntryExtra', { name }) };
    if (releaseSign.sha256(data) !== entry.sha256)
      return { ok: false, reason: i18n.errKey('common.errBackupHashMismatch', { name }) };
    if (releaseSign.crc32(data) !== entry.crc32)
      return { ok: false, reason: i18n.errKey('common.errBackupCrcMismatch2', { name }) };
  }
  return { ok: true, encrypted };
}

/** 探测备份 zip 内 checksums.json 是否为口令加密容器（无需口令即可判断） */
function backupEncrypted(buf) {
  for (const e of zipRead.listStoreEntries(buf)) {
    if (e.name === 'checksums.json') return packProtect.isEncrypted(Buffer.from(e.data));
  }
  return false;
}

module.exports = { backupAll, buildZip, verifyBackupZip, backupEncrypted };
