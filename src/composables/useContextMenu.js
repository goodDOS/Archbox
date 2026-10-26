import { reactive } from 'vue';
import { A } from '../api';
import { t } from '../i18n';
import { toastWarn } from '../feedback';

/**
 * 右键菜单（Beta.169 需求 3 → Beta.329 需求 #434 → Beta.330 全站覆盖）。
 *
 * ---------- 全站自绘，只有输入框保留原生 ----------
 * 1. **自绘路径**（渲染层 ContextMenu.vue）：查看态正文、图片、富文本编辑区，
 *    以及所有「无编辑能力」的右键落点。
 * 2. **原生路径**（主进程 Menu.popup）：只剩 `<input>` / `<textarea>` 这类原生输入框。
 *
 * ---------- 为什么输入框是唯一的例外 ----------
 *   输入框的剪切/复制/粘贴/全选在原生菜单里是 `role` 项，由**系统**绘制（label 恒为
 *   系统语言、跟随系统深色皮肤、CSS 碰不到）。看着该一起换成自绘，但换不掉的地方在于：
 *   **原生输入框的撤销栈由浏览器内部维护，JS 读不到也写不进**。
 *   自绘菜单若用「直接改 value」实现粘贴，那次粘贴就不进撤销栈 —— 用户按 Ctrl+Z
 *   撤不回这次粘贴，而编辑器里的粘贴是可撤的，两处行为不一致比标签是英文更糟。
 *   自己造一套撤销栈要处理输入法组合、相邻输入合并、光标/选区恢复、多框焦点切换，
 *   复刻的是浏览器已做了 20 年的东西，属于成本极高、收益极低的工程。
 *   ⇒ 输入框保留原生：那里标签虽是系统的，但 `Ctrl+X/C/V/A` 是肌肉记忆，不影响操作。
 *   （参照：同类工具也只自绘编辑器菜单，输入框一律交给平台。）
 *
 * ---------- 为什么其余区域必须自绘 ----------
 *   那些区域的菜单项是**我们自定义 label** 的（「复制「xxx…」」「图片另存为…」），
 *   混在系统菜单里就成了中英夹杂。自绘后 label 走 t()、配色走主题变量、
 *   动效与全站一致。这块没有编辑动作，零风险。
 *
 * ---------- 剪贴板为什么仍走主进程 ----------
 *   沙盒 + file:// 下渲染层 navigator.clipboard 的读写均受权限模型约束
 *   （SharePanel 的 copyToken 就吃过「Access is denied for this document」的亏）。
 *   故自绘面板的复制/粘贴一律经 IPC 回主进程执行，主进程 clipboard 不走权限模型。
 *
 * ---------- 职责边界 ----------
 *   本文件只做三件事：① 判断右键落在哪条路径；② 构建菜单项；③ 执行动作。
 *   与编辑器（ProseMirror）相关的动作（剪切/粘贴/全选的具体插入与删除）
 *   由编辑页通过 registerEditorCtx 注册，本文件不直接碰编辑器实例。
 */

/** 自绘路径的作用域：富文本编辑区。其余区域按「是否有编辑能力」分流。 */
const EDITOR_SEL = '.editor-area';

/**
 * 判断元素是否为**原生**输入框（自绘管不了的那一类）。
 * 只认 <input> / <textarea>：它们的撤销栈在浏览器内部。
 * contenteditable 不算 —— 富文本编辑区由 Tiptap 接管，走自绘 + editorHandlers。
 */
function isNativeField(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return !el.disabled && !el.readOnly;
  if (tag === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    // checkbox / radio / button 没有文本可粘贴，不值得弹文本菜单
    const textish = ['text', 'search', 'url', 'tel', 'email', 'password', 'number'];
    return textish.includes(type) && !el.disabled && !el.readOnly;
  }
  return false;
}

/** 从事件目标向上找原生输入框祖先 */
function closestField(el) {
  let n = el;
  while (n && n.nodeType === 1) {
    if (isNativeField(n)) return n;
    n = n.parentElement;
  }
  return null;
}

/** 取图片的 data: URI。本项目图片一律 base64 内联，故 src 就是数据本身。 */
function dataUriOf(img) {
  const src = img && img.getAttribute ? img.getAttribute('src') : '';
  return /^data:image\//i.test(src || '') ? src : '';
}

/** 选中文本去空白：全空白视为「没选中」（与主进程 contextmenu.js 的 norm 同口径） */
function norm(s) {
  return String(s == null ? '' : s)
    .replace(/\s+/g, ' ')
    .trim();
}

/** 文本截断（菜单项里放整篇正文会把菜单撑爆；上限与主进程 clip() 一致：24 字） */
function clip(s, n) {
  const text = norm(s);
  return text.length > n ? text.slice(0, n) + '…' : text;
}

/** 当前选区文本（取不到按空处理；selection 可能已被 mousedown 清掉） */
function currentSelection() {
  try {
    const s = window.getSelection();
    return s ? String(s.toString()) : '';
  } catch (err) {
    return '';
  }
}

/* ------------------------------------------------------------------ *
 * 自绘面板状态（模块级单例）
 *
 * 为什么放模块级而不是组件内部：
 *   面板由 App.vue 挂载**唯一实例**（Teleport 到 body），
 *   而「在哪儿右键」的信息来自全局 window 监听（installContextMenu）。
 *   两者在不同组件树里，必须有一处模块级状态把「事件上下文」送到「面板实例」。
 * ------------------------------------------------------------------ */
export const ctxMenuState = reactive({
  open: false,
  x: 0,
  y: 0,
  items: []
});

/** 编辑器动作注册表（由编辑页注册：cut / paste / selectAll）。 */
let editorHandlers = null;

/**
 * 注册编辑器动作（编辑页挂载时调用）。
 * 返回注销函数 —— 编辑页卸载时必须注销，否则菜单会操作已销毁的编辑器实例。
 *
 * @param {{cut:Function, paste:Function, selectAll:Function}} h
 * @returns {function} 注销函数
 */
export function registerEditorCtx(h) {
  editorHandlers = h || null;
  return function unregister() {
    if (editorHandlers === h) editorHandlers = null;
  };
}

/** 关闭自绘面板 */
export function closeCtxMenu() {
  ctxMenuState.open = false;
  ctxMenuState.items = [];
}

/**
 * 执行被点击的菜单项（由 App.vue 的 ContextMenu 面板 @pick 驱动）。
 * 动作闭包随菜单项一起携带，故这里无需再判断是哪一项。
 */
export function ctxPick(item) {
  closeCtxMenu();
  if (!item || typeof item.action !== 'function') return;
  try {
    item.action();
  } catch (err) {
    /* 窗口销毁等，忽略 */
  }
}

/* ------------------------------------------------------------------ *
 * 菜单项构建
 *
 * 三态：图片 / 编辑区文本 / 只读文本。三者共用同一套视觉与键盘模型，
 * 只是项集不同 —— 分开三个小函数，避免一个函数里三层 if 嵌套。
 * ------------------------------------------------------------------ */

/** 图片态：复制图片 + 另存为（另存为仍走系统保存框，不自造文件浏览器） */
function imageItems(src) {
  return [
    {
      key: 'copyImage',
      label: t('ui.ctxCopyImage'),
      action: () => {
        A.clipWriteImage({ src }).catch(() => {});
      }
    },
    {
      key: 'saveImage',
      label: t('ui.ctxSaveImage'),
      action: () => {
        A.imageSaveAs({ src }).catch(() => {});
      }
    }
  ];
}

/**
 * 编辑区文本态。
 *
 * 结构沿用原生菜单的形态（用户已经熟悉）：
 *   有选区：复制「xxx」 + 分隔线 + 剪切 + 粘贴 + 全选
 *   无选区：剪切(禁用) + 复制(禁用) + 粘贴 + 全选
 *
 * 「复制」在无选区时保留为禁用占位，是为了与原生菜单观感一致（那里也是禁用项）；
 * 有选区时只给**一个确定的复制动作**（带内容预览），不并列「复制富文本/复制纯文本」
 * —— 同 Beta.170 对原生菜单的判断：两个选项把一次决策变成了猜谜。
 *
 * @param {{sel:string, imgSrc:string}} ctx
 * @returns {Array} 菜单项
 */
function editorItems(ctx) {
  if (ctx.imgSrc) return imageItems(ctx.imgSrc);

  const items = [];
  const sel = ctx.sel || '';
  const has = !!norm(sel);

  if (has) {
    items.push({
      key: 'copySel',
      label: t('ui.ctxCopySel', { text: clip(sel, 24) }),
      action: () => {
        A.copyText({ text: sel }).catch(() => {});
      }
    });
  }

  if (items.length) items.push({ key: 'sep1', sep: true });

  items.push({
    key: 'cut',
    label: t('ui.ctxCut'),
    disabled: !has,
    action: () => {
      if (editorHandlers && editorHandlers.cut) editorHandlers.cut(sel);
    }
  });
  if (!has) {
    items.push({
      key: 'copy',
      label: t('ui.ctxCopy'),
      disabled: true
    });
  }
  items.push({
    key: 'paste',
    label: t('ui.ctxPaste'),
    action: async () => {
      let clipData = null;
      try {
        clipData = await A.clipRead();
      } catch (err) {
        /* 读不到剪贴板按空处理，下面会提示「剪贴板为空」 */
      }
      const text = (clipData && clipData.text) || '';
      const html = (clipData && clipData.html) || '';
      const image = (clipData && clipData.image) || '';
      if (!text && !html && !image) {
        toastWarn(t('ui.ctxPasteEmpty'));
        return;
      }
      if (editorHandlers && editorHandlers.paste) editorHandlers.paste({ text, html, image });
    }
  });
  items.push({
    key: 'selectAll',
    label: t('ui.ctxSelectAll'),
    action: () => {
      if (editorHandlers && editorHandlers.selectAll) editorHandlers.selectAll();
    }
  });

  return items;
}

/**
 * 只读文本态（查看态正文、日志、表格、指南等一切非编辑区域）。
 *
 * 只有「复制」一项 —— 那里没有编辑能力，给剪切/粘贴/全选是假按钮
 * （原生菜单在这种区域也只给禁用项，实际等于没有）。
 * 没有选中时给一条**禁用项**而不是弹空菜单：空菜单在 Windows 上表现为
 * 「右键毫无反应」，用户会当成故障（Beta.170 踩过）。
 */
function readonlyItems(sel) {
  const text = norm(sel);
  if (!text) {
    return [{ key: 'noSel', label: t('ui.ctxNoSelection'), disabled: true }];
  }
  return [
    {
      key: 'copySel',
      label: t('ui.ctxCopySel', { text: clip(text, 24) }),
      action: () => {
        A.copyText({ text }).catch(() => {});
      }
    }
  ];
}

/**
 * 安装全局 contextmenu 监听。
 *
 * ★ 为什么禁用 Electron 的默认行为 ★
 *   Electron 窗口默认没有右键菜单，但**仍然会派发 contextmenu 事件**；
 *   不 preventDefault 的话，在 contenteditable 里按住 Ctrl 右键等组合场景下，
 *   会残留浏览器默认行为。显式 preventDefault 后由我们完全接管。
 *
 * ★ 为什么用捕获阶段（capture: true）★
 *   某些组件（如弹窗遮罩）在冒泡路径上 stopPropagation，会导致菜单在内层失效。
 *   菜单是全局能力，捕获阶段拿事件最稳，也让"哪里都能右键"这条语义成立。
 *
 * @returns {function} 卸载函数
 */
export function installContextMenu() {
  if (!A.menuContext) return () => {};

  /** 把构建好的项交给面板并打开（先关再开 = 「换位置再弹一次」） */
  function openAt(e, items) {
    ctxMenuState.x = e.clientX || 0;
    ctxMenuState.y = e.clientY || 0;
    ctxMenuState.items = items;
    ctxMenuState.open = true;
  }

  function onCtx(e) {
    const el = e.target;

    /* ---------- 自绘面板自身：直接吞掉 ----------
       本监听是 window 捕获阶段，早于面板元素上的 @contextmenu.prevent 生效，
       若不拦一道，面板上右键会再弹一次原生菜单（两份菜单叠着）。
       面板内的右键无意义（菜单项只有点击才有效），故整段忽略。 */
    if (el && el.closest && el.closest('.ctx-menu')) {
      e.preventDefault();
      return;
    }

    /* ---------- 原生输入框：全部交给系统 ----------
       理由见文件头「为什么输入框是唯一的例外」：撤销栈在浏览器内部，
       自绘一套要么丢撤销、要么得复刻浏览器编辑栈。
       ★ 这里**不** e.preventDefault()，让 Electron 的默认菜单照常弹出。 */
    const field = closestField(el);
    if (field) {
      if (A.menuContext) {
        let sel = currentSelection();
        // 右键常常发生在 mousedown 清掉选区之后，Chromium 在 input 上会先恢复选区
        // 再派发 contextmenu —— 这里按元素自身的选中区间再兜一次。
        if (!sel.trim()) {
          try {
            const a = field.selectionStart;
            const b = field.selectionEnd;
            if (typeof a === 'number' && typeof b === 'number' && b > a) sel = field.value.slice(a, b);
          } catch (err) {
            /* 某些 input 类型无 selectionStart，忽略 */
          }
        }
        try {
          A.menuContext({
            kind: 'text',
            selectionText: sel,
            editable: true,
            anchor: 'native-field'
          });
        } catch (err) {
          /* 窗口销毁等，忽略 */
        }
      }
      return;
    }

    /* ---------- 图片优先 ----------
       右键点在图片上时，无论有没有选中文字都按图片处理
       （用户点在图上，意图几乎总是"要这张图"）。 */
    const src = dataUriOf(el && el.tagName === 'IMG' ? el : null);

    /* ---------- 以下全部自绘 ---------- */
    e.preventDefault();
    closeCtxMenu();

    if (src) {
      openAt(e, imageItems(src));
      return;
    }

    const inEditor = !!(el && el.closest && el.closest(EDITOR_SEL));
    if (inEditor) {
      // 编辑区里的图片优先于选区（同图片优先口径）
      const imgSrc = dataUriOf(el.closest(EDITOR_SEL + ' img'));
      openAt(e, editorItems({ sel: currentSelection(), imgSrc }));
      return;
    }

    openAt(e, readonlyItems(currentSelection()));
  }

  window.addEventListener('contextmenu', onCtx, true);
  return () => window.removeEventListener('contextmenu', onCtx, true);
}
