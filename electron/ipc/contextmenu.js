'use strict';
/**
 * 右键菜单（Beta.169 需求 3）：非按钮文字与图片可选择、可右键复制。
 *
 * ---------- 为什么必须自己建菜单 ----------
 * Chromium 在浏览器里有自带的右键菜单，但 Electron 的 BrowserWindow **默认没有**
 * （那是 Chrome 的 UI，不是渲染引擎的能力）——不建菜单的话右键点下去什么都不发生，
 * 用户能选中文字却复制不了，需求 3 只做了一半。
 *
 * ---------- 为什么是主进程弹菜单、而不是渲染层自绘 ----------
 * 渲染层自绘意味着要自己实现：边缘吸附、滚动、键盘导航、失焦关闭、多屏定位……
 * 且和系统其它应用的右键观感不一致。Electron 的 Menu.popup() 直接复用系统原生菜单，
 * 零维护成本、观感正确。这也是本项目第一次用 Menu.popup（此前只有托盘 setContextMenu）。
 *
 * ---------- 范围演变：从「编辑区专用」到「全站覆盖」 ----------
 * 原生菜单的 `role: 'cut' / 'copy' / 'paste' / 'selectAll'` 由**系统**绘制：
 * label 恒为系统语言（简体中文 Windows 上也常显示英文）、且跟随系统深色皮肤，
 * 与应用主题割裂 —— 主进程 i18n 只够得着自定义 label 的项，够不着 role 项。
 * 前一步先让**富文本编辑区**（.editor-area）改走渲染层自建中文面板；
 * 随后把范围扩到全站：查看态正文、图片、日志、表格等一律自绘
 * （src/components/ContextMenu.vue + src/composables/useContextMenu.js）。
 *
 * ★ 本文件现在还服务谁 ★
 *   只剩 **<input> / <textarea> 原生输入框**。这不是没做完，是刻意保留：
 *   原生输入框的撤销栈在浏览器内部，JS 读不到也写不进 —— 自绘菜单若用「直接改
 *   value」实现粘贴，那次粘贴就不进撤销栈，用户按 Ctrl+Z 撤不回来，而编辑器里的
 *   粘贴是可撤的。两处行为不一致，比标签是英文更糟。详见 useContextMenu.js 文件头。
 *   故这些区域的右键仍由下面的 buildTextTemplate 生成原生菜单。
 *
 * 剪贴板与另存为仍留在主进程（clipboard:writeText / clipboard:read /
 * clipboard:writeImage / image:saveAs）：沙盒 + file:// 下渲染层 navigator.clipboard
 * 受权限模型约束，主进程侧不受约束。
 *
 * ---------- 与 Beta.169 需求 1（Ctrl+F）的关系 ----------
 * 两者都挂在 webContents 上，但一个是查找、一个是菜单，互不干扰；
 * 自绘面板在渲染层直接用事件上下文，只有输入框这条路径才上报 menu:context。
 *
 * ---------- 关于 clipboard 模块 ----------
 * Electron 沙盒下（sandbox: true + file:// 协议）渲染层 navigator.clipboard 可能被拒
 * （项目里 SharePanel.vue 的 copyToken 就吃过这个亏，注释记着「Access is denied for
 * this document」）。主进程 clipboard 模块不走权限模型，稳。故本文件所有复制一律走它。
 *
 * ---------- 关于运行日志（Beta.170 需求 4）----------
 * **复制类动作的成功路径一律不写运行日志。**
 * 复制是高频、瞬时、低信息量的操作：用户连点几下右键复制，就会往日志里压进同样
 * 条数的「全都成功」行，把保存/删除/导入这些真正有价值的记录挤下去。
 * 所以本文件里 clip 相关的成功分支都没有 getLog().info。
 *
 * 但以下三类**必须保留**，它们不是"复制的成功噪声"：
 *   · 失败路径的 warn/error —— 复制失败用户可感知（"点了没粘出来"），不留痕无法排查；
 *   · 「图片另存为…」的 info —— 那是**落盘动作**（写用户磁盘），属于业务流程变更，
 *     与"把内容放进剪贴板"这种不改变任何持久化状态的操作不是一回事；
 *   · `[右键菜单] 弹出` 那条 info —— 原生菜单渲染在系统层，CDP 在渲染进程里看不到它，
 *     这条日志是自动化验证**唯一的可观测信号**（见下方 popup 处注释）。
 */
const path = require('path');
const state = require('../state');
const { compactStamp, compactDate } = require('../services/timefmt');
const { saveFile } = require('../services/dialog');
const i18n = require('../i18n');
const { handle, getLog } = require('./shared');

/* ---------- electron 模块的懒加载 ----------
 * ★ 为什么不在文件顶部 require('electron') ★
 *   本文件导出 buildTextTemplate / buildImageTemplate / extOf / norm / clip 这几个
 *   **纯函数**供验证脚本直接断言菜单结构（不需要起 Electron）。但 Node 直接 require
 *   本文件时，顶层 require('electron') 会拿到一个字符串（electron 包的 index.js 导出
 *   的是可执行文件路径，不是 API 对象），`Menu` 等全部 undefined —— 只是不解构调用
 *   不会报错，一旦有人不小心在顶层解构出东西用，错误会非常难定位。
 *   故统一收进 el() 按需取，纯函数路径完全不需要 electron。
 */
function el() {
  return require('electron');
}

/* ---------- 取当前窗口的 webContents（与 ipc/find.js 同款防护） ---------- */
function wc() {
  const w = state.win;
  if (!w || w.isDestroyed()) return null;
  const c = w.webContents;
  return c && !c.isDestroyed() ? c : null;
}

/** 选中文本去空白：全空白视为"没选中" */
function norm(s) {
  return String(s == null ? '' : s)
    .replace(/\s+/g, ' ')
    .trim();
}

/** 文本截断（菜单项里放整篇正文会把菜单撑爆） */
function clip(s, n) {
  const t = norm(s);
  return t.length > n ? t.slice(0, n) + '…' : t;
}

/**
 * 构造文本类菜单模板（纯函数，便于单测断言结构）。
 *
 * @param {object} p    渲染层上报的上下文
 * @param {function} on 动作回调集合 { copy, paste }
 * @returns {Array} Menu.buildFromTemplate 用的模板
 */
function buildTextTemplate(p, on) {
  // ★ 这里必须把 null/undefined 归一成 {}。
  //   本文件的调用方是渲染层，p 完全不可信（ipcMain 收到 JSON.parse 的裸对象，
  //   渲染层崩溃/被篡改/传 null 都会走到这）。原版本直接读 p.selectionText，
  //   传 null 就抛 TypeError —— 而异常会冒到 ipcMain.handle 之外变成"菜单没弹、
  //   日志里一条未捕获错误"，用户看到的是"右键没反应"（验证脚本 T9 抓到的真缺陷）。
  p = p || {};
  const sel = norm(p.selectionText);
  const editable = !!p.editable;
  const hasSel = !!sel;
  const items = [];

  if (hasSel) {
    // ★ 这里**只保留一项**复制（Beta.170 修复需求 1）。
    //
    //   原实现额外压了一项 `{ role: 'copy' }`（系统复制，带富文本格式），意图是
    //   「与上面那项互补：一个纯文本、一个富文本」。但实测下来这是个坏设计：
    //     · 两项的 label 一个是「复制「xxx…」」一个是「复制」，用户看不出区别，
    //       反馈原话就是「右键复制菜单多了个 copy 按钮」；
    //     · 想复制纯文本的人点到下面那项会带上格式，想复制格式的人点到上面
    //       那项会丢格式 —— 两个选项把一次决策变成了猜谜；
    //     · 实际需求（原型）是「非按钮文字及媒体文件应当可选择并右键复制」，
    //       要的是**一个确定的复制动作**，不是让人选复制方式。
    //
    //   故只留带内容预览的这一项 —— 它走主进程 clipboard.writeText（纯文本，
    //   见文件头对沙盒下 navigator.clipboard 被拒的说明），行为唯一且可预期。
    //
    //   注意：下面 editable 分支里的 `{ role: 'copy', enabled: false }` 是另一回事
    //   ——那是「可编辑区但没选中」时的禁用占位（配合 cut/paste/selectAll 成组出现），
    //   不是冗余项，不要一起删掉。
    items.push({
      // 把选中内容截断前缀拼进 label：用户能一眼确认"要复制的就是这段"，
      // 尤其在右键点偏、选区不是自己想要的那段时（比只写"复制"有用得多）。
      // 文案随界面语言（i18n 顶层零 electron 依赖，故本纯函数可在纯 Node 下测）
      label: i18n.t('menu.copySel', { text: clip(sel, 24) }),
      click: () => on.copy(sel)
    });
  }

  if (editable) {
    if (items.length) items.push({ type: 'separator' });
    items.push({ role: 'cut', enabled: hasSel });
    if (!hasSel) items.push({ role: 'copy', enabled: false });
    items.push({ role: 'paste' });
    items.push({ role: 'selectAll' });
  }

  if (!items.length) {
    // 既没选中、又不是可编辑区：给一条明确的禁用项，而不是弹空菜单。
    // （空菜单在 Windows 上表现为"右键毫无反应"，用户会以为是故障。）
    items.push({ label: i18n.t('menu.noCopy'), enabled: false });
  }

  return items;
}

/** 构造图片类菜单模板 */
function buildImageTemplate(p, on) {
  p = p || {};
  return [
    {
      label: i18n.t('menu.copyImage'),
      click: () => on.copyImage(p.src)
    },
    {
      label: i18n.t('menu.saveImage'),
      click: () => on.saveImage(p.src)
    }
  ];
}

/* ---------- 图片落盘（base64 data: URI → 文件） ---------- */

/**
 * 本项目的图片一律是 base64 内联 data: URI（v3 起不再有 attachments 分储），
 * 所以"另存为"必须自己解码落盘，不能像普通 URL 那样交给下载管理器。
 *
 * @returns {string|null} 写出的文件绝对路径；无法处理时返回 null
 */
function writeDataUriToFile(dataUri, filePath) {
  const fs = require('fs');
  const m = String(dataUri || '').match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/);
  if (!m) return null;
  const [, , isB64, payload] = m;
  const buf = isB64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8');
  fs.writeFileSync(filePath, buf);
  return filePath;
}

/** 从 data: URI 的 mime 推扩展名 */
function extOf(dataUri) {
  const m = String(dataUri || '').match(/^data:image\/([a-z0-9.+-]+)/i);
  const t = (m && m[1] ? m[1] : 'png').toLowerCase();
  return t === 'jpeg' ? 'jpg' : t;
}

/* ---------- 注册 ---------- */

function registerContextMenu() {
  /**
   * 渲染层在 contextmenu 事件里把上下文报上来，主进程据此弹原生菜单。
   *
   * 参数（全部来自渲染层，**一律不可信**，故逐项做类型与长度收敛）：
   *   kind          'text' | 'image'
   *   selectionText 选中文本（text 类用）
   *   editable      是否在可编辑区（input/textarea/contenteditable）
   *   src           图片的 data: URI（image 类用）
   *   x, y          渲染层坐标（仅调试日志用；菜单定位由 Menu.popup 自己处理）
   *
   * ★ 为什么用 noLockGuard ★
   *   菜单要能在【数据库未解锁】时也用（解锁页的说明文字、错误提示也需要复制）。
   *   本通道本身不读写数据库，也不记审计，放行是安全的。
   */
  handle(
    'menu:context',
    async p => {
      const c = wc();
      if (!c) return false;

      const q = p || {};
      // ★ 长度夹逼：selectionText 由渲染层提供，可能是一整篇长文。菜单 label 只用前 24 字，
      //   但规范化过程（norm 的 \s+ 全局替换）在超长输入上是 O(n)。这里先夹到 2000 字符，
      //   既不损失 label 信息，也杜绝渲染层塞 20MB 文本把主进程卡住。
      //   大数组/长字符串经 IPC 本就有成本，收口在入口比在深处好定位。
      q.selectionText = String(q.selectionText == null ? '' : q.selectionText).slice(0, 2000);
      const kind = q.kind === 'image' ? 'image' : 'text';

      const on = {
        copy(text) {
          el().clipboard.writeText(String(text == null ? '' : text));
        },
        copyImage(src) {
          const { nativeImage } = el();
          try {
            const img = nativeImage.createFromDataURL(String(src || ''));
            if (!img || img.isEmpty()) throw new Error(i18n.errKey('menu.errImageBroken'));
            el().clipboard.writeImage(img);
            // ★ 成功路径**不写运行日志**（Beta.170 需求 4）。
            //
            //   复制是高频、瞬时、低信息量的动作：用户可能连点十几下右键复制，
            //   每一下都往运行日志里压一条「[操作] 复制图片完成」——
            //   日志被这种"全都成功、什么都没发生"的行淹没，真正有价值的
            //   保存/删除/导入记录反而要翻很久才找得到。
            //
            //   ★ 失败路径的日志**保留**（见下面 catch）：
            //     复制失败是用户可感知的异常（"点了复制但没粘出来东西"），
            //     且不记的话现场没有任何线索，属于必须留痕的故障排查信息。
            //     即：本改动只去掉"成功噪声"，不去掉"失败信号"。
            return true;
          } catch (e) {
            getLog().warn('复制图片失败: ' + (e && e.message));
            return false;
          }
        },
        saveImage(src) {
          // 异步保存：saveFile 返回 Promise，await 会阻塞本 handler 的返回，
          // 但菜单已经弹出了，popup 的 resolve 与这里无关 —— 顺序上是安全的。
          return saveFile({
            title: i18n.t('menu.saveImageTitle'),
            defaultPath: i18n.t('menu.imgFileName', { date: compactStamp() }) + '.' + extOf(src),
            filters: [{ name: i18n.t('menu.imgFilter'), extensions: [extOf(src), 'png', 'jpg'] }]
          })
            .then(filePath => {
              if (!filePath) return false;
              try {
                writeDataUriToFile(src, filePath);
                getLog().info(`[操作] 图片已另存为 → ${path.basename(filePath)}`);
                return true;
              } catch (e) {
                getLog().error('图片另存为失败: ' + (e && e.message), e);
                return false;
              }
            })
            .catch(e => {
              getLog().warn('图片另存为弹窗失败: ' + (e && e.message));
              return false;
            });
        }
      };

      const template = kind === 'image' ? buildImageTemplate(q, on) : buildTextTemplate(q, on);

      const menu = el().Menu.buildFromTemplate(template);

      /**
       * ★ popup() 的行为与生命周期（决定了本 handler 的返回时机）★
       *  - 不传 callback：popup 立刻返回，菜单在系统层异步展示，用户选择后触发对应 click。
       *    这正是我们要的 —— handler 应当马上 resolve，不能卡住 IPC。
       *  - 传 callback：等菜单关闭才回调，会让 ipcRenderer.invoke 一直挂在 pending。
       *  - ★ 关键约束：菜单展开期间，本函数里的 menu 变量必须在 JS 侧保持可达。
       *    若在这里 `return` 后 menu 被回收，部分平台（Linux/GTK）会立刻关掉菜单 ——
       *    表现为"右键一闪就没了"。故挂到 state 上延长生命周期，由下一次弹出覆盖。
       */
      state._ctxMenu = menu;
      menu.once('menu-will-close', () => {
        // 关闭后再延迟一帧释放，避免"菜单刚关、GC 就回收"导致的边缘情况
        setTimeout(() => {
          if (state._ctxMenu === menu) state._ctxMenu = null;
        }, 0);
      });

      // 每次弹出记一条：既便于用户排查"右键没反应"，也是自动化验证唯一的可观测信号
      // （原生菜单渲染在系统层，CDP 在渲染进程里看不到它）。
      getLog().info(
        `[右键菜单] ${kind === 'image' ? '图片' : '文本'} · 项数 ${template.length} · ` +
          `选中 ${norm(q.selectionText).length} 字 · 可编辑 ${!!q.editable}`
      );

      // window 参数：不传时 Electron 用当前聚焦窗口；显式传更稳（多窗口/失焦场景）
      menu.popup({ window: state.win });

      return { kind, count: template.length };
    },
    { noLockGuard: true }
  );

  /**
   * 复制任意文本（供渲染层"复制"按钮复用，绕开沙盒下 navigator.clipboard 的权限问题）。
   * 返回 true/false 表示是否写成功，前端据此提示。
   */
  handle(
    'clipboard:writeText',
    async p => {
      const text = String((p && p.text) == null ? '' : p && p.text);
      if (!text) return false;
      el().clipboard.writeText(text);
      return true;
    },
    { noLockGuard: true }
  );

  /**
   * 写入图片到剪贴板（Beta.325，自绘右键菜单的「复制图片」）。
   *
   * 【为什么渲染层自绘菜单也需要它】Beta.325 起编辑区右键改由渲染层自建中文面板承接
   * （原生 Menu.popup 的 role 项由系统绘制，label 恒为系统语言且跟随系统深色皮肤，
   * 主进程 i18n 够不着）。但剪贴板写入仍必须留在主进程 —— 沙盒 + file:// 下
   * 渲染层 navigator.clipboard 受权限模型约束（见文件头说明），主进程侧不受约束。
   *
   * 【成功不写日志】同 copy 口径：高频瞬时低信息量动作，只留失败信号。
   */
  handle(
    'clipboard:writeImage',
    async p => {
      const { nativeImage } = el();
      try {
        const img = nativeImage.createFromDataURL(String((p && p.src) || ''));
        if (!img || img.isEmpty()) throw new Error(i18n.errKey('menu.errImageBroken'));
        el().clipboard.writeImage(img);
        return true;
      } catch (e) {
        getLog().warn('复制图片失败: ' + (e && e.message));
        return false;
      }
    },
    { noLockGuard: true }
  );

  /**
   * 读取剪贴板（Beta.325，自绘右键菜单的「粘贴」）。
   *
   * 【为什么读也要走主进程】粘贴是渲染层 navigator.clipboard.readText/read 明确受
   * 权限模型约束的场景（file:// 文档焦点态直接拒绝），而右键菜单的「粘贴」必须在
   * 用户点击后立刻拿到内容。主进程 clipboard 模块不走权限模型。
   *
   * 【三种形态一起返回】自绘菜单的粘贴要覆盖原生 paste role 的全部能力，缺一项就是
   * 能力回退：
   *   text  纯文本（输入框 / 从记事本复制的场景）
   *   html  富文本（从网页 / Word 复制，PM 的 insertContent 对 string 按 HTML 解析，
   *          走的 parseHTML 规则与系统粘贴路径一致）
   *   image 图片 data: URI（截图 / 复制的图片，PM 按 image node 插入）
   * 三者按 image > html > text 优先级由调用方消费；全空时调用方提示「剪贴板为空」。
   *
   * 【为什么不能只返回 text】从网页复制的带格式文字贴进编辑器是高频路径，
   * 只给纯文本等于把原生菜单能做的事砍掉，属功能回退 —— 不可接受。
   */
  handle(
    'clipboard:read',
    async () => {
      const cb = el().clipboard;
      const text = cb.readText() || '';
      const html = cb.readHTML() || '';
      let image = '';
      try {
        const img = cb.readImage();
        if (img && !img.isEmpty()) image = img.toDataURL();
      } catch (e) {
        /* 某些平台无图剪贴板时 readImage 返回空图而非抛错；抛错的平台忽略即可 */
      }
      return { text, html, image };
    },
    { noLockGuard: true }
  );

  /** 只读暴露：带 data: URI 的图片"另存为"，供渲染层按钮调用（右键菜单之外的第二入口） */
  handle(
    'image:saveAs',
    async p => {
      const src = String((p && p.src) || '');
      if (!src.startsWith('data:image/')) throw new Error(i18n.errKey('menu.errInlineOnly'));
      const c = wc();
      if (!c) throw new Error(i18n.errKey('menu.errNoWindow'));
      const filePath = await saveFile({
        title: i18n.t('menu.saveImageTitle'),
        defaultPath: i18n.t('menu.imgFileName', { date: compactDate() }) + '.' + extOf(src),
        filters: [{ name: i18n.t('menu.imgFilter'), extensions: [extOf(src), 'png', 'jpg'] }]
      });
      if (!filePath) return null;
      writeDataUriToFile(src, filePath);
      getLog().info(`[操作] 图片已另存为 → ${path.basename(filePath)}`);
      return filePath;
    },
    { noLockGuard: true }
  );
}

module.exports = {
  registerContextMenu,
  // 导出纯函数供验证脚本直接断言模板结构（不需要起 Electron）
  buildTextTemplate,
  buildImageTemplate,
  extOf,
  norm,
  clip
};
