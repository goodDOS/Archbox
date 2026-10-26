'use strict';
/**
 * 主进程共享状态单例。
 * 集中管理跨模块共享的可变状态（win/tray/quitting/locked/writable），
 * 供 window / ipc / keystore / shots 各模块统一读写，避免层层传参。
 */
module.exports = {
  win: null, // 主窗口 BrowserWindow 实例
  tray: null, // 系统托盘 Tray 实例
  quitting: false, // 真正退出标志（区分「关闭到托盘」与「退出程序」）
  locked: false, // 数据库已加密但未解锁：除解锁/窗口控制外的 IPC 一律拒绝
  writable: true, // 数据目录是否可写（启动探针检测，不可写时全局只读）
  dbError: null, // 数据库打开/初始化失败时的可读错误信息；非 null 时前端显示"数据库不可用"屏而非卡死或误导向注册
  /* 切库/恢复加密库后，待解锁即清空登录会话（强制重新登录）。
   * reloadDataDir 在 locked 态无法立即清（db 为 null），先置位，security:unlock 成功后消费。 */
  pendingClearSession: false,
  /* 程序文件自检结果（启动时由 main.js 写入，形状见 services/integrity.verifyAppFiles）
   * 全程常驻、不属于「读一次就清」的告警 —— 前端设置页可随时查看当前程序是否被改过。 */
  appIntegrity: null
};
