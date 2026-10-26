'use strict';
/**
 * 发布方签名模块（只用于「程序文件清单」app-integrity.json 的签名与验签）。
 *
 * ★ 与 pack-sign（用户数据签名）彻底分离的原因 ★
 *   pack-sign 处理「用户自己的数据」（文档包 / 备份 / 数据库 .sig），密钥是
 *   **每个用户本机生成**的，公私钥一起保存在本地，用于「本机导出→导入」的
 *   完整性自证。
 *
 *   本模块处理「发布方对程序文件清单的签名」。私钥只能存在于**发布者的
 *   打包机**上，绝不能随源码公开（否则任何人都能重签被篡改的清单）。因此：
 *     - 私钥通过环境变量 ARCHBOX_RELEASE_PRIVATE_KEY（PEM）在打包时注入，
 *       只有打包机（afterPack）持有；
 *     - 公钥**内嵌在客户端源码里**（公钥本就公开，随客户端分发用于验签），
 *       它在 buildManifest 时由私钥派生、作为常量写入 —— 但要注意：公钥必须
 *       与私钥「同源」，由同一把私钥派生，否则验签对不上。
 *
 * ★ 公钥为什么要内嵌在源码，而不是放在清单里 ★
 *   若把公钥放进清单（man.publicKey），攻击者篡改清单时可以同时替换公钥+签名，
 *   用自己的私钥重签，验签照样通过 —— 等于没有防护。所以公钥是「验签的信任
 *   锚点」，必须写死在客户端代码里（它随 asar 头哈希被 exe 内的 fuse 守护，
 *   本身无法被改）。攻击者改不了代码里的公钥，就伪造不了清单签名。
 *
 *   私钥的生成（只在发布者本地执行一次）：
 *     node -e "const c=require('crypto');const k=c.generateKeyPairSync('ed25519');
 *       const p=k.privateKey.export({type:'pkcs8',format:'pem'});
 *       const u=k.publicKey.export({type:'spki',format:'pem'});
 *       require('fs').writeFileSync('release-private.pem',p);
 *       console.log('私钥已写入 release-private.pem');console.log('公钥：');console.log(u);"
 *   把打印出的公钥 PEM 填到下方 RELEASE_PUBLIC_KEY_PEM 常量；私钥文件
 *   release-private.pem 务必加入 .gitignore 并备份到安全位置（丢失则无法
 *   重签旧版本的清单）。
 */
const crypto = require('crypto');
const i18n = require('../i18n');

const SIGN_ALG = 'ed25519';

/**
 * 发布方公钥（SPKI PEM，可公开，随客户端分发）。
 * 由打包机的私钥派生，必须在首次配置私钥时填入，并与私钥同源。
 */
const RELEASE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA1kQMVHbmbM2+Lf7PiPYsmFsY1Emc/K9oeHftjl3vEBY=
-----END PUBLIC KEY-----`;

/* ★ 为什么公钥也允许被环境变量覆盖（仅测试用）★
 *
 * 生产口径不变：公钥随客户端分发、写死在包里，这样攻击者即使改了清单也换不掉验证方
 * （见文件头第 19 行那段说明）。但**测试夹具**需要「自己造一把钥匙、自己验通」：
 * 公开仓库里没有 release-private.pem，_bootstrap-release-sign.mjs 只能随机生成私钥，
 * 若不同时注入配对公钥，就会出现「签名方与验签方不是同一把钥匙」，
 * 本地有私钥时全绿、干净 clone 上必红 —— 这正是公开前踩过的坑。
 *
 * 安全边界：该变量只在宿主进程环境里生效。产物启动时环境由 Electron 自己给出，
 * 外部改不了；而真要在本机设置环境变量绕过的攻击者，本来就能直接改文件。
 * 故不降低实际防护，只让夹具可信。
 */
const RELEASE_PUBLIC_KEY_PEM_RAW = process.env.ARCHBOX_RELEASE_PUBLIC_KEY_PEM || RELEASE_PUBLIC_KEY_PEM;

/** 打包时注入的发布方私钥（PEM）。为空表示当前进程不是发布者，只能验签。 */
const RELEASE_PRIVATE_KEY_PEM = process.env.ARCHBOX_RELEASE_PRIVATE_KEY || '';

let releasePrivateKey = null;
if (RELEASE_PRIVATE_KEY_PEM) {
  releasePrivateKey = crypto.createPrivateKey(RELEASE_PRIVATE_KEY_PEM);
}

/** 是否具备签名能力（仅打包机注入私钥时为 true）。 */
function canSign() {
  return releasePrivateKey !== null;
}

/**
 * 发布方签名。
 * @param {Buffer|string} data
 * @returns {string} base64 签名
 * @throws 未注入私钥时抛错
 */
function sign(data) {
  if (!releasePrivateKey) {
    throw new Error('[release-sign] release private key not set (ARCHBOX_RELEASE_PRIVATE_KEY)');
  }
  const d = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  return crypto.sign(null, d, releasePrivateKey).toString('base64');
}

/**
 * 发布方验签（用内嵌公钥）。
 * @param {Buffer|string} data
 * @param {string} sigB64 base64 签名
 * @returns {boolean}
 */
function verify(data, sigB64) {
  try {
    const d = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    const sig = Buffer.from(String(sigB64 || ''), 'base64');
    return crypto.verify(null, d, crypto.createPublicKey(RELEASE_PUBLIC_KEY_PEM_RAW), sig);
  } catch (e) {
    return false;
  }
}

/** 由私钥派生公钥（SPKI PEM），供配置公钥常量时使用。 */
function derivePublicKey(privateKeyPem) {
  return crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' });
}

/* —— 高层封装（此前供文档包/备份的 L1+L2 签名摘要使用）——
 *
 * ★ 文档包/备份已改用可选口令加密（services/pack-protect.js）★
 *   下面的 buildSignedChecksums / verifySignedChecksums 已不再被文档包/备份调用，
 *   保留仅为通用签名摘要能力（无当前调用方）。sha256 / crc32 / exporterFingerprint
 *   仍被 archpack.js / zip-backup.js 使用（纯哈希计算与来源甄别指纹）。
 */

/** SHA-256 十六进制摘要 */
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/* CRC32（标准多项式 0xEDB88320），与 pack-sign 同口径 */
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
 * 生成「校验摘要对象」：对一组文件的 sha256/crc32 汇总，再用发布方私钥签名。
 * @param {Object<string,{sha256:string,crc32:number}>>} files
 * @param {string} [scope]
 */
function buildSignedChecksums(files, scope) {
  const payload = {
    algorithm: 'sha256+crc32/ed25519',
    scope: scope || 'archive',
    signedAt: { ts: Date.now() },
    files
  };
  const payloadStr = JSON.stringify(payload);
  return { ...payload, signature: sign(payloadStr) };
}

/**
 * 验证「校验摘要对象」：重算签名比对（L2），files 内哈希由调用方自行比对（L1）。
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
 * 发布方指纹：由内嵌公钥派生的一段稳定短标识。
 * 文档包 manifest.pack.origin 用它甄别「是否出自本套程序/同一发布方」。
 * @returns {string} 形如 `AK-XXXXXXXXXXXX`
 */
function exporterFingerprint() {
  const h = sha256(RELEASE_PUBLIC_KEY_PEM_RAW)
    .replace(/[^0-9a-f]/gi, '')
    .toUpperCase();
  return 'AK-' + h.slice(0, 12);
}

module.exports = {
  SIGN_ALG,
  canSign,
  sign,
  verify,
  derivePublicKey,
  sha256,
  crc32,
  buildSignedChecksums,
  verifySignedChecksums,
  exporterFingerprint
};
