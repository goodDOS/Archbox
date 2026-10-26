'use strict';
/**
 * 窗口控制通道：最小化 / 最大化切换 / 关闭 / 查询最大化状态。
 * 均绕过锁定守卫（noLockGuard），标题栏始终可用。
 */
const state = require('../state');
const { handle } = require('./shared');

function registerWindow() {
  handle(
    'win:min',
    async () => {
      state.win && state.win.minimize();
      return true;
    },
    { noLockGuard: true }
  );
  handle(
    'win:max',
    async () => {
      if (state.win) {
        state.win.isMaximized() ? state.win.unmaximize() : state.win.maximize();
      }
      return state.win ? state.win.isMaximized() : false;
    },
    { noLockGuard: true }
  );
  handle(
    'win:close',
    async () => {
      state.win && state.win.close();
      return true;
    },
    { noLockGuard: true }
  );
  handle('win:isMax', async () => (state.win ? state.win.isMaximized() : false), { noLockGuard: true });
}

module.exports = { registerWindow };
