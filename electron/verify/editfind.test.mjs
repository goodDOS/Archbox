/**
 * 任务418：编辑态页内查找（PostView 编辑模式）验证。
 *
 * 覆盖三层：
 *   ① EditorFind 装饰行为 —— jsdom 里挂**真实** Tiptap Editor（Document/Paragraph/
 *      Text + EditorFind 扩展），验证 PM decoration 命中数、激活项随 active/bodyOffset
 *      的落点、大小写语义、空事务驱动重算、reset 撤空；顺带验证装饰不污染文档
 *      模型、不触发 onUpdate（不标记脏数据）。
 *   ② editFind 编排 —— jsdom 构造 .edit-layout DOM（标题/字段输入框 +
 *      .editor-area），配一个「镜像 PM 装饰逻辑」的假 provider
 *      （与 editorFind.js 的 decorations 同一套 bodyActive 计算），验证两类目标的
 *      计数与导航顺序、输入框 focus + 原生选区、正文跳转的查询更新与滚动、正文
 *      编辑器隐藏时不作目标、clear 收尾（撤装饰 + 收幽灵选区 + 幂等）、postFind 路由。
 *   ③ 静态接线契约 —— App.vue 三锚点、PostView provider 生命周期与 data-find-input
 *      锚点、查看态↔编辑态切换重搜、FindBar 焦点归还、find.js ctx 快照传递、
 *      postFind 编辑态分流、FieldRenderer 锚点、引擎不反向依赖 store。
 *
 * 运行：node electron/verify/editfind.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createHarness, installDomGlobals } from './_harness.mjs';

const { ok, section, done } = createHarness();
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ------------------------------------------------------------------ *
 * 1. EditorFind 装饰行为（jsdom + 真实 ProseMirror / Tiptap）
 * ------------------------------------------------------------------ */
section('1. EditorFind 装饰行为（真实 PM 编辑器）');

const pmDom = new JSDOM('<!DOCTYPE html><html><body><div id="ed"></div></body></html>', {
  pretendToBeVisual: true
});
// 统一挂全局（含 navigator）：Node < 21 没有全局 navigator，缺它 jsdom / ProseMirror 会抛错
installDomGlobals(pmDom);

const { Editor } = await import('@tiptap/core');
const { default: DocumentExt } = await import('@tiptap/extension-document');
const { default: ParagraphExt } = await import('@tiptap/extension-paragraph');
const { default: TextExt } = await import('@tiptap/extension-text');
const ef = await import('../../src/utils/editorFind.js');

let updateCalls = 0;
const editor = new Editor({
  element: pmDom.window.document.getElementById('ed'),
  extensions: [DocumentExt, ParagraphExt, TextExt, ef.EditorFind],
  content: '<p>alpha beta alpha</p>',
  onUpdate: () => {
    updateCalls++;
  }
});
const edEl = () => pmDom.window.document.getElementById('ed');
const hits = () => edEl().querySelectorAll('.pf-hit');
const actives = () => edEl().querySelectorAll('.pf-hit-active');

ok(hits().length === 0, '初始无查询 → 无装饰');

// provider 生命周期 + 「空事务驱动装饰重算」机制实证
let pmRefreshCalls = 0;
ef.registerEditorFindProvider({
  refresh: () => {
    pmRefreshCalls++;
    editor.view.dispatch(editor.state.tr);
  }
});
ok(ef.getEditorFindProvider() !== null, 'registerEditorFindProvider 注册后可取回');

Object.assign(ef.editorFindQuery, { text: 'alpha', matchCase: false, active: 1, bodyOffset: 0 });
ok(hits().length === 0, '只写查询对象不派发事务 → 装饰未重算（刷新必须显式触发）');
ef.getEditorFindProvider().refresh();
ok(pmRefreshCalls === 1 && hits().length === 2, 'provider.refresh 派发空事务 → 装饰按查询重算（2 处命中）');
ok(hits()[0].classList.contains('pf-hit-active'), 'active=1 点亮第一处命中');
ok(hits()[1].className === 'pf-hit', '非激活命中只带 pf-hit 类');

// 直接派发空事务（与 provider.refresh 同路径）改激活项
const dispatch = () => editor.view.dispatch(editor.state.tr);
Object.assign(ef.editorFindQuery, { active: 2 });
dispatch();
ok(actives().length === 1 && hits()[1].classList.contains('pf-hit-active'), 'active=2 点亮第二处命中');

Object.assign(ef.editorFindQuery, { bodyOffset: 1, active: 2 });
dispatch();
ok(hits()[0].classList.contains('pf-hit-active'), 'bodyOffset 平移：active-bodyOffset-1=0 → 点亮第一处');

Object.assign(ef.editorFindQuery, { active: 1 });
dispatch();
ok(actives().length === 0, '激活项落在正文段之前（bodyActive<0）→ 正文无激活项');

Object.assign(ef.editorFindQuery, { active: 99, bodyOffset: 0 });
dispatch();
ok(actives().length === 0, 'active 越界 → 正文无激活项（不抛错）');

Object.assign(ef.editorFindQuery, { text: 'ALPHA', matchCase: true, active: 1, bodyOffset: 0 });
dispatch();
ok(hits().length === 0, '大小写敏感：ALPHA 不命中 alpha');

Object.assign(ef.editorFindQuery, { matchCase: false });
dispatch();
ok(hits().length === 2, '大小写不敏感：ALPHA 命中 alpha 两处');

ok(editor.getHTML() === '<p>alpha beta alpha</p>', '装饰不改文档模型（getHTML 原样）');
ok(editor.state.doc.textContent === 'alpha beta alpha', '文档文本未被装饰污染');
ok(updateCalls === 0, '空事务不触发 onUpdate（不标记脏数据）');

ok(ef.resetEditorFindQuery() === true, 'resetEditorFindQuery：有查询时返回 true');
dispatch();
ok(hits().length === 0, 'reset 后装饰撤空');
ok(ef.resetEditorFindQuery() === false, 'resetEditorFindQuery：无查询时返回 false（幂等）');

ef.clearEditorFindProvider();
ok(ef.getEditorFindProvider() === null, 'clearEditorFindProvider 清除后取回 null');
editor.destroy();

/* ------------------------------------------------------------------ *
 * 2. editFind 编排（jsdom DOM + 镜像 PM 装饰逻辑的假 provider）
 * ------------------------------------------------------------------ */
section('2. editFind 编排（三类目标混合）');

const BODY_TEXT = '正文内容 alpha 又一处 beta 还有 alpha 结尾';
let refreshCalls = 0;

/**
 * 假 provider：镜像 editorFind.js decorations 的 bodyActive 计算与类名规则，
 * 把「PM 会渲染出的高亮」直接写进 .editor-area。这样 countPmHits / scrollActivePm
 * 拿到的 DOM 与真实编辑器一致，可在不挂 PM 的环境里驱动 editFind 全流程。
 */
function fakePmRefresh() {
  refreshCalls++;
  const area = document.querySelector('.edit-layout .editor-area');
  if (!area) return;
  area.textContent = '';
  const q = ef.editorFindQuery;
  if (!q.text) return;
  const needle = q.matchCase ? q.text : q.text.toLowerCase();
  const hay = q.matchCase ? BODY_TEXT : BODY_TEXT.toLowerCase();
  const bodyActive = q.active - 1 - q.bodyOffset;
  let i = hay.indexOf(needle);
  let n = 0;
  let prev = 0;
  while (i !== -1) {
    if (i > prev) area.appendChild(document.createTextNode(BODY_TEXT.slice(prev, i)));
    const span = document.createElement('span');
    span.className = n === bodyActive ? 'pf-hit pf-hit-active' : 'pf-hit';
    span.textContent = BODY_TEXT.slice(i, i + needle.length);
    area.appendChild(span);
    prev = i + needle.length;
    n++;
    i = hay.indexOf(needle, i + needle.length);
  }
}
ef.registerEditorFindProvider({ refresh: fakePmRefresh });

const { editSearch, editJump, editClear } = await import('../../src/utils/editFind.js');
const pf = await import('../../src/utils/postFind.js');

const scrollCalls = [];
function mount(html) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, { pretendToBeVisual: true });
  // jsdom 无 scrollIntoView：打桩计数，验证「激活项滚动到位」行为
  dom.window.HTMLElement.prototype.scrollIntoView = function () {
    scrollCalls.push(this);
  };
  global.window = dom.window;
  global.document = dom.window.document;
  global.NodeFilter = dom.window.NodeFilter;
  global.getComputedStyle = dom.window.getComputedStyle;
  scrollCalls.length = 0;
  return dom;
}

const editHtml = `
  <div class="edit-layout">
    <input class="title-input" data-find-input value="标题 alpha 一期">
    <input data-find-input value="字段甲 无命中">
    <input data-find-input value="字段乙 alpha beta">
    <div class="editor-area"><p>${BODY_TEXT}</p></div>
  </div>`;
const inputs = () => document.querySelectorAll('[data-find-input]');

// —— 场景 A：两类目标合计与导航顺序（标题 → 字段 → 正文）——
mount(editHtml);
refreshCalls = 0;
const rA = editSearch('alpha');
ok(rA.matches === 4, `视觉态合计命中=4（标题 1 + 字段 1 + 正文 2），got ${rA.matches}`);
ok(
  ef.editorFindQuery.text === 'alpha' && ef.editorFindQuery.bodyOffset === 2 && ef.editorFindQuery.active === 1,
  '查询对象写入正确（bodyOffset=前两类命中数，首命中即激活项）'
);
ok(refreshCalls === 1, '视觉态搜索触发一次正文刷新');
ok(document.querySelectorAll('.editor-area .pf-hit').length === 2, '正文装饰命中 2 处');
ok(document.querySelectorAll('.editor-area .pf-hit-active').length === 0, '首命中在标题里 → 正文无激活项');

let next = editJump(false, { active: 1, matches: 4, text: 'alpha' });
ok(next === 1, `下一处跳到字段乙（导航序号 ${next}）`);
ok(document.activeElement === inputs()[2], '输入框命中用 focus 标示');
ok(inputs()[2].selectionStart === 4 && inputs()[2].selectionEnd === 9, '原生选区覆盖命中处（字段乙 alpha）');
ok(refreshCalls === 1, '输入框跳转不触发正文刷新');

next = editJump(false, { active: 2, matches: 4, text: 'alpha' });
ok(next === 2, `下一处跳到正文第一处（导航序号 ${next}）`);
ok(ef.editorFindQuery.active === 3, '正文跳转把全局 active 写回查询（active=3）');
ok(refreshCalls === 2, '正文跳转触发 provider 刷新');
const bodyActiveEl = document.querySelector('.editor-area .pf-hit-active');
ok(bodyActiveEl !== null && bodyActiveEl.textContent === 'alpha', '正文激活项高亮正确');
ok(scrollCalls.includes(bodyActiveEl), '正文激活项滚动到可见');

next = editJump(false, { active: 3, matches: 4, text: 'alpha' });
ok(
  next === 3 && document.querySelectorAll('.editor-area .pf-hit')[1].classList.contains('pf-hit-active'),
  '正文第二处激活'
);

next = editJump(false, { active: 4, matches: 4, text: 'alpha' });
ok(next === 0, `正向环绕回标题（导航序号 ${next}）`);
ok(inputs()[2].selectionStart === inputs()[2].selectionEnd, '跳新输入框前收起旧选区（防幽灵选区）');

next = editJump(true, { active: 1, matches: 4, text: 'alpha' });
ok(next === 3, `反向环绕到正文第二处（导航序号 ${next}）`);
ok(ef.editorFindQuery.active === 4, '反向环绕同样更新查询 active');

ok(editJump(false, { active: 1, matches: 0, text: 'alpha' }) === -1, 'matches=0 时跳转返回 -1');
ok(editJump(false, { active: 1, matches: 4, text: '' }) === -1, '空词时跳转返回 -1');

// —— 场景 A2：仅正文命中时，搜索即定位（滚动到位）且不抢焦点 ——
scrollCalls.length = 0;
const rA2 = editSearch('结尾');
ok(rA2.matches === 1, `仅正文命中时总数=1，got ${rA2.matches}`);
ok(document.activeElement === inputs()[0], '搜索不抢焦点（焦点留在原输入框）');
ok(
  scrollCalls.some(el => el.classList.contains('pf-hit-active')),
  '首命中即激活项 → 搜索后自动滚动到位'
);

// —— 场景 B：大小写语义贯穿两类目标 ——
ok(editSearch('ALPHA', { matchCase: true }).matches === 0, '大小写敏感：ALPHA 零命中');
ok(editSearch('ALPHA').matches === 4, '大小写不敏感：ALPHA 命中 4 处');

// —— 场景 C：正文编辑器隐藏时不作目标（无 PM 命中、不刷新 provider） ——
//   Beta.326：代码视图连同 .code-area 查找目标一并移除，此场景原测「代码态目标切换」，
//   保留其中仍有价值的一半——编辑器不可见时 pmProvider 必须识相退场。
mount(`
  <div class="edit-layout">
    <input data-find-input value="标题 alpha 一期">
    <input data-find-input value="字段甲 无命中">
    <input data-find-input value="字段乙 alpha beta">
    <div class="editor-area" style="display:none"><p>${BODY_TEXT}</p></div>
  </div>`);
refreshCalls = 0;
const rC = editSearch('alpha');
ok(rC.matches === 2, `编辑器隐藏时合计命中=2（标题 1 + 字段 1），got ${rC.matches}`);
ok(refreshCalls === 0, '编辑器隐藏不刷新 PM provider（正文不当目标）');
ok(document.querySelectorAll('.editor-area .pf-hit').length === 0, '隐藏的编辑器不产生装饰命中');

// —— 场景 D：clear 收尾（撤装饰 + 收幽灵选区 + 幂等）——
mount(editHtml);
editSearch('alpha');
editJump(false, { active: 1, matches: 4, text: 'alpha' }); // 选区落到字段乙
refreshCalls = 0;
editClear();
ok(
  ef.editorFindQuery.text === '' && ef.editorFindQuery.active === 0 && ef.editorFindQuery.bodyOffset === 0,
  'clear 清空查询对象'
);
ok(refreshCalls === 1, '有查询时 clear 触发一次刷新撤装饰');
ok(document.querySelectorAll('.editor-area .pf-hit').length === 0, 'clear 后正文装饰撤空');
const fieldB = inputs()[2];
ok(
  fieldB.selectionStart === fieldB.selectionEnd && fieldB.selectionStart === fieldB.value.length,
  'clear 收起幽灵选区（光标落末尾）'
);
refreshCalls = 0;
editClear();
ok(refreshCalls === 0, 'clear 幂等（无查询不重复刷新）');

// —— 场景 E：postFind 路由集成（编辑态分流 + 查看态不回归）——
mount(editHtml);
const rE = pf.search('alpha');
ok(rE.matches === 4, `postFind.search 编辑态转调混合引擎，got ${rE.matches}`);
ok(document.querySelectorAll('mark.pf-hit').length === 0, '编辑态不注入 <mark>（查看态方案不污染编辑态 DOM）');
ok(document.querySelectorAll('.editor-area .pf-hit').length === 2, 'postFind 路径同样点亮正文装饰');
ok(pf.jump(false, { active: 1, matches: 4, text: 'alpha' }) === 1, 'postFind.jump 编辑态转调 editJump');
pf.clear();
ok(document.querySelectorAll('.pf-hit').length === 0, 'postFind.clear 编辑态收尾（装饰 + 选区全清）');

mount('<div class="post-main"><div class="post-content">alpha 内容</div></div>');
const rV = pf.search('alpha');
ok(
  rV.matches === 1 && document.querySelectorAll('mark.pf-hit').length === 1,
  '无 .edit-layout 时仍走查看态 <mark> 路径（路由不回归）'
);
pf.clear();

/* ------------------------------------------------------------------ *
 * 3. 静态接线契约（源码断言）
 * ------------------------------------------------------------------ */
section('3. 静态接线契约');

const app = fs.readFileSync(path.join(ROOT, 'src/App.vue'), 'utf8');
ok(
  /function canFindHere\(\) \{[\s\S]*?querySelector\('\.post-main'\)[\s\S]*?querySelector\('\.post-read'\)[\s\S]*?querySelector\('\.edit-layout'\)/.test(
    app
  ),
  'App.vue canFindHere 三锚点并置（查看态 .post-main / 共享详情 .post-read / 编辑态 .edit-layout）'
);

const pv = fs.readFileSync(path.join(ROOT, 'src/pages/PostView.vue'), 'utf8');
ok(
  /import \{\s*EditorFind,\s*registerEditorFindProvider,\s*clearEditorFindProvider\s*\} from '\.\.\/utils\/editorFind';/.test(
    pv
  ),
  'PostView 引入 EditorFind 与 provider 注册/清除'
);
ok(/EditorFind\s*\n\s*\],/.test(pv), 'EditorFind 扩展已接入编辑器 extensions 末尾');
ok(
  /registerEditorFindProvider\(\{\s*refresh: \(\) => \{[\s\S]*?view\.dispatch\(editor\.value\.state\.tr\)/.test(pv),
  'onMounted 注册 provider（空事务驱动装饰重算）'
);
ok(
  /clearEditorFindProvider\(\);\s*\n\s*if \(editor\.value\) editor\.value\.destroy\(\);/.test(pv),
  'onBeforeUnmount 清除 provider（编辑器销毁前）'
);
ok(
  /class="input title-input"\s*\n\s*v-model\.trim="form\.title"[\s\S]*?data-find-input/.test(pv),
  '标题输入框带 data-find-input 锚点'
);
ok(
  /watch\(editing, async \(\) => \{\s*await nextTick\(\);\s*if \(findState\.open && findState\.text\) findSet\(findState\.text\);/.test(
    pv
  ),
  '查看态↔编辑态切换后重搜（nextTick 等新 DOM 挂稳）'
);
ok(
  /watch\(editing, async \(\) => \{\s*await nextTick\(\);\s*if \(findState\.open && findState\.text\) findSet\(findState\.text\);/.test(
    pv
  ),
  '查看态↔编辑态切换后重搜（nextTick 等新 DOM 挂稳）'
);
// Beta.326：代码视图移除后，「视觉↔代码切换重搜」的触发点（switchView 内的
// nextTick 块）随之删除；编辑态只剩 watch(editing) 一个重搜入口，上面已断言。
ok(!/switchView/.test(pv), 'PostView 不再存在视图切换函数（代码视图已移除）');

const fb = fs.readFileSync(path.join(ROOT, 'src/components/FindBar.vue'), 'utf8');
ok(
  /watch\(\s*\(\) => findState\.active,\s*\(\) => \{\s*if \(!findState\.open\) return;\s*const el = inputRef\.value;\s*if \(el && document\.activeElement !== el\) el\.focus\(\);\s*\}\s*\);/.test(
    fb
  ),
  'FindBar 跳转后把焦点还给查找框（编辑态原生选区会抢焦点）'
);

const fj = fs.readFileSync(path.join(ROOT, 'src/store/modules/find.js'), 'utf8');
ok(
  /jump\(backward, \{[\s\S]*?active: findState\.active,[\s\S]*?matches: findState\.matches,[\s\S]*?text: findState\.text,[\s\S]*?matchCase: findState\.matchCase/.test(
    fj
  ),
  'findJump 传 ctx 快照（引擎不反向依赖 store）'
);

const pfSrc = fs.readFileSync(path.join(ROOT, 'src/utils/postFind.js'), 'utf8');
ok(
  /if \(inEditMode\(\)\) return editSearch\(text, \{ matchCase \}\);/.test(pfSrc),
  'postFind.search 编辑态转调 editSearch'
);
ok(
  /if \(inEditMode\(\)\) return editJump\(backward, ctx \|\| \{\}\);/.test(pfSrc),
  'postFind.jump 编辑态转调 editJump'
);
ok(/\n {2}editClear\(\);/.test(pfSrc), 'postFind.clear 编辑态收尾转调 editClear');

const fr = fs.readFileSync(path.join(ROOT, 'src/components/post/FieldRenderer.vue'), 'utf8');
ok(
  (fr.match(/data-find-input/g) || []).length === 2,
  'FieldRenderer 两个填写框带 data-find-input（textarea + fallback input）'
);

const efs = fs.readFileSync(path.join(ROOT, 'src/utils/editorFind.js'), 'utf8');
ok(!/from '\.\.\/store/.test(efs), 'editorFind 不反向依赖 store（避免 find→postFind→editFind→editorFind→find 成环）');
const efind = fs.readFileSync(path.join(ROOT, 'src/utils/editFind.js'), 'utf8');
ok(!/from '\.\.\/store/.test(efind), 'editFind 不反向依赖 store（ctx 快照由 store 传入）');

/* ------------------------------------------------------------------ *
 * 4. findOverlay 命中覆盖层（Beta.316 · 「标题文字没被高亮」修复）
 *
 * 为什么必须单独测：覆盖层是挂在 <input>/<textarea> 之上的**独立 DOM 层**，
 * 不受 Vue 管理，也没有原生选区的"自动正确"兜底 —— 挂错父节点、漏摘、漏还原
 * 都会静默留下错位色块或污染 DOM，肉眼很难在主题切换后才察觉。
 * jsdom 没有布局引擎，量不了像素；这里守的是**结构与生命周期契约**：
 *   ① 命中块数量与文案正确（含 active 项的唯一性）；
 *   ② 单行 input 强制 white-space: pre（不折行，否则第二轮起全部错位）；
 *   ③ number/date 类型跳过（显示形式与 value 不同，硬画只会错位）；
 *   ④ 控件被卸载后层随之销毁，不留悬空节点；
 *   ⑤ 父元素被改的 position 在销毁时**还原**；
 *   ⑥ 无 .edit-layout 时整体清空（退出编辑态不留幽灵高亮）。
 * ------------------------------------------------------------------ */
section('4. findOverlay 命中覆盖层（结构 + 生命周期）');

const foDom = new JSDOM(
  `<!DOCTYPE html><html><body>
    <div class="edit-layout">
      <div id="host-title"><input id="t1" type="text" value="标题里有标题两个字" /></div>
      <div id="host-ta"><textarea id="t2">第一行 标题\n第二行 标题</textarea></div>
      <div id="host-num"><input id="t3" type="number" value="123" /></div>
    </div>
  </body></html>`,
  { pretendToBeVisual: true }
);
global.window = foDom.window;
global.document = foDom.window.document;
global.getComputedStyle = foDom.window.getComputedStyle;
global.NodeFilter = foDom.window.NodeFilter;

const fo = await import('../../src/utils/findOverlay.js');
const doc = foDom.window.document;
const t1 = doc.getElementById('t1');
const t2 = doc.getElementById('t2');
const t3 = doc.getElementById('t3');
const hostTitle = doc.getElementById('host-title');

fo.render(
  [
    // 「标题里有标题两个字」：0 与 4 两处「标题」（不是 5 —— 手算下标别猜）
    { el: t1, start: 0, len: 2 },
    { el: t1, start: 4, len: 2 },
    // 「第一行 标题\n第二行 标题」：3 与 10 两处，跨行各一块
    { el: t2, start: 3, len: 2 },
    { el: t2, start: 10, len: 2 },
    // number 型：必须被跳过
    { el: t3, start: 0, len: 2 }
  ],
  { el: t1, start: 4 }
);

const layer1 = hostTitle.querySelector('.fo-layer');
ok(!!layer1, '① 输入框父元素上生成了 .fo-layer');
ok(
  layer1.querySelectorAll('.fo-hit').length === 2,
  `① 标题里 2 处命中各画一块（实 ${layer1.querySelectorAll('.fo-hit').length} 块）`
);
ok(
  layer1.querySelectorAll('.fo-hit-active').length === 0 || layer1.querySelectorAll('.fo-hit-active').length === 1,
  '① active 标记最多一块（不会多处同时深色）'
);
ok(layer1.querySelectorAll('.fo-hit-active').length === 1, '① active 项有且只有一块（当前定位处可辨认）');
const activeHit = layer1.querySelector('.fo-hit-active');
ok(activeHit && activeHit.textContent === '标题', '① active 块文案取自原值（命中片段不被改写）');
ok(layer1.getAttribute('aria-hidden') === 'true', '① 覆盖层对读屏隐藏（命中信息已在查找条计数里）');
ok(layer1.style.whiteSpace === 'pre', '② 单行 input 强制 white-space:pre（否则长标题折行、第二轮起高亮全错位）');
ok(layer1.style.boxSizing === 'border-box', '② 层用 border-box（宽高取自控件外框，避免整体右下偏）');

const taLayer = doc.getElementById('host-ta').querySelector('.fo-layer');
ok(!!taLayer, '③ textarea 也生成覆盖层');
ok(taLayer.style.whiteSpace !== 'pre', '③ textarea 不强制 pre（多行框要按控件自身折行规则走）');
ok(
  taLayer.querySelectorAll('.fo-hit').length === 2,
  `③ textarea 跨行两处命中都画（实 ${taLayer.querySelectorAll('.fo-hit').length}）`
);
ok(!doc.getElementById('host-num').querySelector('.fo-layer'), '③ number 型 input 跳过（显示形式与 value 不同）');

ok(hostTitle.style.position === 'relative', '④ 静态父元素被临时设为 relative 作为定位上下文');

// 控件被 Vue 卸载：再 render 一次，旧层的父元素已不含该控件 → 层必须销毁
t1.remove();
fo.render([{ el: t2, start: 3, len: 2 }], null);
ok(!hostTitle.querySelector('.fo-layer'), '⑤ 控件被卸载后覆盖层随之销毁（不留悬空色块）');
ok(hostTitle.style.position === '', '⑥ 唯一层销毁时父元素的 position 被还原（不污染 Vue 管的 DOM）');

fo.removeAll();
ok(!doc.querySelector('.fo-layer'), '⑥ removeAll 清干净所有层');

// 非编辑态：render 应整体清空，而不是画到别处
doc.querySelector('.edit-layout').remove();
fo.render([{ el: t2, start: 0, len: 1 }], null);
ok(!doc.querySelector('.fo-layer'), '⑦ 非编辑态不生成覆盖层（退出编辑态不留幽灵高亮）');

// 静态接线：editClear 必须调 removeOverlay，editSearch 必须调 renderOverlay
ok(/removeOverlay\(\);/.test(efind), '⑦ editClear 调 removeOverlay（关闭查找条时覆盖层同步消失）');
ok(/renderOverlay\(/.test(efind), '⑦ editSearch / editJump 调 renderOverlay（命中与激活项一起上图）');
ok(
  /const h = active && active\.el/.test(fs.readFileSync(path.join(ROOT, 'src/utils/findOverlay.js'), 'utf8')) ||
    /active && active\.el/.test(fs.readFileSync(path.join(ROOT, 'src/utils/findOverlay.js'), 'utf8')),
  '⑦ render 接受 active 参数（跳转时当前命中换深色底）'
);

done();
