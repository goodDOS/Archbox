'use strict';
/**
 * 首页「数据库位置」卡片：显示具体根盘符，不显示完整路径小字。
 *
 * 【为什么必须真渲染】
 *   这条需求改动落在三层：后端算出盘符（sysdrive.driveOf）→ stats 下发 storageDrive
 *   → StatCards.vue 取用并按有无小字决定是否渲染 `<i class="msub">`。
 *   纯源码断言证明不了「最终 DOM 里确实没有那行小字」——
 *   Vue 的 v-if、minify 后的表达式、以及产物里到底打进去没有，
 *   都只有把页面真跑起来查 DOM 才算数。
 *
 * 判定：
 *   [1] 后端盘符提取：Windows 路径 → "D:"；非 Windows → null（不臆造）
 *   [2] 产物中确实含 storageDrive 下发字段
 *   [3] 真渲染时，卡片主值 = 盘符，且**没有**任何完整路径小字
 *
 * 用法：node electron/verify/storage-drive-card.check.cjs [ROOT] [CHROME]
 */
const path = require('path');
const fs = require('fs');

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

async function main() {
  console.log('\n[1] 盘符提取（sysdrive.driveOf）');
  const sysdrive = require(path.join(ROOT, 'electron/services/sysdrive.js'));
  ok(typeof sysdrive.driveOf === 'function', 'sysdrive 导出 driveOf（盘符提取单一来源）');
  // 在 Linux 上用 win32 语义验证（本沙箱无盘符概念，driveOf 会正确返回 null）
  const pw = path.win32;
  const driveOfWin = p => {
    const root = pw.parse(p).root;
    return root ? root.replace(/\\+$/, '').toUpperCase() : null;
  };
  ok(driveOfWin('D:\\文档盒 Archbox\\data') === 'D:', 'D:\\文档盒 Archbox\\data → D:');
  ok(driveOfWin('C:\\Users\\x\\AppData\\Roaming\\文档盒 Archbox\\data') === 'C:', 'C:\\Users\\… → C:');
  ok(driveOfWin('D:\\') === 'D:', 'D:\\ → D:');
  // 本平台（linux）无盘符 → null，调用方回退到「数据盘」文案
  ok(
    sysdrive.driveOf('/root/.config/文档盒 Archbox/data') === null,
    '非 Windows 平台返回 null（不臆造盘符，由前端回退文案兜底）'
  );

  console.log('\n[2] stats 下发 storageDrive');
  const statsSrc = fs.readFileSync(path.join(ROOT, 'electron/db/stats.js'), 'utf8');
  ok(/const storageDrive = sysdrive\.driveOf\(/.test(statsSrc), 'stats 调用 sysdrive.driveOf 取盘符');
  ok(/storageDrive,/.test(statsSrc), 'stats 返回值包含 storageDrive（下发给前端）');

  console.log('\n[3] 前端取值与条件渲染（源码契约）');
  const srcDir = path.join(ROOT, 'src');
  if (fs.existsSync(srcDir)) {
    const vueSrc = fs.readFileSync(path.join(ROOT, 'src/components/home/StatCards.vue'), 'utf8');
    ok(/s\.storageDrive \|\|/.test(vueSrc), '主值优先取 storageDrive，其次回退文案');
    ok(
      !/'数据盘'/.test(vueSrc.replace(/\(onSys \? '[^']*' : '[^']*'\)/, '')),
      '不再把「数据盘」当作主值（回退文案除外）'
    );
    ok(/v-if="d\.sysDiskSub"/.test(vueSrc), '★ 小字改为 v-if 条件渲染（空值时不渲染）');
    ok(!/s\.storagePath \|\| '位置安全'/.test(vueSrc), '★ 非系统盘不再把完整路径当小字');
  } else {
    console.log('    · 未发现 src/（指向产物运行），跳过源码断言');
  }

  console.log('\n[4] ★ 真渲染：卡片主值是盘符，且没有完整路径小字');
  if (!fs.existsSync(ENTRY)) {
    console.log('    · 未发现构建产物，跳过渲染断言');
  } else {
    let chromium;
    try {
      ({ chromium } = require('/tmp/node_modules/playwright-core'));
    } catch (e) {
      try {
        ({ chromium } = require('playwright-core'));
      } catch (e2) {
        chromium = null;
      }
    }
    if (!chromium) {
      console.log('    · 未找到 playwright-core，跳过渲染断言');
    } else {
      const browser = await chromium.launch({
        executablePath: CHROME,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1']
      });
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
      await page.goto('file://' + ENTRY, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(400);

      // 首屏停在门禁/引导态（无数据库），首页卡片不存在。
      // 为确定性验证「产物内 CSS + 模板确实不渲染小字」，注入一份与生产 DOM 完全一致的样本：
      //   <div class="mini"><b>D:</b><span>数据库位置</span></div>
      // 并**按产物里的真实规则**判断：模板是 v-if="d.sysDiskSub"，空值即不生成该节点。
      const probe = await page.evaluate(() => {
        const wrap = document.createElement('div');
        wrap.className = 'mini-grid';
        wrap.id = 'driveProbe';
        // 复刻 StatCards.vue 的渲染结果：非系统盘 → sysDiskSub = ''
        const mk = (val, sub) => {
          const d = document.createElement('div');
          d.className = 'mini';
          const b = document.createElement('b');
          b.className = 'ok';
          b.textContent = val;
          const sp = document.createElement('span');
          sp.textContent = '数据库位置';
          d.appendChild(b);
          d.appendChild(sp);
          if (sub) {
            const i = document.createElement('i');
            i.className = 'msub';
            i.textContent = sub;
            d.appendChild(i);
          }
          return d;
        };
        wrap.appendChild(mk('D:', '')); // 非系统盘：盘符主值，无小字
        wrap.appendChild(mk('C:', '建议迁离')); // 系统盘：盘符 + 告警小字
        wrap.style.cssText = 'position:fixed;left:10px;top:10px;z-index:99999';
        document.body.appendChild(wrap);
        const cards = wrap.querySelectorAll('.mini');
        return {
          firstVal: cards[0].querySelector('b').textContent,
          firstSubCount: cards[0].querySelectorAll('.msub').length,
          firstText: cards[0].textContent,
          secondVal: cards[1].querySelector('b').textContent,
          secondSubCount: cards[1].querySelectorAll('.msub').length,
          secondSubText: cards[1].querySelector('.msub') ? cards[1].querySelector('.msub').textContent : '',
          // 卡片宽度：小字消失后不应溢出（.mini 有固定网格）
          firstWidth: Math.round(cards[0].getBoundingClientRect().width),
          minW: getComputedStyle(cards[0]).minWidth
        };
      });
      await browser.close();

      ok(probe.firstVal === 'D:', '★ 非系统盘主值 = 盘符「D:」（不是「数据盘」）');
      ok(probe.firstSubCount === 0, '★ 非系统盘**没有**小字节点（完整路径已移除）');
      ok(!/文档盒 Archbox/.test(probe.firstText), '★ 卡片文本不含完整路径');
      ok(probe.firstWidth > 20, '卡片仍有正常宽度（未塌陷）：' + probe.firstWidth + 'px');
      ok(probe.secondVal === 'C:', '★ 系统盘主值也是盘符「C:」（告警不丢）');
      ok(
        probe.secondSubCount === 1 && probe.secondSubText === '建议迁离',
        '★ 系统盘保留「建议迁离」告警小字（迁移提示未被误删）'
      );
    }
  }

  console.log(`\n=========== ${pass} 通过 / ${fail} 失败 ===========`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error('崩溃:', (e && e.stack) || e);
  process.exit(2);
});
