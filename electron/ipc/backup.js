'use strict';
/**
 * 自动异地备份通道：选择异地备份目录、立即执行一次备份（含旧备份清理）。
 */
const path = require('path');
const db = require('../db');
const autoBackup = require('../services/auto-backup');
const zipBackup = require('../services/zip-backup');
const datadir = require('../services/datadir');
const { pickDirectory } = require('../services/dialog');
const i18n = require('../i18n');
const { handle, currentUser, safeAudit, getLog } = require('./shared');

function registerBackup() {
  /* ---------- 自动异地备份 ---------- */
  handle('backup:chooseTarget', async () => {
    const dir = await pickDirectory({ title: i18n.t('menu.backupPickDir'), create: true });
    if (!dir) return null;
    datadir.assertWritable(dir, '备份目录');
    db.setSetting('backup.targetDir', dir);
    return dir;
  });
  // 立即执行一次异地备份（写入 backup.targetDir）
  handle('backup:run', async () => {
    const target = db.getSetting('backup.targetDir', '');
    if (!target) throw new Error(i18n.errKey('common.errBackupDirUnset'));
    const r = autoBackup.perform(db, zipBackup, { targetDir: target, retain: db.getSetting('backup.retain', 5) });
    // perform() 内部已写入 backup.lastAt（数字时间戳），此处不再冗余覆盖，
    // 避免把数字覆盖成字符串导致调度判断 now - last 得 NaN、自动备份失效。
    safeAudit(currentUser(), '异地备份', 'storage', '', { file: path.basename(r.file), pruned: r.pruned });
    getLog().info(`[操作] 异地备份 完成 → ${path.basename(r.file)}（清理 ${r.pruned || 0} 个旧备份）`);
    return r;
  });
}

module.exports = { registerBackup };
