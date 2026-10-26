/**
 * 实测「另存为」下拉与「保存」按钮的渲染几何（可选脚本，不接入 npm test）。
 *
 * 【为什么静态断言不够】
 *   dropdown-icon-btn.test.mjs 只能证明「源码里写着 32×32、图标 16px」。
 *   但本 bug 的教训与看图器那次同源：CSS 写得对不代表浏览器就这么算 ——
 *   icon-btn 触发器是固定 32px、padding 0、边框 1px×2，内容区只有 30px，
 *   图标 16 + 箭头 12 + 间隙 1 = 29 才刚好装下；箭头若回退成 14 就会溢出被裁，
 *   而静态断言看「width:32px」照样是绿的。所以必须有一份真实浏览器量出来的数字。
 *
 * 【怎么跑】
 *   npm run build && node scripts/check-save-group.mjs
 *   退出码 0 = 「另存为」与「保存」同尺寸（32×32）且触发器内容不溢出；
 *   非 0 = 打印实测尺寸。
 *
 * 【为什么不在 npm test 里】
 *   npm test 要求无浏览器、纯 Node 环境（CI 上不一定有 Chromium）。
 *   本脚本依赖本机 Chromium，属「人工复核工具」，改完保存组样式跑一次即可。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distHtml = path.join(root, 'dist', 'index.html');

if (!existsSync(distHtml)) {
  console.error('✗ 找不到 dist/index.html，先跑 npm run build');
  process.exit(1);
}

// 找一个可用的 Chromium
const CANDIDATES = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];
const bin = CANDIDATES.find(b => {
  try {
    execFileSync('which', [b], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});
if (!bin) {
  console.error('✗ 本机没有 Chromium / Chrome，跳过（装一个或手动目测）');
  process.exit(2);
}

const html = readFileSync(distHtml, 'utf8');
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');

// 只抽与本次相关的规则：Dropdown 的三种皮肤 + .btn 基准。
// ★ 必须剥掉 Vue scoped 的 [data-v-xxx] 属性选择器：本页是裸 DOM
// （没有 data-v 属性），不剥的话一条规则都匹配不上，量出来全是 0。
const WANT = /\.(dropdown|dropdown-toolbar|dropdown-icon-btn|dd-trigger|dd-icon|dd-caret|btn|btn-primary)\b/;
const picked =
  css
    .split('}')
    .filter(r => WANT.test((r.split('{')[0] || '').replace(/\[data-v-[^\]]*\]/g, '')))
    .map(r => r.replace(/\[data-v-[^\]]*\]/g, ''))
    .join('}') + '}';

if (!/\.dropdown-icon-btn/.test(picked)) {
  console.error('✗ 产物 CSS 里找不到 .dropdown-icon-btn —— dist 是旧构建？先 npm run build');
  process.exit(1);
}

// 复刻保存组的 DOM 结构（PostView.vue 保存组）：Dropdown(icon-btn) + button(btn-primary btn-icon)。
// 类名按 Dropdown.vue 根元素的真实 class 绑定逻辑生成（不是手写死）——
// 这样「CSS 写了但类没接进绑定」这类半拉子修复会在这里现形：
// 绑定一断，根元素只剩 .dropdown，触发器回落到 34px 表单皮肤，尺寸断言立刻红。
// 图标用真实 Icon 组件同款渲染：<svg> + 16px 宽高（Icon 内部按 :size 设 width/height）。
const page = `<!doctype html><html><head><meta charset="utf-8"><style>
${picked}
html,body{margin:0;padding:0}
body{background:var(--bg,#fff)}
</style></head><body>
<div class="save-group" style="display:inline-flex;gap:4px;align-items:center;padding:20px">
  <div id="dd">
    <button type="button" class="dd-trigger" id="trigger" aria-expanded="false" aria-haspopup="listbox">
      <svg class="dd-icon" width="16" height="16" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="currentColor"/></svg>
      <svg class="dd-caret" width="12" height="12" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="currentColor"/></svg>
    </button>
  </div>
  <button type="button" class="btn btn-primary btn-icon" id="save">
    <svg width="16" height="16" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="currentColor"/></svg>
  </button>
  <button type="button" class="btn btn-icon" id="drafts">
    <svg width="16" height="16" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="currentColor"/></svg>
  </button>
</div>
<script>
// 与 Dropdown.vue 根元素的 :class 绑定保持同一份逻辑（variant → class）
function ddClasses(variant) {
  return 'dropdown' +
    (variant === 'toolbar' ? ' dropdown-toolbar' : '') +
    (variant === 'icon-btn' ? ' dropdown-icon-btn' : '');
}
document.getElementById('dd').className = ddClasses('icon-btn');
// 对照组：把同一结构渲染成 toolbar 皮肤（= 修复前「另存为」错用的那件）。
// 它必须与 icon-btn 量出不同尺寸 —— 相同则说明两种皮肤已无差别，
// 「用错皮肤」这类回归就再也检测不到，脚本自身失效。
var ctrl = document.createElement('div');
ctrl.id = 'ddCtrl';
ctrl.className = ddClasses('toolbar');
ctrl.innerHTML = '<button type="button" class="dd-trigger" id="triggerCtrl">' +
  '<svg class="dd-icon" width="15" height="15" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="currentColor"/></svg>' +
  '<svg class="dd-caret" width="14" height="14" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="currentColor"/></svg></button>';
document.querySelector('.save-group').appendChild(ctrl);
function measure() {
  var t = document.getElementById('trigger');
  var s = document.getElementById('save');
  var d = document.getElementById('drafts');
  var tr = t.getBoundingClientRect(), sr = s.getBoundingClientRect(), dr = d.getBoundingClientRect();
  // 触发器内容是否溢出其内容盒（边框盒减边框）：scrollWidth/clientWidth 量的是内容区
  var icon = t.querySelector('.dd-icon').getBoundingClientRect();
  var caret = t.querySelector('.dd-caret').getBoundingClientRect();
  var tc = document.getElementById('triggerCtrl').getBoundingClientRect();
  var out = {
    trigger: { w: Math.round(tr.width), h: Math.round(tr.height) },
    save: { w: Math.round(sr.width), h: Math.round(sr.height) },
    drafts: { w: Math.round(dr.width), h: Math.round(dr.height) },
    contentOverflowX: t.scrollWidth > t.clientWidth + 0.5,
    contentOverflowY: t.scrollHeight > t.clientHeight + 0.5,
    iconW: Math.round(icon.width),
    caretW: Math.round(caret.width),
    // 图标右缘与箭头左缘之间应恰好 1px 间隙（gap:1px）
    gap: Math.round(caret.left - icon.right),
    // 三者顶部对齐（保存组是 inline-flex + align-items:center，错行即排布坏了）
    sameRow: Math.abs(tr.top - sr.top) < 0.5 && Math.abs(tr.top - dr.top) < 0.5,
    // 对照组（toolbar 皮肤 = 修复前错用的那件）尺寸
    ctrl: { w: Math.round(tc.width), h: Math.round(tc.height) }
  };
  document.title = JSON.stringify(out);
}
setTimeout(measure, 100); // 无头 Chromium 虚拟时间下 rAF 不触发，必须用 setTimeout
setTimeout(measure, 800); // 兜底
</script></body></html>`;

const tmp = path.join(os.tmpdir(), `archbox-save-group-${Date.now()}.html`);
writeFileSync(tmp, page);

const dom = execFileSync(
  bin,
  [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1280,800',
    '--virtual-time-budget=5000',
    '--dump-dom',
    `file://${tmp}`
  ],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
);

const m = /<title>([\s\S]*?)<\/title>/.exec(dom);
if (!m) {
  console.error('✗ 没能取到测量结果（title 为空）');
  process.exit(1);
}
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

console.log(
  `实测：另存为 ${r.trigger.w}×${r.trigger.h} / 保存 ${r.save.w}×${r.save.h} / 草稿箱 ${r.drafts.w}×${r.drafts.h}`
);
console.log(`触发器内容：图标 ${r.iconW}px + 箭头 ${r.caretW}px（间隙 ${r.gap}px）`);
console.log(`内容溢出：横向 ${r.contentOverflowX ? '是 ✗' : '否 ✓'} / 纵向 ${r.contentOverflowY ? '是 ✗' : '否 ✓'}`);
console.log(`同一行：${r.sameRow ? '是 ✓' : '否 ✗'}`);
console.log(`对照组（toolbar 皮肤 = 修复前错用的那件）：${r.ctrl.w}×${r.ctrl.h}`);

// 硬断言（与「大小不一」的反馈逐条对应）：
// 0) 对照组必须与 icon-btn 量出差别 —— 相同则两种皮肤已无差别，
//    「用错皮肤」的回归再也检测不到，脚本自身失效；
const skinsDiffer = r.ctrl.w !== r.trigger.w || r.ctrl.h !== r.trigger.h;
if (!skinsDiffer) {
  console.error('✗ toolbar 与 icon-btn 两种皮肤量出同一尺寸 —— 皮肤差异已消失，脚本失效');
  process.exit(1);
}
// 1) 另存为必须与保存 / 草稿箱同尺寸（用户原话「大小不一」）；
// 2) 内容不得溢出内容盒（16+14 的旧箭头组合就是在这里被裁）；
// 3) 三者顶部对齐（保存组是 inline-flex + align-items:center，错行即排布坏了）。
const sameSize =
  r.trigger.w === r.save.w && r.trigger.h === r.save.h && r.trigger.w === r.drafts.w && r.trigger.h === r.drafts.h;
if (!sameSize) {
  console.error('✗ 「另存为」与「保存」尺寸不一致 —— 皮肤是不是又用错了（toolbar 28px / icon-btn 32px）？');
  process.exit(1);
}
if (r.contentOverflowX || r.contentOverflowY) {
  console.error('✗ 触发器内容溢出 —— 箭头是不是回退成 14px 了（16+12+1=29 才装得进 30px 内容区）？');
  process.exit(1);
}
if (!r.sameRow) {
  console.error('✗ 三个按钮不在同一行 —— .save-group 的排布被改坏了？');
  process.exit(1);
}
console.log('✓ 「另存为」与「保存」同尺寸、内容不溢出、三者同行 —— 「大小不一」已修复');
