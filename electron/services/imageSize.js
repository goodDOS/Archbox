'use strict';
/**
 * 正文图片显示尺寸的口径 —— 主进程侧（Beta.322）。
 *
 * 【与 src/utils/imageSize.js 的关系】
 *   同一份口径必须在渲染层与主进程各有一份：渲染层是 ESM（被 Vite 打包），
 *   主进程是 CJS（被 Electron 直接 require），不能共享同一个文件。
 *   因此这里保留一份**逐字对应**的副本，并由
 *   electron/verify/image-size.test.mjs 断言两者的常量与正则的源码文本完全一致 ——
 *   任一边改了另一边没跟上，测试直接报红，不会出现「编辑器能设、保存被剥掉」。
 *
 * 【只放校验，不放换算】
 *   主进程只需要判断「这个 CSS 值能不能放行」，不需要按比例算高度（那是编辑器的事）。
 *   换算逻辑只留在渲染层的 imageSize.js，避免两边各实现一套再慢慢走偏。
 */

/** 百分比四档 */
const IMAGE_PCT_STEPS = ['25', '50', '75', '100'];

/** 像素宽度区间 */
const IMAGE_PX_MIN = 24;
const IMAGE_PX_MAX = 2048;

/**
 * 宽度/高度的 CSS 值白名单（与渲染层 SIZE_VALUE_RE 逐字一致）。
 *
 * ★ 这个正则只做「形态」把关（百分比 1–100 或 2–4 位整数像素）★
 *   像素的 24–2048 区间靠 xInRange() 二次断言 —— 把范围从正则里挪出来，
 *   比堆一串 `2[4-9]|[3-9]\d|...` 区间可读、也不会漏掉 2049 这类边界。
 */
const SIZE_VALUE_RE = /^(?:[1-9]|[1-9]\d|100)%$|^[1-9]\d{1,3}px$/;

/** 像素区间断言（与渲染层 pxInRange 同语义） */
function pxInRange(n) {
  return Number.isFinite(n) && n >= IMAGE_PX_MIN && n <= IMAGE_PX_MAX;
}

/** 单个 CSS 值是否可放行：形态命中正则 + 像素区间符合 */
function acceptableSize(value) {
  const s = String(value == null ? '' : value)
    .trim()
    .toLowerCase();
  if (!SIZE_VALUE_RE.test(s)) return false;
  if (!/px$/.test(s)) return true; // 百分比已在正则里夹到 1–100
  return pxInRange(parseInt(s, 10));
}

/**
 * sanitize-html 的规则项要的是「正则数组」，但区间判断无法用单个正则表达干净。
 * 这里用一个等价形态的正则兜住外层，再用带 state 的工厂把区间判断塞进 test：
 * 构造出来的对象长得像 RegExp（有 test），sanitize-html 只调用 .test()。
 */
function sizeRule() {
  return [
    {
      test(value) {
        return acceptableSize(value);
      }
    }
  ];
}

/**
 * 主进程需要放行的 style 属性表（供 core.js 的 allowedStyles 使用）。
 *
 * ★ width / height 只对 img 有意义 ★
 *   不能挂到 '*' 通配组，那等于允许 <div style="width:9999px">，
 *   单个 div 就能把正文撑出横向滚动条。故调用方把它**只挂到 img 分支**。
 */
const IMAGE_SIZE_STYLE_RULES = {
  width: sizeRule(),
  height: sizeRule()
};

module.exports = {
  IMAGE_PCT_STEPS,
  IMAGE_PX_MIN,
  IMAGE_PX_MAX,
  SIZE_VALUE_RE,
  pxInRange,
  acceptableSize,
  IMAGE_SIZE_STYLE_RULES
};
