/**
 * 实测卡片间距（可选脚本，不接入 npm test）。
 *
 * 【为什么静态断言不够】
 *   settings-card-gap.test.mjs 只能证明「写法符合预期」—— 它读源码文本。
 *   而本项目在这个问题上**已经吃过一次亏**：上一轮用 `display: contents` 想消除包装层，
 *   静态看完全合理，注释也写得头头是道，实际三段间距全是 0。
 *   所以必须有一份「拿真实产物 CSS、在真实浏览器里量出来的数字」作为最终依据。
 *
 * 【怎么跑】
 *   npm run build && node scripts/check-card-gap.mjs
 *   退出码 0 = 三段间距均等于 --card-gap；非 0 = 有偏差，会打印实测值。
 *
 * 【为什么不在 npm test 里】
 *   npm test 要求无浏览器、纯 Node 环境（CI 上不一定有 Chromium）。
 *   本脚本依赖本机 Chromium，属「人工复核工具」，改完间距相关样式跑一次即可。
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

// 只抽与卡片/间距相关的规则：整份 CSS 里 .main 的 padding、主题变量会干扰测量
const picked =
  css
    .split('}')
    .filter(r => /\.card-stack|\.card\b/.test(r.split('{')[0] || ''))
    .join('}') + '}';

// 期望值从真实 CSS 里读，而不是在脚本里写 16 —— 否则改了 --card-gap 这里还会假绿
const gapDecl = /\.card-stack\s*\{[^}]*--card-gap:\s*(\d+)px/.exec(css);
const expected = gapDecl ? Number(gapDecl[1]) : 16;

const page = `<!doctype html><html><head><meta charset="utf-8"><style>
${picked}
body{margin:0;padding:20px}
</style></head><body>
<!-- 与设置页「显示」分区渲染后的结构一致：四张卡全是 .card-stack 的直接子元素 -->
<div class="card-stack">
  <div class="card sec" id="theme">主题</div>
  <div class="card sec" id="c1">每页条数</div>
  <div class="card sec" id="c2">界面字体</div>
  <div class="card sec" id="c3">界面语言</div>
</div>
<script>
function r(id){const e=document.getElementById(id).getBoundingClientRect();return {t:e.top,b:e.bottom}}
const o={};['theme','c1','c2','c3'].forEach(k=>o[k]=r(k));
document.title=JSON.stringify({g1:Math.round(o.c1.t-o.theme.b),g2:Math.round(o.c2.t-o.c1.b),g3:Math.round(o.c3.t-o.c2.b)});
</script></body></html>`;

const tmp = path.join(os.tmpdir(), `archbox-card-gap-${Date.now()}.html`);
writeFileSync(tmp, page);

const dom = execFileSync(
  bin,
  ['--headless', '--disable-gpu', '--no-sandbox', '--window-size=1200,900', '--dump-dom', `file://${tmp}`],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
);
const m = /<title>(\{.*?\})<\/title>/.exec(dom);
if (!m) {
  console.error('✗ 没能读到测量结果（Chromium 输出异常）');
  process.exit(1);
}
const g = JSON.parse(m[1]);

const rows = [
  ['主题 → 每页条数', g.g1],
  ['每页条数 → 界面字体', g.g2],
  ['界面字体 → 界面语言', g.g3]
];
let bad = 0;
for (const [name, v] of rows) {
  const okv = v === expected;
  if (!okv) bad++;
  console.log(`${okv ? '✓' : '✗'} ${name}：实测 ${v}px（期望 ${expected}px）`);
}
console.log(
  bad
    ? `\n✗ ${bad} 段间距不符 —— 检查是否又给卡片加了 wrapper（见 settings-card-gap.test.mjs）`
    : '\n✓ 三段间距全部正确'
);
process.exit(bad ? 1 : 0);
