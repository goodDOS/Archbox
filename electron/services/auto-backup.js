'use strict';
/**
 * 自动异地备份服务
 * - 复用 zip-backup 的全量打包（数据目录下全部数据文件），写入用户指定的「异地」目录
 *   （可指向 U 盘 / 局域网共享 / OneDrive 等云同步目录，实现物理异地）
 * - 自动按保留份数清理旧备份，避免目录无限膨胀
 * - 调度判断（maybe）由主进程 ticker 调用；执行（perform）同时供「立即备份」与退出前备份复用
 */
const fs = require('fs');
const path = require('path');
const { compactStamp } = require('./timefmt');
const datadir = require('./datadir');
const i18n = require('../i18n');

// 精确到秒 + 4 位随机，避免同一分钟内多次备份（连点「立即备份」/定时与退出撞车）同名覆盖
// 日期部分复用 timefmt.compactStamp（YYYYMMDD_HHMMSS），仅额外追加随机后缀。
function stamp() {
  return `${compactStamp()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 执行一次异地备份
 * @param {object} db          数据层（需 persistNow / dataDirPath / setSetting）
 * @param {object} zipBackup   zip-backup 服务（backupAll）
 * @param {object} opts        { targetDir, retain }
 * @returns {{file:string,name:string,pruned:number,retain:number}}
 */
function perform(db, zipBackup, { targetDir, retain = 5 }) {
  if (!targetDir || !fs.existsSync(targetDir)) throw new Error(i18n.errKey('common.errBackupDirMissing'));
  // 可写性探测（统一走 datadir.assertWritable，探针名与文案一致）
  datadir.assertWritable(targetDir, '备份目标目录');

  // 先强制落盘，确保备份包含最新数据
  db.persistNow();
  const zipBuf = zipBackup.backupAll(db.dataDirPath());
  const name = `archive-auto-backup_${stamp()}.zip`;
  const out = path.join(targetDir, name);
  fs.writeFileSync(out, zipBuf);

  // 仅清理本程序生成的自动备份；保留最近 retain 份
  const keep = Math.max(1, parseInt(retain, 10) || 5);
  const files = fs
    .readdirSync(targetDir)
    .filter(f => /^archive-auto-backup_.*\.zip$/.test(f))
    .map(f => ({ f, t: fs.statSync(path.join(targetDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  let pruned = 0;
  files.slice(keep).forEach(x => {
    try {
      fs.unlinkSync(path.join(targetDir, x.f));
      pruned++;
    } catch (e) {}
  });

  db.setSetting('backup.lastAt', Date.now());
  return { file: out, name, pruned, retain: keep };
}

/**
 * 调度判断：根据 backup.schedule 与 backup.lastAt 决定是否执行。
 * 不满足时机 / 未配置 / 已锁定时返回 null（不备份）。
 * @returns {null|{file,name,pruned,retain}}
 */
function maybe(db, zipBackup, { locked } = {}) {
  if (locked) return null;
  const schedule = db.getSetting('backup.schedule', 'off');
  if (schedule !== 'daily' && schedule !== 'weekly') return null;
  const target = db.getSetting('backup.targetDir', '');
  if (!target) return null;
  const raw = db.getSetting('backup.lastAt', 0);
  // 历史脏数据兼容：旧版本曾把 backup.lastAt 写成字符串（ISO），归一化为毫秒数字时间戳，
  // 否则 now - last 得 NaN、调度判断恒 false、自动备份失效。
  const last = typeof raw === 'number' ? raw : Date.parse(raw) || 0;
  const now = Date.now();
  const interval = schedule === 'daily' ? 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000;
  if (last && now - last < interval) return null;
  try {
    return perform(db, zipBackup, { targetDir: target, retain: db.getSetting('backup.retain', 5) });
  } catch (e) {
    return null;
  }
}

module.exports = { perform, maybe };
