/**
 * findOverlay —— 编辑态输入框的「命中高亮覆盖层」（Beta.316）。
 *
 * ============================ 它解决的问题 ============================
 * 用户原话：「标题文字没被高亮」。
 *
 * 编辑态的查找有两类目标（见 editFind.js 顶部注释）：
 *   ① 标题 / 字段填写框 —— 值为普通字符串
 *   ② 正文 —— ProseMirror 文档，走 decoration 高亮（有真实背景色）
 *
 * ② 有可见高亮，① 却只有**原生选区**。原生选区的毛病有两层：
 *   · 只在**聚焦**的那个控件上可见 —— 同类命中（比如另外 3 处标题）全都看不见；
 *   · 而且 FindBar 为了不让后续打字落到文档里，会在 active 变化后立刻把焦点抢回查找框
 *     （FindBar.vue 的 watch），选区随之变灰/消失 —— 于是用户看到的画面是
 *     「搜出了 5 处，正文里那 2 处亮着，标题那 3 处一点动静都没有」。
 *
 * 为什么不能像查看态那样给文本包 <mark>：`<input>` / `<textarea>` 的 value 是控件
 * 内部状态，不接受子节点。唯一能做高亮的位置是**控件上方另画一层**。
 *
 * ============================ 怎么画 ============================
 * 对每个「有命中的输入框」在其父元素内插入一个绝对定位的 `div.fo-layer`，
 * 尺寸与位置逐像素对齐该控件（getBoundingClientRect 差值），内部按命中的
 * 起止偏移铺 `<span class="fo-hit">`，横向再平移 `-scrollLeft` 让高亮跟着文字走。
 *
 * 对齐的关键是**同一套字体度量**：`mirrorStyle()` 把控件上会影响字形排版的
 * computed style 逐条复制到覆盖层（font / letter-spacing / padding / border / line-height…），
 * 于是同样的字符序列落在同样的像素位置。这是「textarea 高亮镜像」的标准做法。
 *
 * ============================ 边界处理 ============================
 * · 只在**编辑态**（.edit-layout 存在）且查找条打开时存在；收起时 removeAll 清干净。
 * · 控件滚动（长 textarea）→ 监听 scroll 重画该层；容器滚动 → 用 ResizeObserver 兜住尺寸变化。
 * · `pointer-events: none`：覆盖层纯视觉，不挡点击、不挡选择。用户在框里打字依旧正常。
 * · 主题色走 CSS 变量（--accent / --accent-weak），不硬编码颜色，切主题自动跟随。
 * · 不进 tab 序、不带 aria：它对读屏没有新语义（命中信息已在查找条的计数里），
 *   加 aria 反而会被读两遍。
 */

/** 覆盖层类名（CSS 见 base.css 的「页内查找」段） */
const LAYER_CLS = 'fo-layer';
const HIT_CLS = 'fo-hit';
const HIT_ACTIVE_CLS = 'fo-hit-active';

/** 需要从控件复制过来的排版属性（差一条就可能整体错位） */
const MIRROR_PROPS = [
  'boxSizing',
  'width',
  'height',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'fontStretch',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textTransform',
  'textIndent',
  'textAlign',
  // ★ white-space 必须复制，不能由 CSS 写死：
  //   <input> 是单行（normal/pre，长文本横向溢出靠 scrollLeft 走），
  //   <textarea> 是 pre-wrap（长文本自动折行靠 scrollTop 走）。
  //   若统一写成 pre-wrap，input 里的超长标题会在镜像层折成两行，
  //   第二行起的高亮全部错位 —— 这正是只有长标题才出问题的那类 bug。
  'whiteSpace',
  'overflowWrap',
  'wordBreak',
  'textOverflow',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth'
];

/** 当前挂着的层：Map<Element, {layer:HTMLElement, onScroll:Function}> */
const layers = new Map();

function visible(el) {
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}

/** 把控件的排版度量复制到覆盖层，保证字符逐像素落在同一位置 */
function mirrorStyle(layer, el) {
  const cs = getComputedStyle(el);
  for (const p of MIRROR_PROPS) {
    // width/height 只用来占位，真实尺寸由下面的 rect 对齐决定，这里复制会引入滚动条误差
    if (p === 'width' || p === 'height') continue;
    layer.style[p] = cs[p];
  }
  // ★ 单行控件必须强制不折行。
  //   <input> 的 computed white-space 是 `normal`，但它的**实际渲染行为**是
  //   「单行、长文本横向滚动」—— 因为 input 内部有自己的排版实现，不受 CSS
  //   white-space 支配。镜像层是个普通 div，`normal` 会让它在空格处折行，
  //   一旦折行，从第二行起所有高亮位置全部错位。
  //   故这里按控件类型覆盖：input 一律 pre（保留空格 + 不折行），
  //   textarea 用复制来的 pre-wrap 即可。
  if (el.tagName === 'INPUT') {
    layer.style.whiteSpace = 'pre';
    layer.style.overflowWrap = 'normal';
    layer.style.wordBreak = 'normal';
  }
}

/** 定位覆盖层：与控件的外框对齐（差值法，不受祖先定位上下文影响） */
function placeLayer(layer, el) {
  const r = el.getBoundingClientRect();
  // ★ 基准必须取「layer 的父元素」而不是 el.offsetParent：
  //   offsetParent 会跳过 static 祖先、也可能落到 <body>，两次基准不一致，
  //   层的 left/top 就会整体偏移。层是 appendChild 到 el.parentElement 上的，
  //   父元素就是它唯一的定位参照，用它算差值必然自洽。
  //   父元素在 ensureLayer 里已被确保为 position:relative，故这里就是它的 padding box 原点。
  const host = layer.parentElement;
  const hostRect = host ? host.getBoundingClientRect() : { left: 0, top: 0 };
  const hostLeft = hostRect.left || 0;
  const hostTop = hostRect.top || 0;
  // ★ box-sizing 固定 border-box：宽高取自控件外框 rect，若按 content-box 解释，
  //   复制过来的 padding / border 会把这层再撑大一圈，命中块整体右下偏移。
  layer.style.boxSizing = 'border-box';
  // 父元素自身若滚动过（如卡片内有滚动容器），要把它的 scrollLeft/scrollTop 加回来，
  // 否则滚动后高亮会留在原处。absolute 定位的坐标原点是 padding box，不含滚动偏移。
  const sl = host ? host.scrollLeft || 0 : 0;
  const st = host ? host.scrollTop || 0 : 0;
  // ★ 订正父元素的边框：absolute 定位原点是 padding box（边框内侧），
  //   而 getBoundingClientRect().left/top 量的是边框外沿。父元素若有 border，
  //   两者差一个 border-width，不扣掉会让每一处高亮整体偏移几像素。
  const hs = host ? getComputedStyle(host) : null;
  const hbL = hs ? parseFloat(hs.borderLeftWidth) || 0 : 0;
  const hbT = hs ? parseFloat(hs.borderTopWidth) || 0 : 0;
  // 控件相对父元素内容区的偏移 = 视口差值 + 父元素滚动量 - 父元素边框
  layer.style.left = `${r.left - hostLeft + sl - hbL}px`;
  layer.style.top = `${r.top - hostTop + st - hbT}px`;
  layer.style.width = `${r.width}px`;
  layer.style.height = `${r.height}px`;
}

/** 重画某一层的高亮内容（命中位置变化、滚动、尺寸变化都走这里） */
function paint(el, hits, activeStart) {
  const entry = layers.get(el);
  if (!entry) return;
  const { layer } = entry;
  placeLayer(layer, el);
  layer.replaceChildren();

  const value = el.value || '';
  // ★ scrollTop 同步（textarea 纵向滚动时最容易漏的一条）：
  //   控件里文字随 scrollTop 上移，覆盖层若不动，高亮块就会停在原地、与文字错位。
  //   横向同理（长行横向滚动）。两者一起用 translate 完成，不改变布局。
  const scroller = document.createElement('div');
  scroller.className = 'fo-scroller';
  scroller.style.transform = `translate(${-el.scrollLeft}px, ${-el.scrollTop}px)`;

  let last = 0;
  for (const h of hits) {
    if (h.start > last) {
      scroller.appendChild(document.createTextNode(value.slice(last, h.start)));
    }
    const s = document.createElement('span');
    s.className = HIT_CLS + (h.start === activeStart ? ' ' + HIT_ACTIVE_CLS : '');
    s.textContent = value.slice(h.start, h.end);
    scroller.appendChild(s);
    last = h.end;
  }
  if (last < value.length) scroller.appendChild(document.createTextNode(value.slice(last)));
  layer.appendChild(scroller);
}

/** 为某个控件创建覆盖层（已存在则复用） */
function ensureLayer(el) {
  if (layers.has(el)) return layers.get(el);
  const parent = el.parentElement;
  if (!parent) return null;
  // 父元素必须是定位上下文，否则绝对定位的层会飞到别处。
  // ★ 判据不用 `=== 'static'`：jsdom 等环境里 computed position 可能是空串，
  //   真实浏览器里也可能因为 UA 样式差异给出别的默认值。改成「只要不是四种定位值
  //   之一就补 relative」——这是 active 语义，比逐个枚举"谁是默认值"更稳。
  // ★ 改完要记下原值，销毁时还原 —— 这个动的是 Vue 管的真实 DOM，
  //   留着 position:relative 可能影响其它绝对定位子元素（如卡片内的角标/下拉），
  //   也会在热更新或反复开关查找时留下一堆被污染的节点。
  const cs = getComputedStyle(parent);
  const POSITIONED = ['relative', 'absolute', 'fixed', 'sticky'];
  const patchedPos = !POSITIONED.includes((cs.position || '').trim());
  if (patchedPos) parent.style.position = 'relative';

  const layer = document.createElement('div');
  layer.className = LAYER_CLS;
  layer.setAttribute('aria-hidden', 'true');
  mirrorStyle(layer, el);
  // 输入框内部本身有内边距，命中块要落在内容区里 —— padding 已在 mirrorStyle 中复制
  parent.appendChild(layer);

  const onScroll = () => {
    const rec = el.__foHits;
    if (rec) paint(el, rec.hits, rec.activeStart);
  };
  el.addEventListener('scroll', onScroll, { passive: true });
  // 尺寸变化（窗口缩放、主题切换改字号）时重画：ResizeObserver 对 input 也有效
  let ro = null;
  if (typeof window !== 'undefined' && window.ResizeObserver) {
    ro = new window.ResizeObserver(onScroll);
    ro.observe(el);
  }

  const entry = { layer, onScroll, ro, parent, patchedPos };
  layers.set(el, entry);
  return entry;
}

/**
 * 渲染覆盖层。
 * @param {Array<{el: HTMLElement, start: number, end: number}>} hits 全部「输入框类」命中
 * @param {{el?: HTMLElement, start?: number}} [active] 当前激活项（可选）
 */
export function render(hits, active) {
  if (typeof document === 'undefined') return;
  if (!document.querySelector('.edit-layout')) return removeAll();

  const activeEl = active && active.el;
  const activeStart = active ? active.start : -1;

  // 按控件归组
  const byEl = new Map();
  for (const h of hits) {
    if (!h.el || !h.el.isConnected || !visible(h.el)) continue;
    // number / date 等控件不支持选区，且文字本身不是"文档内容"的可读形式，跳过
    if (h.el.tagName === 'INPUT' && !/^(text|search|url|email|tel)$/i.test(h.el.type || 'text')) continue;
    if (!byEl.has(h.el)) byEl.set(h.el, []);
    byEl.get(h.el).push({ start: h.start, end: h.start + (h.len || 0) });
  }

  // 清掉不再需要高亮的控件 —— 含「控件已被 Vue 卸载」的情形：
  // 用户改字段勾选、切大区导致 FieldRenderer 重渲染时，旧 input 已被移除，
  // 但覆盖层还挂在它原来的父元素上，会留下一块悬空高亮。
  for (const el of Array.from(layers.keys())) {
    if (!byEl.has(el) || !el.isConnected) destroyLayer(el);
  }
  // 画新的
  for (const [el, list] of byEl) {
    if (!ensureLayer(el)) continue;
    el.__foHits = { hits: list, activeStart: el === activeEl ? activeStart : -1 };
    paint(el, list, el.__foHits.activeStart);
  }
}

function destroyLayer(el) {
  const entry = layers.get(el);
  if (!entry) return;
  el.removeEventListener('scroll', entry.onScroll);
  if (entry.ro) entry.ro.disconnect();
  if (entry.layer.parentNode) entry.layer.parentNode.removeChild(entry.layer);
  // 还原父元素被我们改掉的 position（只还原自己改过的那种，别人设的 relative 不动）
  if (entry.patchedPos && entry.parent && entry.parent.style) {
    entry.parent.style.position = '';
    // 清空后若 style 属性已无内容，把属性本身也去掉，不留下 `style=""` 这种痕迹
    if (!entry.parent.getAttribute('style')) entry.parent.removeAttribute('style');
  }
  try {
    delete el.__foHits;
  } catch (e) {
    el.__foHits = null;
  }
  layers.delete(el);
}

/** 清空全部覆盖层（关闭查找条、退出编辑态、重新搜索前） */
export function removeAll() {
  for (const el of Array.from(layers.keys())) destroyLayer(el);
}
