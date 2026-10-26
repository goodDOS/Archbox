/**
 * 正文图片尺寸口径：跨层一致性 + 边界 + 落库全链路（Beta.322）。
 *
 * 【为什么单独一场】
 *   用户这批反馈里有三条是同一个根因的不同表现：
 *     - 「图片尺寸应当可以自定义像素」→ 原先只放行四档百分比
 *     - 「文档发布后，图片变得很小」  → sanitize-html 把 img 的 style 整条剥了
 *     - 「防止代码模式下把图片改坏」  → 占位符映射可被手动编辑污染
 *   这三条的共同点是：**只在某一层生效，且不报错**。编辑器里好好的，
 *   保存下来就变形 —— 单看任何一层的代码都像是对的。所以必须有一场测试
 *   横向盯着「渲染层 ↔ 主进程 ↔ 落库」三处口径是否同一份、有没有哪层偷偷收紧。
 *
 * 【本场断言的三类东西】
 *   [2] 跨层一致：src/utils/imageSize.js 与 electron/services/imageSize.js
 *       的常量与正则**源码文本逐字相同**。这两份副本的存在是刻意的
 *       （ESM/CJS 无法共享文件），一致性只能靠测试守，不能靠记性。
 *   [3] 边界：24 / 2048 / 101% 这类卡边的值必须按预期放行或拒绝。
 *   [4] 落库全链路：真跑一遍 sanitize-html，确认 width/height 能活到发布态，
 *       且同一套规则不会顺手放行 <div style="width:9999px">。
 *
 * 运行：node electron/verify/image-size.test.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => readFileSync(path.join(ROOT, p), 'utf8');
const require = createRequire(import.meta.url);

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.log(`  ✗ ${msg}`);
  }
}

/* 渲染层是 ESM，主进程是 CJS —— 分别按各自的方式加载，模拟真实使用路径 */
const R = await import(path.join(ROOT, 'src/utils/imageSize.js'));
const M = require(path.join(ROOT, 'electron/services/imageSize.js'));

console.log('[1] 渲染层导出齐全');
{
  for (const name of [
    'IMAGE_PCT_STEPS',
    'IMAGE_PX_MIN',
    'IMAGE_PX_MAX',
    'SIZE_VALUE_RE',
    'parseSize',
    'normalizeSize',
    'heightForWidth',
    'aspectRatio'
  ]) {
    ok(name in R, `imageSize.js 导出 ${name}`);
  }
  /* 【单一来源】正则必须整串锚定，否则 '480px; color:red' 这种拼接值会被放过 */
  ok(R.SIZE_VALUE_RE.source.startsWith('^') && R.SIZE_VALUE_RE.source.endsWith('$'), 'SIZE_VALUE_RE 整串锚定（^…$）');

  /* 【解析口径】parseSize 是宽松解析（读旧内容用），不用于放行写入 —— 两者职责不同 */
  ok(R.parseSize('480px')?.n === 480, "parseSize('480px') → 480");
  ok(R.parseSize(' 50% ')?.n === 50, "parseSize 容忍两侧空格（' 50% '）→ 50");
  ok(R.parseSize('calc(100% - 20px)') === null, 'parseSize 拒绝 calc() 表达式');
  ok(R.parseSize('') === null && R.parseSize(null) === null, 'parseSize 空值返回 null');
  ok(R.normalizeSize('480px') === '480px', "normalizeSize('480px') 原样返回");
  ok(R.normalizeSize('480.4px') === '480px', 'normalizeSize 像素取整（480.4 → 480）');
  ok(R.normalizeSize('abc') === '', 'normalizeSize 非法值返回空串（调用方据此删属性）');
}

console.log('[2] 跨层一致：渲染层与主进程的常量、正则逐字相同');
{
  /* 这两份文件是刻意的副本（ESM 不能 require，CJS 不能 import ESM），
     一旦某一侧被单独改动，就会出现「编辑器能设、保存被剥掉」的经典 bug。
     断言到源码文本级：不仅值相等，连写法的字面量都必须一致。 */
  ok(R.IMAGE_PX_MIN === M.IMAGE_PX_MIN, `像素下限一致（${R.IMAGE_PX_MIN}）`);
  ok(R.IMAGE_PX_MAX === M.IMAGE_PX_MAX, `像素上限一致（${R.IMAGE_PX_MAX}）`);
  ok(
    JSON.stringify(R.IMAGE_PCT_STEPS) === JSON.stringify(M.IMAGE_PCT_STEPS),
    `百分比档位一致（${R.IMAGE_PCT_STEPS.join('/')}）`
  );
  ok(R.SIZE_VALUE_RE.source === M.SIZE_VALUE_RE.source, `放行正则源码逐字一致（${R.SIZE_VALUE_RE.source}）`);
  ok(R.SIZE_VALUE_RE.flags === M.SIZE_VALUE_RE.flags, '放行正则 flags 一致');

  /* 逐字比对两份源码里的字面量行：防止有人把某侧改成「等价但不同」的写法后
     两边慢慢走偏（如把 (?:[1-9]|[1-9]\d|100) 改成 1\d{0,2}） */
  /* 渲染层是 `export const X = ...`，主进程是 `const X = ...`，故前缀两种都认 */
  const literal = src =>
    [...src.matchAll(/^(?:export )?const (IMAGE_PCT_STEPS|IMAGE_PX_MIN|IMAGE_PX_MAX|SIZE_VALUE_RE)\s*=\s*(.+?);\s*$/gm)]
      .map(m => `${m[1]}=${m[2]}`)
      .sort()
      .join('\n');
  const rLit = literal(read('src/utils/imageSize.js'));
  const mLit = literal(read('electron/services/imageSize.js'));
  ok(rLit.length > 0 && rLit === mLit, '两侧常量声明行逐字相同（含正则可读写法）');
}

console.log('[3] 放行边界：形态 + 区间两道闸');
{
  /* 主进程只做「能不能放行」的判断题，故这里用 acceptableSize 断言 */
  const cases = [
    // [值, 期望, 说明]
    ['1%', true, '最小百分比'],
    ['100%', true, '最大百分比'],
    ['0%', false, '0% 会让图片消失'],
    ['101%', false, '101% 会撑出容器'],
    ['1000%', false, '超大百分比'],
    ['24px', true, '像素下限（恰好）'],
    ['23px', false, '低于下限 1px'],
    ['2048px', true, '像素上限（恰好）'],
    ['2049px', false, '超过上限 1px'],
    ['9999px', false, '四位数超限'],
    ['480', false, '无单位不认（HTML 属性另有处理）'],
    ['480pt', false, '只认 px 与 %'],
    ['480 px', false, '带空格一律拒绝（宁可回落自适应）'],
    ['480px; color:red', false, '拼接值拒绝（正则整串锚定）'],
    ['expression(alert(1))', false, '表达式注入'],
    ['url(javascript:alert(1))', false, 'url 注入'],
    ['calc(100% - 20px)', false, 'calc 不认'],
    ['auto', false, 'auto 不认'],
    ['', false, '空值']
  ];
  for (const [v, want, why] of cases) {
    const got = M.acceptableSize(v);
    ok(
      got === want,
      `${JSON.stringify(v)} → ${want ? '放行' : '拒绝'}（${why}）${got === want ? '' : `，实际 ${got}`}`
    );
  }

  /* 渲染层与主进程对同一批值必须给出同样的结论（除宽松解析外的口径统一） */
  const mismatch = cases
    .map(([v]) => v)
    .filter(v => {
      const s = String(v).trim().toLowerCase();
      const byFront = !!R.SIZE_VALUE_RE.test(s) && (!/px$/.test(s) || (/^[1-9]\d{1,3}px$/.test(s) && !!R.parseSize(s)));
      return byFront !== M.acceptableSize(v);
    });
  ok(mismatch.length === 0, `两侧对同一批边界值结论一致（不一致：${mismatch.join('、') || '无'}）`);
}

console.log('[4] 锁比例换算：百分比宽度也算成像素高度');
{
  /* 1000×500 的原图，宽 480px → 高 240px */
  ok(R.heightForWidth('480px', 1000, 500) === '240px', '480px @1000×500 → 240px');
  /* 百分比宽度必须结合容器像素宽才能算高度：容器 800px、50% → 400px 宽 → 200px 高 */
  ok(R.heightForWidth('50%', 1000, 500, 800) === '200px', '50% @容器800×1000:500 → 200px');
  /* 拿不到容器宽就放弃（返回空串），不能瞎猜一个基准 */
  ok(R.heightForWidth('50%', 1000, 500) === '', '无容器宽时百分比不给高度（返回空串）');
  /* 拿不到原图尺寸就放弃锁定 */
  ok(R.heightForWidth('480px', 0, 0) === '', '无原图尺寸时不给高度');
  /* 竖图：600×1200，宽 300px → 高 600px */
  ok(R.heightForWidth('300px', 600, 1200) === '600px', '竖图 300px @600×1200 → 600px');
  ok(Math.abs(R.aspectRatio(1000, 500) - 2) < 1e-9, 'aspectRatio(1000,500) = 2');
  ok(R.aspectRatio(0, 500) === 0, '缺尺寸时 aspectRatio 返回 0（调用方据此放弃锁定）');
}

console.log('[5] 发布态落库：img 的 width/height 必须活下来');
{
  /* ★ 这是「文档发布后图片变得很小」的真正根因所在 ★
   *   sanitize-html 的 allowedAttributes 是白名单：img 分支里没写 'style'，
   *   样式在进入 allowedStyles 之前就被整条丢掉 —— allowedStyles 再怎么写都没用。
   *   这里真跑一遍，从 core.js 取实际配置，不复制一份假配置断言。 */
  const sanitizeHtml = require('sanitize-html');
  const { HTML_CFG } = require(path.join(ROOT, 'electron/db/core.js'));

  const run = html => sanitizeHtml(html, HTML_CFG);

  ok(
    (HTML_CFG.allowedAttributes?.img || []).includes('style'),
    'allowedAttributes.img 含 style（否则 allowedStyles 形同虚设）'
  );
  ok(
    !!HTML_CFG.allowedStyles?.img?.width && !!HTML_CFG.allowedStyles?.img?.height,
    'allowedStyles.img 配了 width 与 height'
  );
  ok(
    !HTML_CFG.allowedStyles?.width && !HTML_CFG.allowedStyles?.['*']?.width,
    'width/height 未被挂到通配组（否则 <div style="width:9999px"> 会被放行）'
  );

  const keepPx = run('<p><img src="data:image/png;base64,AAA" style="width: 480px"></p>');
  ok(/width:\s*480px/.test(keepPx), '像素宽度在发布态存活（480px）');

  const keepPct = run('<p><img src="data:image/png;base64,AAA" style="width: 50%"></p>');
  ok(/width:\s*50%/.test(keepPct), '百分比宽度在发布态存活（50%）');

  /* 锁比例时 width 与 height 同时写内联样式，两条都必须留 */
  const keepBoth = run('<p><img src="data:image/png;base64,AAA" style="width: 480px; height: 240px"></p>');
  ok(/width:\s*480px/.test(keepBoth) && /height:\s*240px/.test(keepBoth), '锁比例时宽高同存（480px × 240px）');

  /* 反向：超限与畸形值必须被剥掉，不能因为放宽 img 就把闸门拆了 */
  const dropBig = run('<p><img src="data:image/png;base64,AAA" style="width: 2049px"></p>');
  ok(!/2049px/.test(dropBig), '超上限像素被剥掉（2049px）');

  const dropPct = run('<p><img src="data:image/png;base64,AAA" style="width: 101%"></p>');
  ok(!/101%/.test(dropPct), '超范围百分比被剥掉（101%）');

  const dropInject = run('<p><img src="data:image/png;base64,AAA" style="width: expression(alert(1))"></p>');
  ok(!/expression/.test(dropInject), '表达式注入被剥掉');

  /* 其它标签不得借 img 的规则蹭到宽高 */
  const dropDiv = run('<div style="width: 9999px">x</div>');
  ok(!/width/.test(dropDiv), '<div style="width:9999px"> 的宽度被剥掉（不蹭 img 规则）');
}

/**
 * [5.5] 尺寸条 UI：两个「只在某一层静默失效」的坑（Beta.324）。
 *
 * 用户截图反馈「排版有问题、只能填一个数值、预制百分比整排缺失」，
 * 三个现象两个根因，都不报任何错：
 *   A. IMAGE_PCT_STEPS 漏 import —— v-for 遍历 undefined 静默渲染为空，
 *      四档预制按钮整排不存在（源码里模板写得好好的，肉眼审模板审不出来）。
 *   B. .isb-input 从未写过样式 —— input 是 inline-block，Dropdown 的根是
 *      display:inline-block; width:100% 的盒子，两者必然纵向堆叠
 *      （「25 压在 像素 上方」）。
 * 另加高度格的存在性与联动断言（Beta.324 把「只能填一个数值」补成宽高双值）。
 */
console.log('[5.5] 尺寸条 UI：import 必须在位、输入组必须横排、高度格必须接线');
{
  const postView = read('src/pages/PostView.vue');
  const tpl = postView.slice(0, postView.indexOf('<script setup>'));
  const code = postView
    .slice(postView.indexOf('<script setup>'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  /* 样式段也要剥注释：.isb-input 的注释里写着「纵向堆叠」的反面教材，
     不剥会被注释喂饱（这个坑在 settings-card-gap / image-lightbox-fit 都踩过） */
  const style = postView.slice(postView.indexOf('<style scoped>')).replace(/\/\*[\s\S]*?\*\//g, '');

  // A. import 必须在位，且模板真的在遍历它
  ok(
    /import\s*\{[^}]*\bIMAGE_PCT_STEPS\b[^}]*\}\s*from\s*'\.\.\/utils\/imageSize'/.test(code),
    '★ PostView 导入了 IMAGE_PCT_STEPS（漏它 = v-for 静默渲染空，预制按钮整排消失）'
  );
  ok(
    /v-for="opt in IMAGE_PCT_STEPS"/.test(tpl),
    '★ 百分比按钮由 v-for="opt in IMAGE_PCT_STEPS" 驱动（写死四个按钮会与单一来源漂移）'
  );

  // B. 输入控件组必须横排：flex 一行，且高度确定（26px，与 .tb-btn 的 28px 同族）
  const isbInput = /\.isb-input\s*\{([^}]*)\}/.exec(style);
  ok(!!isbInput, '（依据）.isb-input 有样式规则（Beta.324 之前它一条都没有）');
  const decl = isbInput ? isbInput[1] : '';
  ok(/display:\s*inline-flex/.test(decl), '★ .isb-input 是 inline-flex —— 数字框与单位下拉焊成一行，不再纵向堆叠');
  ok(/align-items:\s*center/.test(decl), '★ .isb-input 垂直居中对齐');
  ok(
    /height:\s*26px/.test(decl),
    '★ .isb-input 高度确定（26px）—— 下拉被压成与数字框同高，不会撑成 34px 的 form 默认高度'
  );
  // 单位下拉必须被压到组内同高（form 皮肤默认 34px、铺满宽）
  ok(
    /\.isb-input :deep\(\.dd-trigger\)\s*\{[^}]*height:\s*100%/.test(style),
    '★ 单位下拉触发器高度 100%（压成与数字框同高的贴附控件）'
  );
  ok(
    /\.isb-input :deep\(\.dropdown\)\s*\{[^}]*width:\s*auto/.test(style),
    '★ 单位下拉根 width:auto（不铺满，避免把输入框挤下去）'
  );

  // 高度格：存在 + 接线 + 联动反推
  ok(/v-model="imgHeightDraft"/.test(tpl), '★ 高度输入框绑定 imgHeightDraft（补上「只能填一个数值」缺的那一格）');
  ok(/@blur="commitImageHeight"/.test(tpl), '★ 高度输入框失焦提交 commitImageHeight');
  ok(/const imgHeightDraft = ref\(''\)/.test(code), 'imgHeightDraft 状态存在');
  ok(/function commitImageSize\(/.test(code) && /function commitImageHeight\(/.test(code), '宽高各有提交函数');
  ok(
    /function widthForHeight\(/.test(code),
    '★ widthForHeight 存在 —— 锁比例时改高按原图比例反推宽（ratioHeight 的逆运算）'
  );
  ok(/imgHeightValue/.test(code), 'imgHeightValue 存在 —— 锁比例未存高度时显示推算值，输入框与眼见一致');
  // 高度恒为像素：整个尺寸条只允许一个单位下拉（归宽度），高度格只有写死的 px
  ok(
    (tpl.match(/class="isb-unit"/g) || []).length === 1,
    '★ 尺寸条里只有一个单位下拉（归宽度）—— 高度格不配下拉，杜绝百分比高度这个不可控形态'
  );
  ok(
    (tpl.match(/class="isb-unit-fixed"/g) || []).length === 1,
    '★ 高度格的单位是写死的 px（带 title 说明为什么没有百分比选项）'
  );

  // i18n：新键三个语言文件都要有（zh-CN 为准，完整性由 i18n-completeness 全场盯）
  const zhCN = read('src/i18n/parts/post.zh-CN.js');
  for (const k of ['imgSizeWidth', 'imgSizeHeight', 'imgHeightPxOnly']) {
    ok(new RegExp(`\\b${k}:`).test(zhCN), `i18n 键 ${k} 已定义`);
  }
}

console.log(`\n通过 ${pass} / 失败 ${fail}\n`);
process.exit(fail ? 1 : 0);
