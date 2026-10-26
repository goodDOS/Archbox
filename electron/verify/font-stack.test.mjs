/**
 * 字体资产与字体栈契约（Beta.322 追加）。
 *
 * 【为什么要有这一场】
 *   用户要求「补上全部语言字体」+「显示设置语言上方新增可选择自带字体或系统字体卡片」，
 *   随后追加「添加 emoji 字体」。这三件事的风险都不在「写不写得出来」，而在**顺序与完整性**：
 *
 *   ① ★ emoji 抢字符 ★
 *      Noto Color Emoji 的 unicode-range 里含 U+23 / U+30-39（# 与 0-9，键帽字符）。
 *      若它排在文字字族之前，正文里的「版本 3」「#标签」会被渲染成键帽方块表情。
 *      现象是「某些字变成表情」，极容易被误判成主题或字体本身有问题。
 *      本条已实测：从生成的 fonts.css 里真读出了 U+30-39，所以顺序必须由测试锁死。
 *
 *   ② 中文类字族若排在系统字体（微软雅黑）之后，会被系统字体抢走全部汉字，
 *      自带字等于没装 —— 界面看不出任何变化，但包体积白涨 13 MB。
 *
 *   ③ fonts.css 引用的文件必须都在磁盘上、且不能有未被引用的残留文件。
 *      脚本重跑时若改了分片筛选规则，旧文件会留下（13 MB 变 26 MB），无人察觉。
 *
 *   ④ 字体是「运行时才用到」的资产，任何一层路径写错都不会在构建期报错，
 *      只会在用户机器上表现为方块字。所以路径与引用必须静态校验。
 *
 * 运行：node electron/verify/font-stack.test.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness } from './_harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { ok, section, done } = createHarness();

const fontStackSrc = readFileSync(path.join(root, 'src', 'utils', 'fontStack.js'), 'utf8');
const useFontModeSrc = readFileSync(path.join(root, 'src', 'composables', 'useFontMode.js'), 'utf8');
const themesCss = readFileSync(path.join(root, 'src', 'styles', 'themes.css'), 'utf8');
const baseCss = readFileSync(path.join(root, 'src', 'styles', 'base.css'), 'utf8');
const fontsDir = path.join(root, 'public', 'fonts');
const fontsCssPath = path.join(fontsDir, 'fonts.css');

/** 从 fontStack.js 源码里取出某个导出数组的字族名 */
function pickStack(name) {
  const re = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\];`);
  const m = re.exec(fontStackSrc);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

const BUNDLED = pickStack('BUNDLED_STACK');
const SYSTEM = pickStack('SYSTEM_STACK');
const MONO = pickStack('MONO_STACK');

/* ============ [1] 字体栈定义本身 ============ */
section('1. 字体栈定义');
ok(Array.isArray(BUNDLED) && BUNDLED.length > 5, `BUNDLED_STACK 可取（${BUNDLED && BUNDLED.length} 项）`);
ok(Array.isArray(SYSTEM) && SYSTEM.length > 3, `SYSTEM_STACK 可取（${SYSTEM && SYSTEM.length} 项）`);
ok(BUNDLED[0] === 'Noto Sans', '自带栈以 Noto Sans 打头（拉丁基础字）');
ok(SYSTEM[0] !== 'Noto Sans', '系统栈不含 Noto（否则「系统字体」名不副实）');

/* 中文类字族必须在系统字体之前 */
const CJK = ['Noto Sans SC', 'Noto Sans TC', 'Noto Sans JP', 'Noto Sans KR'];
const SYS_NAMES = ['PingFang SC', 'Microsoft YaHei', 'Segoe UI'];
for (const cjk of CJK) {
  const i = BUNDLED.indexOf(cjk);
  ok(i >= 0, `自带栈含 ${cjk}`);
  ok(
    SYS_NAMES.every(s => BUNDLED.indexOf(s) > i),
    `★ ${cjk} 排在系统字体之前（否则汉字被系统字体抢走，自带字形同没装）`
  );
}

/* ============ [2] ★ emoji 必须排在所有文字字族之后 ============ */
section('2. emoji 字族的顺序（本场最关键）');
const emojiIdx = BUNDLED.indexOf('Noto Color Emoji');
ok(emojiIdx >= 0, '自带栈含 Noto Color Emoji');
ok(
  BUNDLED.slice(0, emojiIdx).every(n => n.startsWith('Noto ')),
  '★ Noto Color Emoji 之前全是文字字族（emoji 不得插进文字字族中间）'
);
ok(
  BUNDLED.indexOf('Noto Sans SC') < emojiIdx && BUNDLED.indexOf('Noto Sans') < emojiIdx,
  '★ 中/英字族都排在 emoji 之前（emoji 含 U+30-39，排前面会把数字吃成键帽表情）'
);
ok(
  ['PingFang SC', 'Microsoft YaHei', 'Segoe UI'].every(s => BUNDLED.indexOf(s) > emojiIdx),
  '系统字体排在 emoji 之后（缺字兜底顺序：文字 → emoji → 系统）'
);

/* 真实证据：从生成的 fonts.css 里确认 emoji 分片确实含数字码位 */
if (existsSync(fontsCssPath)) {
  const css = readFileSync(fontsCssPath, 'utf8');
  const emojiBlock = css.slice(css.indexOf("font-family: 'Noto Color Emoji'"));
  ok(/unicode-range:[^}]*U\+30-39/.test(emojiBlock), '★ 实测证据：emoji 分片含 U+30-39（数字），顺序错了数字必坏');
  ok(/unicode-range:[^}]*U\+23\b/.test(emojiBlock), '★ 实测证据：emoji 分片含 U+23（#）');
}

/* 系统栈也要有 emoji 兜底 */
ok(SYSTEM.includes('Segoe UI Emoji'), '系统栈含 Segoe UI Emoji');
ok(SYSTEM.includes('Apple Color Emoji'), '系统栈含 Apple Color Emoji');
ok(
  SYSTEM.indexOf('Segoe UI Emoji') < SYSTEM.indexOf('Segoe UI'),
  '★ Segoe UI Emoji 排在 Segoe UI 之前（前者含少量单色 emoji，会抢彩色 emoji 的字形）'
);

/* ============ [3] CSS 初值必须与 JS 一致 ============ */
section('3. CSS 初值 ↔ JS 定义（两处必须同一份）');
const cssVarMatch = /--font-ui:\s*([^;]+);/.exec(themesCss);
ok(!!cssVarMatch, 'themes.css 定义了 --font-ui 初值');
if (cssVarMatch) {
  const cssNames = [...cssVarMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const cssBare = cssVarMatch[1]
    .split(',')
    .map(s => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
  ok(
    JSON.stringify(cssNames) === JSON.stringify(BUNDLED.filter(n => /\s/.test(n))),
    `CSS 里的带引号字族与 BUNDLED_STACK 逐项一致（CSS ${cssNames.length} / JS ${BUNDLED.filter(n => /\s/.test(n)).length}）`
  );
  ok(
    JSON.stringify(cssBare) === JSON.stringify(BUNDLED),
    '★ --font-ui 初值与 BUNDLED_STACK 顺序完全相同（首屏不能闪成系统字体）'
  );
  ok(cssBare.includes('Noto Color Emoji'), 'CSS 初值含 Noto Color Emoji');
}
ok(/body\s*\{[^}]*font-family:\s*var\(--font-ui\)/.test(baseCss), 'body 的 font-family 走 var(--font-ui)');
ok(!/body\s*\{[^}]*font-family:\s*-apple-system/.test(baseCss), '★ body 里不再写死字体栈（写死会导致只切换一半）');
ok(themesCss.includes('--font-mono:'), 'themes.css 仍定义 --font-mono');

/* 全站不得再有写死的 UI 字体栈 */
const hardCoded = [];
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(vue|css)$/.test(f)) {
      const txt = readFileSync(p, 'utf8');
      const re = /font-family:\s*([^;}]+)/g;
      let m;
      while ((m = re.exec(txt))) {
        const v = m[1].trim();
        if (v.startsWith('var(')) continue;
        hardCoded.push(`${path.relative(root, p)}: ${v.slice(0, 40)}`);
      }
    }
  }
}
walk(path.join(root, 'src'));
ok(hardCoded.length === 0, `src/ 下无写死的 font-family（发现 ${hardCoded.length} 处）`);
if (hardCoded.length) hardCoded.slice(0, 5).forEach(h => ok(false, '  → ' + h));

/* ============ [4] 字体产物完整性 ============ */
section('4. 字体产物（public/fonts）');
ok(existsSync(fontsCssPath), 'public/fonts/fonts.css 存在');

if (existsSync(fontsCssPath)) {
  const css = readFileSync(fontsCssPath, 'utf8');
  const refs = [...css.matchAll(/url\('\.\/([^']+\.woff2)'\)/g)].map(m => m[1]);
  ok(refs.length > 100, `fonts.css 引用 ${refs.length} 个 woff2`);

  const missing = refs.filter(r => !existsSync(path.join(fontsDir, r)));
  ok(missing.length === 0, `★ 引用全部落地（缺 ${missing.length} 个）`);

  const onDisk = readdirSync(fontsDir).filter(f => f.endsWith('.woff2'));
  ok(onDisk.length === refs.length, `无残留文件（磁盘 ${onDisk.length} / 引用 ${refs.length}）`);

  /* 9 个字族都要在，且都只有 400 一个字重（多了会让体积翻倍） */
  const families = [...new Set([...css.matchAll(/font-family: '([^']+)'/g)].map(m => m[1]))];
  ok(families.length === 7, `fonts.css 含 7 个字族（实得 ${families.length}）`);
  for (const f of [
    'Noto Sans',
    'Noto Sans SC',
    'Noto Sans TC',
    'Noto Sans JP',
    'Noto Sans KR',
    'Noto Sans Arabic',
    'Noto Color Emoji'
  ]) {
    ok(families.includes(f), `字族 ${f} 已生成`);
  }
  const weights = [...new Set([...css.matchAll(/font-weight: (\d+)/g)].map(m => m[1]))];
  ok(weights.length === 1 && weights[0] === '400', `只含 400 一个字重（实得 ${weights.join('/')}）`);
  ok(!/font-style: italic/.test(css), '不含斜体（省体积，界面不用斜体字族）');
  /* 逐块检查，不能数全文出现次数：脚本头部注释里也写了 font-display: swap,
   * 数次数会比块数多 1，那属于断言写法错、不是产物错。 */
  const faceBlocks = css.match(/@font-face\s*\{[^}]*\}/g) || [];
  ok(faceBlocks.length === refs.length, `@font-face 块数与引用数一致（块 ${faceBlocks.length} / 引用 ${refs.length}）`);
  const noSwap = faceBlocks.filter(b => !/font-display:\s*swap/.test(b));
  ok(noSwap.length === 0, `★ 每条 @font-face 都带 font-display: swap（缺 ${noSwap.length} 条）`);

  /* 语言覆盖：每一门界面语言都能映射到已落地的字族（12 语 → Noto 系 7 族） */
  const LANG_FAMILY = {
    'zh-CN': 'Noto Sans SC',
    'zh-TW': 'Noto Sans TC',
    ja: 'Noto Sans JP',
    ko: 'Noto Sans KR',
    ar: 'Noto Sans Arabic',
    en: 'Noto Sans',
    fr: 'Noto Sans',
    de: 'Noto Sans',
    is: 'Noto Sans',
    ru: 'Noto Sans',
    it: 'Noto Sans',
    es: 'Noto Sans'
  };
  const langs = Object.keys(LANG_FAMILY);
  ok(langs.length === 12, '语言覆盖表恰好 12 项');
  for (const [lang, fam] of Object.entries(LANG_FAMILY)) {
    ok(families.includes(fam), `语言 ${lang} → ${fam} 已就位`);
  }
  /* 俄语需要西里尔分片，不能只有 latin */
  const cyr = refs.filter(r => r.includes('cyrillic'));
  ok(cyr.length >= 2, `西里尔分片已含（${cyr.length} 个，俄语必需）`);
}

/* ============ [5] 运行时接入 ============ */
section('5. 运行时接入（useFontMode / 设置项）');
ok(/FONT_CSS_HREF = '\.\/fonts\/fonts\.css'/.test(useFontModeSrc), '字体 CSS 走 public 相对路径 ./fonts/fonts.css');
ok(useFontModeSrc.includes('export function initFontMode'), '导出 initFontMode（启动时应用）');
ok(useFontModeSrc.includes('export async function setFontMode'), '导出 setFontMode（设置页切换）');
ok(useFontModeSrc.includes('export function useFontMode'), '导出 useFontMode（状态回显）');
ok(/id = 'archbox-fonts'/.test(useFontModeSrc), '注入的 link 带固定 id，可重复调用而不重复插入');
ok(/function removeLink/.test(useFontModeSrc), '系统模式会移除 link（不白加载 22 MB）');
ok(/token !== applyToken/.test(useFontModeSrc), '★ 连续切换时只有最后一次生效（避免快速点选时打架）');
ok(/document\.fonts/.test(useFontModeSrc), '切换前后等待 document.fonts.ready（避免二次抖动）');
ok(/setTimeout\(r, timeoutMs\)/.test(useFontModeSrc), '★ 字体等待有超时兜底（加载失败不能把界面卡在旧字体）');

/* ★ fonts.css 自身加载失败时的兜底 ★
 * 只等 document.fonts.ready 不够：样式表 404 时根本没有 @font-face 被注册，
 * fonts.ready 会立刻 resolve，于是把 --font-ui 写成 Noto 字族 —— 而这些字族不存在，
 * 浏览器全部回退到 sans-serif，中文界面变成默认字形且不会自行恢复。
 * 必须在 link 的 load / error 上等明确结果，失败就退回系统字体。 */
ok(/function waitStylesheet/.test(useFontModeSrc), '★ 有 waitStylesheet 等 link 的 load/error');
ok(/addEventListener\('error'/.test(useFontModeSrc), '★ 监听 link 的 error 事件');
ok(/el\.sheet/.test(useFontModeSrc), 'waitStylesheet 用 el.sheet 判断是否已加载');
ok(/effective = 'system'/.test(useFontModeSrc), '★ 样式表加载失败时回退到系统字体（而非硬写不存在的字族）');
ok(/if \(!cssOk\)/.test(useFontModeSrc), '有 cssOk 分支处理失败');
ok(/applyVars\(effective\)/.test(useFontModeSrc), '写变量用的是 effective 而非用户选的 target');

const usersSrc = readFileSync(path.join(root, 'electron', 'db', 'users.js'), 'utf8');
ok(usersSrc.includes("'display.fontMode'"), '★ display.fontMode 已进 SETTING_KEYS 白名单（否则写入被拒）');

/* 模式非法值归一化 */
ok(/export function normalizeFontMode/.test(fontStackSrc), '导出 normalizeFontMode（脏值兜底）');
ok(/FONT_MODES = \['bundled', 'system'\]/.test(fontStackSrc), '只允许 bundled / system 两种模式');
ok(/DEFAULT_FONT_MODE = 'bundled'/.test(fontStackSrc), '默认自带字体（用户要求「补上全部语言字体」）');
ok(/export function stackToCss/.test(fontStackSrc), '导出 stackToCss（含空格的族名加引号）');
ok(/\\s\/\.test\(n\)/.test(fontStackSrc), 'stackToCss 按空格判断是否加引号');
ok(MONO && MONO.length >= 4, `等宽栈可取（${MONO && MONO.length} 项）`);

/* ---------- 6. 关于页的字体引用（Beta.322 追加）----------
 * 用户要求「把字体引用添加进关于页」。这一节守两件事：
 *   ① 关于页的清单不能与 sync-fonts.mjs 的 FONTS 漂移 —— 新增字族只在脚本里加、
 *      忘了在关于页露出来，用户就看不到它的许可与用途（属于「引用不全」）。
 *   ② 关于页只能引用 `public/fonts/LICENSES.md` 这个真实存在的路径，
 *      不能写个漂亮但不存在的文件名。 */
section('6. 关于页字体引用');
const aboutSrc = readFileSync(path.join(root, 'src', 'pages', 'AboutPage.vue'), 'utf8');
const syncFontsSrc = readFileSync(path.join(root, 'scripts', 'sync-fonts.mjs'), 'utf8');
/* 只取 FONTS 数组里的 family —— 脚本后半段的模板字符串里也有 `family:` 字样
 * （生成 @font-face 时的 `  font-family: '${family}';`），不过滤会多算两条。 */
const FONTS_BLOCK = (/export const FONTS = \[([\s\S]*?)\n\];/.exec(syncFontsSrc) || [null, ''])[1];
const fontFamilies = [...FONTS_BLOCK.matchAll(/family:\s*'([^']+)'/g)].map(m => m[1]);

ok(fontFamilies.length === 7, `（依据）sync-fonts.mjs 定义 ${fontFamilies.length} 个字族`);
const notInAbout = fontFamilies.filter(f => !aboutSrc.includes(`'${f}'`));
ok(
  notInAbout.length === 0,
  '★ 关于页列全了全部字族（与 sync-fonts.mjs 的 FONTS 同源，漏一个就报红）' +
    (notInAbout.length ? ' → 缺：' + notInAbout.join(' / ') : '')
);
ok(/fontsTitle/.test(aboutSrc) && /fontsL1/.test(aboutSrc), '关于页有「自带字体」小节（标题 + 正文都走 t()）');
ok(/public\/fonts\/LICENSES\.md/.test(aboutSrc), '★ 关于页指出许可原文在 public/fonts/LICENSES.md（路径必须真实存在）');
ok(existsSync(path.join(fontsDir, 'LICENSES.md')), '（依据）public/fonts/LICENSES.md 确实存在');
ok(
  /SIL Open Font License/i.test(readFileSync(path.join(fontsDir, 'LICENSES.md'), 'utf8')),
  '（依据）LICENSES.md 里写明了 SIL OFL 1.1'
);
/* 关于页不得把这些当普通文本硬编码：族名可以写死（专有名词），说明必须走字典 */
ok(/useKey:\s*'about\.fontsUse/.test(aboutSrc), '★ 每个字族的用途说明走 about.fontsUse* 字典（不硬编码中文）');
const aboutZh = readFileSync(path.join(root, 'src', 'i18n', 'parts', 'about.zh-CN.js'), 'utf8');
const useKeys = [...aboutSrc.matchAll(/useKey:\s*'(about\.fontsUse\w+)'/g)].map(m => m[1]);
const missingUseKeys = useKeys.filter(k => !new RegExp(`${k.split('.')[1]}:`).test(aboutZh));
ok(
  missingUseKeys.length === 0 && useKeys.length >= 7,
  `★ 全部字族说明都在 about 字典里（${useKeys.length} 项）` +
    (missingUseKeys.length ? ' → 缺：' + missingUseKeys.join(', ') : '')
);

done();
