import { createApp } from 'vue';
import App from './App.vue';
import TrayMenu from './pages/TrayMenu.vue';
import { A } from './api';
import './styles/base.css';
import './styles/components.css';
import './styles/themes.css';
import './styles/bars.css';

// ★ 托盘弹窗模式：主进程以 dist/index.html#tray 加载同一个入口。
//   为什么共用入口而不是单做一个 tray.html：样式、主题变量、图标、i18n
//   全在主包内，再造一个入口就意味着两套产物可能漂移；而托盘界面要的
//   「皮肤跟随主题」恰恰要求它与主界面同源。哈希即模式开关 ——
//   主界面（无哈希）走完整启动流程，托盘界面只挂一个菜单根组件。
const isTray = location.hash === '#tray';

const app = createApp(isTray ? TrayMenu : App);

// ★ 渲染层未捕获错误（组件渲染 / 生命周期 / hook 内抛错）统一写入本地日志，
//   与 src/debug.js 的 window 级监听互补，确保前端崩溃必有本地记录可查。
app.config.errorHandler = (err, instance, info) => {
  const msg = err && err.stack ? err.stack : String(err);
  try {
    A.logWrite({ level: 'ERROR', msg: `[vue:${info || 'render'}] ${msg}` });
  } catch (e) {}
  console.error(err);
};

app.mount('#app');
