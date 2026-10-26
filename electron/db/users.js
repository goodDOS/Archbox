'use strict';
/**
 * 用户与设置：密码哈希、注册/登录/改密、配置读写
 * 依赖 core 的查询助手与审计。
 */
const crypto = require('crypto');
const core = require('./core');
const i18n = require('../i18n');

const { all, get, run, insert, audit, persist, nowIso, uid } = core;

/* ---------------- 用户 ---------------- */
/** 密码哈希：scrypt(salt,64) + salt 前缀，格式 scrypt$<saltHex>$<hashHex> */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}
/** 校验密码：stored 为空（老账号未设密码）一律返回 false，必须由调用方按业务决定放行 */
function verifyPassword(pw, stored) {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const hash = Buffer.from(parts[2], 'hex');
  const calc = crypto.scryptSync(String(pw), salt, 64);
  if (hash.length !== calc.length) return false;
  return crypto.timingSafeEqual(hash, calc);
}
function listUsers() {
  return all('SELECT id,name,mac,created_at,last_login FROM users ORDER BY created_at');
}
function createUser(name, mac, password, secQa) {
  name = String(name || '').trim();
  if (!name || name.length > 30) throw new Error(i18n.errKey('settings.errUserNameRule'));
  if (get('SELECT id FROM users WHERE name=?', [name])) throw new Error(i18n.errKey('settings.errUserNameTaken'));
  password = String(password || '');
  if (password.length < 6) throw new Error(i18n.errKey('settings.errPassMin6'));
  // 注册时强制设置 3 组安全问答（找回密码用）
  const secJson = normalizeSecQa(secQa);
  let id = uid();
  while (get('SELECT id FROM users WHERE id=?', [id])) id = uid();
  const phash = hashPassword(password);
  insert('INSERT INTO users(id,name,mac,password,sec_qa,created_at) VALUES(?,?,?,?,?,?)', [
    id,
    name,
    mac,
    phash,
    secJson,
    nowIso()
  ]);
  audit(id, '注册新用户', 'user', id, { name, mac });
  persist();
  return { id, name, mac };
}

/** 校验并规整 3 组安全问答，返回 JSON 字符串（答案 scrypt 哈希）。非法则抛错。 */
function normalizeSecQa(qa) {
  if (!Array.isArray(qa) || qa.length !== 3) throw new Error(i18n.errKey('settings.errQANone'));
  const clean = qa.map((x, i) => {
    const q = String((x && x.q) || '').trim();
    const a = String((x && x.a) || '').trim();
    if (!q) throw new Error(i18n.errKey('settings.errQAEmptyQ', { n: i + 1 }));
    if (!a) throw new Error(i18n.errKey('settings.errQAEmptyA', { n: i + 1 }));
    return { q, a };
  });
  // 问题不可重复、答案也不可重复（用户明确要求：安全问答的问题与答案都不能相同）
  const qSet = new Set(clean.map(x => x.q));
  if (qSet.size !== clean.length) throw new Error(i18n.errKey('settings.errQADupQ'));
  const aSet = new Set(clean.map(x => x.a));
  if (aSet.size !== clean.length) throw new Error(i18n.errKey('settings.errQADupA'));
  // 校验通过后再哈希答案，避免把「相同答案」哈希成不同串而漏判
  return JSON.stringify(clean.map(x => ({ q: x.q, a: hashPassword(x.a) })));
}
/**
 * 登录失败审计：记录 action='登录失败'，携带尝试登录的用户名、设备与失败原因。
 * 审计异常一律吞掉——绝不能因审计失败改变「登录失败」本身的对外行为与错误文案。
 * 安全注意：绝不记录密码明文。
 */
function failAudit(userId, actorName, mac, reason) {
  try {
    audit(
      userId,
      '登录失败',
      'user',
      userId || '',
      { reason, inputName: actorName, mac },
      { actorName: actorName || i18n.t('sys.unknownUser'), actorMac: mac }
    );
  } catch (e) {}
}
function login(name, mac, password) {
  name = String(name || '').trim();
  const u = get('SELECT * FROM users WHERE name=?', [name]);
  if (!u) {
    failAudit(null, name, mac, '用户不存在');
    throw new Error(i18n.errKey('settings.errUserNotFound'));
  }
  if (u.mac !== mac) {
    failAudit(u.id, u.name, mac, 'MAC 不匹配');
    // 附错误码 MAC_BOUND，供前端识别并引导「重新绑定设备」（跨机迁移后的正常入口）。
    // shared.handle 会以 [MAC_BOUND] 前缀编码，preload 还原到 err.code。
    const e = new Error(i18n.errKey('settings.errMacBound'));
    e.code = 'MAC_BOUND';
    throw e;
  }
  // 老账号未设密码（password 为空）可直接登录；已设密码则必须匹配
  if (u.password && !verifyPassword(String(password || ''), u.password)) {
    failAudit(u.id, u.name, mac, '密码错误');
    throw new Error(i18n.errKey('settings.errPwdWrong'));
  }
  run('UPDATE users SET last_login=? WHERE id=?', [nowIso(), u.id]);
  setSetting('session.user_id', u.id);
  audit(u.id, '登录', 'user', u.id, {});
  return { id: u.id, name: u.name, mac: u.mac };
}
/**
 * 验证「当前登录用户」的密码（用于删除前的二次身份校验）。
 * 返回 { ok, reason }：
 *   - ok=true   密码匹配
 *   - ok=false, reason='no-login'   无登录会话（理论不会发生，登录为强制）
 *   - ok=false, reason='no-password' 当前账号未设密码，无法校验
 *   - ok=false, reason=null          密码不匹配
 */
function verifyCurrentUserPassword(pw) {
  const uid = getSetting('session.user_id');
  if (!uid) return { ok: false, reason: 'no-login' };
  const u = get('SELECT id,name,password FROM users WHERE id=?', [uid]);
  if (!u) return { ok: false, reason: 'no-login' };
  if (!u.password) return { ok: false, reason: 'no-password' };
  return { ok: verifyPassword(String(pw || ''), u.password), reason: null };
}

/**
 * 直接重置某用户的密码（**不经原密码校验**，仅限演示数据初始化等内部链路）。
 *
 * ★ 与 changePassword 的区别：后者是用户自助改密，必须先过原密码校验；
 *   本函数是"确保这个账号可用"，没有任何身份前提，因此 **绝不可暴露成 IPC 通道**。
 *   当前唯一调用方是 main.js 的 ensureDemoUser（--seed / --shot 开发路径）。
 *
 * 存在的原因：老库里可能有历史遗留的无密码演示账号，createUser 因"用户名已存在"
 * 建不了新的，只能补写 password 列。
 * @param {string} userId
 * @param {string} pw  明文（内部哈希后落库，不存明文）
 */
function setUserPassword(userId, pw) {
  const id = String(userId || '');
  if (!id) throw new Error(i18n.errKey('settings.errUserNotFound'));
  const u = get('SELECT id FROM users WHERE id=?', [id]);
  if (!u) throw new Error(i18n.errKey('settings.errUserNotFound'));
  const pass = String(pw || '');
  if (pass.length < 6) throw new Error(i18n.errKey('settings.errPassMin6'));
  run('UPDATE users SET password=? WHERE id=?', [hashPassword(pass), id]);
  audit(id, '重置密码', 'user', id, { by: 'system' });
  persist();
  return true;
}

/** 通过校验原密码后修改密码；老账号未设密码时原密码留空即可通过 */
function changePassword(userId, oldPass, newPass) {
  if (!userId) throw new Error(i18n.errKey('settings.errNotLoggedInChangePass'));
  const u = get('SELECT * FROM users WHERE id=?', [userId]);
  if (!u) throw new Error(i18n.errKey('settings.errUserNotFound'));
  if (u.password && !verifyPassword(String(oldPass || ''), u.password))
    throw new Error(i18n.errKey('settings.errOldPwdWrong'));
  newPass = String(newPass || '');
  if (newPass.length < 6) throw new Error(i18n.errKey('settings.errNewPassMin6'));
  run('UPDATE users SET password=? WHERE id=?', [hashPassword(newPass), u.id]);
  audit(u.id, '修改密码', 'user', u.id, {});
  persist();
  return true;
}

/* ---------------- 安全问答（找回密码） ---------------- */
/**
 * 设置 / 修改安全问答（3 组自定义问答）。需校验原密码（未设密码时留空即可通过）。
 * 答案以 scrypt 哈希存储，不落明文。
 * @param {string} userId
 * @param {string} oldPass  原密码（未设密码时留空）
 * @param {Array<{q:string,a:string}>} qa  长度必须为 3
 */
function setSecurityQuestions(userId, oldPass, qa) {
  if (!userId) throw new Error(i18n.errKey('settings.errNotLoggedInSetQA'));
  const u = get('SELECT * FROM users WHERE id=?', [userId]);
  if (!u) throw new Error(i18n.errKey('settings.errUserNotFound'));
  if (u.password && !verifyPassword(String(oldPass || ''), u.password))
    throw new Error(i18n.errKey('settings.errOldPwdWrong'));
  const secJson = normalizeSecQa(qa);
  run('UPDATE users SET sec_qa=? WHERE id=?', [secJson, u.id]);
  audit(u.id, '设置安全问答', 'user', u.id, {});
  persist();
  return true;
}
/** 返回该用户的安全问答（仅问题，不含答案哈希）或 null */
function getSecurityQuestions(userId) {
  const u = get('SELECT sec_qa FROM users WHERE id=?', [userId]);
  if (!u || !u.sec_qa) return null;
  try {
    const arr = JSON.parse(u.sec_qa);
    return Array.isArray(arr) ? arr.map(x => ({ q: x.q })) : null;
  } catch (e) {
    return null;
  }
}
/** 该用户是否已设置安全问答（决定登录页是否展示「找回密码」 */
function hasSecurityQuestions(userId) {
  const u = get('SELECT sec_qa FROM users WHERE id=?', [userId]);
  return !!(u && u.sec_qa);
}
/**
 * 校验 3 组安全问答答案（改绑设备与找回密码共用的单一答案校验实现）。
 * @param {object} u        users 行（含 sec_qa）
 * @param {string[]} answers 顺序对应设置时的 3 个答案
 */
function verifyAnswersOrThrow(u, answers) {
  if (!u || !u.sec_qa) throw new Error(i18n.errKey('settings.errNoQA'));
  let arr;
  try {
    arr = JSON.parse(u.sec_qa);
  } catch (e) {
    throw new Error(i18n.errKey('settings.errQABroken'));
  }
  if (!Array.isArray(arr) || arr.length !== 3) throw new Error(i18n.errKey('settings.errQABroken'));
  const ans = (answers || []).map(a => String(a || '').trim());
  if (ans.length !== 3) throw new Error(i18n.errKey('settings.errAnswerAll'));
  for (let i = 0; i < 3; i++) {
    if (!verifyPassword(ans[i], arr[i].a)) throw new Error(i18n.errKey('settings.errAnswerN', { n: i + 1 }));
  }
}

/**
 * 通过安全问答重置密码（找回密码）。需 3 个答案全部匹配。
 * @param {string} userId
 * @param {string[]} answers  顺序对应设置时的 3 个答案
 * @param {string} newPass
 */
function recoverByQuestions(userId, answers, newPass) {
  const u = get('SELECT * FROM users WHERE id=?', [userId]);
  if (!u || !u.sec_qa) throw new Error(i18n.errKey('settings.errNoQA'));
  newPass = String(newPass || '');
  if (newPass.length < 6) throw new Error(i18n.errKey('settings.errNewPassMin6'));
  // 答案校验收敛到 verifyAnswersOrThrow（与 rebindMac 的问答验证共用单一实现）
  verifyAnswersOrThrow(u, answers);
  run('UPDATE users SET password=? WHERE id=?', [hashPassword(newPass), u.id]);
  audit(u.id, '安全问答找回密码', 'user', u.id, {});
  persist();
  return true;
}

/* ---------------- 跨机设备绑定（mac 变更留底） ---------------- */
/**
 * 解析 users.mac_history（JSON 数组 [{mac, at}]），损坏时返回空数组。
 */
function parseMacHistory(raw) {
  try {
    const a = JSON.parse(raw || '[]');
    return Array.isArray(a) ? a : [];
  } catch (e) {
    return [];
  }
}

/**
 * 重新绑定设备（跨机迁移后把账号的绑定 MAC 改到本机）。
 *
 * ★ 身份门槛：必须通过「密码」或「安全问答」任一验证才允许改绑，防止仅凭
 *   用户名就改绑他人设备。老账号未设密码（u.password 为空）且未走问答时，
 *   单机环境无凭证可验，直接放行（与 login 老账号「未设密码可直接登录」一致）。
 *
 * ★ 留底：改绑前把旧 mac 追加进 users.mac_history，并写一条审计「设备变更」
 *   （user_mac 固定为旧 mac 以保留变更前的设备线索，detail 记 from/to）。
 *
 * @param {string} name   用户名（登录门按名定位，非 id）
 * @param {string} newMac 新绑定 MAC（本机）
 * @param {{type:'password',password:string}|{type:'answers',answers:string[]}} verify
 * @returns {{id:string,name:string,mac:string}}
 */
function rebindMac(name, newMac, verify) {
  name = String(name || '').trim();
  const u = get('SELECT * FROM users WHERE name=?', [name]);
  if (!u) throw new Error(i18n.errKey('settings.errUserNotFound'));
  // 身份验证：问答优先，其次密码；老账号无密码则放行
  if (verify && verify.type === 'answers') {
    verifyAnswersOrThrow(u, verify.answers);
  } else if (u.password) {
    if (!verify || verify.type !== 'password' || !verifyPassword(String(verify.password || ''), u.password))
      throw new Error(i18n.errKey('settings.errPwdWrong'));
  }
  const oldMac = u.mac;
  const hist = parseMacHistory(u.mac_history);
  hist.push({ mac: oldMac, at: nowIso() });
  run('UPDATE users SET mac=?, mac_history=? WHERE id=?', [String(newMac), JSON.stringify(hist), u.id]);
  audit(u.id, '设备变更', 'user', u.id, { from: oldMac, to: String(newMac) }, { actorName: u.name, actorMac: oldMac });
  persist();
  return { id: u.id, name: u.name, mac: String(newMac) };
}

/**
 * 查询某账号的历史设备（当前绑定 MAC + 历史 MAC 列表）。
 * @param {string} userId
 * @returns {{current:string, history:Array<{mac:string,at:string}>}|null}
 */
function getMacHistory(userId) {
  const u = get('SELECT mac, mac_history FROM users WHERE id=?', [String(userId || '')]);
  return u ? { current: u.mac, history: parseMacHistory(u.mac_history) } : null;
}

/**
 * 清空登录会话（更换/重载数据库后强制重新登录用）。
 */
function clearSession() {
  run("DELETE FROM settings WHERE key='session.user_id'");
  persist();
}

/* ---------------- 设置 ---------------- */
function getSetting(k, def = null) {
  const r = get('SELECT value FROM settings WHERE key=?', [k]);
  if (!r) return def;
  try {
    return JSON.parse(r.value);
  } catch (e) {
    return def;
  }
}
function setSetting(k, v) {
  run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [
    k,
    JSON.stringify(v)
  ]);
  persist();
}
/* 可写设置项白名单：不在此列的 key 一律拒绝（防渲染层越权写任意配置）。
 *
 * ★ display.lang 曾经漏在这里（Beta.271 修复）★
 *   语言选择从 Beta.233 起就走 settings:set 持久化，但白名单没跟上 ——
 *   setSettingSafe 抛「不支持的设置项」，而渲染层的 setLang 把异常静默吞掉
 *   （注释写的是「内存态已生效」），于是：界面上语言切了、库下一个字没写，
 *   重启回到中文，而主进程的 display.lang 读取分支永远拿不到值。
 *   这类"错在另一侧、现象在这一侧"的缺陷只能靠白名单与渲染层写入点的交叉核对发现。 */
const SETTING_KEYS = [
  'theme',
  'themeCustom',
  'session.user_id',
  'editor.snippet',
  'security.deleteSkipAuth',
  'backup.targetDir',
  'backup.schedule',
  'backup.onExit',
  'backup.retain',
  'backup.lastAt',
  'display.pageSize',
  'display.lang',
  /* 字体模式：'bundled'（随包自带 Noto） | 'system'（本机系统字体）。
   * ★ 必须在这里登记，否则 setSettingSafe 直接抛「不支持的设置项」，
   *   而渲染层若吞掉异常，就会出现「界面切了、重启回到旧值」——与 display.lang 同一个坑。 */
  'display.fontMode',
  'ui.floatLog',
  'debug.captureStack'
];
function setSettingSafe(k, v, userId) {
  if (!SETTING_KEYS.includes(k)) throw new Error(i18n.errKey('settings.errUnsupportedSetting'));
  setSetting(k, v);
  audit(userId, '修改设置', 'settings', k, { value: v });
}
function allSettings() {
  const out = {};
  all('SELECT key,value FROM settings').forEach(r => {
    if (r.key === 'session.user_id') return;
    try {
      out[r.key] = JSON.parse(r.value);
    } catch (e) {
      out[r.key] = r.value;
    }
  });
  return out;
}

module.exports = {
  hashPassword,
  verifyPassword,
  verifyCurrentUserPassword,
  listUsers,
  createUser,
  login,
  changePassword,
  setUserPassword,
  setSecurityQuestions,
  getSecurityQuestions,
  hasSecurityQuestions,
  recoverByQuestions,
  parseMacHistory,
  verifyAnswersOrThrow,
  rebindMac,
  getMacHistory,
  clearSession,
  getSetting,
  setSetting,
  setSettingSafe,
  allSettings
};
