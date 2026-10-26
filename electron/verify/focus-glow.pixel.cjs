'use strict';
/**
 * 输入框「选中辉光被裁切」的像素级验证（Beta.218）。
 *
 * 用户报障（截图）：拷贝到本机 → 新建拷贝大区，点进「大区代码」输入框后，
 *   聚焦辉光在**左右两侧被切平**，只剩上下两道弧线，看着像描边被截断。
 *
 * 根因：
 *   `.input:focus { box-shadow: 0 0 0 3px var(--accent-weak) }` —— 辉光是**向外扩**的。
 *   而弹窗链路上有两层 `overflow: hidden`：
 *     · `.modal      { overflow: hidden }`（圆角裁剪）
 *     · `.modal-body { overflow: hidden }`（承担滚动职责）
 *   输入框所在的行容器（如 `.row-2` 的两栏 grid）与 `.modal-body` 同宽，
 *   于是左右各 3px 辉光正好落在裁剪边界外，被切掉；上下因为行容器有间距不受影响。
 *   —— 现象就是「上下有辉光、左右是直角」。
 *
 * 为什么必须像素级验证：
 *   1) `box-shadow` 被父级 `overflow:hidden` 裁切，**不影响任何 computed style**——
 *      `.input:focus` 的 box-shadow 值照样读得到，CSS 文本断言一定全绿；
 *   2) 这是**渲染结果**问题，只有真截图看边界像素才能判定。
 *
 * 判定口径（对每个被聚焦的输入框）：
 *   取输入框 bounding box，向外扩 PAD 像素形成一个"辉光带"，逐边统计：
 *     该边上是否存在「既非白底、也非输入框自身边框色」的过渡像素（即辉光）。
 *   四边都应该有辉光。任一边为 0 → 该边被裁切。
 *
 * 用法：node electron/verify/focus-glow.pixel.cjs [ROOT] [CHROME]
 */
const path = require('path');
const fs = require('fs');
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

/** 与生产同形的测试页：直接内联四个输入框，复刻 CopyTargetDialog 的 row-2 结构。
 *  ★ 为什么要复刻结构而不是直接打开弹窗 ★
 *    弹窗需要走登录 + 导航 + 点开文档 + 点拷贝，链路长且脆弱。
 *    辉光裁切是**纯 CSS 结构问题**（row-2 + modal-body + overflow:hidden），
 *    用一个最小同构页就能稳定复现；同时在 [4] 组里对真实产物做源码契约断言兜底。
 *    这样既稳定又真正驱动渲染管线（而不是抄一份 CSS 到 Node 里算）。 */
const PAGE = `<!DOCTYPE html>
<html data-theme="light"><head><meta charset="utf-8">
<style>__CSS__</style></head>
<body>
<div class="modal-mask">
  <div class="modal" style="max-width:520px">
    <div class="modal-body" data-v-test>
      <p class="sub">复刻 CopyTargetDialog 的「新建拷贝大区」区段</p>
      <div class="row-2" data-v-test>
        <div data-v-test>
          <label class="field-label">大区名称</label>
          <input class="input" id="a" value="共享拷贝" />
        </div>
        <div data-v-test>
          <label class="field-label">大区代码（可留空）</label>
          <input class="input" id="b" value="LAN" />
        </div>
      </div>
      <div class="row-2" style="margin-top: 12px" data-v-test>
        <div data-v-test>
          <label class="field-label">分类名称（可留空）</label>
          <input class="input" id="c" value="借阅中" />
        </div>
        <div data-v-test>
          <label class="field-label">分类代码（可留空）</label>
          <input class="input" id="d" value="LAN" />
        </div>
      </div>
      <div class="modal-foot"><button class="btn btn-primary">确认拷贝</button></div>
    </div>
  </div>
</div>
</body></html>`;

/**
 * 取元素四边外侧的辉光强度。
 * 做法：对每条边，取该边正中外侧 PAD 像素的窄条，逐像素统计「非背景色」的像素数。
 * 背景色取 modal 的 backgroundColor（辉光以外的区域）。
 */
async function glowSides(page, sel, pad) {
  const box = await page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, sel);
  if (!box) return null;

  const shot = await page.screenshot({
    clip: {
      x: Math.max(0, box.x - pad - 2),
      y: Math.max(0, box.y - pad - 2),
      width: box.w + (pad + 2) * 2,
      height: box.h + (pad + 2) * 2
    }
  });

  // 交给 Chromium 解码 PNG，避免在 Node 侧引入 pngjs
  return page.evaluate(
    async ({ b64, box, pad, ox, oy }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, img.width, img.height).data;
      const dpr = img.width / (box.w + (pad + 2) * 2);
      const at = (px, py) => {
        const x = Math.round(px * dpr),
          y = Math.round(py * dpr);
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) return [0, 0, 0, 0];
        const i = (y * img.width + x) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
      };
      // 输入框在裁剪图中的坐标
      const bx = box.x - ox,
        by = box.y - oy;
      // 「辉光」判定：像素与输入框边框色/白底都不同，且有一定不透明度
      // 取输入框内部一点作为底色参照
      const inner = at(bx + box.w / 2, by + box.h / 2);
      const isGlow = p => {
        const [r, gg, b, a] = p;
        if (a < 10) return false;
        // 与输入框内部底色差异明显 → 视为非输入框内容
        const d = Math.abs(r - inner[0]) + Math.abs(gg - inner[1]) + Math.abs(b - inner[2]);
        return d > 30;
      };
      const scanSide = name => {
        let hits = 0,
          total = 0;
        const steps = 24;
        for (let i = 0; i <= steps; i++) {
          let px, py;
          if (name === 'left') {
            px = bx - pad / 2;
            py = by + (box.h * i) / steps;
          }
          if (name === 'right') {
            px = bx + box.w + pad / 2;
            py = by + (box.h * i) / steps;
          }
          if (name === 'top') {
            px = bx + (box.w * i) / steps;
            py = by - pad / 2;
          }
          if (name === 'bottom') {
            px = bx + (box.w * i) / steps;
            py = by + box.h + pad / 2;
          }
          total++;
          if (isGlow(at(px, py))) hits++;
        }
        return total ? hits / total : 0;
      };
      return { left: scanSide('left'), right: scanSide('right'), top: scanSide('top'), bottom: scanSide('bottom') };
    },
    {
      b64: shot.toString('base64'),
      box,
      pad,
      ox: Math.max(0, box.x - pad - 2),
      oy: Math.max(0, box.y - pad - 2)
    }
  );
}

async function main() {
  const srcStyles = path.join(ROOT, 'src/styles');
  const hasSrc = fs.existsSync(srcStyles) && fs.existsSync(path.join(ROOT, 'src/components/CopyTargetDialog.vue'));
  const builtPath = path.join(ROOT, 'dist/index.html');

  // ★ 必须加载全部四张样式表，顺序与 src/main.js 的引入顺序一致 ★
  //   初版只拼了 base + components，漏掉 themes.css —— 而 --accent-weak 定义在 themes.css 里。
  //   CSS 变量取不到值时 `box-shadow: 0 0 0 3px var(--accent-weak)` 整条声明失效，
  //   computed 变成 none → 本用例会「假失败」：明明是测试自己的加载不全，却报成产品有 bug。
  //   这类问题会把人往错误方向带很远，务必保持与真实入口一致的加载集合。
  //
  // ★ 指向产物运行时（生产包按 files 白名单不含 src/）改从 dist/index.html 里取 CSS ★
  //   dist 是单文件内联产物，样式全在 <style> 里，直接抽出来即可 ——
  //   这样产物模式测的是**真正打包进去的样式**，比读源码更有说服力。
  let globalCss;
  let scopedCss = '';
  if (hasSrc) {
    globalCss = ['base', 'components', 'themes', 'bars']
      .map(f => fs.readFileSync(path.join(srcStyles, f + '.css'), 'utf8'))
      .join('\n');
    // ★ .row-2 是组件 scoped 样式，不在全局表里 ★
    //   必须一并注入，否则测试页的 .row-2 是 display:block（两栏塌成一列），
    //   [4] 组的布局断言就失去意义 —— 初版正是漏了它才误判「栅格被破坏」。
    //   这里把 scoped 规则统一挂到 [data-v-test] 上，模拟编译产物。
    const vue = fs.readFileSync(path.join(ROOT, 'src/components/CopyTargetDialog.vue'), 'utf8');
    const m = vue.match(/<style scoped>([\s\S]*?)<\/style>/);
    if (m) {
      scopedCss = m[1].replace(/(^|\})\s*([^{}@]+)\{/g, (full, brace, sel) => {
        if (/^\s*@/.test(sel)) return full;
        const s = sel
          .split(',')
          .map(x => x.trim() + '[data-v-test]')
          .join(',');
        return brace + s + '{';
      });
    }
  } else if (fs.existsSync(builtPath)) {
    // 产物模式：抽出全部内联样式，并把编译后的 [data-v-xxx] 属性选择器改写成 [data-v-test]，
    // 使测试页的 data-v-test 标记能命中同一批规则。
    const built = fs.readFileSync(builtPath, 'utf8');
    const styles = [...built.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x => x[1]).join('\n');
    globalCss = styles.replace(/\[data-v-[0-9a-f]+\]/g, '[data-v-test]');
    console.log('    · 未发现 src/（指向产物运行），改从 dist/index.html 抽取已打包样式');
  } else {
    throw new Error('既没有 src/styles，也没有 dist/index.html，无法取得样式');
  }

  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 760, height: 620 }, deviceScaleFactor: 1 });
  await page.setContent(PAGE.replace('__CSS__', globalCss + '\n' + scopedCss));
  await page.waitForTimeout(150);

  // 自检：辉光样式本身必须真的生效（否则后面所有像素断言都无意义）
  await page.focus('#b');
  await page.waitForTimeout(200);
  const selfCheck = await page.evaluate(() => {
    const el = document.querySelector('#b');
    const cs = getComputedStyle(el);
    return { bs: cs.boxShadow, focus: el.matches(':focus') };
  });
  // 取「扩散半径」= 第 3 个长度值（box-shadow: <offsetX> <offsetY> <blur> [spread] [color]）
  // 注意不能取第一个 match：`rgb(234, 240, 255) 0px 0px 0px 3px` 里的第一个 `0px` 是 offsetX，
  // 直接 match(/(\d+)px/) 会取到 0，断言就假失败了。
  const lens = (selfCheck.bs || '').match(/(-?[\d.]+)px/g) || [];
  const glowPx =
    lens.length >= 4 ? Math.abs(parseFloat(lens[3])) : lens.length ? Math.abs(parseFloat(lens[lens.length - 1])) : 0;
  ok(selfCheck.focus, '（自检）#b 确实处于 :focus 状态');
  ok(
    glowPx >= 3,
    '（自检）辉光 box-shadow 真的生效且扩散半径 ≥3px：' + JSON.stringify(selfCheck.bs) + ' → ' + glowPx + 'px'
  );

  const PAD = glowPx || 3;

  console.log('\n[1] 聚焦前：四边都不应有辉光（基线）');
  await page.evaluate(() => document.querySelector('#b').blur());
  await page.waitForTimeout(150);
  const before = await glowSides(page, '#b', PAD);
  ok(before !== null, '能取到 #b 的几何信息（断言前提）');
  ok(
    before.left < 0.2 && before.right < 0.2,
    '未聚焦时左右无辉光（基线正常）：' + `L=${before.left.toFixed(2)} R=${before.right.toFixed(2)}`
  );

  console.log('\n[2] ★ 聚焦后：四边辉光都必须存在（这是本次报障点）');
  await page.focus('#b');
  await page.waitForTimeout(200);
  const after = await glowSides(page, '#b', PAD);
  const fmt = o => `上=${o.top.toFixed(2)} 下=${o.bottom.toFixed(2)} 左=${o.left.toFixed(2)} 右=${o.right.toFixed(2)}`;
  ok(after.top > 0.5, '上边有辉光：' + fmt(after));
  ok(after.bottom > 0.5, '下边有辉光：' + fmt(after));
  ok(after.left > 0.5, '★ 左边有辉光（修复前此处被 .modal-body 裁掉）：' + fmt(after));
  ok(after.right > 0.5, '★ 右边有辉光（修复前此处被 .modal-body 裁掉）：' + fmt(after));

  console.log('\n[3] 推广到同一行的其它输入框（不能只修一个）');
  for (const id of ['#a', '#c', '#d']) {
    await page.focus(id);
    await page.waitForTimeout(200);
    const g = await glowSides(page, id, PAD);
    ok(g.left > 0.5 && g.right > 0.5 && g.top > 0.5 && g.bottom > 0.5, `${id} 四边辉光齐全：` + fmt(g));
  }

  console.log('\n[4] ★ 布局未被负边距改变（负 margin 必须精确抵消 padding）');
  // 修复用的是「padding + 等量负 margin」：padding 撑出辉光余量，负 margin 把子元素拉回原位。
  // 两者必须严格抵消，否则两栏会变窄或整体偏移——这是本次修复最容易引入的副作用，必须钉住。
  const layout = await page.evaluate(() => {
    const row = document.querySelector('.row-2');
    const cs = getComputedStyle(row);
    const modal = document.querySelector('.modal').getBoundingClientRect();
    const kids = [...row.children].map(k => {
      const b = k.getBoundingClientRect();
      return { x: b.x, w: b.width };
    });
    return {
      display: cs.display,
      cols: cs.gridTemplateColumns,
      padL: parseFloat(cs.paddingLeft),
      marL: parseFloat(cs.marginLeft),
      kids,
      modalX: modal.x,
      modalW: modal.width
    };
  });
  ok(layout.display === 'grid', '★ .row-2 仍是 grid（未被负边距破坏）：' + layout.display);
  ok(/^\d+(\.\d+)?px \d+(\.\d+)?px$/.test(layout.cols), '★ 仍是两栏等宽栅格：' + layout.cols);
  ok(layout.padL + layout.marL === 0, `★ padding(${layout.padL}) 与负 margin(${layout.marL}) 精确抵消`);
  ok(
    layout.kids.length === 2 && Math.abs(layout.kids[0].x - layout.kids[1].x) > 50,
    '★ 两栏确实左右分开，没有塌成一列'
  );
  const leftGap = layout.kids[0].x - layout.modalX;
  ok(
    Math.abs(leftGap - 23) < 1.5,
    `★ 首栏左边界距弹窗左边 ≈23px（.modal padding 22px + 1px 边框），布局未偏移：实测 ${leftGap.toFixed(1)}px`
  );

  console.log('\n[5] 产物契约（最终交付物）');
  // builtPath 已在 main() 开头声明（第 154 行附近），此处复用，勿重复 const。
  ok(fs.existsSync(builtPath), '构建产物 dist/index.html 存在');
  if (fs.existsSync(builtPath)) {
    const built = fs.readFileSync(builtPath, 'utf8');
    // 修复的核心：.modal-body 要有内边距，给向外扩的辉光留出空间。
    // 产物里 scoped 属性会被加 [data-v-xxx]，故用宽松匹配。
    ok(
      /\.modal-body\{[^}]*padding-left:4px/.test(built) || /\.modal-body\{[^}]*padding/.test(built),
      '★ 产物里 .modal-body 带内边距（给辉光留出裁剪余量）'
    );
    ok(
      /row-2(?:\[data-v-[0-9a-f]+\])?\{[^}]*padding-left:4px/.test(built),
      '★ 产物里 .row-2 带内边距（左右辉光不被裁）'
    );
    ok(
      /row-2(?:\[data-v-[0-9a-f]+\])?\{[^}]*margin-left:-4px/.test(built),
      '★ 产物里 .row-2 的负 margin 也在（否则布局会偏）'
    );
  }

  await browser.close();
  console.log(`\n=========== ${pass} 通过 / ${fail} 失败 ===========`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error('用例异常：', e);
  process.exit(1);
});
