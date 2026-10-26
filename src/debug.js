/**
 * 前端调试辅助：捕获全局运行时错误与未处理的 Promise 拒绝，写入本地运行日志
 * （userData/logs/app-*.log，经主进程 log:write 通道落盘）。
 *
 * ★ 报错捕获始终开启（不依赖调试开关）：
 *   调试模式 debug.captureStack 只决定「主进程 ERROR 级是否附带完整堆栈」，
 *   与前端错误是否上报无关。前端报错必须默认就留本地记录，否则线上用户遇到
 *   崩溃时控制台一关就无任何线索可查（Beta.189 数据库崩溃复盘即此痛点）。
 *
 * 另见 src/main.js 的 app.config.errorHandler：Vue 组件渲染/生命周期/hook 内抛错
 * 走该通道，与下面的 window 级监听互为补充。
 */
import { A } from './api';

let installed = false;

function report(level, text) {
  try {
    A.logWrite({ level, msg: text });
  } catch (e) {
    /* 静默：绝不干扰主流程 */
  }
}

export function installErrorCapture() {
  if (installed) return;
  installed = true;

  // 全局未捕获错误：始终写入本地日志
  window.addEventListener('error', ev => {
    // 跳过纯资源加载错误（img/script 404 等无堆栈噪音，ev.message 为空且无 error）
    if (!ev.message && !ev.error) return;
    const err = ev.error || ev;
    const stack = err && err.stack ? err.stack : `${ev.message} @ ${ev.filename || ''}:${ev.lineno}:${ev.colno}`;
    report('ERROR', `[frontend] ${ev.message}\n${stack}`);
  });

  // 未处理的 Promise 拒绝：始终写入本地日志
  window.addEventListener('unhandledrejection', ev => {
    const r = ev.reason;
    const stack = r && r.stack ? r.stack : String(r);
    report('ERROR', `[frontend unhandledrejection] ${stack}`);
  });
}
