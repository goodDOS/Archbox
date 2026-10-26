/**
 * 正文图片的显示尺寸：解析 / 校验 / 生成样式（Beta.322）。
 *
 * 【为什么单独成模块】
 *   这一套口径原先分散在四个地方各写一遍正则，而且写得不一致：
 *     1. 主进程 electron/db/core.js 的 allowedStyles.width（只认四档百分比）
 *     2. 前端 src/utils/sanitize.js 的 STYLE_PROPS.width（同上）
 *     3. 编辑器 ImageSized 扩展的 parseHTML / renderHTML（同上）
 *     4. src/utils/sanitize.js 的 markSelectableMedia（同上）
 *   用户要求「可以自定义像素、可选锁定比例」后，若继续在四处各补一套 px 正则，
 *   必然出现「编辑器能设、保存被剥掉」这类只在某一层失效的 bug。故收敛到这里：
 *   渲染层与主进程都从这里取同一份正则与解析函数，改口径只改一处。
 *
 * 【两种单位并存】
 *   - 百分比（1–100）：相对正文宽度，窗口变宽图也变宽，适合插画/示意图。
 *   - 像素（24–2048）：绝对尺寸，与窗口无关，适合截图/表格这类要看清细节的图。
 *   两种都要（用户明确选了「两套并存」）。缺省不写 = 按容器自适应，与旧行为一致。
 *
 * 【为什么宽度和高度分开存】
 *   锁定比例时，高度由宽度按原图比例推算后写成**像素**，这样即使正文容器宽度变化，
 *   图片的宽高比也保持不变；若高度也写成百分比，百分比高度基准是容器高度，
 *   在流式正文里会得到完全不符合预期的结果。
 *
 * 【正则为什么长这样】
 *   不用「列一堆数字区间」的写法：`20[0-4]\d` 会把 2049 也算进去，需要再补一条
 *   例外，越写越难核对。改成「先匹配形态，再用 test 里带边界的断言」反而清楚：
 *   像素分支只接受 2–4 位整数，具体上下限由 assertPxRange 在 parseSize 里判断。
 */

/** 百分比四档（工具栏快捷按钮用） */
export const IMAGE_PCT_STEPS = ['25', '50', '75', '100'];

/** 像素宽度区间：太小的图看不见，太大的图会把正文撑出横向滚动条 */
export const IMAGE_PX_MIN = 24;
export const IMAGE_PX_MAX = 2048;

/**
 * 宽度/高度的 CSS 值白名单（供净化层放行）。
 *
 * 只认两种形态，其余（calc / expression / url 等）一律不匹配 —— 防注入第一道闸。
 *   1. 1–3 位整数百分比：1%–100%
 *   2. 2–4 位整数像素：具体区间由主进程侧在放行前另行夹取（见 imageSize.js 注释）
 *
 * ★ 必须整串锚定且不含空白 ★
 *   净化拿到的值可能带空格（` 480px`），parseSize 会 trim；但放行正则不 trim，
 *   宁可拒绝也不放过畸形值 —— 拒绝的后果只是回落到自适应宽度，不影响图片本身。
 */
export const SIZE_VALUE_RE = /^(?:[1-9]|[1-9]\d|100)%$|^[1-9]\d{1,3}px$/;

/** 宽松形态：任意百分比或像素，供「解析已有内容」使用（不用于放行写入） */
const LOOSE_RE = /^(\d{1,4}(?:\.\d+)?)(%|px)$/;

/** 像素下限/上限断言：把范围判断从正则里挪出来，比堆区间写法可读得多 */
function pxInRange(n) {
  return Number.isFinite(n) && n >= IMAGE_PX_MIN && n <= IMAGE_PX_MAX;
}

/**
 * 解析一个尺寸值。
 * @returns {{n: number, unit: '%'|'px'} | null} 非法或为空时返回 null
 */
export function parseSize(value) {
  const s = String(value == null ? '' : value)
    .trim()
    .toLowerCase();
  if (!s) return null;
  const m = LOOSE_RE.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (m[2] === 'px') {
    if (!pxInRange(n)) return null;
    return { n: Math.round(n), unit: 'px' };
  }
  // 百分比夹到 1–100：>100 会把图撑出容器，0 会让图消失
  return { n: Math.min(100, Math.max(1, Math.round(n))), unit: '%' };
}

/** 规范化成 CSS 字符串；非法值返回 ''（调用方据此删属性） */
export function normalizeSize(value) {
  const p = parseSize(value);
  return p ? `${p.n}${p.unit}` : '';
}

/**
 * 把「宽度」按原图比例换算成「高度」。
 *
 * @param {string} width  已规范化的宽度（如 '480px' / '50%'）
 * @param {number} natW   原图像素宽
 * @param {number} natH   原图像素高
 * @param {number} [boxW] 百分比宽度时，正文容器的实际像素宽（用于算出高度的像素值）
 * @returns {string} 高度 CSS 值（像素）；无法计算时返回 ''
 *
 * ★ 为什么百分比宽度也要算成像素高度 ★
 *   正文容器宽度是流式的，若高度也写百分比，浏览器会拿「容器高度」当基准 ——
 *   那是完全不同的量，得到的高度毫无意义（通常表现为图片被压成一条）。
 *   所以百分比宽度时，用容器当前像素宽 × 百分比算出实际像素宽，再乘原图高宽比。
 */
export function heightForWidth(width, natW, natH, boxW) {
  if (!natW || !natH) return '';
  const p = parseSize(width);
  if (!p) return '';
  let pxW;
  if (p.unit === 'px') {
    pxW = p.n;
  } else {
    if (!boxW) return '';
    pxW = (boxW * p.n) / 100;
  }
  const pxH = Math.round((pxW * natH) / natW);
  if (pxH < 1 || pxH > 20000) return '';
  return `${pxH}px`;
}

/**
 * 原图宽高比（宽 / 高）。拿不到尺寸时返回 0，调用方据此放弃锁定。
 */
export function aspectRatio(natW, natH) {
  if (!natW || !natH) return 0;
  return natW / natH;
}
