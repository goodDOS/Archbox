'use strict';
/**
 * IPC 通道总入口（薄编排层）。
 *
 * 本文件不再内联任何业务 handler，仅按业务域聚合各子模块注册的通道。
 * 各域的实现见 electron/ipc/*.js：
 *   boot / auth / settings / taxonomy / posts / stats / audit /
 *   pack / exports / media / storage / backup / cleanup / security / runlog /
 *   window / find / contextmenu
 * 公共封装（统一通道注册器、参数清洗、用户注入、审计静默、流程日志、锁定守卫）
 * 见 electron/ipc/shared.js，由子模块直接复用。
 *
 * 对外接口保持不变：module.exports = { registerIpc }
 */
const { registerBoot } = require('./ipc/boot');
const { registerAuth } = require('./ipc/auth');
const { registerSettings } = require('./ipc/settings');
const { registerTaxonomy } = require('./ipc/taxonomy');
const { registerPosts } = require('./ipc/posts');
const { registerStats } = require('./ipc/stats');
const { registerAudit } = require('./ipc/audit');
const { registerPack } = require('./ipc/pack');
const { registerExports } = require('./ipc/exports');
const { registerMedia } = require('./ipc/media');
const { registerStorage } = require('./ipc/storage');
const { registerBackup } = require('./ipc/backup');
const { registerCleanup } = require('./ipc/cleanup');
const { registerSecurity } = require('./ipc/security');
const { registerRunlog } = require('./ipc/runlog');
const { registerLanShare, startIfEnabled, autoSyncIfNeeded, stopLan } = require('./ipc/lanshare');
const { registerWindow } = require('./ipc/window');
const { registerContextMenu } = require('./ipc/contextmenu');
const { registerTray } = require('./ipc/tray');

function registerIpc() {
  registerBoot();
  registerAuth();
  registerSettings();
  registerTaxonomy();
  registerPosts();
  registerStats();
  registerAudit();
  registerPack();
  registerExports();
  registerMedia();
  registerStorage();
  registerBackup();
  registerCleanup();
  registerSecurity();
  registerRunlog();
  registerLanShare();
  registerWindow();
  registerContextMenu();
  registerTray();
}

module.exports = { registerIpc, lanStartIfEnabled: startIfEnabled, lanAutoSync: autoSyncIfNeeded, lanStop: stopLan };
