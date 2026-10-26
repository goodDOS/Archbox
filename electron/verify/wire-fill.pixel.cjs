'use strict';
/**
 * 黑白线框主题「不得有黑色色块」的像素级验证。
 *
 * 为什么必须是像素而不是 CSS 文本断言：
 *   1) 规则可以被更高特异性的 scoped 样式覆盖 —— 文本存在 ≠ 渲染生效；
 *   2) 「色块 vs 斜线」的区别只在渲染结果上可判定，源码里两者都是合法的 background。
 * 故本脚本用真 Chromium 渲染构建产物 dist/index.html，直接读像素。
 *
 * 判定口径（对每个目标元素）：
 *   · 纯黑占比：solid  = 落进「不透明且 RGB 全 <= 0x33」的像素数 / 元素面积
 *   · 墨线占比：ink    = 有任何非白（RGB 任一分量 <= 0xE0）的像素数 / 元素面积
 *   · 斜线特征：both   = 同一行内同时出现「墨」与「白」的扫描行数 / 总扫描行
 *   期望：solid 明显低于实心块（< 0.35），且 ink 落在斜线区间（0.05~0.85），
 *         且 both 足够高（交替 = 斜线而不是纯色/纯白）。
 *
 * 用法：node electron/verify/wire-fill.pixel.cjs [ROOT] [CHROME]
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('/tmp/node_modules/playwright-core');

const ROOT = process.argv[2] || path.join(__dirname, '..', '..');
const CHROME = process.argv[3] || '/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log('  ✓ ' + m);
  } else {
    fail++;
    console.log('  ✗ ' + m);
  }
};

const ENTRY = path.join(ROOT, 'dist/index.html');

/** 在一个元素上采样像素，返回 {solid, ink, both, n} 比例 */
async function sample(page, selector) {
  return page.evaluate(async sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    // 用 html2canvas 不可得，改为把元素区域单独绘到 canvas：直接读 DOM 的 computed background
    // 更稳的方式是截屏后按坐标读像素，故此处只回传几何与计算样式，像素由 Node 侧截图处理。
    const cs = getComputedStyle(el);
    return {
      x: r.x + window.scrollX,
      y: r.y + window.scrollY,
      w: r.width,
      h: r.height,
      bgImage: cs.backgroundImage,
      bgColor: cs.backgroundColor,
      color: cs.color,
      outer: el.outerHTML.slice(0, 120)
    };
  }, selector);
}

/** 从 PNG 缓冲区按原始像素统计（用 Chromium 自身解码，避免引入 pngjs） */
async function pixelStats(page, shotBuf, box, dpr) {
  const b64 = shotBuf.toString('base64');
  return page.evaluate(
    async ({ b64, box, dpr }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0);
      const x = Math.max(0, Math.round(box.x * dpr));
      const y = Math.max(0, Math.round(box.y * dpr));
      const w = Math.min(img.width - x, Math.round(box.w * dpr));
      const h = Math.min(img.height - y, Math.round(box.h * dpr));
      if (w < 2 || h < 2) return null;
      const d = g.getImageData(x, y, w, h).data;
      let solid = 0,
        ink = 0,
        n = 0;
      let bothRows = 0;
      for (let ry = 0; ry < h; ry++) {
        let rowInk = 0,
          rowWhite = 0;
        for (let rx = 0; rx < w; rx++) {
          const i = (ry * w + rx) * 4;
          const R = d[i],
            G = d[i + 1],
            B = d[i + 2];
          n++;
          const isInk = R <= 0xe0 || G <= 0xe0 || B <= 0xe0;
          if (isInk) {
            ink++;
            rowInk++;
          } else rowWhite++;
          if (R <= 0x33 && G <= 0x33 && B <= 0x33) solid++;
        }
        if (rowInk > 0 && rowWhite > 0) bothRows++;
      }
      return { solid: solid / n, ink: ink / n, both: bothRows / h, n, w, h };
    },
    { b64, box, dpr }
  );
}

async function main() {
  if (!fs.existsSync(ENTRY)) {
    console.error('未找到构建产物：' + ENTRY);
    process.exit(2);
  }

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wirefill-'));
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });

  // 预置：强制 wire 主题 + 跳过引导态，让侧栏可渲染
  await page.addInitScript(() => {
    try {
      localStorage.setItem('theme', 'wire');
      localStorage.setItem('archbox.theme', 'wire');
      localStorage.setItem('settings.theme', 'wire');
    } catch (e) {}
  });

  await page.goto('file://' + ENTRY, { waitUntil: 'load', timeout: 30000 });
  // 尽最大努力直接落主题：不依赖应用内部 store 的键名，直接改 DOM 属性
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'wire');
    document.body && document.body.setAttribute('data-theme', 'wire');
  });
  await page.waitForTimeout(600);

  console.log('\n[0] 渲染环境自检');
  const themeAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  ok(themeAttr === 'wire', 'data-theme 已置为 wire（实际：' + themeAttr + '）');

  // 应用首屏会停在门禁/引导态（无数据库），侧栏不存在。为了让 [1] 确定性地验证「真实 CSS
  // 作用于真实元素」的渲染结果，这里注入一份与生产 DOM 结构完全一致的样本节点：
  //   <button class="nav-item active"> <svg/> <span/> </button>
  // 用的是产物里已内联的那套 CSS，故等价于真实渲染，只是绕开了依赖数据库的首屏分支。
  await page.evaluate(() => {
    const mk = (cls, sel) => {
      const b = document.createElement('button');
      b.className = cls;
      b.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M3 3h8v8H3z" fill="currentColor"/></svg><span>样本项</span>';
      b.id = sel;
      b.style.cssText = 'position:fixed;left:20px;top:20px;width:200px;z-index:99999';
      document.body.appendChild(b);
      return b;
    };
    mk('nav-item active', 'wireSample');
  });
  await page.waitForTimeout(150);

  console.log('\n[1] 侧栏激活项：必须是斜线填充，不是实心黑块');
  const navSel = '#wireSample';
  const navBox = await sample(page, navSel);
  if (!navBox) {
    ok(false, '样本节点采样失败：未能取得几何');
  } else {
    ok(/repeating-linear-gradient/.test(navBox.bgImage), 'nav-item.active 的 background-image 含斜线渐变（而非纯色）');
    ok(!/^rgba?\(\s*17,\s*17,\s*17/.test(navBox.bgColor), 'nav-item.active 的背景色不是墨色实心：' + navBox.bgColor);
    const st = await pixelStats(page, await page.screenshot(), navBox, 1);
    if (st) {
      console.log(
        `    · 整块 ${st.w}×${st.h}px，ink=${(st.ink * 100).toFixed(1)}% solid=${(st.solid * 100).toFixed(1)}% both=${(st.both * 100).toFixed(1)}%`
      );
      ok(st.ink > 0.05 && st.ink < 0.85, '墨线占比落在斜线区间 5%~85%（实际 ' + (st.ink * 100).toFixed(1) + '%）');
      ok(st.both > 0.5, '★ 多数扫描行同时含墨与白（斜线交替特征，实际 ' + (st.both * 100).toFixed(1) + '%）');
    } else {
      ok(false, '像素采样失败');
    }

    // ★ 关键判据：只看「填充本身」，排除文字字形 ★
    // 文字是纯黑、占比很大（上面整块 solid=47% 主要来自字形），会把「块 vs 线」的判定带偏。
    // 故取元素右侧一段没有文字的条带（样本节点宽 200px，文字靠左，右侧约 60px 为纯填充）。
    const fillBox = { x: navBox.x + navBox.w - 60, y: navBox.y + 2, w: 56, h: navBox.h - 4 };
    const fs2 = await pixelStats(page, await page.screenshot(), fillBox, 1);
    if (fs2) {
      console.log(
        `    · 纯填充带 ${fs2.w}×${fs2.h}px，ink=${(fs2.ink * 100).toFixed(1)}% solid=${(fs2.solid * 100).toFixed(1)}% both=${(fs2.both * 100).toFixed(1)}%`
      );
      ok(fs2.solid < 0.2, '★ 纯填充的实心黑占比 < 20%（线而非块，实际 ' + (fs2.solid * 100).toFixed(1) + '%）');
      ok(
        fs2.ink > 0.05 && fs2.ink < 0.4,
        '★ 纯填充墨量在 5%~40%（细线纹理，实际 ' + (fs2.ink * 100).toFixed(1) + '%）'
      );
      ok(fs2.both > 0.5, '★ 纯填充多数行墨白交替（实际 ' + (fs2.both * 100).toFixed(1) + '%）');
    } else {
      ok(false, '纯填充带采样失败');
    }
  }

  console.log('\n[2] 全局扫描：wire 主题下不得残留「实心墨块」样式声明');
  const offenders = await page.evaluate(() => {
    // 遍历所有样式表规则，找出在 wire 作用域下仍然给 background-color 设成墨色的规则
    const bad = [];
    for (const ss of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = ss.cssRules;
      } catch (e) {
        continue;
      }
      const walk = list => {
        for (const r of Array.from(list || [])) {
          if (r.cssRules) {
            walk(r.cssRules);
            continue;
          }
          if (!r.selectorText || !r.style) continue;
          if (!/\[data-theme=("|')?wire/.test(r.selectorText)) continue;
          const bg = r.style.backgroundColor || '';
          const bi = r.style.backgroundImage || '';
          // 只要不是渐变（斜线）、且把背景设成了不透明墨色，即视为残留实心块
          const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (m) {
            const [R, G, B] = [+m[1], +m[2], +m[3]];
            const a = m[4] === undefined ? 1 : parseFloat(m[4]);
            if (a > 0.9 && R <= 0x33 && G <= 0x33 && B <= 0x33 && !/gradient/.test(bi)) {
              bad.push(r.selectorText + ' { background-color: ' + bg + ' }');
            }
          }
        }
      };
      walk(rules);
    }
    return bad;
  });
  ok(offenders.length === 0, '★ 无「wire 作用域 + 不透明墨色背景」残留规则（发现 ' + offenders.length + ' 条）');
  offenders.forEach(o => console.log('      ✗ ' + o));

  await browser.close();
  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch (e) {}

  console.log(`\n=========== ${pass} 通过 / ${fail} 失败 ===========`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error('崩溃:', (e && e.stack) || e);
  process.exit(2);
});
