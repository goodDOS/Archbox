// 全局异步确认对话框的状态与 API。
// 取代原生 window.confirm()（同步阻塞、样式不可控），让确认走应用内统一弹窗。
// 用法：
//   import { confirm } from '../composables/useConfirm'
//   const ok = await confirm('确认删除？', { danger: true })
// 视图层由 <ConfirmDialog />（在 App.vue 挂载一次）消费这里的 state。

import { reactive } from 'vue';
import { t } from '../i18n';

const state = reactive({
  open: false,
  title: '',
  message: '',
  danger: false,
  resolve: null
});

/** 弹出确认框，返回 Promise<boolean>（确定=true / 取消=false） */
export function confirm(message, opts = {}) {
  return new Promise(resolve => {
    state.message = message;
    // 弹窗打开时才求值：语言在弹窗存续期间可能被切换（设置页在弹窗下层仍可操作）
    state.title = opts.title || t('common.confirmTitle');
    state.danger = !!opts.danger;
    state.open = true;
    state.resolve = resolve;
  });
}

/** 由 ConfirmDialog 在退场动画播完后调用，兑现 Promise 并复位状态。
 *  ★ Beta.299：这里不再碰 state.open —— 关闭 open 的时机必须由 ConfirmDialog 的
 *   <Modal v-if="state.open"> 在退场动画播完后决定（见 ConfirmDialog 的 @close）。
 *   若在这里抢先 open=false，v-if 会瞬间卸载 Modal，退场动画根本没机会播。 */
export function resolveConfirm(ok) {
  const fn = state.resolve;
  state.resolve = null;
  if (fn) fn(ok);
}

/** 供视图组件读取共享状态 */
export function useConfirmState() {
  return state;
}
