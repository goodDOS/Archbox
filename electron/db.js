'use strict';
/**
 * 数据层聚合入口：保持 `require('./db')` 路径与原有导出签名完全不变，
 * 内部实现按职责拆分到 ./db/* 各模块（core/users/taxonomy/posts/notes/stats/share/seed）。
 * 纯结构重构，行为零变更。
 */
const core = require('./db/core');
const users = require('./db/users');
const taxonomy = require('./db/taxonomy');
const posts = require('./db/posts');
const notes = require('./db/notes');
const stats = require('./db/stats');
const seed = require('./db/seed');
const { getLog } = require('./services/logger');

/**
 * 安全审计写入（单一入口）：审计失败不应影响主流程（如导出已成功写盘）。
 *
 * 此前 IPC 层（ipc/shared.js）与 service 层（services/lan-share.js）各写了一份
 * 语义相同的 try/catch 包装，风格不一（一个用 getLog().warn、一个内联 warn）。
 * 收敛到此——db 层自带 logger（无 electron 依赖），IPC 与 service 都可直接复用，
 * 避免 ipc/shared 因依赖 electron 而无法被 service 引用。
 */
function safeAudit(userId, action, entity, entityId, detail) {
  try {
    core.audit(userId, action, entity, entityId, detail);
  } catch (e) {
    getLog().warn('audit 写入失败: ' + (e && e.message));
  }
}

module.exports = {
  /* core 公开 API */
  init: core.init,
  closeDb: core.closeDb,
  persist: core.persist,
  persistNow: core.persistNow,
  setDataDir: core.setDataDir,
  dataDirPath: core.dataDirPath,
  checkWritable: core.checkWritable,
  verifyDbIntegrity: core.verifyDbIntegrity,
  getPendingIntegrityWarn: core.getPendingIntegrityWarn,
  writeDbSignature: core.writeDbSignature,
  markIntegrityCompromised: core.markIntegrityCompromised,
  isIntegrityCompromised: core.isIntegrityCompromised,
  getIntegrityReason: core.getIntegrityReason,
  acceptCurrentAsBaseline: core.acceptCurrentAsBaseline,
  recordIntegrityIncident: core.recordIntegrityIncident,
  recordAppIntegrityIncident: core.recordAppIntegrityIncident,
  isEncryptedMode: core.isEncryptedMode,
  isDbFileEncrypted: core.isDbFileEncrypted,
  enableEncryption: core.enableEncryption,
  disableEncryption: core.disableEncryption,
  verifyPass: core.verifyPass,
  nowIso: core.nowIso,
  todayStr: core.todayStr,
  uid: core.uid,
  rnd6: core.rnd6,
  cleanHtml: core.cleanHtml,
  listAudit: core.listAudit,
  verifyAuditChain: core.verifyAuditChain,
  audit: core.audit,
  safeAudit,

  /* 用户与设置 */
  ...users,

  /* 大区 / 分类 / 标签 / 字段 */
  ...taxonomy,

  /* 文档 */
  ...posts,

  /* 便签 */
  ...notes,

  /* 统计 */
  ...stats,

  /* 演示数据 */
  ...seed
};
