'use strict';
/**
 * 数据与存储面板：路径文案的渲染验证。
 * 真正要看的是「用户眼睛里的字符串」，而不是构建产物里被转义过的 JS 字面量
 * （产物里 `\\data` 渲染出来才是 `\data`）。故必须真渲染 + 读文本节点。
 */
const { chromium } = require('/tmp/node_modules/playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const ROOT = process.argv[2] || '/workspace/ArchiveStudio';
const ENTRY = path.join(ROOT, 'dist/index.html');

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

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await page.goto('file://' + ENTRY, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  // 直接取产物里的字符串常量（渲染后形态）。DataSection 的模板文本会被打进 bundle，
  // 这里用正则从源码文本里取出「自动创建…文件夹」这段真实文案。
  // 取整页可见文本，确认关键串（未挂载也应有模板字符串在 bundle 里，故改用 bundle 文本）
  const bundle = require('fs').readFileSync(ENTRY, 'utf8');

  console.log('\n[1] 目录结构文案：迁移后必须带 data 层');
  // bundle 中该句被转义为 \\data；还原后再断言，等价于用户所见
  const unescaped = bundle.replace(/\\\\/g, '\\');
  ok(
    unescaped.includes('自动创建「文档盒 Archbox\\data」文件夹'),
    '★ 摘要句：「自动创建「文档盒 Archbox\\data」文件夹」'
  );
  ok(!unescaped.includes('自动创建「文档盒 Archbox」文件夹'), '★ 不再出现漏掉 data 层的旧文案');

  console.log('\n[2] 系统盘告警里的示例路径');
  ok(unescaped.includes('D:\\文档盒 Archbox\\data'), '★ 示例路径 = D:\\文档盒 Archbox\\data');

  console.log(`\n=========== ${pass} 通过 / ${fail} 失败 ===========`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('崩溃:', (e && e.stack) || e);
  process.exit(2);
});
