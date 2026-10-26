/**
 * 弹层固定定位统一算法：Teleport 到 body 的下拉/取色/日期弹层的坐标计算。
 * 此前 DatePicker / ColorPicker / Dropdown 三处各自实现一份「getBoundingClientRect +
 * 视口翻转 + 边距」逻辑，仅宽度/间距/高度兜底不同，现收口为单一函数。
 *
 * 语义：弹层默认出现在触发元素下方，右侧对齐触发元素左缘；若下方放不下则翻到上方，
 * 若右侧越界则向左收；始终留 8px 视口安全边距。
 *
 * @param {object}  anchor  触发元素的 getBoundingClientRect() 结果（{ bottom, left, top, width }）
 * @param {object}  opts     { width: 弹层宽度px, height: 弹层高度px(offsetHeight，缺省用兜底), margin: 与触发的间距px }
 * @param {object}  viewport { vw: innerWidth, vh: innerHeight }（可注入以便测试）
 * @returns {{ top:number, left:number }} 纯数字坐标（调用方自行拼 px）
 */
export function computeFixedPosition(anchor, opts = {}, viewport = {}) {
  const width = Number(opts.width) || 200;
  const height = Number(opts.height) || 240;
  const margin = opts.margin != null ? Number(opts.margin) : 6;
  const vw = viewport.vw || (typeof window !== 'undefined' ? window.innerWidth : 0);
  const vh = viewport.vh || (typeof window !== 'undefined' ? window.innerHeight : 0);

  let top = anchor.bottom + margin;
  if (top + height > vh - 8) top = Math.max(8, anchor.top - height - margin);

  let left = anchor.left;
  if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
  if (left < 8) left = 8;

  return { top, left };
}
