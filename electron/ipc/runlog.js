'use strict';
/**
 * 运行日志通道：读取当日日志、渲染进程主动写日志、打开日志目录。
 * 均绕过锁定守卫（noLockGuard），便于锁定态下排查。
 */
const path = require('path');
const fs = require('fs');
const { app, shell } = require('electron');
const { getLog } = require('../services/logger');
const { handle } = require('./shared');

function registerRunlog() {
  handle(
    'log:read',
    async () => {
      const dir = path.join(app.getPath('userData'), 'logs');
      if (!fs.existsSync(dir)) return { lines: [], files: [] };
      const files = fs
        .readdirSync(dir)
        .filter(f => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(f))
        .sort()
        .reverse();
      const todayFile = files[0];
      if (!todayFile) return { lines: [], files };
      const content = fs.readFileSync(path.join(dir, todayFile), 'utf8');
      const lines = content.split('\n').filter(Boolean).slice(-500); // 最近 500 行
      return { lines, files, current: todayFile };
    },
    { noLockGuard: true }
  );
  // 渲染进程主动写日志（前端调试模式用于上报完整错误堆栈）；级别限定 info/warn/error/debug
  handle(
    'log:write',
    async p => {
      const lv = String((p && p.level) || 'INFO').toUpperCase();
      const msg = String(p && p.msg != null ? p.msg : '').slice(0, 20000);
      if (!msg) return true;
      const log = getLog();
      if (lv === 'ERROR') log.error(msg);
      else if (lv === 'WARN') log.warn(msg);
      else if (lv === 'DEBUG') log.debug(msg);
      else log.info(msg);
      return true;
    },
    { noLockGuard: true }
  );
  handle(
    'log:open',
    async () => {
      const dir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(dir, { recursive: true });
      shell.openPath(dir);
      return true;
    },
    { noLockGuard: true }
  );
}

module.exports = { registerRunlog };
