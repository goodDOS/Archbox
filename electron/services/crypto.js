'use strict';
/**
 * 数据库透明加密服务（应用层实现，等效替代 SQLCipher，无需原生编译依赖）
 *
 * 文件格式（52 字节头）：
 *   MAGIC(8B "ARCHENC1") + salt(16B) + iv(12B) + GCM tag(16B) + 密文
 *
 * 安全设计：
 * - 算法：AES-256-GCM 认证加密—— confidentiality + 完整性/防篡改一步到位
 * - 密钥派生：scrypt(N=16384, r=8, p=1)——抗 GPU 暴力破解的口令哈希
 * - 口令永不落盘；「记住口令」由主进程经 Electron safeStorage（Windows 上为
 *   DPAPI，绑定当前 Windows 账户）包裹后存入 enc.key，拷走 keyfile 无法解密
 * - 每次落盘随机新 iv，同一明文两次加密的密文完全不同（语义安全）
 */
const crypto = require('crypto');
const i18n = require('../i18n');
const { SCRYPT } = require('./crypto-params');

const MAGIC = Buffer.from('ARCHENC1');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN; // 52

/** 文件是否为本格式的加密数据库 */
function isEncrypted(buf) {
  return Buffer.isBuffer(buf) && buf.length > HEADER_LEN && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

function randomSalt() {
  return crypto.randomBytes(SALT_LEN);
}

/** 口令 + salt -> 32 字节 AES 密钥 */
function deriveKey(pass, salt) {
  return crypto.scryptSync(String(pass), salt, 32, SCRYPT);
}

/** 明文 Buffer -> 加密文件 Buffer（salt 固定写入头部，iv 每次随机） */
function encryptBuffer(plain, key, salt) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, salt, iv, tag, ct]);
}

/**
 * 加密文件 Buffer -> 明文 Buffer
 * 认证失败（口令错误/文件被篡改）时抛出 Error
 */
function decryptBuffer(file, key) {
  if (!isEncrypted(file)) throw new Error(i18n.errKey('settings.errNotEncryptedFile'));
  const salt = file.subarray(MAGIC.length, MAGIC.length + SALT_LEN);
  const iv = file.subarray(MAGIC.length + SALT_LEN, MAGIC.length + SALT_LEN + IV_LEN);
  const tag = file.subarray(MAGIC.length + SALT_LEN + IV_LEN, HEADER_LEN);
  const ct = file.subarray(HEADER_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return { plain: Buffer.concat([decipher.update(ct), decipher.final()]), salt };
  } catch (e) {
    throw new Error(i18n.errKey('settings.errUnlockAuthFailed'));
  }
}

/** 从加密文件头读取 salt（无需口令） */
function readSalt(file) {
  if (!isEncrypted(file)) return null;
  return file.subarray(MAGIC.length, MAGIC.length + SALT_LEN);
}

/** 常数时间比较两个密钥是否一致（长度不同直接 false） */
function keysEqual(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  MAGIC,
  SALT_LEN,
  IV_LEN,
  TAG_LEN,
  HEADER_LEN,
  isEncrypted,
  randomSalt,
  deriveKey,
  encryptBuffer,
  decryptBuffer,
  readSalt,
  keysEqual
};
