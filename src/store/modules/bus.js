/** 轻量全局事件总线：用于「全局刷新」等跨页面通知 */
const _listeners = {};
export const bus = {
  on(e, fn) {
    (_listeners[e] || (_listeners[e] = [])).push(fn);
  },
  off(e, fn) {
    if (_listeners[e]) _listeners[e] = _listeners[e].filter(f => f !== fn);
  },
  // 返回各监听器返回值（可为 Promise），便于调用方 await 并判断成败（如全局刷新）
  emit(e, ...args) {
    return (_listeners[e] || []).map(fn => {
      try {
        return fn(...args);
      } catch (err) {
        console.error('[bus]', e, err);
        return Promise.reject(err);
      }
    });
  }
};
