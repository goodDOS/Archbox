/**
 * 「另存为」下拉图标尺寸契约（Beta.324 追加）。
 *
 * 【为什么要有这一场】
 *   用户发来编辑页页头截图：「另存为图标大小不一」。
 *   现象是保存组里四个控件三种尺寸：
 *     · 草稿箱 / 模板   .btn.btn-icon        → 32×32、图标 16px（基准）
 *     · 「保存」主按钮   .btn.btn-primary    → 32×32、图标 16px（基准）
 *     · 「另存为」下拉   Dropdown toolbar 皮肤 → 高 28px、宽约 39px、图标 15px（异类）
 *   toolbar 皮肤是给编辑器工具栏设计的（对齐 .tb-btn 的 28px），保存组在页面动作区，
 *   本该对齐 .btn 系列 —— 用它属于「皮肤用错了地方」，不是数值写错。
 *
 * 【本条测试锁什么】
 *   1. Dropdown 提供 icon-btn 皮肤，且与 base.css 的 .btn.btn-icon 逐像素同参
 *      （32×32 / padding 0 / --surface 底 / --border 框 / --radius-sm 圆角 /
 *       hover 走 --btn-ghost-hover / disabled 透明度 0.5）；
 *   2. 图标与折叠箭头尺寸随皮肤切换（icon-btn：16 / 12；toolbar：15 / 14）——
 *      箭头缩到 12 是硬约束：触发器固定 32px、padding 0、边框 1px×2，内容区只有
 *      30px，16 + 14 会溢出被裁，16 + 12 + 1px 间隙 = 29 才装得下；
 *   3. PostView 保存组的接线：「另存为」用 icon-btn，紧邻的「保存」仍是
 *      .btn.btn-primary.btn-icon，整组只有一个下拉 + 一个按钮；
 *   4. toolbar 皮肤未被顺手改坏（编辑器工具栏三处仍在用它，回归保护）。
 *
 * 运行：node electron/verify/dropdown-icon-btn.test.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness } from './_harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { ok, section, done } = createHarness();

const read = p => readFileSync(path.join(root, p), 'utf8');
const ddSrc = read('src/components/Dropdown.vue');
const baseCss = read('src/styles/base.css');
const pvSrc = read('src/pages/PostView.vue');

/** 剥 CSS 注释：本文件新增的注释里就写着「32×32、图标 16px」，
 *  不剥的话把规则删光也能靠注释喂饱断言（这个坑在 image-lightbox-fit 踩过）。 */
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 取出 .vue 的 <template> 段 */
function tpl(src) {
  const m = /<template>([\s\S]*)<\/template>/.exec(src);
  return m ? m[1] : '';
}
/** 取出 .vue 的 <script setup> 段 */
function script(src) {
  const m = /<script setup>([\s\S]*)<\/script>/.exec(src);
  return m ? m[1] : '';
}

/** 取出选择器对应的声明块（selector 到配对的 }），注释已剥 */
function block(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[},])\\s*${esc}\\s*\\{`, 'm');
  const m = re.exec(css);
  if (!m) return null;
  const start = css.indexOf('{', m.index + m[0].length - 1);
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (!depth) return css.slice(start + 1, i);
    }
  }
  return null;
}

/** 声明块里某属性的最终值（取最后一条，模拟层叠） */
function prop(decl, name) {
  if (!decl) return null;
  const re = new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+)`, 'g');
  let v = null;
  let m;
  while ((m = re.exec(decl))) v = m[1].trim();
  return v;
}

const ddCss = stripCssComments(ddSrc);
const ddTpl = tpl(ddSrc);
const ddScript = script(ddSrc);
const pvTpl = tpl(pvSrc).replace(/<!--[\s\S]*?-->/g, '');

/* ============ 1. icon-btn 皮肤与 .btn.btn-icon 对齐 ============ */
section('1. icon-btn 皮肤逐像素对齐 .btn.btn-icon');
{
  const root_ = block(ddCss, '.dropdown-icon-btn');
  ok(!!root_, '.dropdown-icon-btn 根规则存在');
  ok(root_ && /width:\s*auto/.test(root_), '根容器 width:auto（不撑满父级，贴按钮排布）');

  const trig = block(ddCss, '.dropdown-icon-btn .dd-trigger');
  ok(!!trig, '.dropdown-icon-btn .dd-trigger 规则存在');
  ok(trig && prop(trig, 'width') === '32px', '触发器宽 32px（实得 ' + (trig ? prop(trig, 'width') : '无') + '）');
  ok(trig && prop(trig, 'height') === '32px', '触发器高 32px（实得 ' + (trig ? prop(trig, 'height') : '无') + '）');
  ok(trig && prop(trig, 'min-width') === '32px', 'min-width 32px（图标+箭头内容不被压缩）');
  ok(trig && prop(trig, 'padding') === '0', 'padding:0（正方形居中，同 .btn.btn-icon）');
  ok(trig && prop(trig, 'background') === 'var(--surface)', '底色 var(--surface)（同 .btn）');
  ok(trig && prop(trig, 'color') === 'var(--text)', '文字/图标色 var(--text)');
  ok(trig && /border:\s*1px solid var\(--border\)/.test(trig), '边框 1px solid var(--border)（同 .btn）');
  ok(trig && prop(trig, 'border-radius') === 'var(--radius-sm)', '圆角 var(--radius-sm)（同 .btn）');
  ok(trig && prop(trig, 'justify-content') === 'center', '内容居中（纯图标钮）');

  const hov = block(ddCss, '.dropdown-icon-btn .dd-trigger:hover:not(:disabled)');
  ok(!!hov, 'hover 规则存在');
  ok(hov && prop(hov, 'background') === 'var(--btn-ghost-hover)', 'hover 底色 --btn-ghost-hover（同 .btn:hover）');

  const foc = block(ddCss, '.dropdown-icon-btn .dd-trigger:focus-visible');
  ok(!!foc, 'focus-visible 规则存在');
  ok(foc && prop(foc, 'border-color') === 'var(--accent)', '键盘焦点边框变 accent（可访问性，无辉光）');

  const dis = block(ddCss, '.dropdown-icon-btn .dd-trigger:disabled');
  ok(!!dis, 'disabled 规则存在');
  ok(dis && prop(dis, 'opacity') === '0.5', 'disabled 透明度 0.5（与 .btn:disabled 一致）');
}

/* ============ 2. 图标 / 箭头尺寸随皮肤切换 ============ */
section('2. 图标与箭头尺寸随皮肤切换（16/12 ↔ 15/14）');
{
  ok(
    /'dropdown-icon-btn':\s*props\.variant === 'icon-btn'/.test(ddTpl),
    '★ 根元素 class 绑定含 dropdown-icon-btn（只写 CSS 不接类 = 皮肤根本不生效）'
  );
  ok(
    /'dropdown-toolbar':\s*props\.variant === 'toolbar'/.test(ddTpl),
    '根元素 class 绑定仍含 dropdown-toolbar（既有皮肤未被挤掉）'
  );
  ok(
    /const iconSize = computed\(\(\) => \(props\.variant === 'icon-btn' \? 16 : 15\)\)/.test(ddScript),
    'iconSize computed：icon-btn → 16，其余 → 15'
  );
  ok(
    /const caretSize = computed\(\(\) => \(props\.variant === 'icon-btn' \? 12 : 14\)\)/.test(ddScript),
    'caretSize computed：icon-btn → 12，其余 → 14'
  );
  ok(
    /<Icon v-if="resolvedIcon" :name="resolvedIcon" :size="iconSize"/.test(ddTpl),
    '模板主图标绑定 :size="iconSize"（不写死数字）'
  );
  ok(/name="chevron-down" :size="caretSize"/.test(ddTpl), '模板折叠箭头绑定 :size="caretSize"（不写死数字）');
  // 12px 箭头是几何硬约束：32 - 边框2 - padding0 = 30px 内容区，16+12+1 间隙=29 才装得下
  const trig = block(ddCss, '.dropdown-icon-btn .dd-trigger');
  ok(trig && prop(trig, 'gap') === '1px', 'icon 与箭头间隙 1px（16+12+1=29 ≤ 30 内容区；14px 箭头会溢出被裁）');
}

/* ============ 3. 对齐基准 .btn.btn-icon 未被挪动 ============ */
section('3. base.css 的对齐基准未被挪动');
{
  const bi = block(stripCssComments(baseCss), '.btn.btn-icon');
  ok(!!bi, '.btn.btn-icon 规则存在');
  ok(bi && prop(bi, 'width') === '32px', '.btn.btn-icon 宽仍为 32px');
  ok(bi && prop(bi, 'height') === '32px', '.btn.btn-icon 高仍为 32px');
  ok(bi && prop(bi, 'padding') === '0', '.btn.btn-icon 仍 padding:0');
}

/* ============ 4. PostView 保存组接线 ============ */
section('4. PostView 保存组接线');
{
  // 保存组整段（从 .save-group 开标签到其闭合）里必须只有一个 Dropdown + 一个 button
  const g = /<div class="save-group">([\s\S]*?)<\/div>\s*<\/div>/.exec(pvTpl);
  ok(!!g, '保存组片段可提取');
  const seg = g ? g[1] : '';
  ok(
    (seg.match(/<Dropdown/g) || []).length === 1 && (seg.match(/<button/g) || []).length === 1,
    '保存组只有一个下拉 + 一个按钮（实得 ' +
      (seg.match(/<Dropdown/g) || []).length +
      ' 下拉 / ' +
      (seg.match(/<button/g) || []).length +
      ' 按钮）'
  );
  ok(
    /<Dropdown[\s\S]{0,220}variant="icon-btn"[\s\S]{0,220}icon="save-as"/.test(seg),
    '「另存为」用 icon-btn 皮肤 + save-as 图标'
  );
  ok(!/variant="toolbar"/.test(seg), '「另存为」不再误用 toolbar 皮肤');
  ok(
    /class="btn btn-primary btn-icon"/.test(seg),
    '紧邻的「保存」仍是 .btn.btn-primary.btn-icon（主/次层级由皮肤区分，不用改下拉配色）'
  );
  ok(
    /class="save-as"/.test(seg) && /class="save-group"/.test(pvTpl),
    'save-group / save-as 类名仍在（.save-group 的 inline-flex + gap:4 排布不变）'
  );
  // 编辑器工具栏的三处 toolbar 用法不受影响（回归保护：不许为了修保存组把工具栏皮肤删了）
  const tbCount = (pvTpl.match(/variant="toolbar"/g) || []).length;
  ok(tbCount === 2, '编辑器工具栏仍保留 2 处 variant="toolbar"（对齐/字号，实得 ' + tbCount + '）');
}

/* ============ 5. toolbar 皮肤未被顺手改坏 ============ */
section('5. toolbar 皮肤回归保护');
{
  const tbTrig = block(ddCss, '.dropdown-toolbar .dd-trigger');
  ok(!!tbTrig, '.dropdown-toolbar .dd-trigger 规则仍存在');
  ok(tbTrig && prop(tbTrig, 'height') === '28px', 'toolbar 触发器仍为 28px（编辑器 .tb-btn 同尺寸）');
  ok(tbTrig && prop(tbTrig, 'padding') === '0 22px 0 8px', 'toolbar padding 未被改动');
  const iconMode = block(ddCss, '.dropdown-toolbar:has(.dd-icon) .dd-trigger');
  ok(!!iconMode, 'toolbar 纯图标模式规则仍存在（gap 2px + padding 0 4px + 居中）');
  ok(iconMode && prop(iconMode, 'gap') === '2px', 'toolbar 图标模式 gap 仍为 2px');
}

done();
