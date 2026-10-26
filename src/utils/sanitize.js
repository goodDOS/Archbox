import DOMPurify from 'dompurify';
import { t } from '../i18n';
import { normalizeSize, parseSize } from './imageSize';

/**
 * 渲染侧二次净化（纵深防御）：
 * 主进程保存时已用 sanitize-html 白名单清洗，此处展示前再净化一次，
 * 并放行内联图片协议 data:（文章图片已 base64 内联）
 */
const URI_RE = /^(?:(?:https?|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/**
 * style 属性的 CSS 属性白名单（Tiptap 书写工具：颜色/高亮/对齐/字号/图片宽高）。
 * 与主进程 core.js 的 allowedStyles 同口径：两边同源维护，任一层被绕过另一层仍兜底。
 * 值必须命中对应正则，其余 CSS 属性（url()/expression() 等注入向量）一律剥除。
 *
 * ★ Beta.322：图片宽高不再写死正则，改由 utils/imageSize.js 的 normalizeSize 判定 ★
 *   像素与百分比两套单位并存后，要同时夹住「1–100%」与「24–2048px」。
 *   这份判定若在两处各写一遍必然走偏（本次「发布后图片变小」就是这么坏的：
 *   主进程剥掉了 style，渲染层却以为自己放行了）。现在两边调同一个 normalizeSize。
 */
const STYLE_PROPS = {
  'text-align': /^(left|right|center|justify)$/,
  color: /^(?:#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/,
  'background-color': /^(?:#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/,
  'font-size': /^\d{1,3}(px|pt|em|rem|%)$/
};

/** 逐条过滤 style 值：只留白名单 CSS 属性且值合法；全被剥则返回空串（调用方删属性） */
function filterStyleValue(value) {
  const kept = [];
  for (const decl of String(value || '').split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    // 图片宽高走统一判定（像素 + 百分比两套单位并存）
    if (prop === 'width' || prop === 'height') {
      const norm = normalizeSize(val);
      if (norm) kept.push(`${prop}: ${norm}`);
      continue;
    }
    const re = STYLE_PROPS[prop];
    if (re && re.test(val)) kept.push(`${prop}: ${val}`);
  }
  return kept.join('; ');
}

export function safeHtml(html) {
  // style 属性局部过滤 hook：只在本次 sanitize 内存活，用完即摘（DOMPurify.removeHook 按事件名全摘，
  // 本项目无其他同名 hook，成对摘除不影响全局）。原本 style 在 FORBID_ATTR 里一律禁掉，
  // 但 Tiptap 的颜色/对齐/字号工具靠 style 表达，禁掉等于排版保存后展示时静默丢失。
  const styleHook = (node, data) => {
    if (data.attrName !== 'style') return;
    const filtered = filterStyleValue(data.attrValue);
    if (filtered) data.attrValue = filtered;
    else data.keepAttr = false;
  };
  DOMPurify.addHook('uponSanitizeAttribute', styleHook);
  try {
    return DOMPurify.sanitize(html || '', {
      ALLOWED_URI_REGEXP: URI_RE,
      FORBID_ATTR: ['onerror', 'onload', 'onclick'],
      ADD_ATTR: ['target']
    });
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute', styleHook);
  }
}

/**
 * Beta.169 需求 3：「图片可右键复制」的注册器。
 *
 * 需求原文要求「媒体文件应当可选择并右键复制」。右键菜单本身在主进程（原生 Menu.popup），
 * 但有一条链路得在渲染层补：**只读态下的正文图片**。
 *
 * ---------- 为什么必须补这一步 ----------
 * 正文查看用的是 `v-html` + DOMPurify，净化后的 <img> 是**真实 DOM 节点**
 * （不是 canvas、不是背景图），所以右键的 target 就是 IMG 本身，
 * 主进程按 src 取 data: URI 那条路本来是通的。
 *
 * 但有两处会断：
 *   1. DOMPurify 的 FORBID_ATTR 没"禁止"draggable，浏览器默认给 <img> 发出
 *      draggable=true —— 拖图会在 Electron 里起一个原生拖拽会话，拖着费劲、还容易误操作。
 *      base.css 已用 -webkit-user-drag:none 处理，这里再显式落属性，双保险（老内核兜底）。
 *   2. 更实际的：用户**根本不知道**图能右键复制。右键菜单里那一项要主动去发现。
 *      这里给图片打上 draggable=false 与 title 提示，让能力"可见"。
 *
 * ---------- 为什么用 DOM 遍历而不是正则改 HTML 字符串 ----------
 * 正则改 HTML 是本项目踩过的坑（正则会误伤属性值与注释里的同名片段）。
 * 用 detached DOM 解析 → 改属性 → 读 outerHTML，交给浏览器自己的解析器，
 * 不会有"正则匹配到一半"的问题。且容器是 detached 的，图片不会因此发起加载。
 *
 * @param {string} html 已净化的 HTML
 * @returns {string} 图片已可右键复制/可另存的 HTML
 */
export function markSelectableMedia(html) {
  const src = String(html || '');
  // 没图就别付解析成本（列表/首页滚动时这条会被频繁调用）
  if (!/<img[\s>]/i.test(src)) return src;
  try {
    const box = document.createElement('div');
    box.innerHTML = src;
    box.querySelectorAll('img').forEach(img => {
      img.setAttribute('draggable', 'false');
      // ★ Beta.316：给图片打「可点击放大」的可读线索（用户需求 4：点击浮窗显示原尺寸）。
      //   点击行为由 PostView 的图片浮层委托监听实现（正文是 v-html，事件只能挂在容器上）；
      //   这里只负责让能力「看得见」：光标变放大镜由 base.css 的 .post-content img 规则给。
      img.setAttribute('data-img-zoom', '1');
      // 右键菜单是主进程的原生菜单，提示文案必须在这里写明，否则用户无从发现。
      // 文案走 i18n：每次净化时求值，切换语言后新渲染的正文即用新语言。
      if (!img.getAttribute('title')) {
        img.setAttribute('title', t('post.imgTitleTip'));
      }
      // data: URI 之外的远程图片（导入的旧文档包可能残留 http 图）：不接管，避免误判
      if (!/^data:image\//i.test(img.getAttribute('src') || '')) {
        img.removeAttribute('title');
      }
      // 显示宽度：属性与内联 style 双写（属性给旧内容兜底，style 供当前渲染直接生效）。
      // ★ Beta.322：这里原先只「校验」属性、从不写回 style ★
      //   而 base.css 的 .post-content img 只有 max-width:100%，
      //   于是 <img width="25"> 会被浏览器当成 25 *像素* —— 图直接缩成一条，
      //   这正是用户报的「文档发布后，图片变得很小」。
      //   现在把合法值同步进 style，并把非法值从两处都清掉。
      const w = normalizeSize(img.getAttribute('width'));
      if (w) {
        img.setAttribute('width', String(parseSize(w).n));
        const rest = stripSizeDecls(img.style && img.style.cssText);
        img.setAttribute('style', rest ? `${rest}; width: ${w}` : `width: ${w}`);
      } else {
        img.removeAttribute('width');
        const rest = stripSizeDecls(img.style && img.style.cssText);
        if (rest) img.setAttribute('style', rest);
        else img.removeAttribute('style');
      }
    });
    return box.innerHTML;
  } catch (e) {
    // 解析失败不能把正文弄丢 —— 退回原样（图仍能显示，只是少了 title 提示）
    return src;
  }
}

/**
 * 从一串 CSS 文本里摘掉 width / height 声明，其余原样保留。
 * 用于「只改图片尺寸这两项、不碰颜色/对齐等其它内联样式」。
 */
function stripSizeDecls(cssText) {
  return String(cssText || '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => {
      const p = s.slice(0, s.indexOf(':')).trim().toLowerCase();
      return s.indexOf(':') > 0 && p !== 'width' && p !== 'height';
    })
    .join('; ');
}
