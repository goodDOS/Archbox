import { ref } from 'vue';
import { toastInfo, toastWarn } from '../feedback';
import { t } from '../i18n';

/**
 * 统一的刷新处理：包裹一次数据加载，管理 busy 状态并给出成功/失败气泡反馈。
 *
 * 成败判定（与标题栏全局刷新一致）：
 *   - loader 返回 false  → 刷新失败
 *   - loader 抛错        → 刷新失败
 *   - loader 返回其它值   → 刷新成功
 *
 * 用法：
 *   const { refresh, busy } = useRefresh(loader, { busy: myBusyRef, success: () => t('xxx.yyy') })
 *   // success/fail 传「函数」以便在刷新时按当前语言惰性求值；
 *   // 不传则默认 success = t('shell.refreshed')、fail = t('common.refreshFailed')
 */
export function useRefresh(loader, opts = {}) {
  const busy = opts.busy || ref(false);
  // ★ Beta.301：success/fail 文案必须是「调用时求值」，不能在这里提前算好存成字符串。
  //   否则组件 setup 阶段就把 t('shell.refreshed') 求值成「已刷新」固化下来，
  //   之后切换语言再刷新，弹出的仍是旧语言文案（残留）。
  const successSrc = opts.success;
  const failSrc = opts.fail;
  // 求值：函数 → 调用；字符串 → 原样；undefined → 惰性取默认 t()（此刻才是「当前语言」）
  const resolveMsg = (src, r, defaultKey) => {
    if (typeof src === 'function') return src(r);
    if (src != null) return src;
    return t(defaultKey);
  };
  async function refresh() {
    if (busy.value) return false;
    busy.value = true;
    try {
      const r = await loader();
      if (r === false) {
        const failMsg = resolveMsg(failSrc, r, 'common.refreshFailed');
        if (failMsg) toastWarn(failMsg);
        return false;
      }
      const msg = resolveMsg(successSrc, r, 'shell.refreshed');
      if (msg) toastInfo(msg);
      return r;
    } catch (e) {
      const failMsg = resolveMsg(failSrc, undefined, 'common.refreshFailed');
      if (failMsg) toastWarn(failMsg);
      return false;
    } finally {
      busy.value = false;
    }
  }
  return { refresh, busy };
}
