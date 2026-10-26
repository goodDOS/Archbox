/**
 * 实测图片查看器「适应窗口」（可选脚本，不接入 npm test）。
 *
 * 【为什么静态断言不够】
 *   image-lightbox-fit.test.mjs 只能证明「源码写法符合预期」。
 *   但这个 bug 的教训恰恰是：CSS 写得「看起来对」不代表浏览器也这么算 ——
 *   grid 下 max-height:100% 静默失效，源码里该写的都写了。
 *   所以必须有一份「拿真实产物 CSS、在真实浏览器里量出来的数字」作为最终依据。
 *
 * 【怎么跑】
 *   npm run build && node scripts/check-image-fit.mjs
 *   退出码 0 = fit 态图片完整装入舞台（无溢出）；非 0 = 打印实测尺寸。
 *
 * 【为什么不在 npm test 里】
 *   npm test 要求无浏览器、纯 Node 环境（CI 上不一定有 Chromium）。
 *   本脚本依赖本机 Chromium，属「人工复核工具」，改完看图器样式跑一次即可。
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

// 只抽与看图器相关的规则。★ 必须剥掉 Vue scoped 的 [data-v-xxx] 属性选择器：
// 本页是裸 DOM（没有 data-v 属性），不剥的话一条规则都匹配不上，量出来全是 0。
const picked =
  css
    .split('}')
    .filter(r => /\.iv-(wrap|bar|stage|img|mask)\b/.test((r.split('{')[0] || '').replace(/\[data-v-[^\]]*\]/g, '')))
    .map(r => r.replace(/\[data-v-[^\]]*\]/g, ''))
    .join('}') + '}';

if (!/\.iv-stage/.test(picked)) {
  console.error('✗ 产物 CSS 里找不到 .iv-stage —— dist 是旧构建？先 npm run build');
  process.exit(1);
}

// 2000×1200 的 SVG（比舞台大，才能暴露「fit 没生效」）；舞台窗口按 1280×800 视口推算。
const page = `<!doctype html><html><head><meta charset="utf-8"><style>
${picked}
html,body{margin:0;padding:0;width:100%;height:100%}
</style></head><body>
<div class="iv-mask" style="position:fixed;inset:0">
  <div class="iv-wrap">
    <div class="iv-bar"><span class="iv-info">2000 × 1200 · 适应窗口</span></div>
    <div class="iv-stage" id="stage">
      <img class="iv-img fitted" id="img" alt="t"
        src="data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2000' height='1200'%3E%3C/svg%3E" />
    </div>
  </div>
</div>
<script>
// 等图片解码完成（与真机上 load 后再量的时机一致）
var img = document.getElementById('img');
function measure() {
  var st = document.getElementById('stage');
  var ir = img.getBoundingClientRect(), sr = st.getBoundingClientRect();
  var out = {
    imgW: Math.round(ir.width), imgH: Math.round(ir.height),
    stageW: Math.round(sr.width), stageH: Math.round(sr.height),
    overflowsY: st.scrollHeight > st.clientHeight + 1,
    overflowsX: st.scrollWidth > st.clientWidth + 1
  };
  document.title = JSON.stringify(out);
}
if (img.complete) measure();
else img.addEventListener('load', function(){ setTimeout(measure, 50); });
setTimeout(measure, 500); // 兜底：load 事件万一没触发也出数
</script></body></html>`;

const tmp = path.join(os.tmpdir(), `archbox-image-fit-${Date.now()}.html`);
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

console.log(`实测：图片 ${r.imgW}×${r.imgH} / 舞台内容区 ${r.stageW}×${r.stageH}`);
console.log(`溢出：纵向 ${r.overflowsY ? '是 ✗' : '否 ✓'} / 横向 ${r.overflowsX ? '是 ✗' : '否 ✓'}`);

// Beta.324 的修复基线（同机同视口复现过）：2000×1200 的图在 1280×800 视口下
// 应收成约 1048×629 且无任何方向溢出。这里只硬断言「不溢出」，
// 具体像素留给日志人工核对（不同 DPI / 窗口尺寸下数值本就该变）。
if (r.overflowsX || r.overflowsY) {
  console.error('✗ fit 态图片超出舞台 —— 「适应窗口」等于没生效（.iv-stage 是不是被改回 grid 了？）');
  process.exit(1);
}
console.log('✓ fit 态完整装入舞台，「适应窗口」生效');
