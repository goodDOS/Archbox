'use strict';
/**
 * 数据目录契约（单一数据源 / single source of truth）
 *
 * ★ 为什么要有这个模块 ★
 *   数据目录下有哪些文件，此前在「迁移白名单」（ipc/storage.js）与「备份」
 *   （services/zip-backup.js）里各写了一遍，靠人肉维护同步——这正是 share.db
 *   被漏掉两次的根因。凡「数据移动 / 备份 / 恢复 / 校验」功能殊途同归，都是
 *   「搬运 / 打包数据目录里的文件」，因此把文件名与清单收敛到这一个模块，
 *   新增数据文件只改这里，所有功能自动跟上。
 *
 * 数据目录下的文件（相对路径 → 用途）：
 *   archive.db            主数据库（SQLite；加密模式下端上即为密文）
 *   archive.db.sig        主库完整性签名（L1 sha256 + L2 Ed25519 + CRC32）
 *   share.db              局域网共享镜像库（独立 SqlJs 实例，物理隔离）
 *   lan-visitors.json     局域网访客访问记录
 *
 * 注：加密口令文件 enc.key、数据目录指针 storage.json、clock.json、logs/ 等
 *     属于「本机运行时状态」，位于 userData 根，**不随数据目录迁移/备份**，
 *     故不在此列（备份/迁移它们反而有害：enc.key 绑定本机账户，指针会指回旧路径）。
 */
const path = require('path');
const i18n = require('../i18n');
const { listFiles } = require('./fs-utils');

/** 相对文件名常量（避免各功能散落字面量拼错） */
const FILES = {
  DB: 'archive.db',
  DB_SIG: 'archive.db.sig',
  DB_SIG_SUFFIX: '.sig', // archive.db 的伴随签名后缀（core.js 以 dbPath + suffix 生成）
  SHARE_DB: 'share.db',
  LAN_VISITORS: 'lan-visitors.json'
};

/**
 * 可写探针文件名清单（历史遗留的两个字面量：core 用 .write_probe、
 * storage/boot/backup/auto-backup 用 .write_test）。收敛到此处：
 * listFiles 跳过它们、assertWritable 用统一的一个写入再删除。
 */
const PROBE_NAMES = ['.write_test', '.write_probe'];

/**
 * 数据目录的「核心数据文件」清单——用于迁移白名单兜底等需精确文件名的场景。
 * 顺序即迁移顺序（主库优先）。
 * @returns {string[]} 相对文件名数组
 */
function coreFileNames() {
  return [FILES.DB, FILES.DB_SIG, FILES.SHARE_DB, FILES.LAN_VISITORS];
}

/**
 * 递归列出数据目录下的全部数据文件（含未来新增），返回相对路径数组。
 * 用于「整目录备份」等不需要白名单的场景——新增文件天然覆盖。
 * 跳过自检探针等临时文件。实现已收敛到 fs-utils.listFiles（单一来源）。
 * @param {string} dataDir
 * @returns {string[]} 相对路径数组（以 '/' 分隔）
 */

/**
 * 数据目录可写断言：写一个探针文件再删除，不可写则抛错。
 *
 * 此前这段「writeFileSync → unlinkSync」在 5 处各写一遍，且探针文件名还不一致
 * （.write_probe / .write_test）。收敛到这里后，凡「写数据目录 / 备份目录」前
 * 都调本函数，行为与提示文案统一。
 *
 * @param {string} dir 目标目录（数据目录 / 备份目录 / 迁移目标目录）
 * @param {string} [label] 用于报错的目录中文名，如「数据目录」「备份目录」
 * @throws {Error} 不可写时抛出带可读文案的错误
 */
function assertWritable(dir, label = '数据目录') {
  const fs = require('fs');
  const probe = path.join(dir, PROBE_NAMES[0]);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
  } catch (e) {
    throw new Error(
      i18n.errKey('common.errDirNotWritable', {
        label,
        dir,
        reason: (e && e.message) || i18n.t('common.errUnknownReason')
      })
    );
  }
}

/**
 * 数据目录可写探测（不抛错版，供启动时置 state.writable 用）。
 * @returns {boolean}
 */
function canWrite(dir) {
  try {
    assertWritable(dir);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { FILES, PROBE_NAMES, coreFileNames, listFiles, assertWritable, canWrite };
