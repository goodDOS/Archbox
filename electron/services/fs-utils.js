'use strict';
/**
 * 文件系统通用工具（单一来源）：目录体积 / 递归列文件 / 字节格式化。
 *
 * 此前这三段逻辑分散在 db/stats.js（dirSize）、services/datadir.js（listFiles）
 * 与 ipc/storage.js（内联 `/1024 KB`）各自实现，行为略有出入（如 listFiles 走
 * withFileTypes 递归、dirSize 走栈式遍历），且字节格式化后端一直缺统一入口。
 * 现收敛到此处：三处调用方改 import，后端自此有与前端 timefmt.formatBytes
 * 同口径的字节格式化（formatBytes）。
 */
const fs = require('fs');
const path = require('path');

/** 遍历时跳过的文件名（自检探针等临时文件，见 datadir.PROBE_NAMES） */
const SKIP_NAMES = new Set(['.write_test', '.write_probe']);

/**
 * 递归计算目录体积（字节）。目录不存在 / 不可读时返回 0（尽力而为，不抛错）。
 * @param {string} dir 绝对路径
 * @returns {number} 总字节数
 */
function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (SKIP_NAMES.has(e.name)) continue;
      const fp = path.join(cur, e.name);
      try {
        if (e.isDirectory()) stack.push(fp);
        else if (e.isFile()) total += fs.statSync(fp).size;
      } catch {
        /* 单文件不可读时跳过，不影响整体统计 */
      }
    }
  }
  return total;
}

/**
 * 递归列出目录下全部文件，返回相对路径数组（以 '/' 分隔）。
 * 跳过自检探针等临时文件。目录不可读时返回空数组（不抛错）。
 * @param {string} dir 绝对路径
 * @returns {string[]} 相对路径数组
 */
function listFiles(dir) {
  const out = [];
  function walk(cur, base) {
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP_NAMES.has(e.name)) continue;
      const abs = path.join(cur, e.name);
      const rel = base ? base + '/' + e.name : e.name;
      try {
        if (e.isDirectory()) walk(abs, rel);
        else if (e.isFile()) out.push(rel);
      } catch {
        /* 单文件不可读时跳过 */
      }
    }
  }
  walk(dir, '');
  return out;
}

/**
 * 字节数 → 人类可读体积字符串（与前端 src/utils/timefmt.formatBytes 同口径）。
 * @param {number} bytes
 * @returns {string} 如 `1.5 MB`
 */
function formatBytes(bytes) {
  const b = Math.max(0, Number(bytes) || 0);
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

module.exports = { dirSize, listFiles, formatBytes };
