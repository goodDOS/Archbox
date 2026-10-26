'use strict';
/**
 * 文档包 / 备份的「可选口令保护」模块。
 *
 * ★ 为什么用口令加密替代 Ed25519 签名 ★
 *   单机开源软件里，「私钥」一旦随源码/客户端分发，开源即公开，任何人都能
 *   拿它伪造文档包或备份（L2 防伪造自毁）。而「口令」是用户脑子里唯一
 *   天然不分发、不进代码的秘密，能真正防第三方伪造。
 *
 *   因此文档包 / 备份的完整性保护从「Ed25519 签名」改为「可选口令加密」：
 *     - 无口令：checksums.json 只保留 sha256+crc32（纯哈希，L1 防损坏/比特翻转，
 *       不防伪造——第三方可重算哈希，但这与「明文包」的语义一致，用户自担）；
 *     - 有口令：用口令经 scrypt 派生 AES-256-GCM 密钥，把整个 checksums.json
 *       加密成密文写入包内，第三方不知口令则无法伪造一份能通过解密的摘要
 *       （L2 防伪造，跨机迁移靠口令而非本机密钥）。
 *
 * ★ 文件格式 ★
 *   加密后的 checksums.json 是一个带 8 字节魔数的容器：
 *     MAGIC(8B "PACKENC1") + salt(16B) + iv(12B) + GCM tag(16B) + 密文
 *   与 crypto.js 的 ARCHENC1 同构但魔数不同，避免与「加密数据库」混淆。
 *
 * ★ 为什么只加密 checksums.json 而非整个 manifest ★
 *   保留 manifest.json 明文，接收方在不输入口令时仍能预览包内内容（大区/分类/
 *   文档标题等），仅在「导入/恢复」那一刻要求口令校验完整性。这与数据库加密
 *   「预览需口令」的取舍不同：文档包是「导出给他人」的，读标题不应成为障碍。
 */
const crypto = require('crypto');
const i18n = require('../i18n');
const { SCRYPT } = require('./crypto-params');

const MAGIC = Buffer.from('PACKENC1');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN; // 52

/** 一段 buffer 是否为「口令加密的 checksums」容器 */
function isEncrypted(buf) {
  return Buffer.isBuffer(buf) && buf.length > HEADER_LEN && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

/** 口令 + salt -> 32 字节 AES 密钥 */
function deriveKey(pass, salt) {
  return crypto.scryptSync(String(pass), salt, 32, SCRYPT);
}

/**
 * 用口令加密 checksums.json 的明文 JSON 文本，返回加密容器 Buffer。
 * @param {string} plainJson 明文 JSON 字符串
 * @param {string} pass 口令
 * @returns {Buffer}
 */
function encryptChecksums(plainJson, pass) {
  if (!pass) throw new Error(i18n.errKey('common.errPackPassEmpty'));
  const salt = crypto.randomBytes(SALT_LEN);
  const key = deriveKey(pass, salt);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = Buffer.from(plainJson, 'utf8');
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, salt, iv, tag, ct]);
}

/**
 * 用口令解密 checksums 容器，返回明文 JSON 字符串。
 * 口令错误或容器被篡改时抛错。
 * @param {Buffer} buf 加密容器 Buffer
 * @param {string} pass 口令
 * @returns {string} 明文 JSON 字符串
 */
function decryptChecksums(buf, pass) {
  if (!pass) throw new Error(i18n.errKey('common.errPackPassRequired'));
  if (!isEncrypted(buf)) throw new Error(i18n.errKey('common.errPackNotEncrypted'));
  const salt = buf.subarray(MAGIC.length, MAGIC.length + SALT_LEN);
  const iv = buf.subarray(MAGIC.length + SALT_LEN, MAGIC.length + SALT_LEN + IV_LEN);
  const tag = buf.subarray(MAGIC.length + SALT_LEN + IV_LEN, HEADER_LEN);
  const ct = buf.subarray(HEADER_LEN);
  const key = deriveKey(pass, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (e) {
    throw new Error(i18n.errKey('common.errPackPassWrong'));
  }
}

module.exports = {
  MAGIC,
  HEADER_LEN,
  isEncrypted,
  deriveKey,
  encryptChecksums,
  decryptChecksums
};
