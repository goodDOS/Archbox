/**
 * 字体栈的唯一来源。
 *
 * 两套模式：
 *   'bundled' —— 用随包自带的 Noto 字体（src/assets/fonts/，见 scripts/sync-fonts.mjs）
 *   'system'  —— 用本机系统字体（旧行为：Win 微软雅黑 / macOS 苹方）
 *
 * 为什么必须收敛到这里：
 *   改造前 body 的 font-family 写死在 base.css，`--font-mono` 写在 themes.css，
 *   两处各管一摊。一旦要「按用户选择切换」，散落的 font-family 就会出现
 *   「正文换了、按钮没换」「输入框还是旧字体」这类半切换状态 —— 同类问题在主题上踩过。
 *   现在全站只引用 --font-ui / --font-mono，切换只改这两个变量的值。
 *
 * 为什么中文类要排在最前面而不是作为兜底：
 *   字体匹配是「逐字符」的，浏览器从左往右找第一个包含该字符的字体。
 *   Noto Sans（拉丁）排在 Noto Sans SC 前面也无妨 —— 它不含汉字，汉字会自动落到后面的中文字族。
 *   但反过来，若把系统字体（如微软雅黑）排在自带字体之前，它会抢走全部汉字，自带字就等于没装。
 *   所以自带模式下，自带字族**必须**全部排在系统字体之前。
 */

/** 自带字体模式：字族名与 src/assets/fonts/fonts.css 里 @font-face 的 font-family 一一对应 */
export const BUNDLED_STACK = [
  'Noto Sans',
  'Noto Sans SC',
  'Noto Sans TC',
  'Noto Sans JP',
  'Noto Sans KR',
  'Noto Sans Arabic',
  /* ★ emoji 必须排在所有文字字族之后 ★
   * 彩色 emoji 字体里含数字 0-9 与 # *（键帽字符 U+0023 / U+0030-0039）。
   * 若排在前面，浏览器会优先用 emoji 字体渲染这些字符，
   * 正文里的「版本 3」「#标签」全部变成键帽方块表情 —— 且这条只影响部分字符，
   * 肉眼很容易误判成「某个主题的字体有问题」。所以它只能垫底，接住文字字体没有的 emoji。
   *
   * 系统 emoji 字体同理，排在自带 emoji 之后作为缺字兜底。 */
  'Noto Color Emoji',
  'Segoe UI Emoji',
  'Apple Color Emoji',
  // 自带字若有缺字（极生僻字），仍要落到系统字体，不能让界面出现豆腐块
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI',
  'PingFang SC',
  'Microsoft YaHei',
  'Helvetica Neue',
  'Arial',
  'sans-serif'
];

/** 系统字体模式：本次改造前的原字体栈，只补了 emoji 兜底
 *
 * 原来没写 emoji 字体，靠浏览器自己找（Chromium 在各平台会回落到 Segoe UI Emoji /
 * Apple Color Emoji），多数情况能显示。显式列出是为了两件事：
 *   ① Windows 上 'Segoe UI' 本身含少量单色 emoji 字形，会抢在彩色 emoji 之前被选中，
 *      表现为「有的 emoji 是彩色、有的是黑白线框」；显式把 emoji 族提到 'Segoe UI' 之前解决。
 *   ② 与自带模式保持同一套兜底顺序，切换时 emoji 观感不至于突然变风格。 */
export const SYSTEM_STACK = [
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI Emoji',
  'Apple Color Emoji',
  'Segoe UI',
  'PingFang SC',
  'Microsoft YaHei',
  'Helvetica Neue',
  'Arial',
  'sans-serif'
];

/** 等宽栈：两种模式共用。等宽字体与配色/字族风格无关，只为「数字对齐」 */
export const MONO_STACK = ['ui-monospace', 'Cascadia Code', 'Consolas', 'Courier New', 'monospace'];

export const FONT_MODES = ['bundled', 'system'];
export const DEFAULT_FONT_MODE = 'bundled';

/** 把字族数组拼成 CSS font-family 值；含空格的族名加引号 */
export function stackToCss(list) {
  return (Array.isArray(list) ? list : []).map(n => (/\s/.test(n) ? `'${n}'` : n)).join(', ');
}

/** 归一化：非法值一律回落到默认，不让脏数据传进 DOM 属性 */
export function normalizeFontMode(v) {
  const s = String(v == null ? '' : v).trim();
  return FONT_MODES.includes(s) ? s : DEFAULT_FONT_MODE;
}

/** 把模式写成 CSS 自定义属性值（挂到 :root 上） */
export function fontVarsOf(mode) {
  const m = normalizeFontMode(mode);
  return {
    '--font-ui': stackToCss(m === 'bundled' ? BUNDLED_STACK : SYSTEM_STACK),
    '--font-mono': stackToCss(MONO_STACK)
  };
}
