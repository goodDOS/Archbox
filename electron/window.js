'use strict';
/**
 * 窗口与托盘管理：无边框窗口、关闭到托盘、系统托盘。v3 起图片 base64 内联，无自定义协议。
 * 依赖：electron、db、共享状态、日志。窗口/托盘显隐统一读写 state。
 *
 * 托盘菜单是**自绘弹窗**（frameless BrowserWindow 加载 #tray），不是原生 Menu：
 * 原生菜单由操作系统绘制，CSS 一行都碰不到，主题皮肤无从谈起；且菜单项要动态
 * （最近浏览列表），原生 template 每次重建也会闪烁。自绘弹窗复用主界面的
 * dist/index.html 与 data-theme，皮肤/语言/列表全部天然一致。
 */
const { BrowserWindow, nativeImage, Tray, ipcMain, app, screen } = require('electron');
const path = require('path');
const { APP_NAME } = require('./services/appinfo');
const { pathToFileURL } = require('url');
const db = require('./db');
const state = require('./state');
const { getLog } = require('./services/logger');
const i18n = require('./i18n');

// 渲染进程上报的「未保存修改」标记：编辑页面有改动时置 true，离开/清空后置 false
let _unsaved = false;
ipcMain.on('win:setUnsaved', (e, v) => {
  _unsaved = !!v;
});

/* ---------- 未保存确认：改为应用内弹窗 ----------
 * 原实现用 dialog.showMessageBoxSync —— 系统级**同步阻塞**模态。窗口是 frame:false，
 * Chromium 在无边框窗口上关闭原生模态后不把焦点归还网页内容，键盘输入会失效，
 * 必须重开窗口才恢复（与 SharePanel 那三处 window.confirm 是同一个根因）。
 * 现在改成：主进程只发一个「请确认」事件，由渲染进程用应用内 ConfirmDialog 询问后回调。
 *
 * 时序：close → 拦下 → 问前端 → 前端 confirm() → 回执 win:confirmResult → 真正关闭
 * 用 _closePending 防重入（前端弹窗期间用户可能狂点关闭按钮）。 */
let _closePending = false;
/**
 * 无头（截图）模式：跳过"请渲染层确认"这一步，直接执行动作。
 *
 * ★ 不跳会怎样 ★
 * 截图模式的主循环在 runShots 里，界面上无人点确认框，win:confirmResult
 * 永远不会回执，于是 _closePending 卡在 true 不再复位 —— 它只在收到回执时复位。
 * 后果是"此后所有关闭请求都被这里的 if (_closePending) return 静默吞掉"，
 * 表现为点关闭按钮毫无反应。且该标志在整个进程生命周期内都是脏的。
 *
 * 截图进程是短生命周期的无头进程，不存在"用户有未保存修改"这一情形，
 * 因此这里直接放行，同时保证 _closePending 永不被置脏。
 */
let _headless = false;
function setHeadless(v) {
  _headless = !!v;
}

function askRendererThen(kind, onConfirm) {
  const w = state.win;
  if (!w || w.isDestroyed()) {
    // 窗口已不在：无头模式下仍执行，否则截图模式的收尾动作会被吞掉
    if (_headless) onConfirm();
    return;
  }
  if (_headless) {
    onConfirm();
    return;
  }
  if (_closePending) return;
  _closePending = true;
  const done = ok => {
    ipcMain.removeListener('win:confirmResult', done);
    _closePending = false;
    if (ok) onConfirm();
  };
  ipcMain.once('win:confirmResult', (e, ok) => done(!!ok));
  // 只发 kind，不发文案：确认文本由渲染层按 kind 取本地化字典（见 App.vue onConfirmClose）。
  // 不走主进程字典是对的：这是应用内弹窗，由渲染层绘制，语言必然最新。
  w.webContents.send('win:confirmClose', { kind });
}

const DEV_URL = 'http://127.0.0.1:5173';
// 是否 dev 环境：createWindow 时由 main.js 传入，托盘弹窗加载 URL 时要用
let _isDev = false;

/* ---------- 退出请求（托盘菜单「退出」与旧原生菜单共用） ----------
 * 有未保存修改时先问：取消则中止，确认则丢弃并退出。
 * 窗口此时可能处于隐藏态（从托盘退出时主窗口就是隐藏的），必须先 showWindow
 * 再询问 —— 否则应用内确认弹窗画在一个看不见的窗口里，用户点了没反应。 */
function requestQuit() {
  if (_unsaved) {
    showWindow();
    askRendererThen('quit', () => {
      state.quitting = true;
      app.quit();
    });
    return;
  }
  state.quitting = true;
  app.quit();
}

function showWindow() {
  if (!state.win) return;
  if (state.win.isMinimized()) state.win.restore();
  state.win.setSkipTaskbar(false);
  state.win.show();
  state.win.focus();
}
function hideWindow() {
  if (!state.win) return;
  state.win.setSkipTaskbar(true);
  state.win.hide();
}
function toggleWindow() {
  if (!state.win) return;
  if (state.win.isVisible()) hideWindow();
  else showWindow();
}

/* ---------- 系统托盘 ---------- */
/* 托盘弹窗（自绘菜单）：
 * 左键单击 = 切换主窗口显隐（沿用既有习惯）；右键 = 弹出自绘菜单。
 * 不用原生 setContextMenu —— 系统绘制的菜单无法跟随主题皮肤，且它会把
 * 右键事件吃掉，与自绘弹窗只能二选一。 */
const TRAY_W = 264;
// 主题 → 弹窗预绘背景色。来源：src/styles/themes.css 各主题的 --bg。
// 仅用于 CSS 生效前的第一帧，避免深色主题下闪一道白；与主题漂移时后果
// 仅是那一帧颜色不一致，故允许在此留一份映射而不强行实时解析 CSS。
const TRAY_BG = {
  light: '#f4f5f7',
  dark: '#101216',
  wire: '#ffffff',
  cs16: '#4c5844',
  bamboo: '#f4f5f7',
  sandalwood: '#f4f5f7',
  sky: '#f4f5f7',
  halflife: '#0a0a0f'
};
let _trayPopup = null;

/** 读取当前主题 key（未解锁/无设置时回退 light）。仅主进程侧调用。 */
function currentThemeKey() {
  try {
    const t = db.getSetting && db.getSetting('theme');
    return t && TRAY_BG[t] ? t : 'light';
  } catch (e) {
    return 'light';
  }
}

/** 按托盘图标位置摆放弹窗：图标在屏幕上半（macOS 菜单栏）→ 放下方；下半（Windows 任务栏）→ 放上方 */
function positionTrayPopup(popup, height) {
  if (!state.tray || popup.isDestroyed()) return;
  const b = state.tray.getBounds();
  const wa = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;
  let x = Math.round(b.x + b.width / 2 - TRAY_W / 2);
  x = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - TRAY_W - 8));
  const fromTop = b.y < wa.y + wa.height / 2;
  let y = fromTop ? b.y + b.height + 6 : b.y - height - 6;
  y = Math.max(wa.y + 8, Math.min(y, wa.y + wa.height - height - 8));
  popup.setBounds({ x, y, width: TRAY_W, height });
}

function hideTrayPopup() {
  if (_trayPopup && !_trayPopup.isDestroyed()) _trayPopup.hide();
}

function toggleTrayPopup() {
  if (_trayPopup && !_trayPopup.isDestroyed() && _trayPopup.isVisible()) {
    hideTrayPopup();
    return;
  }
  showTrayPopup();
}

/**
 * 打开托盘弹窗。**每次打开都新建、关闭即销毁**，不缓存隐藏实例：
 * 主题、语言、最近浏览列表都要求「此刻最新」，复用实例就得自己实现一套
 * 失效刷新；而本地 file:// 加载一份 index.html 只要一两百毫秒，
 * 用一次性的成本换掉整类状态漂移问题，是这里更划算的交易。
 */
function showTrayPopup() {
  if (_trayPopup && !_trayPopup.isDestroyed()) {
    _trayPopup.close();
    _trayPopup = null;
  }
  const theme = currentThemeKey();
  const popup = new BrowserWindow({
    width: TRAY_W,
    height: 420, // 预估值：内容真实高度由渲染层 tray:resize 回报后校正
    show: false,
    frame: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: TRAY_BG[theme] || TRAY_BG.light,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });
  _trayPopup = popup;
  // 失焦即收起：菜单类弹窗的通用交互，不依赖点空白处关闭
  popup.on('blur', () => hideTrayPopup());
  popup.on('closed', () => {
    if (_trayPopup === popup) _trayPopup = null;
  });
  // Esc 关闭：走 before-input-event 比让渲染层再发一次 IPC 更直接
  popup.webContents.on('before-input-event', (e, input) => {
    if (input.key === 'Escape') {
      hideTrayPopup();
    }
  });
  popup.once('ready-to-show', () => {
    positionTrayPopup(popup, 420);
    popup.show();
    // 主动取焦点：不拿焦点的窗口不会触发 blur，「点外面收起」与 Esc 关闭全都会失灵
    popup.focus();
  });
  const entry = path.join(__dirname, '../dist/index.html');
  if (_isDev) popup.loadURL(DEV_URL + '#tray');
  else popup.loadFile(entry, { hash: 'tray' });
  return popup;
}

/** 渲染层内容挂载后回报真实高度 → 校正弹窗尺寸与位置 */
function resizeTrayPopup(height) {
  if (!_trayPopup || _trayPopup.isDestroyed() || !_trayPopup.isVisible()) return;
  const h = Math.max(160, Math.min(560, parseInt(height, 10) || 0));
  if (!h) return;
  positionTrayPopup(_trayPopup, h);
}

/** 托盘动作转发给主窗口渲染层（打开某篇文档 / 以新建态打开）。窗口隐藏时其渲染进程仍在跑，send 可达。 */
function sendTrayNavigate(payload) {
  const w = state.win;
  if (!w || w.isDestroyed()) return false;
  w.webContents.send('tray:navigate', payload);
  return true;
}

/* 托盘悬停提示：文案由渲染层按当前语言经 'tray:tooltip' 推过来（品牌名属于渲染层
 * shell 域，主进程字典里没有也不需要复制一份）。
 * 模块级暂存一份：启动时渲染层的推送可能早于 createTray 到达（建托盘在窗口 ready-to-show
 * 之后），暂存后由 createTray 读取，两条时序都不会丢。 */
let _trayTooltip = '';

function createTray() {
  if (state.tray) return;
  let img;
  try {
    img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  } catch (e) {
    img = null;
  }
  if (!img || img.isEmpty()) {
    // 兜底：无图标文件时用纯色方块，保证托盘可用
    img = nativeImage.createFromBuffer(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAJklEQVR42u3OMQEAAAgDoJk/aRZw0gJ6mUm3bdu2bdu2bdu2D9sHQwgBgQ9V4xQAAAAASUVORK5CYII=',
        'base64'
      )
    );
  }
  state.tray = new Tray(img);
  const tray = state.tray;
  // 兜底名走应用常量（品牌名不随语言变），避免这里再写一份「文档盒」
  tray.setToolTip(_trayTooltip || APP_NAME);
  tray.on('click', () => toggleWindow());
  tray.on('double-click', () => showWindow());
  tray.on('right-click', () => toggleTrayPopup());
  getLog().info('系统托盘已创建');
}

/* 渲染层语言切换 / 启动时推送悬停提示；托盘已建则立即应用，未建则暂存 */
ipcMain.on('tray:tooltip', (_e, text) => {
  _trayTooltip = String(text || '');
  if (state.tray && !state.tray.isDestroyed()) state.tray.setToolTip(_trayTooltip);
});

/* 界面语言：渲染层 applyLang/setLang 时推过来（Beta.271）。
 *
 * ★ 为什么主进程还要靠渲染层推一遍 ★
 *   主进程自己能从 settings 表读 display.lang，但只在启动那一刻读一次。
 *   用户切语言时主进程若不知道，下一次弹原生对话框（右键菜单「图片另存为…」、
 *   完整性告警）就会用旧语言 —— 界面上明明是英文，弹窗是中文。
 *   这里不落库：语言持久化仍由渲染层的 settings:set 负责（单一写入点，
 *   否则同一次切换会产生两条「修改设置」审计记录）。setLang 只负责更新内存态
 *   与 userData 缓存（那份缓存是 dbError 屏场景的唯一语言来源）。
 *
 * fire-and-forget（ipcMain.on 而非 handle）：语言切换是本地状态，不需要回执，
 * 与 tray:tooltip 同一模式。 */
ipcMain.on('lang:set', (_e, lang) => {
  try {
    i18n.setLang(String(lang || ''));
  } catch (e) {}
});

/* ---------- 图片：v3 起一律 base64 内联 ---------- */
// v3 起文章图片一律 base64 内联进正文（data: URI），浏览器原生渲染，
// 不再使用自定义图片协议 / attachments 分储，旧文档包格式亦不再兼容。

function createWindow({ isDev, isShot }) {
  _isDev = !!isDev;
  state.win = new BrowserWindow({
    width: isShot ? 1440 : 1280,
    height: isShot ? 900 : 840,
    minWidth: 960,
    minHeight: 620,
    frame: false,
    show: false,
    backgroundColor: '#f4f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });
  state.win.once('ready-to-show', () => state.win.show());
  const wc = state.win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  // 转发渲染进程 console 到主进程日志（便于诊断版本号等问题）；按真实级别写入，ERROR/WARN 才标红/标黄
  wc.on('console-message', (e, level, msg, _line, _src) => {
    const lv = ['DEBUG', 'INFO', 'WARN', 'ERROR'][level] || 'INFO';
    const text = `[renderer ${lv}] ${msg}`;
    const log = getLog();
    if (lv === 'ERROR') log.error(text);
    else if (lv === 'WARN') log.warn(text);
    else if (lv === 'DEBUG') log.debug(text);
    else log.info(text);
  });
  /* ---------- 导航防护：只允许留在应用自己的页面上 ----------
   *
   * ★★★ 为什么必须收窄，而不是"拦非 file:// 就够了" ★★★
   *
   * 原实现是：
   *     if (url !== DEV_URL && !url.startsWith('file://')) e.preventDefault()
   *
   * 即**无条件放行所有 file://**。当时的心智模型是"file:// 就是我们自己的页面"，
   * 这在生产下不成立 —— 任何本地文件都是 file://。
   *
   * 后果（Beta.177 用户上报的"白屏"）：
   *   窗口被导航到应用之外的 file:// 页面后，**应用界面被整个替换掉**。
   *   窗口外壳还在、backgroundColor #f4f5f7 露出来，看起来就是一片空白；
   *   用户在那个外来页面上按 Ctrl+F，弹出的是 **Chromium 原生查找栏**
   *   （浅绿配色），与本应用 FindBar.vue 的蓝色查找条外观完全不同 ——
   *   这正是用户截图里那条绿栏的来历。
   *   重启能恢复，因为重启会重新 loadFile 回 dist/index.html。
   *
   * ★ 已实测确认的放行事实（复现脚本）：
   *     初始 URL: file:///…/dist/index.html
   *     did-start-navigation: file:///tmp/xxx.png   ← 未拦截
   *     最终 URL: file:///tmp/xxx.png               ← 导航成功
   *
   * ★ 修法：把"放行所有 file://"收窄为"只放行应用自身的入口页面"。
   *   用 pathToFileURL 生成基准，与 loadFile 的解析结果一致（含盘符/转义/空格处理），
   *   再比对上 hash —— 应用自身靠 hash 做路由（#/post/1 等），必须允许。
   *
   * ★ 为什么用 pathToFileURL 而不是手拼 'file://' + p：
   *   Windows 盘符要转成 file:///C:/…，路径里的空格与中文要百分号转义。
   *   手拼在中文路径（本应用默认目录就叫「文档盒 Archbox」）上必错。
   *
   * ★ 为什么只对主框架生效：
   *   will-navigate 对主框架与子框架**都会**触发。子框架（如 fields 里的
   *   <a target="_blank">）导航被拦下是无害的，但把主框架的放行规则套给子框架
   *   会在将来引入 iframe 时误伤。这里显式只放行主框架，子框架一律收口。 */
  //
  // ★ asar 下基准必须按「Electron 实际报告的页面 URL」取，不能手拼 ★
  //   __dirname 在 asar 下是 .../resources/app.asar/electron，手拼出来是
  //   file:///.../resources/app.asar/dist/index.html；
  //   而 Chromium 里真实的 document URL 未必逐字符相同（盘符大小写、转义等）。
  //   一旦不等，主框架的「应用自身页面」就成了永假条件 —— 表现为**每一次页面内
  //   跳转都被判为站外导航并拦下**（比白屏更隐蔽：首屏能显示，点哪都走不动）。
  //   故改为在 did-finish-load 后用 webContents.getURL() 校准一次真实值。
  let APP_ENTRY_URL = pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
  if (!isDev) {
    wc.once('did-finish-load', () => {
      try {
        const real = String(wc.getURL() || '').split('#')[0];
        if (/\/index\.html$/i.test(real)) APP_ENTRY_URL = real;
      } catch (e) {}
    });
  }
  wc.on('will-navigate', (e, url, isInPlace, isMainFrame) => {
    // Electron 30 的签名：will-navigate(event, url, isInPlace, isMainFrame)
    // 兼容老签名（只给 2 个参数）：缺省按主框架处理。
    const main = isMainFrame === undefined ? true : isMainFrame;
    if (!main) {
      e.preventDefault();
      return;
    }
    // 应用自身的入口页面（忽略 hash —— 应用靠 hash 路由）
    const ok = isDev ? url === DEV_URL || url.startsWith(DEV_URL + '#') : url.split('#')[0] === APP_ENTRY_URL;
    if (!ok) {
      e.preventDefault();
      getLog().warn(`已拦截站外导航：${url}`);
    }
  });
  /* 拖放兜底：把外部文件拖进窗口时，Chromium 默认会导航到该 file:// 并替换界面。
   * will-navigate 已经能拦住它，但在此之前窗口会闪一下；这里在渲染层装一个
   * dragover/drop 的全局拦截，把它挡在导航之前，彻底消除闪烁。
   * 用 executeJavaScript 而不是 preload：preload 走 contextIsolation，改不了页面级
   * 默认行为；且这段逻辑必须早于任何用户操作，故放在 did-finish-load。 */
  wc.on('did-finish-load', () => {
    wc.executeJavaScript(
      `(() => {
      if (window.__navGuardInstalled) return
      window.__navGuardInstalled = true
      const stop = (e) => { e.preventDefault(); e.stopPropagation(); return false }
      window.addEventListener('dragover', stop, true)
      window.addEventListener('drop', stop, true)
      window.addEventListener('dragenter', stop, true)
    })()`,
      true
    ).catch(() => {});
  });
  state.win.on('maximize', () => wc.send('win:state', { maximized: true }));
  state.win.on('unmaximize', () => wc.send('win:state', { maximized: false }));
  /* 关闭窗口：默认仅隐藏到系统托盘，不退出程序（quitting=true 时才真正退出）。
   *
   * 截图模式是例外：无头运行，没有托盘（createWindow 里 !isShot 才建托盘），
   * 界面已被撤走，只能"关闭即真退"。不这么做的后果很具体：
   * hideWindow() 之后 isShot 分支的收尾按不到 state.win，runShots 里的
   * app.quit() 便无从触发，截图进程会一直挂到外部超时才被杀。
   *
   * ★ 实现上把两种模式写在【同一个】close 监听器里，而不是挂两个监听器。
   *   两个监听器有两个真实风险：① 将来有人只改其中一个，两个分支的行为会打架；
   *   ② `state.quitting = true` 与 `e.preventDefault()` 的执行先后依赖监听器注册顺序，
   *   一旦顺序变了就变成"该退的没退、该拦的没拦"。合成一个，顺序是显式的。 */
  state.win.on('close', e => {
    if (isShot) {
      state.quitting = true;
      return;
    }
    if (!state.quitting) {
      // 编辑中有未保存修改时，隐藏到托盘前也先询问，避免误关编辑页。
      // 用应用内弹窗（见 askRendererThen 注释）：先拦下本次关闭，等前端确认后再隐藏。
      if (_unsaved) {
        e.preventDefault();
        askRendererThen('hide', () => {
          hideWindow();
          getLog().info('窗口已关闭到托盘（程序继续运行）');
        });
        return;
      }
      e.preventDefault();
      hideWindow();
      getLog().info('窗口已关闭到托盘（程序继续运行）');
    }
  });
  state.win.on('closed', () => {
    state.win = null;
  });
  if (isDev) state.win.loadURL(DEV_URL);
  else state.win.loadFile(path.join(__dirname, '../dist/index.html'));
  // 非截图模式下创建系统托盘（关闭后保留托盘图标，可从此恢复窗口）
  if (!isShot) createTray();
}

module.exports = {
  showWindow,
  hideWindow,
  toggleWindow,
  createTray,
  createWindow,
  setHeadless,
  requestQuit,
  showTrayPopup,
  hideTrayPopup,
  toggleTrayPopup,
  resizeTrayPopup,
  sendTrayNavigate
};
