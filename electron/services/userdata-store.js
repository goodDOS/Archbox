'use strict';
/**
 * userData 根目录下的 JSON 运行时状态读写（单一来源）。
 *
 * 此前 search-history.json（ipc/settings.js）、lan-tokens.json（ipc/lanshare.js）、
 * clock.json（services/clock.js）三处各自写一遍「readFileSync + JSON.parse 容错 /
 * writeFileSync + JSON.stringify 静默」，且原子性不统一（断电可能写坏半截文件）。
 * 现收敛为 readJson / writeJson：readJson 容错返回默认值，writeJson 走「临时文件 +
 * rename」原子落盘。
 *
 * 这些文件属于「本机运行时状态」（位于 userData 根，不随数据目录迁移/备份），
 * 与数据目录下的数据文件（见 datadir.js）是两回事，勿混用。
 */
const fs = require('fs');
const path = require('path');

/**
 * 读 JSON 文件，损坏/缺失时返回 fallback（默认 {}）。
 * @param {string} file 绝对路径
 * @param {*} [fallback={}] 读取失败或解析失败时的返回值
 */
function readJson(file, fallback = {}) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const j = JSON.parse(raw);
    return j == null ? fallback : j;
  } catch {
    return fallback;
  }
}

/**
 * 原子写 JSON：先写临时文件再 rename，避免写入中途崩溃/断电产生半截文件。
 * 任何写失败都静默（userData 不可写属预期，调用方不依赖写成功）。
 * @param {string} file 绝对路径
 * @param {*} value 可 JSON 序列化的值
 * @returns {boolean} 是否写成功
 */
function writeJson(file, value) {
  try {
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch {
    // 清理可能残留的临时文件
    try {
      fs.unlinkSync(file + '.tmp-' + process.pid);
    } catch {
      /* 忽略清理失败 */
    }
    return false;
  }
}

module.exports = { readJson, writeJson };
