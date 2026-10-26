/**
 * 三套主题下测量登录卡样式（HTTP 服务 + 注入探针）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = 'http://127.0.0.1:5199';
const PROBE = 'probe-theme.html';
const PROBE_FS = path.join(process.cwd(), PROBE);

const JS = `
<script>
window.addEventListener('load', () => setTimeout(() => {
  const q = s => document.querySelector(s);
  const cs = e => e ? getComputedStyle(e) : null;
  const card = cs(q('.ls-card'));
  const name = cs(q('.lname'));
  const no = cs(q('.lno'));
  const mb = cs(q('.lmetric b'));
  const mspan = cs(q('.lmetric span'));
  const warn = cs(q('.lmetric b.warn'));
  const sec = cs(q('.lsec'));
  const head = cs(q('.lsec-head'));
  const out = {
    theme: document.documentElement.getAttribute('data-theme'),
    ok: !!q('.ls-card'),
    cardBg: card && card.backgroundColor,
    cardBorder: card && (card.borderTopWidth + ' ' + card.borderTopStyle + ' ' + card.borderTopColor),
    radius: card && card.borderRadius,
    nameColor: name && name.color,
    noColor: no && no.color,
    metricColor: mb && mb.color,
    metricSize: mb && mb.fontSize,
    metricWeight: mb && mb.fontWeight,
    labelColor: mspan && mspan.color,
    labelSize: mspan && mspan.fontSize,
    warnColor: warn && warn.color,
    secBorderTop: sec && (sec.borderTopWidth + ' ' + sec.borderTopStyle + ' ' + sec.borderTopColor),
    headColor: head && head.color,
    rows: document.querySelectorAll('.lsec .lrow').length,
    // 斜线填充检测：wire 主题会给 .cat-fill/.b7-bar 加背景
    nameBgImage: name && name.backgroundImage
  };
  document.title = 'T:' + JSON.stringify(out);
}, 1600));
</script>
`;

let allOk = true;
for (const th of ['light', 'dark', 'wire']) {
  // 注意：探针页是 curl 抓取后另存再访问的，query string 不会保留，
  // 因此把主题写进 <html data-theme> 由服务端 HTML 直接带过去。
  const raw = execFileSync('curl', ['-s', `${ORIGIN}/preview-login.html?theme=${th}`], {
    encoding: 'utf8',
    maxBuffer: 1 << 26
  });
  // 让 preview 脚本知道要切到哪个主题：在注入前先把 theme 塞进一个 window 变量
  const bootTheme = `<script>window.__PREVIEW_THEME__=${JSON.stringify(th)}</script>`;
  fs.writeFileSync(PROBE_FS, raw.replace('<head>', '<head>' + bootTheme).replace('</body>', JS + '</body>'));
  let dom;
  try {
    dom = execFileSync(
      'google-chrome',
      [
        '--headless',
        '--no-sandbox',
        '--disable-gpu',
        '--hide-scrollbars',
        '--window-size=1440,900',
        '--virtual-time-budget=9000',
        `--screenshot=/tmp/b137/login-${th}.png`,
        '--dump-dom',
        `${ORIGIN}/${PROBE}`
      ],
      { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch (e) {
    dom = e.stdout || '';
  }

  const mm = dom.match(/T:(\{.*?\})<\/title>/s);
  if (!mm) {
    console.log(`[${th}] ❌ 未取到数据`);
    allOk = false;
    continue;
  }
  const m = JSON.parse(
    mm[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
  );

  const okTheme = m.ok && m.rows === 7;
  if (!okTheme) allOk = false;
  console.log(`\n[${th}] data-theme=${m.theme}  渲染=${m.ok ? '✅' : '❌'}  名单行=${m.rows}`);
  console.log(`  卡片背景    : ${m.cardBg}`);
  console.log(`  卡片边框    : ${m.cardBorder}  圆角=${m.radius}`);
  console.log(`  指标数字    : ${m.metricColor} / ${m.metricSize} / w=${m.metricWeight}`);
  console.log(`  指标标签    : ${m.labelColor} / ${m.labelSize}`);
  console.log(`  名单姓名    : ${m.nameColor}`);
  console.log(`  排行序号    : ${m.noColor}`);
  console.log(`  失败警戒色  : ${m.warnColor}`);
  console.log(`  分区上边框  : ${m.secBorderTop}`);
  console.log(`  分区标题色  : ${m.headColor}`);
  console.log(`  姓名背景图  : ${m.nameBgImage === 'none' ? 'none ✅ 未被斜线填充污染' : '⚠️ ' + m.nameBgImage}`);
  console.log(`  截图        : /tmp/b137/login-${th}.png`);
}
try {
  fs.unlinkSync(PROBE_FS);
} catch (e) {}

console.log(`\n${allOk ? '✅ 三套主题下登录卡均正常渲染' : '❌ 存在异常主题'}`);
process.exit(allOk ? 0 : 1);
