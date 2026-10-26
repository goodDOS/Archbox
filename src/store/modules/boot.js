import { store } from './state';
import { A } from '../../api';
import { applyTheme, THEME_KEYS, STANDARD } from './theme';
import { applyLang, LANG_KEYS } from '../../i18n';
import { t } from '../../i18n';
import { initFontMode } from '../../composables/useFontMode';

/** 拉取大区列表写入 store（启动、登录、增删大区后均会调用） */
export async function refreshRegions() {
  try {
    store.regions = await A.regions();
  } catch (e) {
    store.regions = [];
  }
}

/** 应用启动：根据主进程返回决定进入解锁门还是加载完整业务数据 */
export async function bootApp() {
  const d = await A.boot();
  store.mac = d.mac;
  store.versions = d.versions || {};
  store.writable = d.writable !== false;
  // 完整性状态（防篡改）：常驻展示用，与「读后即清」的启动弹窗不同。
  // 数据结构见 electron/ipc/boot.js 的 integritySnapshot()。
  store.integrity = d.integrity || null;
  store.settings = d.settings || {};
  // 界面语言必须先落地：下面 writableReason / dbErrorMessage 的兜底文案要走 t()，
  // 若等旧位置（第 50 行附近）才 applyLang，英文用户看到的只读原因会是中文字面量。
  // 无效 key（升级残留/手工改坏）回退 zh-CN，而不是让界面停在 raw key 上。
  applyLang(LANG_KEYS.includes(d.settings['display.lang']) ? d.settings['display.lang'] : 'zh-CN');
  // 只读原因的文案分流：完整性不通过导致的只读，与目录物理不可写，处置方式完全不同，
  // 不能共用一句「数据目录不可写」——那会让用户去改权限，而真正要处理的是数据可信度。
  const dbTamperedNow = !!(d.integrity && d.integrity.db && d.integrity.db.compromised);
  store.writableReason = dbTamperedNow ? t('common.readonlyTampered') : t('common.readonlyNotWritable');
  if (d.locked) {
    // 数据库已加密且未解锁：进入解锁门，不加载任何业务数据
    store.locked = true;
    store.booted = true;
    return;
  }
  store.locked = false;
  if (d.dbError) {
    // 数据库初始化失败：显示"数据库不可用"屏，引导用户从备份恢复或重指目录，
    // 而不是卡在启动屏、或误导向"重新注册"（注册会因 db 未就绪再次报错）。
    store.dbError = true;
    store.dbErrorMessage = d.dbErrorMessage || t('common.dbOpenFailed');
    store.booted = true;
    return;
  }
  // 数据库已恢复可用：清掉此前「数据库不可用」的两个标记。
  // ★ 修复重指目录后重跑 bootApp 时，若不清除，App.vue 的 `v-else-if="store.dbError"`
  //   会一直为真、继续显示错误屏，用户仍要手动重启（本次修复的核心链路）。
  store.dbError = false;
  store.dbErrorMessage = '';
  store.theme = THEME_KEYS.includes(d.settings.theme) ? d.settings.theme : 'light';
  // 恢复「自定义」主题记忆：仅采用有效主题 key；否则若上次停在某个非标准主题则直接用该主题，否则回退 cs16
  store.themeCustom =
    d.settings && THEME_KEYS.includes(d.settings.themeCustom)
      ? d.settings.themeCustom
      : (STANDARD.includes(store.theme) ? 'cs16' : store.theme) || 'cs16';
  applyTheme();
  /* 字体模式与主题同一位置落地：两者都是「影响全局观感、必须在首屏就位」的设置。
   * 放在 booted=true 之前，避免用户先看到系统字体再跳成 Noto（一次闪烁）。
   * 传 silent —— 首屏不等待字体下载，@font-face 有 font-display: swap 兜住，
   * 不会白屏；等用户真正打开文档时字体早已就位。 */
  initFontMode(store.settings['display.fontMode']);
  store.users = d.users || [];
  // 记录上次登录用户用于登录门预选（密码保护账号不自动登录，需手动输入密码）
  store.lastUser = (d.lastUserId && store.users.find(x => x.id === d.lastUserId)) || null;
  await refreshRegions();
  // 启动时校验审计链完整性
  try {
    store.auditChain = await A.auditVerify();
  } catch (e) {
    store.auditChain = null;
  }
  store.booted = true;
}

/** 解锁加密数据库：成功后重新走完整启动流程 */
export async function unlockDb(pass, remember) {
  const r = await A.securityUnlock({ pass, remember });
  // 重新启动应用状态（此时数据库已解锁，boot 返回完整数据）
  store.locked = false;
  store.booted = false;
  await bootApp();
  return r;
}
