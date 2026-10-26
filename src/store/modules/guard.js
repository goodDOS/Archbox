/**
 * 离开守卫：各页面（如 PostView）注册一个守卫函数，
 * 返回 true 允许离开 / false 阻止离开（内部通常用 store.dirty 判断并弹确认框）。
 * 导航跳转（goto / 前进 / 后退）在真正切换页面前先 await 守卫，确认离开才执行跳转。
 */
let _leaveGuard = null;
export function setLeaveGuard(fn) {
  _leaveGuard = fn;
}
export function clearLeaveGuard() {
  _leaveGuard = null;
}
// 供导航模块（nav.js）在切换页面前调用
export async function guardLeave() {
  if (typeof _leaveGuard === 'function') {
    try {
      return await _leaveGuard();
    } catch (e) {
      return false;
    }
  }
  return true;
}
