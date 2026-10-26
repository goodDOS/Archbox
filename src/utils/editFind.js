/**
 * editFind —— 编辑态页内查找引擎（PostView 编辑模式专用）。
 *
 * ============================ 与查看态的分工 ============================
 * postFind.js 是总入口：search / jump / clear 先探测当前是不是编辑态
 * （.edit-layout 存在），是则转调本模块，否则走查看态的 DOM <mark> 扫描。
 * 两侧共用 findState（store/modules/find.js）与同一套 pf-hit 样式，用户看到的
 * 查找条、计数、跳转行为完全一致，只是"命中长在哪里、怎么点亮"不同。
 *
 * ============================ 编辑态的命中分两类 ============================
 * ① 输入框类（标题 / 字段填写框）：值是普通字符串，命中用
 *    **源码级高亮覆盖层**（findOverlay.js）+ 原生选区两条腿：
 *    · 覆盖层负责「所有命中都可见」——在控件上方另画一层带背景色的命中块，
 *      不抢焦点、不挡点击。Beta.316 前只有原生选区，导致"搜索出 5 处，只有聚焦的
 *      那 1 处有反白，其余全看不见"，用户报「标题文字没被高亮」。
 *    · 原生选区负责「跳过去就能直接改字」——跳转时 focus + setSelectionRange，
 *      光标正落在命中处。
 *    ⚠ 焦点会从查找框被抢走，故 FindBar.vue 监听 findState.active 变化把焦点
 *    还回来（见该文件的 watch）—— 否则用户接着打的字全落进文档表单里。
 *    还回来后原生选区虽然淡了，覆盖层的命中块仍在，所以"高亮"不会消失。
 * ② 正文：ProseMirror 文档，外部不能拆 DOM，走 editorFind.js 的
 *    decoration 高亮（pf-hit 类名与查看态同一套 CSS）。命中数直接数 DOM 里
 *    .editor-area .pf-hit 的个数——装饰集是唯一真相源，避免在应用层另写一套
 *    文本匹配计数而与装饰结果漂移。
 *
 * ============================ 导航顺序 ============================
 * 标题 → 字段填写框 → 正文（与查看态 scopes() 的"标题 + 字段数据 + 正文"同序）。
 * 全局序号 1-based 跨三类统一编号；正文段偏移量 bodyOffset = 前两类命中数，
 * 由 editorFindQuery 带进 decorations 计算激活项。
 *
 * 刻意不在查找范围内（与查看态口径一致）：大区/分类下拉、标签输入、编号输入、
 * select 型字段的下拉显示值——它们是表单控件/元信息，不是"文档内容"。
 */
import { editorFindQuery, resetEditorFindQuery, getEditorFindProvider } from './editorFind.js';
import { render as renderOverlay, removeAll as removeOverlay } from './findOverlay.js';

/** 输入框类目标锚点（PostView 标题框与 FieldRenderer 填写框自带 data-find-input） */
const INPUT_SEL = '.edit-layout [data-find-input]';
const PM_HIT_SEL = '.edit-layout .editor-area .pf-hit';
const PM_ACTIVE_SEL = '.edit-layout .editor-area .pf-hit-active';

/** 上一次被选区标示的输入框：跳转前先把旧选区收起，避免留下"幽灵选区" */
let lastSelected = null;

function visible(el) {
  if (!el) return false;
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}

/** 正文提供者（编辑器可见才作目标） */
function pmProvider() {
  const p = getEditorFindProvider();
  if (!p) return null;
  return visible(document.querySelector('.edit-layout .editor-area')) ? p : null;
}

function countPmHits() {
  return document.querySelectorAll(PM_HIT_SEL).length;
}

function scrollActivePm() {
  const el = document.querySelector(PM_ACTIVE_SEL);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'auto' });
}

/**
 * 收集全部命中位置（每次调用重算，DOM 便宜且能容忍用户中途改了输入框内容）。
 * @returns {{ items: Array<{el: HTMLInputElement|HTMLTextAreaElement, start: number}>, bodyPm: object|null }}
 *   items = 输入框类命中，按导航顺序；bodyPm = 正文提供者或 null。
 */
function locate(needle, matchCase) {
  const items = [];
  const head = Array.from(document.querySelectorAll(INPUT_SEL));
  const bodyPm = pmProvider();
  const inputs = head;
  for (const el of inputs) {
    const value = el.value || '';
    const hay = matchCase ? value : value.toLowerCase();
    let i = hay.indexOf(needle);
    while (i !== -1) {
      items.push({ el, start: i });
      i = hay.indexOf(needle, i + needle.length);
    }
  }
  return { items, bodyPm };
}

/** 收起旧选区（光标落到末尾），只动自己标示过的输入框 */
function collapseSelection(el) {
  try {
    const n = el.value ? el.value.length : 0;
    el.setSelectionRange(n, n);
  } catch (e) {
    /* 某些 input 类型（如 number）不支持 setSelectionRange，忽略 */
  }
}

/** focus + 原生选区标示命中处，并滚动到可见 */
function focusAndSelect(el, start, end) {
  if (lastSelected && lastSelected !== el) collapseSelection(lastSelected);
  el.focus();
  try {
    el.setSelectionRange(start, end);
  } catch (e) {
    /* 同上：不支持选区的输入框退化为仅 focus */
  }
  lastSelected = el;
  if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
}

/**
 * 编辑态查找（由 postFind.search 转调）。
 * @param {string} text 查询词（调用方已保证非空）
 * @param {{matchCase?: boolean}} [opts]
 * @returns {{matches: number}} 三类目标合计命中数
 */
export function editSearch(text, { matchCase = false } = {}) {
  const needle = matchCase ? text : text.toLowerCase();
  const { items, bodyPm } = locate(needle, matchCase);
  const beforeBody = items.length;
  let bodyCount = 0;
  if (bodyPm) {
    editorFindQuery.text = text;
    editorFindQuery.matchCase = matchCase;
    editorFindQuery.bodyOffset = beforeBody;
    editorFindQuery.active = 1; // 与查看态同口径：首命中即激活项
    bodyPm.refresh();
    bodyCount = countPmHits();
  }
  // 输入框命中全量上图：这一步就是「标题文字没被高亮」的修复点。
  // 传给 overlay 的 len 是 needle 长度（大小写不敏感时用于截取原文，长度相同）。
  renderOverlay(
    items.map(it => ({ el: it.el, start: it.start, len: needle.length })),
    items[0]
  );
  const total = items.length + bodyCount;
  // 激活项落在正文时，与查看态 search() 的 setActive(0) 一样滚动到位；
  // 落在输入框里不抢焦点（用户正在查找框打字），由 Enter/↑/↓ 显式定位。
  if (total && !items.length && bodyPm) scrollActivePm();
  return { matches: total };
}

/**
 * 编辑态跳转（由 postFind.jump 转调）。
 * @param {boolean} backward 是否上一处
 * @param {{active?: number, matches?: number, text?: string, matchCase?: boolean}} ctx
 *   findState 快照——store 持有状态，引擎不反向依赖 store（避免成环）
 * @returns {number} 新的 0-based 序号；无命中返回 -1
 */
export function editJump(backward, ctx = {}) {
  const { active = 0, matches = 0, text = '', matchCase = false } = ctx;
  if (!matches || !text) return -1;
  const needle = matchCase ? text : text.toLowerCase();
  const { items, bodyPm } = locate(needle, matchCase);
  const total = items.length + (bodyPm ? countPmHits() : 0);
  if (!total) return -1;
  const next = (((active - 1 + (backward ? -1 : 1)) % total) + total) % total;
  // 激活项一换，覆盖层要跟着换「当前」那块的深色底 —— 否则用户按 Enter 后
  // 只有正文（PM 装饰）在动，输入框里看不出跳到哪一处了。
  renderOverlay(
    items.map(it => ({ el: it.el, start: it.start, len: needle.length })),
    items[next] || null
  );
  if (next < items.length) {
    const it = items[next];
    focusAndSelect(it.el, it.start, it.start + needle.length);
  } else if (bodyPm) {
    editorFindQuery.active = next + 1;
    bodyPm.refresh();
    scrollActivePm();
  }
  return next;
}

/**
 * 编辑态收尾（由 postFind.clear 转调，覆盖 findClose / 切页 / 重新搜索三条路径）：
 * 撤正文装饰 + 收起自己标示过的输入框选区。幂等。
 */
export function editClear() {
  const hadQuery = resetEditorFindQuery();
  const p = getEditorFindProvider();
  if (hadQuery && p) p.refresh();
  // 覆盖层必须随查找一起消失：它挂在输入框的父元素上，不归 Vue 管，
  // 不显式移除就会在页面上留一层"幽灵高亮"。
  removeOverlay();
  if (lastSelected) {
    collapseSelection(lastSelected);
    lastSelected = null;
  }
}
