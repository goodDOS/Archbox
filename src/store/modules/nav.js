import { store } from './state';
import { guardLeave } from './guard';
import { findClose, findState } from './find';
import { clear as clearFindMarks } from '../../utils/postFind';

/* ───────── 导航历史栈（浏览器式 前进/后退） ───────── */
/* 页面名 → i18n key（Beta.270：原先直接存中文字面量，切英文后工具栏提示仍是中文）。
 * 存 key 而不是存译文：语言可在设置页随时切换，存译文会让已入栈的历史步定格在旧语言；
 * 渲染处（NavToolbar）调 t() 才能跟着变。大区/文档详情侧栏没有对应项，用 shell.navRegion /
 * shell.navPost；其余复用侧栏同名键，保证「侧栏叫什么、后退提示就叫什么」。 */
const PAGE_LABELS = {
  home: 'shell.navHome',
  posts: 'shell.navPosts',
  post: 'shell.navPost',
  region: 'shell.navRegion',
  taxonomy: 'shell.navTaxonomy',
  search: 'shell.navSearch',
  settings: 'shell.navSettings',
  about: 'shell.navAbout',
  guide: 'guide.title',
  lanshare: 'shell.navLanShare',
  trash: 'shell.navTrash'
};
const MAX_HISTORY = 100;
const _history = [];
let _cursor = -1;

function _shallowEqualParams(a, b) {
  if (a === b) return true;
  const ka = Object.keys(a || {});
  const kb = Object.keys(b || {});
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

/**
 * ★★★ 页面切换时的查找状态清理（Beta.179 引入，Beta.184 适配 postFind） ★★★
 *
 * 【为什么必须做（用户反馈「其它页面也能唤出搜索」）】
 * 旧方案（主进程 findInPage + 注入 <style> 范围排除）切页时不关闭查找条，且注入的
 * <style> 挂在 <head> 不随 Vue 切换卸载 → 切到别的页面侧栏仍被排除。
 * Beta.184 已迁移到渲染端 postFind 引擎（只在 .post-main 内高亮），主进程不再参与查找，
 * 但「切页要结束上一个查找会话」这一点仍然成立。
 *
 * 【清理策略】
 * ① 查找条开着 → findClose()：复位查找状态 + 调 postFind.clear() 撤掉 .post-main 内的
 *    <mark> 高亮。语义最自然：换了页面，旧会话就该结束（否则计数停在旧页的 n/m，
 *    用户看到「1/63」却在新页面上，更困惑）。
 * ② 查找条没开、但仍有残留 <mark>（异常路径）→ 直接调 postFind.clear() 兜底（幂等）。
 *
 * 注意：本函数可能较早被调用，故用 try 包住，任何异常都不影响导航本身。
 *
 * ───────── 查找「进入/退出」三条路径（Beta.183 补，仍有效） ─────────
 * 本函数只负责【退出】的【导航路径】。完整三条：
 *   ① 导航路径 │ goto()/前进后退/点卡片   │ 本函数（清上一个会话）
 *   ② 按键路径 │ Ctrl+F                  │ src/App.vue onFindKey（非文章页白名单拦截）
 *   ③ 点击路径 │ 页头「页内查找」按钮     │ PostView.vue 按钮（仅查看模式渲染）
 *   · 本函数只在 _applyEntry（页面真换了）时触发；当前页按 Ctrl+F/点按钮不经过导航栈，
 *     故 ②③ 分别补在 App.vue / PostView。删 ② 则非文章页能唤出搜索；删本函数则切页后查找条残留。
 *   · 不要因「都碰查找」就误删其一 —— 这正是 Beta.183 补的那一刀。
 */
function _clearFindOnNavigate() {
  try {
    if (findState.open) findClose();
    else clearFindMarks(); // 兜底清文章内查找高亮（postFind 幂等 clear）
  } catch (e) {
    /* 导航不应因查找清理失败而中断 */
  }
}

/**
 * ★★★ 切页时把主滚动容器归零（Beta.223）★★★
 *
 * 【用户反馈】「关于也划到中间，点击软件说明也定位到了中间，而不是从头开始」
 *
 * 【根因】主滚动容器是 App.vue 里的 `main.main`（单页内所有页面共用同一个滚动元素），
 *   切页只换 `<main>` 里的组件、**不重置该容器的 scrollTop** ——
 *   于是在 A 页滚到一半再切到 B 页，B 页直接停在同样的滚动位置。
 *   页越短越明显：长说明页滚下去后进「关于」，会觉得"关于页被划到了中间"。
 *
 * 【为什么之前没暴露】旧版说明页较短、且用户很少在长页滚动后切页；
 *   新说明页变长后，这个一直存在的缺陷被放大了。
 *
 * 【不在 App.vue 的 goto 里修，而放在这里】
 *   本函数是**所有**导航的统一出口 —— goto / goBack / goForward 三处都经过它。
 *   放在 App.vue 的滚动监听里只能覆盖其一，且会与「回到顶部」按钮的 showTop 状态打架。
 *   写在这里，前进后退也一并归零（浏览器语义：换页回到页首，本来就该如此）。
 *
 * 【为什么用 instant 而不是 smooth】
 *   这次是「换了一页」，不是「在同一页里回到顶部」。用平滑滚动会看到新页面
 *   先渲染出来、再当着用户的面自己滚上去 —— 像页面在抽搐。瞬时归零才符合换页预期。
 *   （同一页内的「回到顶部」按钮仍保留 smooth，那是另一个语义，不要动 App.vue 那边。）
 *
 * 【为什么用 rAF 而不是直接赋值】
 *   store.page 刚被改，Vue 尚未 patch 出新页面；此刻容器里还是旧页面的 DOM，
 *   高度也是旧的。直接赋值可能被随后的 patch 覆盖或与旧高度计算打架。
 *   留一帧等新内容挂载后再归零，最稳。
 *
 * 注意：容器选择器 '.main' 与 App.vue 的 `<main class="main" ref="mainRef">` 对应。
 *   用 querySelector 而非 ref —— nav.js 属于 store 层，拿不到组件的 ref。
 *   若将来改类名，此处与 App.vue 需同步（standardize 有用例守这条契约）。
 */
function _resetScroll() {
  try {
    const el = typeof document !== 'undefined' && document.querySelector('.main');
    if (!el) return;
    const reset = () => {
      el.scrollTop = 0;
    };
    reset(); // 先立即归零：短页面无刷新，直接生效
    if (typeof requestAnimationFrame === 'function') {
      // 再留一帧兜底：长页面 patch 后有新的内容高度，可能把 scrollTop 带偏
      requestAnimationFrame(reset);
    }
  } catch (e) {
    /* 滚动归零失败不应中断导航 */
  }
}

function _applyEntry(entry) {
  _clearFindOnNavigate();
  store.page = entry.page;
  store.params = { ...entry.params };
  _resetScroll();
}

function _updateNav() {
  const prev = _cursor > 0 ? _history[_cursor - 1] : null;
  const next = _cursor >= 0 && _cursor < _history.length - 1 ? _history[_cursor + 1] : null;
  store.nav = {
    canBack: !!prev,
    canForward: !!next,
    backKey: prev ? PAGE_LABELS[prev.page] || '' : '',
    forwardKey: next ? PAGE_LABELS[next.page] || '' : ''
  };
}

export async function goto(page, params = {}) {
  // 与当前项一致：不入栈、也不重写 store 引用
  const cur = _cursor >= 0 ? _history[_cursor] : null;
  if (cur && cur.page === page && _shallowEqualParams(cur.params, params)) return;
  // 离开前守卫：若当前页面有未保存修改，先询问；用户取消则中止跳转
  if (!(await guardLeave())) return false;
  // 截断 forward（浏览器式语义）
  _history.length = _cursor + 1;
  _history.push({ page, params: { ...params } });
  if (_history.length > MAX_HISTORY) _history.shift();
  else _cursor++;
  _cursor = _history.length - 1;
  _applyEntry(_history[_cursor]);
  _updateNav();
}

export async function goBack() {
  if (_cursor <= 0) return false;
  // 离开前守卫：用户取消则不前进
  if (!(await guardLeave())) return false;
  _cursor--;
  _applyEntry(_history[_cursor]);
  _updateNav();
  return true;
}

export async function goForward() {
  if (_cursor < 0 || _cursor >= _history.length - 1) return false;
  if (!(await guardLeave())) return false;
  _cursor++;
  _applyEntry(_history[_cursor]);
  _updateNav();
  return true;
}

/** 安装 Alt+←/Alt+→ 快捷键（前后步），由标题栏调用一次即可 */
export function installNavShortcuts() {
  if (typeof window === 'undefined') return () => {};
  const onKey = e => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goBack();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goForward();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
