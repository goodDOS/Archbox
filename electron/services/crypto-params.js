'use strict';
/**
 * 加密参数（单一来源 / single source of truth）。
 *
 * 数据库透明加密的 scrypt 派生参数此前在 crypto.js 的 SCRYPT 常量与
 * security.js 的算法描述文案里各写一遍（N/r/p 字面量），改参数时极易漏改一处，
 * 导致「实际派生参数」与「界面展示的算法描述」不一致。
 * 现把 N/r/p 收敛到此处：crypto.js 据此派生密钥，security.js 据此生成描述文案。
 *
 * ★ 只统一来源、不改生效值 ★
 *   已加密的库是拿 N=16384/r=8/p=1 派生的密钥锁的，任何改动都会导致
 *   旧库无法解密。这些值必须保持冻结，除非有迁移方案。
 */
const SCRYPT = {
  N: 16384,
  r: 8,
  p: 1,
  /** scrypt 内存上限（Node 默认 32MB 对 N=16384/r=8 不够，需放宽到 64MB） */
  maxmem: 64 * 1024 * 1024
};

/** 供界面展示的算法描述（如「AES-256-GCM + scrypt(N=16384,r=8,p=1)」） */
function algoLabel() {
  return `AES-256-GCM + scrypt(N=${SCRYPT.N},r=${SCRYPT.r},p=${SCRYPT.p})`;
}

module.exports = { SCRYPT, algoLabel };
