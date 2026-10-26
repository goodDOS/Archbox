'use strict';
/**
 * 账户与认证通道：注册 / 登录 / 改密 / 删除前二次校验，
 * 以及安全问答（设置、查询、找回密码）。
 */
const db = require('../db');
const keystore = require('../keystore');
const i18n = require('../i18n');
const { S, handle, currentUser } = require('./shared');

function registerAuth() {
  handle('users:register', async p => {
    const user = db.createUser(S(p.name), keystore.getMac(), String(p.password || ''), p.secQa);
    db.setSetting('session.user_id', user.id);
    return user;
  });
  handle('users:list', async () => db.listUsers());
  handle('users:login', async p => db.login(S(p.name), keystore.getMac(), String(p.password || '')));
  // 重新绑定设备（跨机迁移后）：登录门场景可能处于 locked 态，需 noLockGuard；
  // 身份安全由 rebindMac 内部「密码或安全问答」自证，不依赖登录会话。
  handle(
    'users:rebindMac',
    async p => {
      const v = p.verify || {};
      const verify =
        v.type === 'answers'
          ? { type: 'answers', answers: (v.answers || []).map(a => String(a || '').trim()) }
          : { type: 'password', password: String(v.password || '') };
      const u = db.rebindMac(S(p.name), keystore.getMac(), verify);
      db.setSetting('session.user_id', u.id);
      return u;
    },
    { noLockGuard: true }
  );
  // 查询历史设备（设置页展示；需登录会话，走正常锁定守卫）
  handle('users:getMacHistory', async p => db.getMacHistory(S(p.userId) || currentUser()));
  handle('users:changePass', async p => {
    const uid = currentUser();
    if (!uid) throw new Error(i18n.errKey('settings.errNotLoggedInChangePass'));
    db.changePassword(uid, String(p.oldPass || ''), String(p.newPass || ''));
    return true;
  });
  // 删除前的二次身份校验：验证当前登录用户的密码
  handle('user:verify', async p => db.verifyCurrentUserPassword(String(p.pass || '')));

  /* ---------- 安全问答（找回密码） ---------- */
  handle('users:setSecurity', async p => {
    const uid = currentUser();
    if (!uid) throw new Error(i18n.errKey('settings.errNotLoggedInSetQA'));
    db.setSecurityQuestions(uid, String(p.oldPass || ''), p.qa);
    return true;
  });
  handle('users:getSecurity', async p => db.getSecurityQuestions(String(p.userId || '')));
  handle('users:hasSecurity', async p => db.hasSecurityQuestions(String(p.userId || '')));
  // 找回密码：无需登录会话，凭安全问答重置（登录门使用）
  handle('users:recover', async p => {
    db.recoverByQuestions(String(p.userId || ''), p.answers, String(p.newPass || ''));
    return true;
  });
}

module.exports = { registerAuth };
