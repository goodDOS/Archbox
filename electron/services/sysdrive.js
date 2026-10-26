'use strict';
/**
 * 系统盘检测：判断数据存储目录是否落在系统盘（典型如 Windows 的 C:）。
 * 系统盘上的用户数据在重装 / 还原系统时常被清空，故需提示用户迁离。
 */
const path = require('path');

// 取系统盘盘符（Windows 专属），如 "C:"
function systemDrive() {
  if (process.platform !== 'win32') return null;
  return (process.env.SystemDrive || 'C:').replace(/\\+$/, '').toUpperCase();
}

// 判断给定目录是否位于系统盘
function isOnSystemDrive(dir) {
  if (process.platform !== 'win32' || !dir) return false;
  const root = path.parse(dir).root.replace(/\\+$/, '').toUpperCase(); // 如 "C:"
  return root === systemDrive();
}

/**
 * 取给定目录所在盘的盘符（如 "D:"）。
 *
 * ★ 为什么要单独一个函数 ★
 *   首页「数据库位置」卡片要显示具体根盘符（用户要求：不要「数据盘」这种笼统说法，
 *   也不要在下面挂一行完整路径——路径太长不好看）。
 *   盘符提取属平台细节（Windows 是 `D:`，POSIX 是 `/`），必须收口在一处，
 *   不能让前端自己去 split/startsWith 猜。
 *
 * 非 Windows 平台返回 null（无盘符概念），由调用方决定如何回退展示。
 */
function driveOf(dir) {
  if (process.platform !== 'win32' || !dir) return null;
  const root = path.parse(dir).root; // "D:\"
  if (!root) return null;
  const d = root.replace(/\\+$/, '').toUpperCase(); // "D:"
  return d || null;
}

module.exports = { systemDrive, isOnSystemDrive, driveOf };
