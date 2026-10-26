'use strict';
/**
 * 数据库加密通道：状态查询、解锁、启用、关闭、修改口令。
 * 解锁类通道在锁定态可用（noLockGuard），其余需在已解锁态。
 */
const path = require('path');
const fs = require('fs');
const { safeStorage } = require('electron');
const db = require('../db');
const keystore = require('../keystore');
const cryptoSvc = require('../services/crypto');
const { algoLabel } = require('../services/crypto-params');
const state = require('../state');
const i18n = require('../i18n');
const { handle, currentUser, safeAudit } = require('./shared');
const { startIfEnabled } = require('./lanshare');
const usage = require('../services/usage');

function registerSecurity() {
  /* ---------- 数据库加密（security 系列：锁定态可用，noLockGuard） ---------- */
  handle(
    'security:status',
    async () => {
      return {
        locked: state.locked,
        encrypted: db.isEncryptedMode(),
        fileEncrypted: keystore.dbFileIsEncrypted(),
        keyFileExists: fs.existsSync(keystore.keyFile()),
        safeStorage: safeStorage.isEncryptionAvailable(),
        algo: algoLabel()
      };
    },
    { noLockGuard: true }
  );

  handle(
    'security:unlock',
    async p => {
      const pass = String(p.pass || '');
      if (!pass) throw new Error(i18n.errKey('settings.errNeedPass'));
      if (db.isEncryptedMode()) throw new Error(i18n.errKey('settings.errAlreadyUnlocked'));
      const dir = keystore.readDataDir();
      const fp = path.join(dir, 'archive.db');
      const file = fs.readFileSync(fp);
      if (!cryptoSvc.isEncrypted(file)) throw new Error(i18n.errKey('settings.errFileNotEncrypted'));
      const salt = cryptoSvc.readSalt(file);
      const key = cryptoSvc.deriveKey(pass, salt); // 抛错即口令错误
      await db.init(dir, { key }); // 内部会再次解密校验
      state.locked = false;
      state.writable = db.checkWritable() && !db.isIntegrityCompromised();
      // 切库/恢复加密库后待清会话：解锁成功即清，强制重新登录
      if (state.pendingClearSession) {
        state.pendingClearSession = false;
        try {
          db.clearSession();
        } catch (e) {
          console.warn('[security] 解锁后清空会话失败：' + (e && e.message));
        }
      }
      let remembered = false;
      if (p.remember) {
        remembered = keystore.writeKeyFile(pass);
        if (!remembered) console.warn('[security] safeStorage 不可用，口令未持久化');
      }
      safeAudit(currentUser(), '解锁数据库', 'security', '', { remembered });
      // 解锁后若已开启局域共享，自动拉起只读服务（需先初始化副本库并重建共享大区）
      startIfEnabled();
      // 数据库解锁后开始累计使用时长（仅窗口聚焦时长）
      try {
        usage.start();
      } catch (e) {
        console.error('[usage] start failed', e.message);
      }
      try {
        if (state.win) usage.setFocused(state.win.isFocused());
      } catch (e) {}
      return { unlocked: true, remembered, safeStorage: safeStorage.isEncryptionAvailable() };
    },
    { noLockGuard: true }
  );

  handle('security:enable', async p => {
    const pass = String(p.pass || '');
    const pass2 = String(p.pass2 || '');
    if (pass.length < 8) throw new Error(i18n.errKey('settings.errPassMin8'));
    if (pass !== pass2) throw new Error(i18n.errKey('settings.errPassMismatch'));
    const salt = cryptoSvc.randomSalt();
    const key = cryptoSvc.deriveKey(pass, salt);
    db.enableEncryption({ key, salt });
    let remembered = false;
    if (p.remember) remembered = keystore.writeKeyFile(pass);
    else keystore.removeKeyFile();
    safeAudit(currentUser(), '启用数据库加密', 'security', '', { remembered });
    return { encrypted: true, remembered };
  });

  handle('security:disable', async p => {
    const pass = String(p.pass || '');
    if (!db.verifyPass(pass)) throw new Error(i18n.errKey('settings.errPassWrong'));
    db.disableEncryption();
    keystore.removeKeyFile();
    safeAudit(currentUser(), '关闭数据库加密', 'security', '', {});
    return { encrypted: false };
  });

  handle('security:change', async p => {
    const oldPass = String(p.oldPass || '');
    const newPass = String(p.newPass || '');
    const newPass2 = String(p.newPass2 || '');
    if (!db.verifyPass(oldPass)) throw new Error(i18n.errKey('settings.errOldPassWrong'));
    if (newPass.length < 8) throw new Error(i18n.errKey('settings.errNewPassMin8'));
    if (newPass !== newPass2) throw new Error(i18n.errKey('settings.errNewPassMismatch'));
    const salt = cryptoSvc.randomSalt();
    const key = cryptoSvc.deriveKey(newPass, salt);
    db.enableEncryption({ key, salt });
    let remembered = false;
    if (fs.existsSync(keystore.keyFile())) {
      keystore.removeKeyFile();
      remembered = keystore.writeKeyFile(newPass);
    }
    safeAudit(currentUser(), '修改数据库加密口令', 'security', '', { remembered });
    // 直接返回纯数据：shared.handle 会统一包 {ok:true,data}，无需再写 {ok:true}（避免双层 {ok}）
    return { remembered };
  });
}

module.exports = { registerSecurity };
