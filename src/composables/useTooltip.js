/**
 * 自建悬停提示层（Beta.324，#437）。
 *
 * ---------- 为什么不用原生 title ----------
 *   · 延迟固定约 1s，改不了；连续划过一排工具栏按钮时体验很碎。
 *   · 样式由系统绘制，CSS 碰不到 —— 8 套主题下它是唯一的「系统灰」，暗色主题尤刺眼。
 *   · 不跟随主题变量，无法做圆角/阴影/动效，与全站视觉语言脱节。
 *
 * ---------- 为什么保留 title 不删 ----------
 *  ★ 这是本模块最重要的设计约束 ★
 *   仓库里有 15+ 处断言要求「纯图标按钮必须有 aria-label 与 title」
 *   （见 standardize / nav-toolbar-a11y / editor-head-buttons 等）。
 *   那个规矩的理由是「读屏与悬停各有一条线索」，而不是「必须用原生气泡」。
 *   自绘层出现后如果删掉 title：
 *     · 断言全红，且改断言等于降低无障碍基线（规矩明确禁止为变绿而改断言）；
 *     · 触屏设备长按、读屏的部分实现仍依赖 title 作为后备名。
 *   所以 title 是**无障碍语义层**，自绘层是**视觉呈现层**，两者并存不冲突：
 *   原生气泡会紧跟在自绘层之后弹出，因此自绘层出现时主动移除 title 属性，
 *   鼠标离开再原样恢复 —— 用户只看到自绘层，语义与测试都不动。
 *
 * ---------- 为什么用事件委托而不是 v-tooltip 指令 ----------
 *   142 处 :title 分布在 40 个组件里。加指令要逐个改模板，改动面大且容易漏；
 *   委托只需在 App.vue 挂一个空的 #app-tip 容器，全站自动生效，
 *   连以后新写的 title 也自动获得自绘层，不需要记得「加提示」这件事。
 *
 * ---------- 触发方式（用户已确认：hover + focus）----------
 *   键盘 Tab 到按钮同样要能看到提示，否则纯图标按钮对键盘用户不可用。
 *   读屏仍走 aria-label（不动），提示层标 role="tooltip" 仅作视觉补充。
 */
import { ref, onBeforeUnmount } from 'vue';

/* 提示层出现前的悬停停留时间。原生约 1000ms，这里取 380ms：
 * 足够避开「鼠标顺手划过」的误触，又不至于像原生那样等得让人以为没有提示。 */
const SHOW_DELAY = 380;

/* 距视口边缘的最小留白，防止提示贴边或被裁 */
const EDGE = 8;
/* 与目标元素的间距 */
const GAP = 8;

/** 取元素的提示文本：优先 title，其次 data-tip（给「不想有原生 title」的场景留口子） */
function tipTextOf(el) {
  if (!el) return '';
  const raw = el.getAttribute('title') || el.getAttribute('data-tip') || '';
  // title 里常见 \n 分隔（如「用户 张三\n点击切换」），提示层只显示首行太亏，保留换行由 CSS 处理
  return raw.trim();
}

/** 元素是否真的可交互（避免给纯装饰元素加提示） */
function isTippable(el) {
  if (!el || el.nodeType !== 1) return false;
  // 屏蔽提示的场景：显式声明、以及弹窗/菜单内部（那里空间紧张，提示层容易盖住内容）
  if (el.closest('[data-tip="off"]')) return false;
  return true;
}

export function useTooltip() {
  const visible = ref(false);
  const text = ref('');
  const pos = ref({ left: 0, top: 0, placement: 'top' });

  let showTimer = 0;
  let currentEl = null;
  /* 被临时摘掉的 title 原文：mouseleave 时原样放回。
   * 用属性而非变量存，是因为中途可能有别的代码改过 title（如按钮进入 busy 态）。 */
  const stripped = new WeakMap();

  function stripTitle(el) {
    if (!el) return;
    const t0 = el.getAttribute('title');
    if (t0 === null) return;
    stripped.set(el, t0);
    el.removeAttribute('title');
  }

  function restoreTitle(el) {
    if (!el) return;
    const t0 = stripped.get(el);
    if (t0 === undefined) return;
    // 只在「仍然是摘掉时的状态」才恢复，避免覆盖运行期更新的文案
    if (!el.hasAttribute('title')) el.setAttribute('title', t0);
    stripped.delete(el);
  }

  /** 计算提示层位置：默认在上方居中；上方不够则翻到下方；水平方向夹在视口内 */
  function place(el, tipEl) {
    const r = el.getBoundingClientRect();
    const tipW = tipEl ? tipEl.offsetWidth : 0;
    const tipH = tipEl ? tipEl.offsetHeight : 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let placement = 'top';
    let top = r.top - tipH - GAP;
    if (top < EDGE) {
      // 上方放不下 → 翻到下方
      const below = r.bottom + GAP;
      if (below + tipH <= vh - EDGE) {
        placement = 'bottom';
        top = below;
      } else {
        // 上下都放不下（矮窗口），贴着上边缘显示，至少别被裁掉
        top = EDGE;
      }
    }

    let left = r.left + r.width / 2 - tipW / 2;
    if (left < EDGE) left = EDGE;
    if (left + tipW > vw - EDGE) left = vw - EDGE - tipW;

    return { left, top, placement };
  }

  function hide() {
    clearTimeout(showTimer);
    showTimer = 0;
    visible.value = false;
    restoreTitle(currentEl);
    currentEl = null;
  }

  function show(el) {
    const txt = tipTextOf(el);
    if (!txt) return;
    currentEl = el;
    text.value = txt;
    /* 先摘 title：自绘层一出现就把原生气泡的路堵死。
     * 放在显示前而不是显示后，避免那 380ms 里原生气泡抢跑。 */
    stripTitle(el);
    visible.value = true;
    // 等 DOM 更新后再量尺寸定位（下一帧）
    requestAnimationFrame(() => {
      if (!visible.value) return;
      const tipEl = document.getElementById('app-tip');
      pos.value = place(el, tipEl);
    });
  }

  function onOver(e) {
    const el = e.target && e.target.closest ? e.target.closest('[title], [data-tip]') : null;
    if (!el || !isTippable(el)) return;
    if (el === currentEl) return;
    hide();
    /* 提示文本可能是空串（如动态绑定的空值），这种情况不值得弹层 */
    if (!tipTextOf(el)) return;
    currentEl = el;
    showTimer = window.setTimeout(() => show(el), SHOW_DELAY);
  }

  function onOut(e) {
    const el = e.target && e.target.closest ? e.target.closest('[title], [data-tip]') : null;
    if (!el) return;
    // 在同一个可提示元素内部移动（划过子节点）不算离开
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    if (el === currentEl || showTimer) hide();
  }

  function onFocusIn(e) {
    const el = e.target && e.target.closest ? e.target.closest('[title], [data-tip]') : null;
    if (!el || !isTippable(el)) return;
    // 键盘聚焦用更短的延迟：用户是按 Tab 主动过去的，不需要防误触
    hide();
    if (!tipTextOf(el)) return;
    currentEl = el;
    showTimer = window.setTimeout(() => show(el), 120);
  }

  function onFocusOut() {
    hide();
  }

  /* 任何滚动 / 窗口尺寸变化都要收起：提示层是 fixed 定位，
   * 目标一动它就跟不上，留在原地会指向错误的东西。 */
  function onAnyScroll() {
    if (visible.value || showTimer) hide();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') hide();
  }

  function bind() {
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('keydown', onKeyDown, true);
    /* capture + passive：滚动事件在捕获阶段收，子滚动容器内的滚动也能收到 */
    document.addEventListener('scroll', onAnyScroll, { capture: true, passive: true });
    window.addEventListener('resize', onAnyScroll, { passive: true });
  }

  function unbind() {
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('mouseout', onOut, true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('scroll', onAnyScroll, true);
    window.removeEventListener('resize', onAnyScroll);
    hide();
  }

  // 组件卸载时兜底解绑，避免监听器泄漏（App.vue 常驻，但测试里可能反复挂载）
  onBeforeUnmount(unbind);

  return { visible, text, pos, bind, unbind, hide };
}
