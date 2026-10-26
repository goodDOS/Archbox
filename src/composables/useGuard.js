// 删除前的密码验证弹窗状态机。
// 与 useConfirm 同源设计：视图层由 <PasswordGate />（在 App.vue 挂载一次）消费 state。
// 用法：
//   import { requirePassword } from '../composables/useGuard'
//   const ok = await requirePassword('删除《X》需要验证密码。')
//   if (!ok) return
//
// 返回的 Promise 在用户「验证通过」时兑现 true，在「取消」或「无法验证」时兑现 false。

import { reactive } from 'vue';
import { store, toast } from '../store';
import { t } from '../i18n';

const state = reactive({
  open: false,
  title: '',
  message: '',
  error: '', // 密码错误等可重试提示
  busy: false,
  reason: null, // 'no-password' | 'no-login'：账号本身无法校验密码
  action: '', // 确认按钮与提示语里的动作名（删除 / 恢复）
  resolve: null
});

// 会话级「删除验证」缓存：开启开关后，5 分钟内重复删除免重复输入密码
const SKIP_WINDOW = 5 * 60 * 1000;
let lastVerifiedAt = 0;

/** 删除验证成功后调用，记录本次通过时间（用于「5 分钟内免重复输入」） */
export function markVerified() {
  lastVerifiedAt = Date.now();
}

/**
 * 弹出密码验证框，返回 Promise<boolean>。
 * @param {string} message  警示文案（危险样式）
 * @param {Object} [opts]
 * @param {string} [opts.title]   弹窗标题
 * @param {string} [opts.action]  动作名，用于确认按钮文案（默认「删除」）。
 *                                恢复历史版本等非删除场景传 '恢复'，
 *                                否则按钮会写着「确认删除」却执行恢复 —— 语义错位。
 */
export function requirePassword(message, opts = {}) {
  return new Promise(resolve => {
    // 开关已开启且 5 分钟内已验证过：直接放行，不再弹窗
    const skipAuth = store.settings && store.settings['security.deleteSkipAuth'];
    if (skipAuth && lastVerifiedAt && Date.now() - lastVerifiedAt < SKIP_WINDOW) {
      toast(t('common.guardPassed'), 'info');
      resolve(true);
      return;
    }
    // 标题/动作名/警示文案都在弹窗打开时求值：与 useConfirm 同一口径，
    // 存续期间切语言（设置页在弹窗下层）不会让弹窗定格在旧语言上。
    state.message = message || t('common.guardNeedPass');
    state.title = opts.title || t('settings.delVerifyTitle');
    state.action = opts.action || t('common.delete');
    state.error = '';
    state.busy = false;
    state.reason = null;
    state.open = true;
    state.resolve = ok => {
      state.open = false;
      resolve(!!ok);
    };
  });
}

/** 供视图组件读取共享状态 */
export function useGuardState() {
  return state;
}
