'use strict';
/**
 * ZIP（STORE 模式）读取器（单一数据源）
 *
 * ★ 为什么独立成模块 ★
 *   本程序用 STORE 模式（无压缩）自建 ZIP 承载两类包：
 *     - 全量备份（zip-backup.js）
 *     - 文档包 .archboxpack（archpack.js）
 *   两者都需要「逐 local-file-header 遍历、按 STORE 取原文、可选 CRC32 校验」这套
 *   解析逻辑。此前 zip-backup 与 archpack 各手写了一份（同一段 0x04034b50 遍历），
 *   属「殊途同归」重复。这里收敛为唯一实现，两处共用。
 *
 * 仅支持 STORE（method 0）；DEFLATE 条目会被跳过（本程序从不产生）。
 */
const packSign = require('./pack-sign');
const i18n = require('../i18n');

/**
 * 遍历 ZIP 的 STORE 条目（不校验 CRC）。
 * @param {Buffer} buf
 * @returns {Array<{name:string,data:Buffer,crcStored:number}>}
 */
function listStoreEntries(buf) {
  const out = [];
  let off = 0;
  while (off + 4 <= buf.length) {
    if (buf.readUInt32LE(off) !== 0x04034b50) break; // 到达中央目录/结束段
    const method = buf.readUInt16LE(off + 8);
    const compSize = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const crcStored = buf.readUInt32LE(off + 14);
    const name = buf.toString('utf8', off + 30, off + 30 + nameLen);
    const dataStart = off + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    if (method === 0) out.push({ name, data, crcStored });
    off = dataStart + compSize;
  }
  return out;
}

/**
 * 解析 ZIP 为 { name: Buffer }，并在解包时逐 entry 校验 CRC32（损坏即抛）。
 * 用于文档包导入等「损坏必须硬失败」的场景。
 * @param {Buffer} buf
 * @param {string} [label] 错误前缀（如 '文档包' / '备份'），默认 'ZIP'
 * @returns {Object<string,Buffer>}
 */
function extractStoreChecked(buf, label = 'ZIP') {
  const files = {};
  for (const e of listStoreEntries(buf)) {
    if (packSign.crc32(e.data) !== e.crcStored) {
      throw new Error(i18n.errKey('common.errZipCorrupt', { label, name: e.name }));
    }
    files[e.name] = Buffer.from(e.data);
  }
  return files;
}

module.exports = { listStoreEntries, extractStoreChecked };
