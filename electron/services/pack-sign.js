'use strict';
/**
 * 用户数据完整性签名模块 —— 现仅用于「数据库 .sig」的本机自证。
 *
 * ★ 文档包 / 备份已改用「可选口令加密」（见 services/pack-protect.js）★
 *   文档包（archpack.js）与全量备份（zip-backup.js）的 L2 保护此前由本模块的
 *   Ed25519 签名承担。但单机开源软件里私钥随客户端分发即公开，防伪造自毁；
 *   已改为「用户口令经 scrypt 派生 AES-256-GCM 加密 checksums」（口令天然不分发）。
 *   本模块保留 buildSignedChecksums / verifySignedChecksums 作为通用签名封装，
 *   当前唯一实际使用者是数据库 .sig（writeDbSignature / 校验）。
 *
 * ★ 密钥来源（本模块不生成、不落盘，只持有）★
 *   本模块签名/验签所需的 Ed25519 密钥对由**每个用户在本机首次使用时生成**，
 *   由 keystore 持久化并提供。这样：
 *     - 私钥不再随源码分发 —— 开源后没有任何硬编码私钥可被提取；
 *     - 数据库 .sig 由「自己的密钥」签名，用于「本机数据完整性自证」
 *       （防手滑改错 / 传输比特翻转 / 第三方伪造同一用户的库）。
 *
 *   它提供的保护边界（必须如实告知）：
 *     - 「本机数据」的防损坏、防伪造 —— 强（私钥只有本机有）；
 *     - 「跨用户来源甄别」—— 弱（密钥是每个用户各自的，指纹不能证明
 *       「同一发布方」，只能证明「同一用户/同一台设备」）。
 *   程序文件清单（app-integrity.json）的签名**不归本模块管**，
 *   改由 release-sign（发布方私钥，仅打包机持有）负责。
 *
 * ★ 无状态、可注入 ★
 *   模块加载时处于「未配置」状态，任何 sign/verify 在配置前调用都返回失败
 *   （sign 抛错、verify 返回 false），由 keystore 在启动初始化时调用 configure()
 *   注入当前用户的密钥对。测试可直接 configure() 随机密钥，不依赖磁盘。
 */
const crypto = require('crypto');
const i18n = require('../i18n');

const SIGN_ALG = 'ed25519';

/** 当前配置的密钥对（由 configure 注入，初始为空） */
let privateKey = null;
let publicKey = null;
let publicKeyPem = '';

/**
 * 注入密钥对。私钥 PEM 与公钥 PEM 二者传其一即可（另一个自动派生）。
 * @param {{privateKeyPem?: string, publicKeyPem?: string}} opts
 */
function configure(opts = {}) {
  if (opts.privateKeyPem) {
    privateKey = crypto.createPrivateKey(opts.privateKeyPem);
    publicKey = crypto.createPublicKey(privateKey);
  } else if (opts.publicKeyPem) {
    publicKey = crypto.createPublicKey(opts.publicKeyPem);
    privateKey = null; // 只有公钥时只能验签
  }
  publicKeyPem = publicKey ? publicKey.export({ type: 'spki', format: 'pem' }) : '';
}

/** 当前是否已配置密钥（未配置则 sign 抛错、verify 恒 false） */
function isConfigured() {
  return publicKey !== null;
}

/** 生成一对新密钥（供 keystore 首次初始化使用，不落盘、不存模块态） */
function generateKeyPair() {
  const { privateKey: priv, publicKey: pub } = crypto.generateKeyPairSync('ed25519');
  return {
    privateKeyPem: priv.export({ type: 'pkcs8', format: 'pem' }),
    publicKeyPem: pub.export({ type: 'spki', format: 'pem' })
  };
}

/** SHA-256 十六进制摘要 */
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/* CRC32（标准多项式 0xEDB88320），用于 L1 低层损坏检测 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * 对数据签名（Ed25519 直接对消息签名，内部已做哈希）。
 * 未配置密钥时抛错（调用方必须先经 keystore 初始化）。
 * @param {Buffer|string} data
 * @returns {string} base64 签名
 */
function sign(data) {
  if (!privateKey) throw new Error('[pack-sign] key not configured; keystore must init first');
  const d = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  return crypto.sign(null, d, privateKey).toString('base64');
}

/**
 * 验签。未配置密钥时返回 false。
 * @param {Buffer|string} data
 * @param {string} sigB64 base64 签名
 * @returns {boolean}
 */
function verify(data, sigB64) {
  if (!publicKey) return false;
  try {
    const d = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    const sig = Buffer.from(String(sigB64 || ''), 'base64');
    return crypto.verify(null, d, publicKey, sig);
  } catch (e) {
    return false;
  }
}

/**
 * 生成「校验摘要对象」：对一组文件的 sha256/crc32 汇总，
 * 再对摘要 JSON 签名，返回 { algorithm, signedAt, files, signature }
 * @param {Object<string,{sha256:string,crc32:number}>>} files  相对路径 -> 校验值
 * @param {string} [scope] 标识范围，如 'archboxpack' / 'db-backup'
 */
function buildSignedChecksums(files, scope) {
  const payload = {
    algorithm: 'sha256+crc32/ed25519',
    scope: scope || 'archive',
    signedAt: { ts: Date.now() },
    files
  };
  const payloadStr = JSON.stringify(payload);
  return {
    ...payload,
    signature: sign(payloadStr)
  };
}

/**
 * 验证「校验摘要对象」：重算签名比对（L2）+ 调用方自行比对 files 内哈希（L1）
 * @returns {{ok:boolean, reason?:string}}
 */
function verifySignedChecksums(signed) {
  if (!signed || typeof signed !== 'object') return { ok: false, reason: i18n.errKey('common.errSignObjMissing') };
  const { signature, ...rest } = signed;
  const payloadStr = JSON.stringify(rest);
  if (!verify(payloadStr, signature)) return { ok: false, reason: i18n.errKey('common.errSignVerifyFail') };
  return { ok: true };
}

/**
 * 导出者指纹：由当前用户公钥派生的一段稳定短标识，写入文档包 manifest.pack.origin，
 * 用于「甄别」——判断文档包是否出自同一用户/同一台设备。
 * 未配置密钥时返回 null（调用方应在此之前确保已初始化）。
 * @returns {string|null} 形如 `AK-XXXXXXXXXXXX`
 */
function exporterFingerprint() {
  if (!publicKeyPem) return null;
  const h = sha256(publicKeyPem)
    .replace(/[^0-9a-f]/gi, '')
    .toUpperCase();
  return 'AK-' + h.slice(0, 12);
}

module.exports = {
  SIGN_ALG,
  configure,
  isConfigured,
  generateKeyPair,
  sha256,
  crc32,
  sign,
  verify,
  buildSignedChecksums,
  verifySignedChecksums,
  exporterFingerprint
};
