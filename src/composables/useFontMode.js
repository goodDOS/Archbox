import { ref } from 'vue';
import { fontVarsOf, normalizeFontMode, DEFAULT_FONT_MODE } from '../utils/fontStack';

/**
 * 字体模式的加载与切换（全站唯一入口）。
 *
 * 两件事：
 *   1. 决定是否注入自带字体的 @font-face —— 系统字体模式下**不注入**，
 *      浏览器就不会去请求那 511 个 woff2（连带省掉磁盘与内存）。
 *   2. 把 --font-ui / --font-mono 写到 :root，全站靠这两个变量。
 *
 * 为什么 @font-face 用动态 <link> 而不是 import：
 *   本项目用 vite-plugin-singlefile 把 JS/CSS 全内联进 dist/index.html。
 *   若直接 `import './...fonts.css'`，那 511 条 @font-face 会连同 unicode-range
 *   一起塞进 HTML——文本体积暴涨，而字体文件本身无论如何都要独立存在
 *   （base64 内联 22 MB 不现实）。所以 fonts.css 放 public 目录，
 *   用 <link> 按需挂载，构建时由 vite 原样拷到 dist/fonts/。
 *
 * 为什么切换后要等 fonts.ready：
 *   font-display: swap 意味着新字体就位前先用回退字体渲染。切换时若不等待，
 *   会看到「先变回系统字体、再跳成 Noto」的二次抖动。等 ready 再换变量，
 *   过渡只有一次。等不到（字体加载失败）也必须放行，不能把界面卡在旧字体上。
 */

const FONT_CSS_HREF = './fonts/fonts.css';
const mode = ref(DEFAULT_FONT_MODE);
const loaded = ref(false);
let linkEl = null;
let applyToken = 0;

function ensureLink() {
  if (linkEl && document.head.contains(linkEl)) return linkEl;
  linkEl = document.getElementById('archbox-fonts');
  if (!linkEl) {
    linkEl = document.createElement('link');
    linkEl.id = 'archbox-fonts';
    linkEl.rel = 'stylesheet';
    linkEl.href = FONT_CSS_HREF;
    document.head.appendChild(linkEl);
  }
  return linkEl;
}

/**
 * 等 fonts.css 这个样式表真正就位（或确定失败）。
 *
 * ★ 为什么不能只等 document.fonts.ready ★
 *   fonts.ready 只承诺「已开始的字体加载都结束了」。若 fonts.css 本身 404
 *   （打包漏文件、路径写错），根本没有 @font-face 被注册，fonts.ready 会**立刻**
 *   resolve，于是我们把 --font-ui 写成 Noto 字族 —— 而这几个字族并不存在，
 *   浏览器全部回退到最后的 sans-serif，中文界面会突然变成难看的默认字形，
 *   且不会自己恢复。这里必须在 link 的 load / error 上等一个明确结果。
 */
function waitStylesheet(el, timeoutMs = 4000) {
  return new Promise(resolve => {
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      el.removeEventListener('load', onLoad);
      el.removeEventListener('error', onError);
      resolve(ok);
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false);
    el.addEventListener('load', onLoad);
    el.addEventListener('error', onError);
    // 已经加载完的 link（重复调用时）不会再触发 load，用 sheet 是否存在来判断
    if (el.sheet) finish(true);
    setTimeout(() => finish(!!el.sheet), timeoutMs);
  });
}

function removeLink() {
  const el = document.getElementById('archbox-fonts');
  if (el && el.parentNode) el.parentNode.removeChild(el);
  linkEl = null;
}

/** 等字体就位；超时或失败都放行，绝不卡住界面 */
function waitFonts(timeoutMs = 3000) {
  const fonts = document.fonts;
  if (!fonts || !fonts.ready) return Promise.resolve();
  return Promise.race([fonts.ready.catch(() => {}), new Promise(r => setTimeout(r, timeoutMs))]);
}

/** 把变量写到 :root */
function applyVars(m) {
  const vars = fontVarsOf(m);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

/** 应用模式。silent=true 用于首屏（无需等待，直接上） */
async function apply(m, { silent = false } = {}) {
  const target = normalizeFontMode(m);
  const token = ++applyToken;

  let effective = target;
  if (target === 'bundled') {
    const link = ensureLink();
    if (!silent) {
      /* ★ 样式表没加载成功就退回系统字体，而不是硬写 Noto 字族 ★
       * 硬写的后果：字族名不存在 → 全部文字回落到 sans-serif，中文变成默认字形，
       * 且用户完全不知道发生了什么（设置里还显示「自带字体」）。
       * 退回系统字体至少界面是正常的，且下次启动还会重试。 */
      const cssOk = await waitStylesheet(link);
      if (token !== applyToken) return;
      if (cssOk) await waitFonts();
      if (token !== applyToken) return;
      if (!cssOk) {
        console.warn('[font] fonts.css 未能加载，本次回退到系统字体');
        effective = 'system';
      }
    }
  }

  applyVars(effective);
  mode.value = effective;
  loaded.value = true;

  // 自带字体就位后再撤掉系统模式下的残留 link（顺序不能反：先撤会闪回退字体）
  if (effective === 'system' && target === 'system') removeLink();
}

/**
 * 在应用启动时调用一次（main.js）。
 * 传进来的值来自设置表；非法值会被 normalizeFontMode 兜回默认。
 */
export function initFontMode(initial) {
  apply(initial, { silent: true });
}

/** 设置页切换用 */
export async function setFontMode(m) {
  const next = normalizeFontMode(m);
  if (next === mode.value) return;
  await apply(next);
}

/** 只读状态，供设置页回显 */
export function useFontMode() {
  return { mode, loaded, setFontMode };
}

/** 测试与诊断用：当前模式下的变量值 */
export function currentFontVars() {
  return fontVarsOf(mode.value);
}
