/**
 * 首页登录卡改版 — 尺寸探针（走 HTTP，避免 file:// 下 ESM 被 CORS 拦）
 * 1) 从 vite 服务取页面，注入测量脚本，写到项目静态目录
 * 2) headless Chrome 打开 http://127.0.0.1:5199/<探针页>，把结果写进 title
 * 3) --dump-dom 抓回解析
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || 5199;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PROBE = 'probe-login.html';
const PROBE_FS = path.join(process.cwd(), PROBE);
const SHOT_DIR = '/tmp/b137';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const SIZES = [
  { w: 1280, h: 900, tag: '1280' },
  { w: 1440, h: 900, tag: '1440' },
  { w: 1920, h: 1080, tag: '1920' }
];

const MEASURE_JS = `
<script>
window.addEventListener('load', () => setTimeout(() => {
  const q = s => document.querySelector(s);
  const bx = e => e ? e.getBoundingClientRect() : null;
  const cols = q('.home-cols');
  const col1 = cols ? cols.children[0] : null;
  const kids = col1 ? Array.from(col1.children) : [];
  const cards = Array.from(document.querySelectorAll('.dash > .panel')).map(p => ({
    cls: p.className.replace('panel ',''),
    w: Math.round(p.getBoundingClientRect().width),
    left: Math.round(p.getBoundingClientRect().left)
  }));
  const lefts = [...new Set(cards.map(c => c.left))];
  const out = {
    title: q('.section-title') ? q('.section-title').textContent.trim() : null,
    lsW: bx(q('.ls-card')) ? Math.round(bx(q('.ls-card')).width) : null,
    lsH: bx(q('.ls-card')) ? Math.round(bx(q('.ls-card')).height) : null,
    colKids: kids.map(k => ({ cls: (k.className||'').trim(), w: Math.round(k.getBoundingClientRect().width) })),
    homeColsCss: cols ? getComputedStyle(cols).gridTemplateColumns : null,
    hasTrend: !!q('.b7-bars'),
    lsecCount: document.querySelectorAll('.lsec').length,
    lrowTotal: document.querySelectorAll('.lsec .lrow').length,
    metrics: Array.from(document.querySelectorAll('.lmetric')).map(x => x.textContent.trim().replace(/\\s+/g,' ')),
    cards, colCount: lefts.length,
    viewport: window.innerWidth,
    cardCount: document.querySelectorAll('.dash > .panel').length
  };
  document.title = 'MEASURE:' + JSON.stringify(out);
}, 1500));
</script>
`;

let ok = true;
const raw = execFileSync('curl', ['-s', `${ORIGIN}/preview-login.html`], { encoding: 'utf8', maxBuffer: 1 << 26 });
fs.writeFileSync(PROBE_FS, raw.replace('</body>', MEASURE_JS + '</body>'));

try {
  for (const s of SIZES) {
    let dom = '';
    try {
      dom = execFileSync(
        'google-chrome',
        [
          '--headless',
          '--no-sandbox',
          '--disable-gpu',
          '--hide-scrollbars',
          `--window-size=${s.w},${s.h}`,
          '--virtual-time-budget=9000',
          `--screenshot=${SHOT_DIR}/home-${s.tag}.png`,
          '--dump-dom',
          `${ORIGIN}/${PROBE}`
        ],
        { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }
      );
    } catch (e) {
      dom = e.stdout || '';
    }

    const mm = dom.match(/MEASURE:(\{.*?\})<\/title>/s);
    if (!mm) {
      console.log(`\n=== ${s.tag}px ===\n  ❌ 未取到测量数据`);
      ok = false;
      continue;
    }
    const m = JSON.parse(
      mm[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
    );

    const nextW = m.colKids[1] ? m.colKids[1].w : null;
    const sameW = nextW === null || Math.abs(m.lsW - nextW) <= 1;
    if (!sameW) ok = false;

    console.log(`\n=== 视口 ${m.viewport}px ===`);
    console.log(`  标题              : ${m.title}`);
    console.log(`  home-cols 列定义  : ${m.homeColsCss}`);
    console.log(`  登录卡宽 × 高     : ${m.lsW}px × ${m.lsH}px`);
    console.log(`  同列下一卡宽      : ${nextW === null ? '（未找到）' : nextW + 'px'}`);
    console.log(`  与同列卡等宽      : ${sameW ? '✅ 是' : '❌ 差 ' + Math.abs(m.lsW - nextW) + 'px'}`);
    console.log(`  TrendChart 已移除 : ${m.hasTrend ? '❌ 否' : '✅ 是'}`);
    console.log(`  分区数 / 名单行数 : ${m.lsecCount} / ${m.lrowTotal}`);
    console.log(`  四指标            : ${m.metrics.join('  |  ')}`);
    console.log(`  .dash ${m.cardCount} 张卡 / ${m.colCount} 列：`);
    m.cards.forEach(c => console.log(`      ${String(c.cls).padEnd(9)} left=${String(c.left).padStart(4)}  w=${c.w}`));
    const uniq = [...new Set(m.cards.map(c => c.w))].sort((a, b) => b - a);
    console.log(`  卡宽唯一值        : ${uniq.join(', ')}`);
    console.log(`  截图              : ${SHOT_DIR}/home-${s.tag}.png`);
  }
} finally {
  try {
    fs.unlinkSync(PROBE_FS);
  } catch (e) {}
}

console.log(`\n${ok ? '✅ 全部尺寸：登录卡与同列卡片等宽' : '❌ 存在不等宽尺寸'}`);
process.exit(ok ? 0 : 1);
