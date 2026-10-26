/**
 * 文档编辑器块级格式专项回归（Beta.319）。
 *
 * 【为什么单独一场】
 *   用户同一批反馈里的三个现象，根因都是「编辑态缺东西」：
 *   1. 改文字对齐方式无效 —— 调用了一个不存在的函数（run / chainRun 之误）；
 *   2. 有/无序列表文字太贴边 —— .editor-area 从来没写过 ul/ol 规则，
 *      退化成浏览器默认（缩进贴字、无左内边距）；
 *   3. 引用模式无样式 —— 同理，blockquote 样式只写在 .post-content（查看态）。
 *   这三条都在「查看态正常、编辑态崩」的那条缝里，且都不报编译错，只能靠断言盯住。
 *
 * 运行：node electron/verify/post-editor-blocks.test.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const postView = read('src/pages/PostView.vue');
const baseCss = read('src/styles/base.css');

/* 只取 <script setup> 段做代码检查：模板里也有 tb-btn 之类字样，混进来会误判 */
const scriptBody = postView.slice(postView.indexOf('<script setup>'));
/* 去掉注释：注释里出现的旧写法是「记录踩过的坑」，不是违规 */
const codeOnly = scriptBody.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('[1] 对齐：不得调用未定义的 run()');
{
  /* 正例：onAlignChange 内部用 chainRun */
  const fn = /function onAlignChange\(v\)\s*\{([\s\S]*?)\n\}/.exec(codeOnly);
  ok(!!fn, '找到 onAlignChange 定义');
  const body = fn ? fn[1] : '';
  ok(/chainRun\(/.test(body), 'onAlignChange 走 chainRun（与其它格式按钮同一路径）');
  /* ★ 注意 run 在本文件里是**两个不同的东西**，这是本 bug 的成因本身：
   *   - 从 ../feedback 导入的 run(fn)：异步任务包装（await fn()、busy、错误 toast）；
   *   - 本地 chainRun(fn)：编辑器命令链（fn(editor.chain().focus()).run()）。
   * 把编辑器命令交给 feedback.run 时，回调参数是 undefined → 报
   * 「Cannot read properties of undefined (reading 'setTextAlign')」。
   * 所以这里不能笼统禁 run(（onMerge/预览/对比三处正常用它包 API 调用），
   * 只禁「把 chain 回调交给 run」，判据是回调形参里出现 c.xxx 这类链式命令。 */
  const wrongUse = [...codeOnly.matchAll(/(?<![\w.$])run\(\s*\(?\s*([\w$]+)\s*\)?\s*=>\s*\1\.\w+/g)];
  ok(wrongUse.length === 0, `无「把编辑器链式命令交给 feedback.run」的误用（实际 ${wrongUse.length} 处）`);

  /* 对齐扩展必须仍然注册，否则 setTextAlign 命令不存在 */
  ok(/TextAlign\.configure\(/.test(codeOnly), 'TextAlign 扩展已注册');
  ok(/setTextAlign\(/.test(body), 'onAlignChange 调用 setTextAlign');
  /* feedback.run 的合法用途仍在（说明导入没被顺手删掉导致其它功能崩） */
  ok(
    /import \{[^}]*\brun\b[^}]*\} from '\.\.\/feedback'/.test(codeOnly),
    'feedback.run 导入保留（其它异步动作仍用它）'
  );
}

console.log('[2] 编辑态列表缩进（不可贴边）');
{
  const editorUl = /\.editor-area\s+ul,\s*\.editor-area\s+ol\s*\{([^}]*)\}/.exec(baseCss);
  ok(!!editorUl, '.editor-area ul/ol 规则存在');
  const decl = editorUl ? editorUl[1] : '';
  const m = /padding-left:\s*(\d+)px/.exec(decl);
  ok(!!m, '列表有 padding-left（否则序号线贴到文字）');
  ok(m && Number(m[1]) >= 24, `缩进 ≥ 24px（实际 ${m ? m[1] : '无'}px），与查看态一致`);
  /* 查看态同一条基准：两态缩进一致，避免「编辑看着好、发布后变样」 */
  const viewUl = /\.post-content\s+ul,\s*\.post-content\s+ol\s*\{([^}]*)\}/.exec(baseCss);
  const vm = viewUl ? /padding-left:\s*(\d+)px/.exec(viewUl[1]) : null;
  ok(vm && m && vm[1] === m[1], `编辑态缩进 = 查看态缩进（${vm ? vm[1] : '?'}px）`);
}

console.log('[3] 编辑态引用样式');
{
  const q = /\.editor-area\s+blockquote\s*\{([^}]*)\}/.exec(baseCss);
  ok(!!q, '.editor-area blockquote 规则存在');
  const decl = q ? q[1] : '';
  ok(/border-left:\s*3px\s+solid/.test(decl), '引用有左侧竖线（用户要的「样式显示」）');
  ok(/background:\s*var\(--surface-2\)/.test(decl), '引用有弱底色');
  /* 查看态同款：两态形制一致 */
  const vq = /\.post-content\s+blockquote\s*\{([^}]*)\}/.exec(baseCss);
  ok(vq && /border-left:\s*3px\s+solid/.test(vq[1]), '查看态 blockquote 同为 3px 竖线（两态一致）');
}

console.log('[4] 举一反三：其它块级元素编辑态也不缺样式');
for (const [sel, why] of [
  ['hr', '分隔线'],
  ['code', '行内代码'],
  ['pre', '代码块']
]) {
  ok(new RegExp(`\\.editor-area\\s+${sel}\\s*\\{`).test(baseCss), `.editor-area ${sel} 有样式（${why}）`);
}

console.log('[4.5] 图标库：语义匹配（用户要求「不要手搓」「不必局限阿里，最重要是匹配」）');
{
  const data = (await import(path.join(ROOT, 'src/components/icon-antd.js'))).ICONS;
  const gen = read('scripts/gen-icons.mjs');

  /* 不得出现「两个键指向同一份图形」——上一版 eraser/broom、code/code-block、
     heading-1/heading-2 都是同图，用户一眼看出不对。 */
  const seen = new Map();
  const dups = [];
  for (const [k, v] of Object.entries(data)) {
    const sig = JSON.stringify(v.ch);
    if (seen.has(sig)) dups.push(`${seen.get(sig)}/${k}`);
    else seen.set(sig, k);
  }
  ok(dups.length === 0, `图标无重复图形（重复：${dups.join('、') || '无'}）`);

  /* 编辑器里必须能分辨的成对图标。
     ★ Beta.328：原 ['code', 'code-block', '行内代码/代码块'] 一对随「行内代码按钮」
       用户要求移除而删除 —— 工具栏不再有行内代码入口，code 图标一并下架，
       此对已无对应 UI，故从清单移除（不是放水：其余三对仍守原功能）。 */
  for (const [a, b, why] of [
    ['heading-1', 'heading-2', 'H1/H2'],
    ['eraser', 'broom', '清除格式/数据清洗'],
    ['align-left', 'align-right', '左对齐/右对齐']
  ]) {
    ok(
      data[a] && data[b] && JSON.stringify(data[a].ch) !== JSON.stringify(data[b].ch),
      `${why} 图形可区分（${a} ≠ ${b}）`
    );
  }

  /* 结构完整性：每个图标都要有来源标记、viewBox 与至少一个图元，
     且 tag 不得是 undefined —— 上一版 c.tagName 的笔误让全部图标渲染成 <undefined>。 */
  const broken = Object.entries(data).filter(([, v]) => !v.s || !v.vb || !v.ch.length || v.ch.some(c => !c.t));
  ok(broken.length === 0, `全部图标结构完整（异常：${broken.map(x => x[0]).join('、') || '无'}）`);

  /* 生成脚本必须声明两库与 tag 字段陷阱，否则改回 tagName 会静默产出空图标 */
  ok(/@ant-design\/icons-svg/.test(gen), '生成脚本声明 Ant Design 来源');
  ok(/lucide-static/.test(gen), '生成脚本声明 Lucide 来源（补齐 AntD 缺的编辑器语义形）');
  ok(/c\.tag\b/.test(gen), '生成脚本取 tag 字段（不是 tagName）');

  /* ★ 「实在没有匹配图标才手搓」★ 手绘是最后手段，必须可审计：
   *   - 手绘项必须集中在 CUSTOM 表里，不许混进 ICONS 清单冒充库图标；
   *   - 每项必须写明 why（为什么两库都没有），否则生成脚本直接抛错；
   *   - 与 ICONS 撞名直接抛错（库里有匹配还手搓 = 违规）。
   * 这里断言生成脚本确实实现了这三条约束，防止后人把门槛拆掉。 */
  ok(/const CUSTOM\s*=/.test(gen), '生成脚本有独立的 CUSTOM（手绘）表');
  ok(/手绘图标必须写明 why/.test(gen), '手绘项强制写理由（无 why 直接报错）');
  ok(/不得手绘覆盖/.test(gen), '库里有匹配时禁止手绘覆盖（撞名报错）');
  /* 若 CUSTOM 为空，说明当前 0 手绘 —— 这是最理想的状态，不该被读成"没实现" */
  const customEmpty = /const CUSTOM = \{\s*\}/.test(gen);
  if (customEmpty) ok(true, '当前无手绘图标，全部来自图标库');
}

console.log('[5] 页头动作按钮为纯图标（title + aria-label 齐全）');
{
  /* 找出编辑页头部那几个 btn-icon，断言都带 title 与 aria-label */
  const iconBtns = [...postView.matchAll(/<button[\s\S]*?class="[^"]*btn-icon[^"]*"[\s\S]*?<\/button>/g)].map(
    m => m[0]
  );
  ok(iconBtns.length >= 3, `页头纯图标按钮 ≥ 3 个（实际 ${iconBtns.length}）`);
  const bad = iconBtns.filter(b => !/:title=/.test(b) || !/:aria-label=/.test(b));
  ok(bad.length === 0, `每个纯图标按钮都同时有 :title 与 :aria-label（缺 ${bad.length} 个）`);
  /* 保存按钮不能再有可见文字 */
  const saveBtn = iconBtns.find(b => /btn-primary/.test(b));
  ok(!!saveBtn, '保存按钮已改为纯图标');
  ok(saveBtn && !/>\s*\{\{\s*busy/.test(saveBtn), '保存按钮不再内联 saving/save 文字');
}

console.log('[6] 工具栏状态随光标实时刷新（选区版本号）');
{
  /* 【这一节守什么】
   * ProseMirror 的 state 是普通对象，光标移动不触发 Vue 更新。此前编辑器根本没有
   * onSelectionUpdate 钩子，于是「光标从红字移到黑字」后，字色/高亮/加粗/对齐/字号
   * 全部停在上一段的样式上 —— 用户报的「两个按钮应当实时显示当前颜色」即此。
   * 修法：selectionTick 自增驱动，且模板一律走 isOn()，不得再直接写
   * `editor && editor.isActive(...)`（那不算响应式依赖）。
   */
  const tpl = postView.slice(0, postView.indexOf('<script setup>'));

  ok(/onSelectionUpdate\s*:/.test(codeOnly), 'useEditor 挂载了 onSelectionUpdate');
  const hooksOk = /onSelectionUpdate\s*:\s*bumpSelection/.test(codeOnly);
  ok(hooksOk, 'onSelectionUpdate 接的是 bumpSelection（而非空回调）');
  ok(/onUpdate[\s\S]{0,200}?bumpSelection\(\)/.test(codeOnly), 'onUpdate 内也 bump（撤销/粘贴改格式但选区不动）');
  ok(/onCreate\s*:[\s\S]{0,40}?bumpSelection/.test(codeOnly), 'onCreate 内也 bump（首次进入即回显真实状态）');

  ok(/const\s+isOn\s*=/.test(codeOnly), '存在统一的按下态入口 isOn()');
  ok(/isOn[\s\S]{0,80}?selectionTick\.value/.test(codeOnly), 'isOn() 内部读取 selectionTick 建立依赖');

  /* 模板里不得再有裸的 isActive —— 有一处漏网就有一个按钮不刷新 */
  const naked = [...tpl.matchAll(/editor\s*&&\s*editor\.isActive\(/g)];
  ok(naked.length === 0, `模板内无「editor && editor.isActive(…)」裸写法（剩 ${naked.length} 处）`);

  /* 四个回显型 computed 必须间接依赖 tick（经由 isOn） */
  for (const [name, probe] of [
    ['curAlign', /const\s+curAlign\s*=[\s\S]{0,400}?isOn\(/],
    ['curFontSize', /const\s+curFontSize\s*=[\s\S]{0,200}?isOn\(/],
    ['curColor', /const\s+curColor\s*=[\s\S]{0,200}?isOn\(/],
    ['curHighlight', /const\s+curHighlight\s*=[\s\S]{0,200}?isOn\(/],
    /* Beta.322：curImageWidth 改为 selectedImage（只判有无），宽度下放到 imgWidthValue，
       避免同一份宽度有两个出口。断言跟着换成新名字，口径不变。 */
    ['selectedImage', /const\s+selectedImage\s*=[\s\S]{0,200}?isOn\(/]
  ]) {
    ok(probe.test(codeOnly), `${name} 经由 isOn 依赖选区变化`);
  }

  /* ColorPicker 两个按钮都必须把「当前值」传进去，否则显示永远是默认色 */
  ok(/purpose="text"[\s\S]{0,120}?curColor|:model-value="curColor"/.test(tpl), '文字颜色按钮绑定 curColor');
  ok(/:model-value="curHighlight"/.test(tpl), '高亮按钮绑定 curHighlight');

  /* ColorPicker 内部：未设置时不能沿用默认色冒充「已设置」 */
  const cp = read('src/components/ColorPicker.vue');
  const cpCode = cp
    .slice(cp.indexOf('<script setup>'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  ok(/const\s+isSet\s*=/.test(cpCode), 'ColorPicker 区分「已设置/未设置」');
  ok(/cp-bar-unset/.test(cp), '未设置时色条用棋盘格表示透明，而不是涂成某个颜色');
  ok(/:style="\{ color: iconColor \}"/.test(cp), '图标本身也跟随当前色（用户明确要求「实时显示当前颜色」）');
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
