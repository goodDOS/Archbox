// 表单/操作提交封装：自动管理 busy 标志，可选先弹确认框 / 密码验证，再用 run() 收口异常与成功提示。
// 取代散落的 `if (!confirm(...)) return` + `await run(...)` 组合，统一交互与加载态。
//
// 用法：
//   const { submit, busy } = useSubmit()
//   await submit(() => api.delete({ id }), {
//     confirm: '确认删除？',
//     password: true,                          // 删除前二次验证登录密码
//     passwordMessage: '删除《X》需要验证密码。',
//     ok: '已删除',
//     then: () => refresh()
//   })

import { ref } from 'vue';
import { run } from '../feedback';
import { confirm } from './useConfirm';
import { requirePassword } from './useGuard';
import { t } from '../i18n';

export function useSubmit() {
  const busy = ref(false);

  /**
   * @param {() => Promise} fn        要执行的异步任务
   * @param {Object} [opts]
   * @param {string} [opts.confirm]        若提供，先弹确认框（danger 样式），取消则中止
   * @param {boolean} [opts.password]      若为 true，执行前弹密码验证框（删除防护），取消则中止
   * @param {string} [opts.passwordMessage] 密码验证框中的警示文案
   * @param {string} [opts.passwordTitle]   密码验证框标题（默认「删除验证」）
   * @param {string} [opts.passwordAction]  确认按钮里的动作名（默认「删除」；恢复场景传「恢复」）
   * @param {string|Function} [opts.ok]       成功提示文案
   * @param {string} [opts.err]               异常兜底文案
   * @param {(r:any)=>void} [opts.then]       成功回调
   * @param {(e:Error)=>void} [opts.catch]    失败回调
   * @returns {Promise<any|undefined>}
   */
  async function submit(fn, opts = {}) {
    const { confirm: msg, password, passwordMessage, passwordTitle, passwordAction, ...runOpts } = opts;
    if (msg) {
      const ok = await confirm(msg, { danger: true });
      if (!ok) return;
    }
    if (password) {
      const ok = await requirePassword(passwordMessage || t('common.guardNeedPass'), {
        title: passwordTitle,
        action: passwordAction
      });
      if (!ok) return;
    }
    return run(fn, { busy, ...runOpts });
  }

  return { busy, submit };
}
