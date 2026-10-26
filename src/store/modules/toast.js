import { store } from './state';

let toastTimer = null;
/** 全局轻提示：3 秒后自动消失 */
export function toast(msg, type = 'info') {
  store.toast = { msg: String(msg), type };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    store.toast = null;
  }, 3000);
}
