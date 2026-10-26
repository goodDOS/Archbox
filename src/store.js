'use strict';
/**
 * 全局状态与前端协同逻辑（聚合 re-export 层）。
 *
 * 本文件不再内联任何具体实现，仅按职责聚合各子模块的导出，
 * 对外暴露与原 store.js 完全一致的符号，故所有 `from '.../store'` 的 import 零改动。
 *
 * 子模块见 src/store/modules/：
 *   state（响应式根） / bus（事件总线） / dirty（未保存标记） / guard（离开守卫） /
 *   toast（轻提示） / searchHistory（搜索历史持久化） / nav（导航历史栈） /
 *   theme（主题） / boot（启动/刷新/解锁） / auth（登录/改密/登出） / find（页面内查找）
 */
export { store } from './store/modules/state';
export { bus } from './store/modules/bus';
export { markDirty, clearDirty } from './store/modules/dirty';
export { setLeaveGuard, clearLeaveGuard } from './store/modules/guard';
export { toast } from './store/modules/toast';
export { loadSearchHistory, persistSearchHistory } from './store/modules/searchHistory';
export { goto, goBack, goForward, installNavShortcuts } from './store/modules/nav';
export { applyTheme, setTheme } from './store/modules/theme';
export { refreshRegions, bootApp, unlockDb } from './store/modules/boot';
export { doLogin, changePassword, logout, enterAs } from './store/modules/auth';
export { findState, findOpen, findClose, findSet, findJump, findToggleCase } from './store/modules/find';
