'use strict';
/**
 * 设置与搜索历史通道：全局设置读写、调试模式实时同步日志系统，
 * 以及按用户隔离的搜索历史词持久化（落地 userData，规避 file:// 沙盒）。
 */
const path = require('path');
const { app } = require('electron');
const db = require('../db');
const keystore = require('../keystore');
const sysdrive = require('../services/sysdrive');
const { setDebug, logDir } = require('../services/logger');
const { readJson, writeJson } = require('../services/userdata-store');
const { handle, currentUser } = require('./shared');

function registerSettings() {
  handle('settings:getAll', async () => ({
    ...db.allSettings(),
    dataDir: db.dataDirPath(),
    // 日志目录与数据目录同级而非其子目录，说明页要给出完整路径（见 services/logger.logDir 注释）
    logDir: logDir(),
    dataDirOnSystemDrive: sysdrive.isOnSystemDrive(db.dataDirPath()),
    systemDrive: sysdrive.systemDrive(),
    mac: keystore.getMac()
  }));
  handle('settings:set', async p => {
    const k = String(p.k).slice(0, 50);
    db.setSettingSafe(k, p.v, currentUser());
    // 调试模式开关变更时，实时同步到日志系统（控制是否记录报错堆栈）
    if (k === 'debug.captureStack') setDebug(!!p.v);
    return true;
  });

  /* 全局搜索历史词：持久化到 userData/search-history.json（按用户隔离）。
   * 不依赖 localStorage——file:// 协议下被浏览器沙盒禁用，持久化会静默失败、重启即丢。 */
  const SEARCH_HISTORY_FILE = path.join(app.getPath('userData'), 'search-history.json');
  function readSearchHistories() {
    return readJson(SEARCH_HISTORY_FILE, {});
  }
  function writeSearchHistories(map) {
    writeJson(SEARCH_HISTORY_FILE, map);
  }
  handle('searchHistory:get', async () => readSearchHistories());
  handle('searchHistory:set', async p => {
    const userId = String(p.userId || currentUser() || '0');
    const list = Array.isArray(p.list) ? p.list.filter(x => typeof x === 'string').slice(0, 50) : [];
    const map = readSearchHistories();
    map[userId] = list;
    writeSearchHistories(map);
    return true;
  });
}

module.exports = { registerSettings };
