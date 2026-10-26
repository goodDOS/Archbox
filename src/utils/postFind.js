/**
 * postFind —— 文章内查找引擎（Beta.184 引入，取代主进程 findInPage 方案）
 *
 * ============================ 为什么要自建，而不是用 Chromium 原生 findInPage ============================
 * 旧方案（electron/ipc/find.js）走 webContents.findInPage，它是 webContents 级**整页**
 * 查找，Chromium 没有"限定子树"的参数。为了把侧栏/标题栏这类"界面文字"排除在结果外，
 * 旧方案用 `content-visibility:hidden` 把它们移出查找树 —— 但那会让文字**不绘制**
 * （白屏），而 `opacity` 弱化虽然可见、却又仍在查找树里被命中。两条路在 CSS 层面互斥，
 * 永远无法同时做到"界面文字可见"且"不被查找命中"。
 *
 * 类比 WorkBuddy 的搜索设计：它的搜索**只遍历"内容对象"（任务/空间/产物）**，
 * 根本不碰界面 DOM，所以天然"只命中内容、不命中界面文字"。
 *
 * 本引擎就是把这个思路落到文档盒：放弃原生整页查找，**只扫文章标题、字段数据与正文**
 *（`.page-head .title-selectable` + `.post-main .fields-card` + `.post-main .post-content`；
 *  Beta.219 起局域共享文档详情页同口径接入：`.post-read` 的 pr-title / pr-fields / pr-body），
 * wrap `<mark>` 高亮、维护命中列表、next/prev 滚动定位。侧栏/标题栏/元信息完全不在扫描范围 ——
 * 既不白屏，也不会被命中。
 *
 * ============================ 与 Vue 的协调 ============================
 * 查找条打开时通常是查看模式（editing=false），`.post-main` 内容稳定。每次 search
 * 先 clear（移除 mark、还原纯文本）再重新扫描；即便中途 Vue 重渲染清掉了 mark，
 * 下次输入也会重建。我们修改的是真实 DOM 文本节点的结构，与 Vue 的 vnode 不是同一层，
 * 只要该组件不被 patch，mark 就原样留着。
 *
 * ============================ 编辑态（Beta.315 / #418）============================
 * 编辑态（.edit-layout 存在）正文归 ProseMirror 所有，不能拆 DOM 包 <mark>，
 * 且查找范围变成「标题输入框 + 字段填写框 + 正文」三类目标。此时 search / jump /
 * clear 一律转调 editFind.js 混合引擎：输入框类用原生选区标示，正文用 PM decoration
 * 高亮（editorFind.js）。查看态的三条路径（历史版本预览 / 共享详情 / 本机详情）
 * 行为不变——编辑态下这三个容器都不渲染，scopes() 自然落空。
 *
 * ============================ 边界处理 ============================
 * · 跳过 script / style 内的文本节点；
 * · 跳过 display:none / visibility:hidden 的节点（它们本就不应被"看到"，也不该命中）；
 * · 跳过我们自己注入的 <mark>（防御，正常由 clear 先清掉）；
 * · 同一文本节点内的多处命中从后往前拆分，避免 index 偏移；
 * · 大小写不敏感时用 toLowerCase 比较，但高亮保留原文大小写。
 */
import { editSearch, editJump, editClear } from './editFind.js';

const HIT = 'pf-hit';
const ACTIVE = 'pf-hit-active';

/** 当前是否处于编辑态（PostView 编辑模式）：有 .edit-layout 即转混合引擎 */
function inEditMode() {
  return typeof document !== 'undefined' && !!document.querySelector('.edit-layout');
}

/** 当前命中 <mark> 元素，按文档顺序 */
let marks = [];
/** 当前激活项（0-based），-1 表示无 */
let activeIndex = -1;

/**
 * 查找范围容器：只包含「文章标题 + 字段数据 + 正文」。
 * 历史版本预览弹层打开时，优先只搜弹层内的标题/正文，不碰背后的当前页面。
 */
function scopes() {
  const pvBody = document.querySelector('.pv-body.post-content');
  if (pvBody) {
    return [document.querySelector('.pv-head .pv-title'), pvBody].filter(Boolean);
  }
  // ★ Beta.219：局域共享文档详情页（LanShare.vue 只读视图 .post-read）★
  //   口径与本机详情页严格一致：标题 + 字段数据 + 正文。
  //   pr-meta（作者/分类等元信息）与 pr-tags（标签）刻意排除——本机侧同样不搜这些。
  //   .post-read 只在详情视图（v-else）渲染，共享列表视图无 pr-* → 自动落到本机三件套（也为空）。
  const lanBody = document.querySelector('.post-read .pr-body');
  if (lanBody) {
    return [
      document.querySelector('.post-read .pr-title'),
      document.querySelector('.post-read .pr-fields'),
      lanBody
    ].filter(Boolean); // .pr-fields 在源文档无字段时不渲染，filter 兜底
  }
  return [
    document.querySelector('.page-head .title-selectable'),
    document.querySelector('.post-main .fields-card'),
    document.querySelector('.post-main .post-content')
  ].filter(Boolean);
}

/**
 * 移除所有高亮并还原纯文本（幂等，可重复调用）。
 * 用 replaceChild 把每个 <mark> 换回纯文本节点，再 normalize 合并相邻文本节点。
 * 编辑态另路收尾：撤 PM 装饰 + 收起输入框选区（editClear 幂等，查看态下为空转）。
 */
export function clear() {
  for (const m of marks) {
    const parent = m.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    if (parent.normalize) parent.normalize();
  }
  marks = [];
  activeIndex = -1;
  editClear();
}

/**
 * 在文本节点的所有命中位置包裹 <mark class="pf-hit">。
 * 从后往前拆分，避免 index 偏移。
 */
function wrapHits(node, needle, matchCase) {
  const value = node.nodeValue;
  const hay = matchCase ? value : value.toLowerCase();
  const hits = [];
  let i = hay.indexOf(needle);
  while (i !== -1) {
    hits.push(i);
    i = hay.indexOf(needle, i + needle.length);
  }
  if (!hits.length) return;

  const parent = node.parentNode;
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const h of hits) {
    if (h > last) frag.appendChild(document.createTextNode(value.slice(last, h)));
    const mark = document.createElement('mark');
    mark.className = HIT;
    mark.textContent = value.slice(h, h + needle.length);
    frag.appendChild(mark);
    last = h + needle.length;
  }
  if (last < value.length) frag.appendChild(document.createTextNode(value.slice(last)));
  parent.replaceChild(frag, node);
}

/**
 * 在文章标题、字段数据与正文内查找 text，包裹高亮。
 * 编辑态（.edit-layout）转调 editFind 混合引擎（输入框原生选区 + PM 装饰）。
 * @param {string} text 查询词
 * @param {{matchCase?:boolean}} [opts]
 * @returns {{matches:number}}
 */
export function search(text, { matchCase = false } = {}) {
  clear();
  if (!text) return { matches: 0 };
  if (inEditMode()) return editSearch(text, { matchCase });
  const roots = scopes();
  if (!roots.length) return { matches: 0 };

  const needle = matchCase ? text : text.toLowerCase();

  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const v = node.nodeValue;
        if (!v || !v.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest('script, style')) return NodeFilter.FILTER_REJECT;
        if (p.classList && p.classList.contains(HIT)) return NodeFilter.FILTER_REJECT;
        const cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    // 先收集再包裹：TreeWalker 迭代中直接 replaceChild 会破坏游标，导致同容器内后续
    // 文本节点被跳过（如 .fields-card 中多个 <td> 文本）。
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const node of nodes) wrapHits(node, needle, matchCase);
  }

  marks = Array.from(document.querySelectorAll('.' + HIT));
  if (marks.length) setActive(0);
  return { matches: marks.length };
}

/**
 * 定位到第 i 个（0-based，环绕），滚动可见，更新 active 样式。
 * @returns {number} 实际定位到的 0-based 序号；无命中返回 -1
 */
export function setActive(i) {
  if (!marks.length) return -1;
  const len = marks.length;
  i = ((i % len) + len) % len;
  marks.forEach((m, k) => m.classList.toggle(ACTIVE, k === i));
  activeIndex = i;
  const el = marks[i];
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'auto' });
  return i;
}

/**
 * 跳到下一个/上一个。
 * @param {boolean} [backward=false]
 * @param {{active?:number, matches?:number, text?:string, matchCase?:boolean}} [ctx]
 *   编辑态必需的 findState 快照（store 传入；引擎不反向依赖 store）。查看态忽略。
 * @returns {number} 新的 0-based 序号；无命中返回 -1
 */
export function jump(backward = false, ctx = null) {
  if (inEditMode()) return editJump(backward, ctx || {});
  if (!marks.length) return -1;
  return setActive(activeIndex + (backward ? -1 : 1));
}

/**
 * 当前状态。
 * @returns {{matches:number, active:number}} active 为 1-based（0 表示无）
 */
export function status() {
  return { matches: marks.length, active: activeIndex + 1 };
}

// 暴露到 window，供 electron/verify/postfind.js 在真实渲染进程里调用取证
if (typeof window !== 'undefined') {
  window.__postFind = { search, jump, clear, setActive, status };
}
