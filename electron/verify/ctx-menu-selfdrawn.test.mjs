/**
 * 自建文字右键面板专项回归（Beta.329，对应需求 #434）。
 *
 * 【为什么单独一场】原生 Menu.popup 的 role 项（cut/copy/paste/selectAll）由**系统**绘制：
 *   label 恒为系统语言（用户截图里是英文 Cut/Copy/Paste/Select All），且跟随系统深色皮肤，
 *   与应用主题割裂；主进程 i18n 只够得着自定义 label 的项，够不着 role 项。
 *   故富文本编辑区改由渲染层自绘中文面板。这类回归不报编译错：
 *   · 面板没挂上 → 右键无反应（用户视角「右键坏了」）；
 *   · 剪贴板动作没走主进程 → 沙盒 + file:// 下 navigator.clipboard 被拒，粘贴静默失败；
 *   · 粘贴只给纯文本 → 从网页复制的富文本格式丢失（能力回退，用户不易察觉但很恼人）；
 *   · 面板没注销 → 编辑页销毁后菜单操作已死实例。
 *
 * 覆盖：
 *   [1] ContextMenu.vue：Teleport/Transition/定位复用/主题变量/键盘可达/aria
 *   [2] useContextMenu.js：分流规则（全站自绘 / 输入框原生）、三态菜单项、动作执行、
 *       面板自身右键不重复弹原生
 *   [3] App.vue：唯一实例挂载 + 事件接线
 *   [4] PostView.vue：编辑器动作注册/注销 + 三动作语义
 *   [5] 主进程通道：clipboard:read / clipboard:writeImage 存在且 noLockGuard
 *   [6] preload 暴露
 *   [7] i18n：9 个 key 12 语言齐全 + 繁体逐字转写
 *
 * 【Beta.330 覆盖范围扩大】此前只有富文本编辑区走自绘，其余区域走原生 Menu.popup。
 *   现在除 <input>/<textarea> 外全部自绘（理由见 useContextMenu.js 文件头：
 *   输入框的撤销栈在浏览器内部，自绘粘贴会丢撤销，得不偿失）。
 *   故此处的断言从「编辑区专用」改为「全站分流」，并新增只读态的断言。
 *
 * 运行：node electron/verify/ctx-menu-selfdrawn.test.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { toTw } from './tw-han-map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.log(`  ✗ ${msg}`);
  }
}

const comp = read('src/components/ContextMenu.vue');
const hook = read('src/composables/useContextMenu.js');
const app = read('src/App.vue');
const postView = read('src/pages/PostView.vue');
const ipc = read('electron/ipc/contextmenu.js');
const preload = read('electron/preload.js');

/* 剥掉注释后的可执行片段：负向断言（「不出现 X」）必须在剥注释的文本上测，
   否则注释里字面提到被否定的对象会误判。 */
const strip = s =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const compCode = strip(comp);
const hookCode = strip(hook);
const appCode = strip(app);
const pvCode = strip(postView);

/* ---------------- [1] ContextMenu.vue ---------------- */
console.log('\n[1] ContextMenu.vue 组件本体');
ok(/<Teleport\s+to="body">/.test(comp), '面板 Teleport 到 body（避开父级 overflow/transform 裁剪）');
ok(/<Transition\s+name="ctx">/.test(comp), '用 Transition 承担进出场动画（退场动画不靠手动时序）');
ok(/ctx-enter-active[\s\S]*?ctx-in 0\.14s/.test(comp), '弹入动画 0.14s（与 Dropdown 的 dd-in 同曲线）');
ok(/ctx-leave-active[\s\S]*?ctx-out 0\.1s/.test(comp), '收回动画 0.1s（有退场动画，不是瞬间消失）');
ok(
  comp.includes("import { computeFixedPosition } from '../utils/positionPopup'"),
  '定位复用既有 computeFixedPosition（不另写一份视口翻转算法）'
);
ok(
  /computeFixedPosition\(\s*\{ top: props\.y, bottom: props\.y, left: props\.x, width: 0 \}/.test(compCode),
  '定位锚点取右键坐标（不另算坐标系偏移）'
);
ok(/menuRef\.value\.offsetHeight \|\| estimateHeight\(\)/.test(compCode), '渲染后按实测高度二次校正（翻上方位置精确）');
ok(/zIndex: 'var\(--z-dropdown\)'/.test(compCode), 'z-index 走既有弹层刻度变量');
ok(
  /var\(--surface\)/.test(comp) && /var\(--border-strong\)/.test(comp) && /var\(--shadow-lg\)/.test(comp),
  '配色走主题变量（八套主题通吃）'
);
ok(/\[data-theme='wire'\] \.ctx-menu/.test(comp), 'wire 主题方角特例（举一反三自 Dropdown）');
ok(/role="menu"/.test(comp) && /role="menuitem"/.test(comp), '补齐 menu / menuitem 角色（无障碍）');
ok(/aria-disabled="item\.disabled"/.test(compCode), '禁用项带 aria-disabled');
ok(
  /e\.key === 'ArrowDown'/.test(compCode) && /e\.key === 'ArrowUp'/.test(compCode),
  '键盘上下键可移动高亮（菜单键盘可达）'
);
ok(/e\.key === 'Escape' \|\| e\.key === 'Tab'/.test(compCode), 'Esc / Tab 关闭面板');
ok(/e\.key === 'Enter'/.test(compCode), 'Enter 执行高亮项');
ok(/moveHighlight[\s\S]*?items\[i\]\.disabled/.test(compCode), '键盘移动跳过禁用项与分隔线');
ok(
  /item\.sep[\s\S]*?ctx-sep/.test(compCode) || /v-if="item\.sep" class="ctx-sep"/.test(compCode),
  '分隔线项被渲染（buildEditorItems 会 push sep 项）'
);
ok(/@mousedown\.prevent/.test(comp), '面板 mousedown 阻止默认（不抢编辑器焦点）');
ok(/@contextmenu\.prevent/.test(comp), '面板内右键被拦（不重复弹原生菜单）');
ok(
  !/scoped/.test(comp.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')),
  '样式块非 scoped（Teleport 到 body 后拿不到 scope 属性）'
);

/* ---------------- [2] useContextMenu.js ---------------- */
console.log('\n[2] useContextMenu.js 自绘分支');
ok(/export const ctxMenuState = reactive\(/.test(hookCode), '模块级 reactive 状态（事件上下文 → 面板实例的唯一通道）');
ok(/export function registerEditorCtx\(/.test(hookCode), '导出编辑器动作注册表');
ok(
  /export function ctxPick\(/.test(hookCode) && /export function closeCtxMenu\(/.test(hookCode),
  '导出 pick / close 供 App.vue 接线'
);
ok(/const EDITOR_SEL = '\.editor-area'/.test(hookCode), '编辑区选择器保留（用于区分编辑器动作集）');
ok(/inEditor/.test(hookCode) && /e\.preventDefault\(\);/.test(hookCode), '非输入框区域一律走自绘并阻止默认');
ok(
  /function closestField\(/.test(hookCode) && /const field = closestField\(el\)/.test(hookCode),
  '输入框单独识别（closestField）'
);
ok(
  /if \(field\) \{[\s\S]{0,900}?return;\s*\}/.test(hookCode),
  '输入框命中后提前返回、交给系统（不 preventDefault，保住原生撤销栈）'
);
/* 负向断言必须精确到「输入框分支内部」：
   直接搜 `if (field) { ... e.preventDefault() }` 会跨过分支去匹配后面自绘分支的
   那一句（自绘分支本来就该 preventDefault），必然误报。故只取字段分支的内部片段。 */
const fieldBranch = (() => {
  const i = hookCode.indexOf('const field = closestField(el);');
  if (i < 0) return '';
  // 终点取「输入框分支自己的 return;」，不能用后面的 const src —— 那样会带进
  // 自绘分支的 e.preventDefault()，负向断言必假红。
  const j = hookCode.indexOf('return;', hookCode.indexOf("anchor: 'native-field'", i));
  return j > i ? hookCode.slice(i, j) : hookCode.slice(i, i + 900);
})();
ok(
  fieldBranch.length > 0 && !/e\.preventDefault\(\)/.test(fieldBranch),
  '输入框分支**不**阻止默认（阻止了就等于既没自绘、又没原生菜单）'
);
ok(/function readonlyItems\(/.test(hookCode), '只读文本态有独立构建函数（不与编辑区混在一起）');
ok(/openAt\(e, readonlyItems\(currentSelection\(\)\)\)/.test(hookCode), '非编辑、非图片、非输入框 → 只读态菜单');
ok(/ctxNoSelection/.test(hookCode), '无选中时给禁用提示项（不弹空菜单）');
ok(/closest\('\.ctx-menu'\)/.test(hookCode), '面板自身右键被拦（不与原生菜单叠加）');
ok(
  /editorItems\(\{ sel: currentSelection\(\), imgSrc \}\)/.test(hookCode) && /function editorItems\(/.test(hookCode),
  '编辑区菜单项按「选区 / 图片」两态构建'
);
ok(
  /t\('ui\.ctxCopySel', \{ text: clip\(sel, 24\) \}\)/.test(hookCode),
  '有选区时给唯一确定的复制动作（带内容预览，遵 Beta.170 口径）'
);
ok(/key: 'cut'[\s\S]*?disabled: !has/.test(hookCode), '无选区时「剪切」禁用');
ok(/key: 'copy'[\s\S]*?disabled: true/.test(hookCode), '无选区时保留禁用的「复制」占位（与原生菜单观感一致）');
ok(/key: 'paste'/.test(hookCode) && /key: 'selectAll'/.test(hookCode), '「粘贴」「全选」常驻');
ok(/key: 'copyImage'/.test(hookCode) && /key: 'saveImage'/.test(hookCode), '图片态给「复制图片」「图片另存为…」');
ok(/A\.copyText\(\{ text: sel \}\)/.test(hookCode), '复制走主进程剪贴板（沙盒下 navigator.clipboard 会被拒）');
ok(/A\.clipRead\(\)/.test(hookCode), '粘贴经主进程读剪贴板（渲染层 read 受权限模型约束）');
ok(
  /const text = \(clipData && clipData\.text\) \|\| ''/.test(hookCode) &&
    /const html = \(clipData && clipData\.html\) \|\| ''/.test(hookCode) &&
    /const image = \(clipData && clipData\.image\) \|\| ''/.test(hookCode),
  '粘贴读回剪贴板三形态（text / html / image）'
);
ok(/!text && !html && !image/.test(hookCode) && /ctxPasteEmpty/.test(hookCode), '剪贴板为空时提示（不静默失败）');
ok(/A\.clipWriteImage\(\{ src \}\)/.test(hookCode), '「复制图片」经主进程写图片剪贴板');
ok(/A\.imageSaveAs\(\{ src \}\)/.test(hookCode), '「图片另存为…」经主进程落盘');
ok(!/navigator\.clipboard/.test(hookCode), '不使用渲染层 navigator.clipboard（沙盒下会被拒）');
ok(/item\.sep/.test(hookCode) === false || /sep: true/.test(hookCode), '分隔线项以 sep 标记表达');
ok(/ctxMenuState\.open = true/.test(hookCode), '菜单项构建后打开面板');

/* ---------------- [3] App.vue ---------------- */
console.log('\n[3] App.vue 挂载');
ok(/import ContextMenu from '\.\/components\/ContextMenu\.vue'/.test(app), '导入 ContextMenu 组件');
ok(/<ContextMenu[\s\S]*?:open="ctxMenuState\.open"/.test(appCode), '面板受控于模块级状态');
ok(/:items="ctxMenuState\.items"/.test(appCode), '菜单项由 composable 提供');
ok(/@pick="ctxPick"/.test(appCode) && /@close="closeCtxMenu"/.test(appCode), 'pick / close 事件接线正确');
ok((app.match(/<ContextMenu/g) || []).length === 1, '全站只挂一个面板实例（Teleport 弹层不得多处重复挂载）');
ok(
  app.includes('import { installContextMenu, ctxMenuState, ctxPick, closeCtxMenu }'),
  '状态与动作从同一 composable 导入（单一来源）'
);

/* ---------------- [4] PostView.vue ---------------- */
console.log('\n[4] PostView.vue 编辑器动作');
ok(/import \{ registerEditorCtx \} from '\.\.\/composables\/useContextMenu'/.test(pvCode), '导入 registerEditorCtx');
ok(
  /registerEditorCtx\(\{\s*cut: ctxCut,\s*paste: ctxPaste,\s*selectAll: ctxSelectAll\s*\}\)/.test(pvCode),
  '注册三个编辑器动作'
);
ok(/unregisterEditorCtx\(\)/.test(pvCode), '卸载时注销（避免操作已销毁的编辑器实例）');
ok(/function ctxCut\(/.test(pvCode) && /deleteSelection\(\)/.test(pvCode), '剪切 = 删除选区');
ok(/A\.copyText\(\{ text: txt \}\)/.test(pvCode), '剪切先写剪贴板再删选区（顺序不可颠倒）');
ok(/function ctxPaste\(\{ text, html, image \}\)/.test(pvCode), '粘贴接收三形态');
ok(/c\.insertContent\(\{ type: 'image'/.test(pvCode), '粘贴图片走 image 节点插入');
ok(/c\.insertContent\(html\)/.test(pvCode), '粘贴富文本走 HTML（与系统粘贴路径一致，格式不丢）');
ok(/c\.insertContent\(text\)/.test(pvCode), '粘贴纯文本走文本插入');
ok(/c\.selectAll\(\)/.test(pvCode), '全选走 selectAll');
ok(
  !/ctxCut[\s\S]{0,400}ctxPaste[\s\S]{0,400}ctxSelectAll[\s\S]{0,400}ctxCut/.test(pvCode) || /ctxPaste/.test(pvCode),
  '三个动作各自独立（无循环引用）'
);

/* ---------------- [5] 主进程通道 ---------------- */
console.log('\n[5] 主进程通道');
ok(/handle\(\s*'clipboard:writeImage'/.test(ipc), 'clipboard:writeImage 通道存在');
ok(/handle\(\s*'clipboard:read'/.test(ipc), 'clipboard:read 通道存在');
ok(
  /cb\.readText\(\)/.test(ipc) && /cb\.readHTML\(\)/.test(ipc) && /cb\.readImage\(\)/.test(ipc),
  '读剪贴板覆盖 text / html / image 三形态（缺一项即能力回退）'
);
ok(/toDataURL\(\)/.test(ipc), '图片形态转 data: URI 返回（供编辑器插入 image 节点）');
ok(/noLockGuard: true/.test(ipc), '剪贴板通道不受数据库锁限制（解锁页也要能复制）');
ok(
  /clipboard:writeImage[\s\S]{0,600}noLockGuard: true/.test(ipc) ||
    /noLockGuard: true[\s\S]{0,400}clipboard:writeImage/.test(ipc),
  'clipboard:writeImage 走 noLockGuard'
);
ok(/buildTextTemplate/.test(ipc) && /buildImageTemplate/.test(ipc), '原生菜单模板函数保留（其余区域仍在用）');

/* ---------------- [6] preload ---------------- */
console.log('\n[6] preload 暴露');
ok(/clipWriteImage: p => call\('clipboard:writeImage', p\)/.test(preload), '暴露 clipWriteImage');
ok(/clipRead: \(\) => call\('clipboard:read'\)/.test(preload), '暴露 clipRead');
ok(/menuContext: p => call\('menu:context', p\)/.test(preload), '原生 menuContext 保留');
ok(/copyText: p => call\('clipboard:writeText', p\)/.test(preload), 'copyText 保留');
ok(/imageSaveAs: p => call\('image:saveAs', p\)/.test(preload), 'imageSaveAs 保留');

/* ---------------- [7] i18n ---------------- */
console.log('\n[7] i18n 12 语言');
/* 语言列表从 LANGS 派生：写死会让新增语言静默漏检（it/es 就是这么漏掉的）。 */
const LANGS = [
  ...read('src/i18n/index.js')
    .match(/export const LANGS = \[([\s\S]*?)\];/)[1]
    .matchAll(/key:\s*'([^']+)'/g)
].map(m => m[1]);
const KEYS = [
  'ctxCut',
  'ctxCopy',
  'ctxCopySel',
  'ctxPaste',
  'ctxSelectAll',
  'ctxCopyImage',
  'ctxSaveImage',
  'ctxPasteEmpty',
  'ctxNoSelection'
];
const dicts = {};
for (const L of LANGS) {
  const src = read(`src/i18n/parts/ui.${L}.js`);
  const m = src.match(/export default \{([\s\S]*?)\n\};/);
  const obj = {};
  for (const line of (m ? m[1] : '').split('\n')) {
    // 单引号：'key: 'value''
    let mm = line.match(/^\s*([a-zA-Z0-9_]+):\s*'((?:[^'\\]|\\.)*)'/);
    if (mm) {
      obj[mm[1]] = mm[2].replace(/\\'/g, "'");
      continue;
    }
    // 双引号：'key: "value"'（法语等含撇号的语言会用到）
    mm = line.match(/^\s*([a-zA-Z0-9_]+):\s*"((?:[^"\\]|\\.)*)"/);
    if (mm) obj[mm[1]] = mm[2].replace(/\\"/g, '"');
  }
  dicts[L] = obj;
}
for (const L of LANGS) {
  const missing = KEYS.filter(k => !(k in dicts[L]));
  ok(
    missing.length === 0,
    `${L}：${KEYS.length} 个右键菜单 key 齐全${missing.length ? '（缺 ' + missing.join(',') + '）' : ''}`
  );
}
const cn = dicts['zh-CN'];
const tw = dicts['zh-TW'];
for (const k of KEYS) {
  ok(tw[k] === toTw(cn[k]), `${k}：繁体逐字转写一致（${tw[k]}）`);
}
ok(cn.ctxCopySel.includes('{text}'), '复制项保留 {text} 占位符');
ok(/复制「\{text\}」/.test(cn.ctxCopySel), '复制项带内容预览（用户能确认复制的是哪一段）');
ok(
  !/快捷键|Ctrl|Shift/i.test(cn.ctxCut + cn.ctxCopy + cn.ctxPaste + cn.ctxSelectAll),
  '菜单项不带快捷键提示（避免暗示与浏览器默认快捷键的富文本语义等价）'
);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
