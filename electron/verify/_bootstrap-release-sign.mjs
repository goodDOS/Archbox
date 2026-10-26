'use strict';
/**
 * 测试引导：在加载 integrity / release-sign 之前注入发布方私钥。
 *
 * release-sign 在模块加载时读取 process.env.ARCHBOX_RELEASE_PRIVATE_KEY，
 * 若未注入则只能验签、不能签名 —— 而单测里的 buildManifest / writeManifest
 * 需要签名。本引导从项目根的 release-private.pem 读取私钥（该文件已在
 * .gitignore，仅发布者本地存在），或回退到「随机生成」。
 *
 * 注意：回退到随机私钥时，必须**同时注入配对公钥**（ARCHBOX_RELEASE_PUBLIC_KEY_PEM），
 *   否则签名方与验签方不是同一把钥匙，签完立刻验签必然失败 ——
 *   而本地因为有 release-private.pem 会全绿，只有干净 clone 才暴露，很难在推送前发现。
 *   现在两条路径都自成一对：有 pem 用 pem（与内嵌公钥同源），没有就自己造一对。
 *
 * 用法（必须在任何 require('../services/integrity') 之前调用）：
 *   import { bootstrapReleaseSign } from './_bootstrap-release-sign.mjs';
 *   bootstrapReleaseSign();
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

export function bootstrapReleaseSign() {
  if (process.env.ARCHBOX_RELEASE_PRIVATE_KEY) return;
  const f = path.join(ROOT, 'release-private.pem');
  if (fs.existsSync(f)) {
    process.env.ARCHBOX_RELEASE_PRIVATE_KEY = fs.readFileSync(f, 'utf8').trim();
    return;
  }
  // 回退：随机生成，并**同时注入配对公钥**。
  // ★ 只注入私钥是不够的 ★
  //   内嵌公钥写死在 release-sign.js 里，随机私钥签出来的东西用它必然验不过，
  //   于是「本地有 release-private.pem 时全绿、公开仓库干净 clone 上必红」。
  //   配套公钥通过 ARCHBOX_RELEASE_PUBLIC_KEY_PEM 覆盖（见 release-sign.js 注释），
  //   这样夹具自成一对钥匙，签名方与验签方同源。
  const kp = crypto.generateKeyPairSync('ed25519');
  process.env.ARCHBOX_RELEASE_PRIVATE_KEY = kp.privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.ARCHBOX_RELEASE_PUBLIC_KEY_PEM = kp.publicKey.export({ type: 'spki', format: 'pem' });
}
