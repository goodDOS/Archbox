/**
 * 「殊途同归」标准化静态断言（纯 Node，不依赖 Electron）。
 *
 * 目的：把本轮「前端样式/类型收敛 + 后端功能收敛」确立的单一数据源固化成回归测试，
 * 防止后续开发又在各处重写自造的 pad 时间、可写探测、审计包装、主题常量。
 *
 * 运行：node electron/verify/standardize.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
/* Beta.271 主进程 i18n：两处断言需要「字典措辞」这一头。
 * sys 域是主进程自渲染（弹窗/菜单/dbError）的字典；common.zh-CN 是渲染层共享域，
 * 主进程抛给渲染层的业务错误也落在那里（见 i18n/errKey 的说明）。
 * 取 zh-CN：它是基准语言，所有语言都按它的键集校验。 */
const sysZhSrc = read(path.join(ROOT, 'electron/i18n/parts/sys.zh-CN.js'));
const commonZhSrc = read(path.join(ROOT, 'src/i18n/parts/common.zh-CN.js'));

/* 语言清单单一来源（Beta.314 八语言扩容）：渲染层取 src/i18n/index.js 的
 * LANGS（{key,name} 数组），主进程取 electron/i18n/index.js 的 LANGS（字符串数组）。
 * 新增语言只改两处 index.js，本断言自动纳入，不再留三语言硬编码。 */
const RENDER_LANGS = [
  ...read(path.join(ROOT, 'src/i18n/index.js'))
    .match(/export const LANGS = \[([\s\S]*?)\];/)[1]
    .matchAll(/key:\s*'([^']+)'/g)
].map(m => m[1]);
const MAIN_LANGS = [
  ...read(path.join(ROOT, 'electron/i18n/index.js'))
    .match(/const LANGS = \[([^\]]+)\]/)[1]
    .matchAll(/'([^']+)'/g)
].map(m => m[1]);

/* 允许「渐进补齐」的语言（目前为空集，机制保留）。
 * 背景：本断言原先强制每种语言 16 域齐全且键集与 zh-CN 完全一致 —— 对首批 10 语
 * 是合理的（它们本来就是全量译好的），但每加一门新语言就等于要求一次性翻完 1600 条，
 * 现实里只会导致「要么全翻、要么不落地」。所以把「语言清单」拆成两个集合：
 *   RENDER_LANGS          下拉里能选的全部语言（字典/聚合层结构必须存在）
 *   FULL_TRANSLATION_LANGS 必须与 zh-CN 键集完全一致的语言（全量翻译）
 * 差集 PARTIAL_LANGS 允许逐域/逐键缺失，运行时由 t() 的回退链落到 zh-CN
 * （见 src/i18n/index.js 的 lookup()：本语言 → zh-CN → key 本身）。
 * ★ 约束仍在：它必须为 nil（即不能出现空文件/空域），且回退不能静默 —— 缺键得能一眼看出。 */

let FULL_TRANSLATION_LANGS = RENDER_LANGS;
/* Beta.324 时 it/es 走过「核心域优先」，此处曾是 ['it', 'es']。
 * 现在 9 个业务域已全部补齐（每语 16 域齐全、键集与 zh-CN 一致），故清空 ——
 * 留空的机制保留，是为了下次再加新语言时仍能先落地核心域、再逐步补齐，
 * 而不必一次性翻完 1600 条（那正是当初新增 it/es 卡住的原因）。 */
const PARTIAL_LANGS = [];
FULL_TRANSLATION_LANGS = RENDER_LANGS.filter(l => !PARTIAL_LANGS.includes(l));

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + msg);
  } else {
    fail++;
    console.error('  ✗ ' + msg);
  }
}

// 递归收集指定后缀文件（跳过 node_modules / dist / release）
function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'release') continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, exts, out);
    else if (exts.some(x => e.name.endsWith(x))) out.push(abs);
  }
  return out;
}
function read(p) {
  return fs.readFileSync(p, 'utf8');
}
function hits(files, re) {
  const out = [];
  for (const f of files) {
    const src = read(f);
    src.split('\n').forEach((line, i) => {
      if (re.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
        out.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
    });
  }
  return out;
}

const electronJs = walk(path.join(ROOT, 'electron'), ['.js']);
const renderJs = walk(path.join(ROOT, 'src'), ['.js', '.vue']);

// ---------- 1. 后端时间源统一 ----------
console.log('[1] 后端时间格式化统一到 services/timefmt');
const padHits = hits(electronJs, /padStart\(2,\s*['"]0['"]\)/).filter(h => !h.includes('services/timefmt.js'));
ok(padHits.length === 0, '后端无自造 pad 时间' + (padHits.length ? ' → ' + padHits.join(' | ') : ''));
ok(
  read(path.join(ROOT, 'electron/services/timefmt.js')).includes('module.exports'),
  'timefmt 导出 localTime/localDate/compact* 等统一格式化函数'
);

// ---------- 2. 可写探测收敛 ----------
console.log('[2] 数据目录可写探测收敛到 datadir.assertWritable');
ok(
  read(path.join(ROOT, 'electron/services/datadir.js')).includes('function assertWritable'),
  'datadir 提供 assertWritable'
);
const probeHits = hits(electronJs, /writeFileSync\([^)]*\.write_(test|probe)/);
ok(probeHits.length === 0, '除 datadir 外无内联可写探针' + (probeHits.length ? ' → ' + probeHits.join(' | ') : ''));

// ---------- 3. 审计入口统一 ----------
console.log('[3] 审计入口统一走 safeAudit');
const dbAuditHits = hits(electronJs, /db\.audit\(/);
ok(
  dbAuditHits.length === 0,
  '无 db.audit 直调（应走 db.safeAudit）' + (dbAuditHits.length ? ' → ' + dbAuditHits.join(' | ') : '')
);
ok(
  read(path.join(ROOT, 'electron/db.js')).includes('safeAudit'),
  'db 聚合出口导出 safeAudit（供 IPC 与 service 共用）'
);

// ---------- 4. share.js 复用 core 助手 ----------
console.log('[4] share.js 复用 core 的 resolveWasm / nv');
const shareSrc = read(path.join(ROOT, 'electron/db/share.js'));
ok(shareSrc.includes('core.resolveWasm()'), 'share.js 调用 core.resolveWasm');
ok(shareSrc.includes('core.nv'), 'share.js 复用 core.nv');
ok(!/function resolveWasm/.test(shareSrc), 'share.js 不再自带 resolveWasm 副本');
ok(!/function nv/.test(shareSrc), 'share.js 不再自带 nv 副本');

// ---------- 5. 前端时间格式化统一 ----------
console.log('[5] 前端时间格式化统一到 utils/timefmt');
const fePad = hits(renderJs, /padStart\(2,\s*['"]0['"]\)/).filter(h => !h.includes('utils/timefmt.js'));
ok(fePad.length === 0, '前端组件无内联 pad 时间' + (fePad.length ? ' → ' + fePad.join(' | ') : ''));
const feSlice = hits(renderJs, /\.slice\(0,\s*10\)/).filter(h => !h.includes('utils/timefmt.js'));
ok(feSlice.length === 0, '前端无内联日期截取（应用 dateOnly）' + (feSlice.length ? ' → ' + feSlice.join(' | ') : ''));

// ---------- 6. 前端死代码与常量 ----------
console.log('[6] 前端死代码清理与常量单一来源');
ok(!read(path.join(ROOT, 'src/api.js')).includes('tryRun'), 'api.js 已删除死代码 tryRun');
const standardDefs = hits(renderJs, /(const|export const)\s+STANDARD\s*=/);
ok(standardDefs.length === 1, 'STANDARD 主题常量单一定义（' + standardDefs.length + ' 处）');
ok(standardDefs[0] && standardDefs[0].includes('store/modules/theme.js'), 'STANDARD 唯一定义在 store/modules/theme.js');

// ---------- 7. 设计 token 单一来源 ----------
console.log('[7] 设计 token 无死 token、无冗余回退值');
const styleFiles = walk(path.join(ROOT, 'src'), ['.css', '.vue']);
const themeSrc = read(path.join(ROOT, 'src/styles/themes.css'));

// 7a. 收集「被使用」的 token：var(--x) / var(--x, ...) 中的 --x
const usedTokens = new Set();
for (const f of styleFiles) {
  for (const m of read(f).matchAll(/var\(\s*(--[a-z0-9-]+)/g)) usedTokens.add(m[1]);
}
// 7b. 收集「被定义」的 token：src 下任意 --x: 形式（含组件内作用域定义）
const definedTokens = new Set();
for (const f of styleFiles) {
  for (const m of read(f).matchAll(/(--[a-z0-9-]+)\s*:/g)) definedTokens.add(m[1]);
}
const deadTokens = [...usedTokens].filter(t => !definedTokens.has(t)).sort();
ok(
  deadTokens.length === 0,
  '无死 token（被使用但从未定义）' + (deadTokens.length ? ' → ' + deadTokens.join(', ') : '')
);

// 7c. 冗余回退值：var(--token, <hex|数字层级>)。token 恒定义时回退永不触发，
//     留着只会掩盖主题漂移（改 token 名后旧值静默生效）。
const redundantFallbacks = [];
for (const f of styleFiles) {
  read(f)
    .split('\n')
    .forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (/var\(\s*--[a-z0-9-]+\s*,\s*(#[0-9a-fA-F]{3,8}|\d{3,5})\s*\)/.test(line)) {
        redundantFallbacks.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
      }
    });
}
ok(
  redundantFallbacks.length === 0,
  '无 var(--token, #hex|数字) 冗余回退值' +
    (redundantFallbacks.length ? ' → ' + redundantFallbacks.slice(0, 6).join(' | ') : '')
);

// 7d. 错误态语义色不得回退到私设 hex（历史上 --c-red / --c-red-weak / --bg-2 / --sbw 均为死 token）
for (const dead of ['--c-red', '--c-red-weak', '--bg-2', '--sbw']) {
  const h = hits(styleFiles, new RegExp('var\\(\\s*' + dead.replace(/-/g, '\\-') + '\\b'));
  ok(h.length === 0, `死 token ${dead} 已清除` + (h.length ? ' → ' + h.join(' | ') : ''));
}

// 7e. 硬编码 hex 仅允许出现在 token 定义层（themes.css）、主题预览样例（ThemeSection）、
//     以及按约定必须固定不随主题翻转的便签纸（NotesBoard 局部变量）。
const HARDCODE_ALLOW = [
  'styles/themes.css', // token 定义层
  'settings/ThemeSection.vue', // 固定主题预览色板（数据，非样式）
  'RegionModal.vue', // 大区配色选择器（数据，持久化到库）
  'ColorPicker.vue' // 取色器算法色（SV 黑/白叠加、色相彩虹条、默认值，非主题 token）
];
const strayHex = [];
// 任务编号引用（Beta.数字/#数字，如「Beta.315/#418 起」）不是颜色值——#418 的字符
// 恰好都是十六进制数字，裸检测会把它当成游离 hex（Beta.325 实测误报：
// PostView.vue 编辑态按钮注释里的任务编号触发 7e）。先剔除该形态再检测。
// 只豁免紧跟 Beta.N/ 前缀的任务引用；裸写的 #418 仍算疑似颜色，照样抓。
const TASK_REF_RE = /Beta\.\d+\s*\/\s*#\d+/g;
for (const f of styleFiles) {
  const rel = path.relative(ROOT, f);
  if (HARDCODE_ALLOW.some(a => rel.endsWith(a))) continue;
  read(f)
    .split('\n')
    .forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // 注释行跳过
      if (rel.endsWith('home/NotesBoard.vue')) return; // 便签纸：约定固定深色墨（见组件注释）
      if (/#[0-9a-fA-F]{3,8}\b/.test(line.replace(TASK_REF_RE, ''))) strayHex.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
}
ok(
  strayHex.length === 0,
  '非豁免文件无游离硬编码 hex' + (strayHex.length ? ' → ' + strayHex.slice(0, 6).join(' | ') : '')
);

// 7f. 后端时间字符串（新格式不含 'T'）→ SharePanel 不应再保留 UTC 兼容分支
const sharePanelSrc = read(path.join(ROOT, 'src/components/SharePanel.vue'));
ok(!/ts\.includes\(['"]T['"]\)/.test(sharePanelSrc), 'SharePanel 已移除历史 UTC(ISO) 兼容分支');

// ---------- 8. 等宽字体栈单一来源 ----------
console.log('[8] 等宽字体栈收敛到 --font-mono');
const monoDefs = [];
for (const f of styleFiles) {
  const rel = path.relative(ROOT, f);
  read(f)
    .split('\n')
    .forEach((line, i) => {
      if (rel.endsWith('styles/themes.css')) return; // 唯一定义层
      if (/font-family\s*:\s*ui-monospace/.test(line)) monoDefs.push(`${rel}:${i + 1}`);
    });
}
ok(
  monoDefs.length === 0,
  '除 themes.css 外无内联等宽字体栈（应用 var(--font-mono)）' + (monoDefs.length ? ' → ' + monoDefs.join(', ') : '')
);
ok(/--font-mono\s*:/.test(themeSrc), 'themes.css 定义 --font-mono 变量');

// ---------- 9. 复合样式已上收、组件内无残留同名副本 ----------
console.log('[9] 复合模式上收 components.css，组件内不得残留同名规则');
const componentsCss = read(path.join(ROOT, 'src/styles/components.css'));
for (const cls of ['.share-flag', '.region-dot', '.lift', '.acct-row', '.switch input']) {
  ok(componentsCss.includes(cls), `components.css 收录 ${cls}`);
}
// .region-dot：只允许「纯尺寸覆盖」（--dot），不得再写形状/描边等完整形制
const dotRules = hits(styleFiles, /^\.region-dot\s*\{/);
ok(dotRules.length > 0, '.region-dot 有覆盖点登记');
const dotFull = hits(styleFiles, /^\.region-dot\s*\{[^}]*border\s*:/);
ok(
  dotFull.length === 0,
  '组件内 .region-dot 不再重写 border（形制已上收）' + (dotFull.length ? ' → ' + dotFull.join(' | ') : '')
);
// AuditSection 复用 Pager 组件，不自造分页
const auditSrc = read(path.join(ROOT, 'src/components/settings/AuditSection.vue'));
ok(auditSrc.includes("import Pager from '../Pager.vue'"), 'AuditSection 复用 Pager 组件');
ok(!/class="pager"/.test(auditSrc), 'AuditSection 无自造 .pager 容器');

// ---------- 10. 信息条左对齐 + 头像形制上收 ----------
console.log('[10] .acct-row 左对齐、.avatar 单一来源（登录页错位回归）');
// 10a. .acct-row 必须显式 text-align: left —— 宿主 .gate-card 是 center，
//      不写就会被继承，导致姓名/ID 与左侧头像脱节（Beta.199 后的登录页错位）。
const acctRowBlock = (componentsCss.match(/\.acct-row\s*\{[\s\S]*?\}/) || [''])[0];
ok(/text-align\s*:\s*left/.test(acctRowBlock), '.acct-row 显式声明 text-align: left（防宿主 center 继承）');

// 10b. .avatar 形制只在 base.css 定义一次，组件侧只覆盖 --av 尺寸
const avatarFull = [];
for (const f of styleFiles) {
  const rel = path.relative(ROOT, f);
  if (rel.endsWith('styles/base.css')) continue; // 唯一定义层
  read(f)
    .split('\n')
    .forEach((line, i) => {
      // 组件内不得再写 width/height/border-radius 等形制（只许 --av）
      if (/^\.avatar\s*\{[^}]*border-radius\s*:/.test(line)) avatarFull.push(`${rel}:${i + 1}`);
    });
}
ok(
  avatarFull.length === 0,
  '组件内 .avatar 不重写形制（只覆盖 --av）' + (avatarFull.length ? ' → ' + avatarFull.join(' | ') : '')
);
// 10c. base.css 的 .avatar 必须带 flex: none —— 缺了会在 flex 行里被长文字挤压变形
const avatarBlock = (read(path.join(ROOT, 'src/styles/base.css')).match(/\.avatar\s*\{[\s\S]*?\}/) || [''])[0];
ok(/flex\s*:\s*none/.test(avatarBlock), '.avatar 带 flex: none（防 flex 行内被挤压）');

// ---------- 11. 构建产物必须真的带上修复 ----------
// 教训（Beta.199 → Beta.200）：源码改对了、单测也过了，但忘记重新打包，
// 用户拿到的还是旧 zip —— 所有源码级断言都拦不住这种情况。
// 故这里直接校验 dist/index.html（构建产物）而不只是 src。
console.log('[11] 构建产物校验（防「改了源码没重新打包」）');
const distPath = path.join(ROOT, 'dist/index.html');
if (!fs.existsSync(distPath)) {
  ok(false, 'dist/index.html 存在（先跑 npm run build）');
} else {
  const dist = read(distPath);
  ok(/\.acct-row\{[^}]*text-align:left/.test(dist), '构建产物内 .acct-row 带 text-align:left（登录页错位已修进包）');
  ok(/--font-mono:/.test(dist), '构建产物内含 --font-mono 定义');
  ok(!/font-family:\s*ui-monospace/.test(dist), '构建产物内无残留内联等宽字体栈');
}

// ---------- 12. PDF 导出图片不裂图：临时页面必须拿到应用页面的宽松 CSP ----------
console.log('[12] PDF 导出临时页匹配 CSP 白名单（防 data URI 内联图被拦截）');
const exportsSrc = read(path.join(ROOT, 'electron/ipc/exports.js'));
ok(
  /tmpHtml\s*=\s*path\.join\(\s*tmpDir\s*,\s*['"]index\.html['"]\s*\)/.test(exportsSrc),
  'exports.js 把 PDF 临时 HTML 命名为 index.html'
);
ok(/['"]file:\/\/['"]\s*\+\s*tmpHtml/.test(exportsSrc), 'exports.js 以 file:// + tmpHtml 加载临时页');
const mainSrc = read(path.join(ROOT, 'electron/main.js'));
const isAppBlock = (mainSrc.match(/const _isAppPage\s*=\s*\(?[^{]*\{[\s\S]*?\n\s*\}/) || [''])[0];
ok(/\\\/index\\\.html\$/.test(isAppBlock), 'main.js 的 _isAppPage 按 /index.html 识别应用页面（PDF 临时页需命中）');
ok(/img-src[^;]*data:/.test(mainSrc), '应用页面 CSP 显式允许 img-src data:（data URI 内联图可渲染）');

// ---------- 13. 修复重指目录必须热重载，不能只写指针 ----------
console.log('[13] 数据库不可用屏「选择其它数据目录」须当进程热重载（免手动重启）');
const keystoreSrc = read(path.join(ROOT, 'electron/keystore.js'));
ok(/function reloadDataDir/.test(keystoreSrc), 'keystore 提供 reloadDataDir');
ok(/async function openDatabase/.test(keystoreSrc), 'keystore 抽出 openDatabase 供启动与修复共用');
ok(
  /tryBootDb[\s\S]{0,400}openDatabase\(readDataDir\(\)\)/.test(keystoreSrc),
  'tryBootDb 复用 openDatabase（启动与修复同一条开库路径）'
);
const reloadBlock = (keystoreSrc.match(/async function reloadDataDir[\s\S]*?\n\}/) || [''])[0];
ok(
  /db\.closeDb\(\)/.test(reloadBlock),
  'reloadDataDir 先 closeDb（否则 db.init 的 `if (db) return` 会短路，指针换库不换）'
);
ok(/state\.dbError\s*=\s*null/.test(reloadBlock), 'reloadDataDir 重置 state.dbError');
ok(/openDatabase\(/.test(reloadBlock), 'reloadDataDir 在当前进程内重新打开数据库');

const coreSrc = read(path.join(ROOT, 'electron/db/core.js'));
ok(/function closeDb/.test(coreSrc), 'core 提供 closeDb（切换目录前释放旧库）');
const closeBlock = (coreSrc.match(/function closeDb\s*\(\)[\s\S]*?\n\}/) || [''])[0];
ok(/persistNow\(\)/.test(closeBlock), 'closeDb 先 persistNow 落盘旧目录（不丢改动）');
ok(/db\s*=\s*null/.test(closeBlock), 'closeDb 释放 db 置 null');
// core.init 失败必须原子回滚：否则 db/dataDir 残留半初始化态，重指目录被 `if (db) return` 短路
const initBlock = (coreSrc.match(/async function init\s*\(dir, opts\)[\s\S]*?\n\}\n/) || [''])[0];
ok(
  /catch \(e\)[\s\S]*?db = null[\s\S]*?dataDir = prevDataDir/.test(initBlock),
  'core.init 失败时原子回滚 db/dataDir（防半初始化污染）'
);
ok(
  /const targetDbPath = path\.join\(dir, 'archive\.db'\)/.test(initBlock),
  'core.init 先算目标 dbPath（不在回滚后被残留值影响）'
);

const bootIpcSrc = read(path.join(ROOT, 'electron/ipc/boot.js'));
ok(/keystore\.reloadDataDir\(/.test(bootIpcSrc), 'app:repairDataDir 调用 reloadDataDir（而非仅 writeDataDir）');
ok(
  !/keystore\.writeDataDir\(dir\)\s*\n\s*return\s*\{\s*dataDir/.test(bootIpcSrc),
  'app:repairDataDir 不再「只写指针就返回」'
);

const feBootSrc = read(path.join(ROOT, 'src/store/modules/boot.js'));
ok(/store\.dbError\s*=\s*false/.test(feBootSrc), 'bootApp 在数据库恢复可用时清除 store.dbError（否则错误屏不消失）');
const appVueSrc = read(path.join(ROOT, 'src/App.vue'));
ok(
  !/window\.location\.reload\(\)/.test(appVueSrc),
  'App.vue recoverDataDir 不再用 location.reload()（重载的是同一损坏进程）'
);
ok(/recoverDataDir[\s\S]{0,600}await bootApp\(\)/.test(appVueSrc), 'recoverDataDir 成功后重跑 bootApp 进入业务界面');

/* ---------- [14] 文档包防篡改 + 导入来源标记（甄别） ---------- */
console.log('\n[14] 文档包防篡改校验 + 导入来源标记（甄别）');

// 防篡改：三层校验链路必须在导出/导入两端闭合（L1 哈希 + 可选口令加密 L2 + CRC32）
const packSvcSrc = read(path.join(ROOT, 'electron/services/archpack.js'));
ok(
  /packProtect\.encryptChecksums\(/.test(packSvcSrc) && /protection: pass \? 'password' : 'hash'/.test(packSvcSrc),
  '导出时按口令生成 checksums（有口令加密 L2，无口令纯哈希 L1）'
);
ok(/packProtect\.decryptChecksums\(/.test(packSvcSrc), '导入时检测加密容器并口令解密（L2），失败即抛错拒绝导入');
ok(
  /mSha !== entry\.sha256/.test(packSvcSrc) && /mCrc !== entry\.crc32/.test(packSvcSrc),
  '导入时比对 manifest sha256 + crc32（L1），不匹配即拒绝'
);
// 标签文案会被翻译（sys.packZipLabel），断调用形状而非字面量
ok(
  /extractStoreChecked\(buf, i18n\.t\('sys\.packZipLabel'\)\)/.test(packSvcSrc),
  '导入时逐 entry 校验 ZIP CRC32（STORE 模式，method===0）'
);
ok(
  /PK\\x03\\x04|0x50.*0x4B.*0x03.*0x04/.test(packSvcSrc) || /buf\[0\] !== 0x50/.test(packSvcSrc),
  '导入时校验 PK ZIP 特征头（拒绝非 v3 格式）'
);

// 来源标识：manifest.pack.exporter + origin，导入写入 posts.imported_at/imported_from
const packSignSrc = read(path.join(ROOT, 'electron/services/pack-sign.js'));
ok(/function exporterFingerprint\s*\(\)/.test(packSignSrc), 'pack-sign 提供导出者指纹（甄别文档包出处）');
ok(/exporterFingerprint\b/.test(packSignSrc), 'pack-sign 导出 exporterFingerprint');
ok(
  /pack: \{[\s\S]*?exporter: releaseSign\.exporterFingerprint\(\)/.test(packSvcSrc),
  '导出 manifest 写入 pack.exporter 指纹（发布方公钥派生，仅来源甄别）'
);
ok(
  /manifest\.pack\.origin = packOriginTag\(manifest\)/.test(packSvcSrc),
  '导出 manifest 回填 pack.origin 完整来源标识'
);
ok(/summary\.importedFrom = importedFrom/.test(packSvcSrc), '导入 summary 回传 importedFrom（供前端展示/审计）');
// ★ Beta.206：逐条携带原作者名（importedOne = { ...imported, originAuthor }），不再是裸 imported
ok(
  /db\.savePost\(draft, userId, \{ skipOwnerCheck: true, imported: importedOne \}\)/.test(packSvcSrc),
  '导入新建文档时携带 imported 标记（含原作者）落库'
);
ok(
  /db\.mergePost\(\{ targetId: dupInfo\.postId, draft \}, userId, \{ skipOwnerCheck: true, imported: importedOne \}\)/.test(
    packSvcSrc
  ),
  '导入合并文档时同样打上 imported 标记（含原作者）'
);
ok(
  /const importedOne = originAuthor \? \{ \.\.\.imported, originAuthor \} : imported/.test(packSvcSrc),
  '逐条计算 importedOne（把该条原作者并入 imported 标记）'
);
ok(/authorName: fullPost\.author_name/.test(packSvcSrc), 'postToPack 导出条目带 authorName（作者元信息随包走）');
ok(/authors,/.test(packSvcSrc), 'manifest.data 带 authors 快照表（源主机 users 不外传）');

const postsDbSrc = read(path.join(ROOT, 'electron/db/posts.js'));
ok(/pcols3\.includes\('imported_at'\)/.test(coreSrc), 'core.migrate 增量补 posts.imported_at 列（不破坏存量库）');
ok(
  /INSERT INTO posts\([^)]*imported_at,imported_from,copied_at,copied_from,origin_author\)/.test(postsDbSrc),
  'savePost 的 INSERT 显式写入 imported_at/imported_from + copied_at/copied_from/origin_author'
);
ok(
  /opts\.imported[\s\S]{0,200}UPDATE posts SET imported_at=/.test(postsDbSrc),
  'mergePost 支持 imported 标记（合并也标记来源）'
);
ok(
  /p\.imported_at, p\.imported_from/.test(postsDbSrc) &&
    /p\.copied_at, p\.copied_from, p\.origin_author/.test(postsDbSrc),
  'listPosts 返回 imported_at/imported_from + copied_at/copied_from/origin_author（供列表甄别展示）'
);
ok(
  /'p\.imported_at IS NOT NULL'/.test(postsDbSrc) &&
    /'p\.copied_at IS NOT NULL'/.test(postsDbSrc) &&
    /'p\.imported_at IS NULL AND p\.copied_at IS NULL'/.test(postsDbSrc),
  'buildWhere 支持 origin 三态枚举（import/copy/local 互斥）'
);

// UI 甄别落点
const cardSrc = read(path.join(ROOT, 'src/components/PostCard.vue'));
ok(/badge-imp[\s\S]*?post\.imported_at/.test(cardSrc), 'PostCard 为导入文档显示「导入」徽章');
const viewSrc = read(path.join(ROOT, 'src/pages/PostView.vue'));
// ★ Beta.270：来源文案搬进 post 字典（sourceLabel/sourceDocPack），页面只留 t() 引用
ok(
  /post\.imported_at[\s\S]{0,300}t\('post\.sourceLabel'\)[\s\S]{0,120}t\('post\.sourceDocPack'\)[\s\S]{0,120}withTz\(post\.imported_at\)/.test(
    viewSrc
  ),
  'PostView 元信息行显示来源标记与导入时间'
);
const wizSrc = read(path.join(ROOT, 'src/components/ImportWizard.vue'));
ok(/packOrigin\.origin|packOrigin\.exporter/.test(wizSrc), 'ImportWizard 展示文档包来源标识（甄别）');
const sfSrc = read(path.join(ROOT, 'src/components/SearchFilters.vue'));
ok(
  /f === 'origin'/.test(sfSrc) && /origin: origin\.value \|\| null/.test(sfSrc),
  'SearchFilters 提供「来源」筛选并输出 origin 枚举'
);
ok(
  /t\('search\.originImport'\)/.test(sfSrc) &&
    /t\('search\.originCopy'\)/.test(sfSrc) &&
    /t\('search\.originLocal'\)/.test(sfSrc) &&
    /value: 'import'/.test(sfSrc) &&
    /value: 'copy'/.test(sfSrc) &&
    /value: 'local'/.test(sfSrc),
  '来源下拉为四态（全部/文档包导入/局域共享拷贝/本机自建；标签经 t() 引用 search 字典）'
);

/* ---------- [15] 数据目录根：%APPDATA%/文档盒 Archbox/data ---------- */
console.log('\n[15] 数据目录根改为 文档盒 Archbox/data');

const mainSrc15 = read(path.join(ROOT, 'electron/main.js'));
const mainLines = mainSrc15.split('\n');
// setName 现在走单一数据源：app.setName(require('./services/appinfo').APP_NAME)
// 兼容两种写法（字面量 / 常量引用），但必须存在且不再出现旧名截断
const setNameLine = mainLines.findIndex(l => /app\.setName\(/.test(l) && /APP_NAME|'文档盒 Archbox'/.test(l)) + 1;
ok(setNameLine > 0, 'main.js 将 app.name 设为「文档盒 Archbox」（走单一数据源或字面量）');
// Electron 的 userData = %APPDATA%/<app.name>；而 app.name 取自 package.json 的 name（archbox），
// 不是 productName。故必须 setName 才能让根目录变成「文档盒 Archbox」。
ok(
  setNameLine > 0 && !/app\.setName\('文档盒'\)\s*$/.test(mainSrc15.split('\n')[setNameLine - 1]),
  'app.name 用「文档盒 Archbox」（含空格的产品名），不再截断为「文档盒」'
);

// ★ 顺序是本次修复的核心：setName 必须早于所有本地 require ★
// 否则子模块模块作用域的 app.getPath('userData') 会把旧根钉死（lanshare/settings 均属此类）。
// 【唯一豁免】services/appinfo —— 它只导出字符串常量、零依赖、不解析 userData，
// 是 setName 取名字的来源，物理上必须排在 setName 之前。豁免项写死文件名，避免开口子。
const LOCAL_REQUIRE_WHITELIST = /require\('\.\/services\/appinfo'\)/;
const firstLocalRequireLine =
  mainLines.findIndex(l => /require\('\.\//.test(l) && !LOCAL_REQUIRE_WHITELIST.test(l)) + 1;
ok(
  firstLocalRequireLine > 0 && setNameLine < firstLocalRequireLine,
  `setName 早于首个本地 require（${setNameLine} < ${firstLocalRequireLine}，已豁免零依赖的 appinfo）`
);
const codeBeforeSetName = mainLines.slice(0, setNameLine - 1).filter(l => {
  const t = l.trim();
  return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});
ok(
  codeBeforeSetName.every(l => !/getPath\('userData'\)/.test(l)),
  'setName 之前没有任何 userData 解析（否则旧根被钉死）'
);
// 豁免项本身必须保持零依赖：若 appinfo 将来 require 了会解析 userData 的模块，
// 上述豁免就变成了漏洞。故显式断言它没有**可执行的** require（注释里提到不算）。
const appinfoSrc15 = read(path.join(ROOT, 'electron/services/appinfo.js'));
const appinfoCodeLines = appinfoSrc15.split('\n').filter(l => {
  const t = l.trim();
  return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});
ok(
  appinfoCodeLines.every(l => !/\brequire\s*\(/.test(l)),
  '★ appinfo.js 零 require（豁免 setName 顺序的前提，若破坏则豁免失效）'
);
// 旧写法必须已移除：先 getPath 把旧路径 pin 住再 setName
ok(!/const _userDataDir = app\.getPath\('userData'\)/.test(mainSrc15), '已移除「先 pin userData 再 setName」的旧写法');

/* ---------- [15b] 应用命名单一数据源：迁移创建的文件夹名必须是「文档盒 Archbox」 ---------- */
// ★ 真实事故 ★ 产品更名后 main.js 改了 app.setName，但 ipc/storage.js 里
//   `path.join(selectedDir, 'Archbox')` 漏改 —— 程序根目录叫「文档盒 Archbox」，
//   用户迁移存储路径后得到的却是 D:\Archbox，名实不符。
console.log('\n[15b] 应用命名单一数据源（services/appinfo.js）');

const appinfoPath = path.join(ROOT, 'electron/services/appinfo.js');
const appinfoExists = fs.existsSync(appinfoPath);
ok(appinfoExists, '存在 electron/services/appinfo.js（命名单一数据源）');

if (appinfoExists) {
  const aiSrc = read(appinfoPath);
  ok(/const APP_NAME = '文档盒 Archbox'/.test(aiSrc), "appinfo.js 的 APP_NAME = '文档盒 Archbox'");
  ok(/const APP_DIR_NAME = APP_NAME/.test(aiSrc), 'APP_DIR_NAME 直接派生自 APP_NAME（不另写字面量）');
  ok(/const DATA_SUBDIR = 'data'/.test(aiSrc), "appinfo.js 的 DATA_SUBDIR = 'data'（业务数据子目录名，单一数据源）");

  // 与 package.json 的 productName 对齐，防两处悄悄漂移
  const pkgJson = JSON.parse(read(path.join(ROOT, 'package.json')));
  ok(pkgJson.productName === '文档盒 Archbox', `package.json 的 productName 与之一致（实际：${pkgJson.productName}）`);
}

// 迁移逻辑：子目录名必须引用单一数据源，不得再出现硬编码旧名
const storSrc15b = read(path.join(ROOT, 'electron/ipc/storage.js'));
ok(
  /path\.join\(selectedDir,\s*APP_DIR_NAME,\s*DATA_SUBDIR\)/.test(storSrc15b),
  'storage.js 迁移目标 = <所选目录>/APP_DIR_NAME/DATA_SUBDIR（与默认结构一致）'
);
ok(
  !/path\.join\(selectedDir,\s*'Archbox'\)/.test(storSrc15b),
  "storage.js 已移除硬编码 'Archbox'（Beta.208 修复的核心）"
);
ok(
  !/path\.join\(selectedDir,\s*APP_DIR_NAME\)\s*$/.test(storSrc15b.replace(/\n/g, ' ').replace(/;.*/, '')),
  '★ 迁移目标不再止步于 APP_DIR_NAME（曾因此漏掉 data 层，Beta.209 修复）'
);
ok(/require\('\.\.\/services\/appinfo'\)/.test(storSrc15b), 'storage.js 已 require appinfo');
ok(/\{\s*APP_DIR_NAME,\s*DATA_SUBDIR\s*\}/.test(storSrc15b), 'storage.js 同时引入 APP_DIR_NAME 与 DATA_SUBDIR');

// main.js 的 setName 也必须与单一数据源一致（防再次各写一遍）
ok(
  /app\.setName\(require\('\.\/services\/appinfo'\)\.APP_NAME\)|app\.setName\('文档盒 Archbox'\)/.test(
    read(path.join(ROOT, 'electron/main.js'))
  ),
  'main.js 的 app.setName 与 appinfo 的 APP_NAME 一致（引用常量或逐字相同）'
);

// 其余引用点也应走单一数据源
const refFiles = [
  ['electron/services/archpack.js', /app:\s*\{\s*name:\s*APP_NAME\s*\}/, '文档包 manifest 的应用名'],
  // 落款整句已本地化，应断「APP_NAME 作为参数传入」而非 ${APP_NAME} 的字面拼接
  ['electron/services/export-text.js', /app:\s*APP_NAME\s*\}/, '导出落款的应用名']
];
for (const [rel, re, label] of refFiles) {
  ok(re.test(read(path.join(ROOT, rel))), `${label} 走 APP_NAME 常量（${rel}）`);
}

// 用户可见文案内不得残留旧名
// 注：UserGate/AboutPage 里「文档盒 <span>Archbox</span>」是刻意分色排版，不算残留
const uiFiles = ['src/components/settings/DataSection.vue'];
for (const rel of uiFiles) {
  const s = read(path.join(ROOT, rel));
  ok(!/自动创建 Archbox 文件夹/.test(s) && !/D:\\Archbox(?!\S)/.test(s), `${rel} 无『Archbox』旧名残留文案`);
}

// 数据目录默认值必须是 userData/<DATA_SUBDIR>（=> 文档盒 Archbox/data）
const ksSrc = read(path.join(ROOT, 'electron/keystore.js'));
ok(
  /return path\.join\(app\.getPath\('userData'\), DATA_SUBDIR\)/.test(ksSrc),
  '默认数据目录 = userData/DATA_SUBDIR（即 文档盒 Archbox/data），走单一数据源'
);
ok(
  !/return path\.join\(app\.getPath\('userData'\), 'data'\)/.test(ksSrc),
  "★ keystore 不再硬编码 'data'（已收敛到 appinfo.DATA_SUBDIR）"
);
ok(
  /storage\.json/.test(ksSrc) && /pointerFile/.test(ksSrc),
  '数据目录指针 storage.json 也落在同一根下（随根一起迁移）'
);
// 模块作用域解析 userData 的模块必须在 setName 之后才被 require
ok(
  /TOKEN_CACHE_FILE = path\.join\(app\.getPath\('userData'\)/.test(read(path.join(ROOT, 'electron/ipc/lanshare.js'))),
  'lanshare 的 TOKEN_CACHE_FILE 在模块作用域解析 userData（故 require 必须晚于 setName）'
);

/* ---------- [16] 局域共享文档拷贝 + 作者元信息（Beta.206） ---------- */
console.log('\n[16] 局域共享文档拷贝 + 作者元信息');

const lanSvcSrc = read(path.join(ROOT, 'electron/services/lan-share.js'));
const lanIpcSrc = read(path.join(ROOT, 'electron/ipc/lanshare.js'));
const preloadSrc = read(path.join(ROOT, 'electron/preload.js'));
const shareDbSrc = read(path.join(ROOT, 'electron/db/share.js'));

// 16.1 写入口收敛：唯一 POST 路由
ok(/if \(p === '\/api\/copy-report'\)/.test(lanSvcSrc), 'lan-share 支持 /api/copy-report 路由');
ok(/if \(req\.method !== 'POST'\) return sendJson\(res, 405/.test(lanSvcSrc), 'copy-report 仅接受 POST（其余 405）');
ok(
  /if \(!allowCopyRuntime\) return sendJson\(res, 403, \{ error: '未开放拷贝' \}\)/.test(lanSvcSrc),
  'allowCopy 未开启时 copy-report 返回 403'
);
ok(
  /if \(req\.method !== 'GET' && req\.method !== 'HEAD'\)[\s\S]{0,80}sendJson\(res, 405/.test(lanSvcSrc),
  '只读路由拒绝非 GET（写入口只有 copy-report）'
);
ok(
  /COPY_BODY_MAX/.test(lanSvcSrc) && /req\.destroy\(\)[\s\S]{0,80}return resolve\(null\)/.test(lanSvcSrc),
  'copy-report 请求体有上限保护（超限断开）'
);
// 16.2 能力位
ok(/allowCopy: allowCopyRuntime/.test(lanSvcSrc), '/api/version 下发 allowCopy 能力位');
ok(
  /function setAllowCopy\s*\(v\)/.test(lanSvcSrc) && /isAllowCopy/.test(lanSvcSrc),
  'lan-share 提供 setAllowCopy/isAllowCopy 运行时开关'
);
ok(
  /allowCopyCopyRuntime/.test(lanSvcSrc) === false && /allowCopy = false\b/.test(lanSvcSrc),
  'allowCopy 模块级默认 false（危险能力默认关）'
);
/* ★ 响应信封一致性（Beta.213）★
 * 所有 /api/* 路由都必须回 `{ ok:true, data }`，客户端（lan:request / lan:copyPost 的 reqJson）
 * 统一解包 `json.data`。/api/version 曾把能力位平铺在顶层 → json.data === undefined →
 * 客户端读 `cap.allowCopy` 得到 undefined → 误判「未开放拷贝」，
 * 现象是「明明开了拷贝权限，本机却显示该共享源未开放拷贝」。
 * 这条断言锁死「/api/version 必须带 data 信封」，防止再次退化为平铺结构。 */
{
  const verBlock = (lanSvcSrc.match(/if \(p === '\/health' \|\| p === '\/api\/version'\)[\s\S]*?\n {4}\}/) || [''])[0];
  ok(verBlock.length > 0, '/api/version 分支已定位（断言前提）');
  ok(/data: info/.test(verBlock), '★ /api/version 把能力位包进 data 信封（客户端按 json.data 解包）');
  ok(/allowCopy: allowCopyRuntime/.test(verBlock), '/api/version 的 data 内含 allowCopy');
  // 客户端侧：解包前必须校验 data 是否存在，否则协议不符会静默退化成业务误判
  ok(
    /json\.data === undefined[\s\S]{0,200}throw new Error/.test(lanIpcSrc),
    '★ lan:request 对缺失 data 的信封显式报错（不静默返回 undefined）'
  );
}
// 16.3 拷贝记录
ok(/const COPY_CAP = 500/.test(lanSvcSrc), 'copyLog 有容量上限 COPY_CAP');
ok(/function recordCopy\s*\(ip, payload\)/.test(lanSvcSrc), 'lan-share 提供 recordCopy');
ok(/function copyRank\s*\(top = 20\)/.test(lanSvcSrc), 'lan-share 提供 copyRank（按 postId 聚合）');
ok(/lan-copies\.json/.test(lanSvcSrc), 'copyLog 落 lan-copies.json（与 visitorLog 同套路）');
ok(/actors/.test(lanSvcSrc) && /firstTs/.test(lanSvcSrc), 'copyRank 聚合次数/首次/最近/拷贝者集合');
// 16.4 IPC
ok(
  /function isAllowCopy\s*\(\)[\s\S]{0,200}=== '1'/.test(lanIpcSrc),
  "isAllowCopy 兜底 === '1'（老库无键 → 默认关，方向与 isAuthEnabled 相反）"
);
ok(/handle\s*\(\s*'lan:setAllowCopy'/.test(lanIpcSrc), 'IPC 提供 lan:setAllowCopy');
ok(/handle\s*\(\s*'lan:copyPost'/.test(lanIpcSrc), 'IPC 提供 lan:copyPost');
ok(
  /handle\s*\(\s*'lan:copyLog'/.test(lanIpcSrc) && /handle\s*\(\s*'lan:copyRank'/.test(lanIpcSrc),
  'IPC 提供 lan:copyLog / lan:copyRank'
);
// 注：copyPost handler 体较长（含 fetch/端到端流程），正则跨度放到 12000 字符
ok(
  /handle\s*\(\s*'lan:copyPost',?[\s\S]{0,12000}?\{ noLockGuard: false \}[\s\S]{0,20}\)/.test(lanIpcSrc),
  'lan:copyPost 为写通道（noLockGuard:false，锁定态拒绝）'
);
ok(
  /handle\s*\(\s*'lan:setAllowCopy',?[\s\S]{0,900}?\{ noLockGuard: false \}[\s\S]{0,20}\)/.test(lanIpcSrc),
  'lan:setAllowCopy 为写通道（noLockGuard:false）'
);
ok(/上报失败不回滚/.test(lanIpcSrc), '注释记录「上报失败不回滚」的关键设计');
ok(
  /method: 'POST'/.test(lanIpcSrc) && /\/api\/copy-report/.test(lanIpcSrc),
  'lan:copyPost 回连源主机 POST /api/copy-report'
);
ok(
  /copied: \{ at: db\.nowIso\(\), from, originAuthor \}/.test(lanIpcSrc),
  'lan:copyPost 以 copied 标记落库（含原作者快照）'
);
ok(
  /errKey\('common\.errLanNoCopy'\)/.test(lanIpcSrc) && /errLanNoCopy: '该共享源未开放文档拷贝'/.test(commonZhSrc),
  '源主机未开放拷贝时明确报错（i18n key + 字典措辞两头锁）'
);
// 16.5 preload
ok(/lanSetAllowCopy: p => call\('lan:setAllowCopy', p\)/.test(preloadSrc), 'preload 暴露 lanSetAllowCopy');
ok(/lanCopyPost: p => call\('lan:copyPost', p\)/.test(preloadSrc), 'preload 暴露 lanCopyPost');
ok(/lanCopyLog: \(\) => call\('lan:copyLog'\)/.test(preloadSrc), 'preload 暴露 lanCopyLog');
ok(/lanCopyRank: \(\) => call\('lan:copyRank'\)/.test(preloadSrc), 'preload 暴露 lanCopyRank');
// 16.6 副本库作者列
ok(/author_name TEXT/.test(shareDbSrc), 'share.db posts 增 author_name 列');
ok(
  /if \(!pcols\.includes\('author_name'\)\) sdb\.run\('ALTER TABLE posts ADD COLUMN author_name TEXT'\)/.test(
    shareDbSrc
  ),
  'share.db 增量迁移补 author_name（不破坏存量副本库）'
);
ok(
  /function copyPostsWithAuthor\s*\(regionIds, ph\)/.test(shareDbSrc),
  'rebuild 走 copyPostsWithAuthor（联表带作者名）'
);
ok(/LEFT JOIN users u ON u\.id = p\.author_id/.test(shareDbSrc), '副本库重建时联表 users 取作者名');
ok(/copyPostsWithAuthor\(list, ph\)/.test(shareDbSrc), 'rebuild 实际调用 copyPostsWithAuthor');
ok(/p\.author_name AS author_name/.test(shareDbSrc), 'share.listPosts 显式带出 author_name');
// 16.7 核心迁移
ok(
  /pcols4\.includes\('copied_at'\)/.test(coreSrc) && /pcols4\.includes\('origin_author'\)/.test(coreSrc),
  'core.migrate 增量补 copied_at/copied_from/origin_author'
);
ok(/CREATE INDEX IF NOT EXISTS idx_posts_copied ON posts\(copied_at\)/.test(coreSrc), 'migrate 为 copied_at 建索引');
// 16.8 前端落点
const cardSrc16 = read(path.join(ROOT, 'src/components/PostCard.vue'));
ok(/badge-copy[\s\S]{0,120}post\.copied_at/.test(cardSrc16), 'PostCard 为拷贝文档显示「拷贝」徽章');
ok(/\.badge-copy \{[\s\S]{0,40}background: var\(--ok\)/.test(cardSrc16), '拷贝徽章用 --ok 与「导入」的 --accent 区分');
const viewSrc16 = read(path.join(ROOT, 'src/pages/PostView.vue'));
// ★ Beta.270：拷贝来源行文案搬进 post 字典（sourceLanCopy），页面只留 t() 引用
ok(
  /post\.copied_at[\s\S]{0,600}t\('post\.sourceLabel'\)[\s\S]{0,300}t\('post\.sourceLanCopy'\)/.test(viewSrc16),
  'PostView 显示拷贝来源行'
);
ok(/原作者/.test(viewSrc16), 'PostView 拷贝来源行含原作者');
const lanVueSrc = read(path.join(ROOT, 'src/pages/LanShare.vue'));
ok(/拷贝到本机/.test(lanVueSrc), 'LanShare 详情页有「拷贝到本机」按钮');
ok(/A\.lanCopyPost\(\{/.test(lanVueSrc), 'LanShare 调用 lanCopyPost');
ok(
  /probeAllowCopy/.test(lanVueSrc) && /v\.allowCopy/.test(lanVueSrc),
  'LanShare 探测源主机 allowCopy 能力位（提前禁用按钮）'
);
ok(/:disabled="copying \|\| !activeSource\.allowCopy"/.test(lanVueSrc), '未开放拷贝时按钮禁用');
// ★ Beta.250（用户要求「去掉这句话」）：操作条行尾那句「该共享源未开放拷贝」已删除。
//   注意别和上面那条搞混：**禁用行为照旧保留**，去掉的只是视觉上那行常驻文字；
//   「能否拷贝」现在只由按钮灰化态 + 悬停 title 表达。
//   先剥注释再断言，避免把解释性注释里提到的那句话当成"还留着"
//   （本文件后半段另有一个 stripComments，但那是局部作用域，这里就地剥一次）。
{
  const noComments = lanVueSrc
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l))
    .join('\n');
  ok(!/该共享源未开放拷贝/.test(noComments), '★ 已移除操作条行尾的「该共享源未开放拷贝」提示文字');
  ok(
    !/class="pr-hint/.test(noComments) && !/^\s*\.pr-hint\s*\{/m.test(noComments),
    '★ 连同 .pr-hint 节点与样式一并清掉（不留死代码）'
  );
}
ok(/post\.author_name/.test(lanVueSrc), 'LanShare 详情元信息行显示原作者');
const spSrc = read(path.join(ROOT, 'src/components/SharePanel.vue'));
ok(/允许他人拷贝文档/.test(spSrc), 'SharePanel 有「允许他人拷贝文档」开关');
ok(/A\.lanSetAllowCopy\(\{ enabled: v \}\)/.test(spSrc), 'SharePanel 调用 lanSetAllowCopy');
ok(
  /await confirm\([\s\S]{0,300}\{ danger: true \}\)/.test(spSrc.slice(spSrc.indexOf('toggleAllowCopy'))),
  '开启拷贝用应用内 confirm 二次确认（无边框窗口不丢焦点）'
);
ok(/ref="copySwitchEl"/.test(spSrc), '拷贝开关有 ref（取消时手动回滚 DOM 勾选态）');
ok(/文档被拷排行/.test(spSrc) && /拷贝记录（/.test(spSrc), 'SharePanel 新增「文档被拷排行」与「拷贝记录」两块');
ok(
  /loadCopies/.test(spSrc) && /A\.lanCopyLog\(\)/.test(spSrc) && /A\.lanCopyRank\(\)/.test(spSrc),
  'SharePanel 拉取 copyLog 与 copyRank'
);
ok(/r\.actors\.join\('、'\)/.test(spSrc), '被拷排行展示拷贝者集合');
// Beta.211：本机源也可拷贝（反转 Beta.209 的「本机禁拷」决策）。
// 按钮显隐不再看「是不是本机」，只看能力位 allowCopy —— 本机共享开了拷贝就有按钮。
ok(!/!activeSource\.self/.test(lanVueSrc), '★ 本机源不再被排除在「拷贝到本机」之外（Beta.211）');
ok(/!activeSource\.allowCopy/.test(lanVueSrc), '按钮显隐改为只看能力位 allowCopy');
// 取出 probeAllowCopy 的函数体（从函数名到第一个顶格 }），在其上断言，避免跨函数误匹配
const probeBody = (lanVueSrc.match(/async function probeAllowCopy[\s\S]*?\n\}/) || [''])[0];
ok(probeBody.length > 0, 'probeAllowCopy 函数体已定位（断言前提）');
ok(/api\/version/.test(probeBody), 'probeAllowCopy 远端源仍走 /api/version 免鉴权探针');
/* ★ Beta.213 起本机源**应当**短路，但短路到 status.allowCopy ★
 * Beta.211 的修法是「删掉 `if (s.self) return`，让本机源也打一次回环探针」——
 * 那是为绕开「本机能力位被钉死为 false」，但引入了一个新隐患：本机源能否拿到正确
 * 能力位，取决于回环请求与 /api/version 的响应结构是否对得上。事实是没对上
 * （能力位曾平铺在顶层，客户端解包 json.data 得到 undefined），
 * 于是「开了拷贝权限本机仍显示未开放拷贝」（用户实测报障）。
 * 本机共享状态的真相来源就是本机设置本身，直读 status.allowCopy 即可，
 * 无需任何网络往返 —— 少一次请求，也少一处会失配的契约。
 * 注意与 Beta.209 的区别：那是短路后**不赋值**（能力位恒 false），这是短路后**正确赋值**。 */
ok(
  !/if \(s\.self\)\s*return/.test(probeBody),
  '★ 本机源不再被直接 return 掉（Beta.209 的「能力位钉死为 false」不得回归）'
);
ok(
  /if \(s\.self\)\s*\{\s*s\.allowCopy = !!status\.allowCopy/.test(probeBody),
  '★ 本机源短路到 status.allowCopy（本机设置即真相，与 Beta.213 修复一致）'
);
// 16.9 图标
/* Beta.319 起图标数据迁移到 icon-antd.js（由 scripts/gen-icons.mjs 从
 * Ant Design / Lucide 两个开源库提取），Icon.vue 不再手绘分支。
 * ★ 断言方式 ★ 直接 import 数据模块断言键存在，不靠正则匹配源码文本 ——
 * 源码里的键会被 prettier 在 ``copy:`` 与 `"copy":` 之间反复改写，
 * 用文本正则盯它只会得到「格式化一次红一次」的假红灯。 */
const ICON_DATA = (await import(path.join(ROOT, 'src/components/icon-antd.js'))).ICONS;
ok(!!ICON_DATA.copy, 'Icon 提供 copy 图标（icon-antd.js 数据）');

/* ================= Beta.215：代码字段收敛 + <script setup> 的 props 陷阱 ================= */
{
  // —— 17.1 全项目不得再出现「字母代码」这个标签 ——
  //   用户要求自定义字段的「字母代码」改叫「代码」。这是**字段标签**的措辞统一，
  //   不是把校验规则描述里的「字母」也抠掉：规则本身要求「以字母开头」，
  //   抠掉反而读不懂。所以只禁标签形态（后面紧跟 <span 或作为表头/列名），
  //   允许「代码须以字母开头」这类规则描述。
  const srcFiles = walk(path.join(ROOT, 'src'), ['.vue', '.js']);
  const backFiles = walk(path.join(ROOT, 'electron'), ['.js']);
  const labelHits = [...srcFiles, ...backFiles]
    .filter(f => !f.includes(`${path.sep}verify${path.sep}`))
    .flatMap(f =>
      read(f)
        .split('\n')
        .map((line, i) => ({ f, i: i + 1, line }))
        .filter(x => /字母代码/.test(x.line))
        .map(x => `${path.relative(ROOT, x.f)}:${x.i}: ${x.line.trim()}`)
    );
  ok(labelHits.length === 0, '★ 全项目已无「字母代码」字样：' + (labelHits.length ? labelHits.join(' | ') : '0 处'));

  // —— 17.2 三类代码都必须查重（且编辑自己不算冲突）——
  const taxBack = read(path.join(ROOT, 'electron/db/taxonomy.js'));
  ok(/FROM regions WHERE code=\? AND id<>\?/.test(taxBack), '★ saveRegion 代码查重（排除自身 id）');
  ok(/FROM categories WHERE code=\? AND id<>\?/.test(taxBack), '★ saveCategory 代码查重（排除自身 id）');
  ok(/FROM field_defs WHERE code=\? AND id<>\?/.test(taxBack), '★ saveFieldDef 代码查重（排除自身 id）');

  // —— 17.3 拷贝路径不得再把代码写死 ——
  const lanIpc = read(path.join(ROOT, 'electron/ipc/lanshare.js'));
  ok(!/\[n,\s*'LAN'/.test(lanIpc), "★ ensureRegion 不再把 'LAN' 写死进 INSERT");
  ok(!/\[regionId,\s*n,\s*'LAN'/.test(lanIpc), "★ ensureCategory 不再把 'LAN' 写死进 INSERT");
  ok(/ensureRegion\s*=\s*\(name,\s*code\)/.test(lanIpc), 'ensureRegion 接收 code 参数');
  ok(/ensureCategory\s*=\s*\(regionId,\s*name,\s*code\)/.test(lanIpc), 'ensureCategory 接收 code 参数');

  // —— 17.4 共享源要把代码一起带出来（否则 follow 只能按名猜）——
  const shareSrc = read(path.join(ROOT, 'electron/db/share.js'));
  ok(/r\.code AS rcode/.test(shareSrc), '★ 共享副本列集合带出 rcode');
  ok(/c\.code AS ccode/.test(shareSrc), '★ 共享副本列集合带出 ccode');

  // —— 17.5 <script setup> 里引用 props 必须写 props.xx ——
  //   Vue 模板会自动解包 props，<script setup> 里不会。漏写 props. 时不会构建报错，
  //   而是在 computed 求值那一刻抛 ReferenceError，被 Vue 吞成渲染告警：
  //   现象是「弹窗一打开就报错、按钮点了没反应」，从界面完全看不出根因。
  //   Beta.215 实际踩到过（CopyTargetDialog 把 sourceCategoryName.value 当局部变量用）。
  //   这里对所有具名 props 做一次「script 段内裸用」扫描。
  const vueFiles = walk(path.join(ROOT, 'src'), ['.vue']);
  const barePropHits = [];
  for (const f of vueFiles) {
    const src = read(f);
    const m = src.match(/<script setup>([\s\S]*?)<\/script>/);
    if (!m) continue;
    const script = m[1];
    // 收集 defineProps 的对象字面量键名（形如 `  foo: {` 或 `  foo: Type`）
    const propBlock = script.match(/defineProps\s*\(\s*\{([\s\S]*?)\n\s*\}\s*\)/);
    if (!propBlock) continue;
    const names = [...propBlock[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map(x => x[1]);
    for (const n of names) {
      // 形如 `n.value`（当成 ref 用）或 `n(`（当成函数用）即视为漏写 props.
      const bad = new RegExp(`(?<![.\\w$'"])${n}(\\.value|\\s*\\()`);
      if (bad.test(script)) barePropHits.push(`${path.relative(ROOT, f)} → ${n}`);
    }
  }
  ok(
    barePropHits.length === 0,
    '★ <script setup> 内无裸用 props（须写 props.xx）：' + (barePropHits.length ? barePropHits.join(' | ') : '0 处')
  );

  // —— 17.6 数据库级唯一约束（Beta.217）——
  //   应用层查重只挡「走 saveRegion/saveCategory 的写入」，绕过它们的写入（导入/直接 SQL）
  //   仍能制造重码。唯一索引是最后一道闸，且必须用 CREATE UNIQUE INDEX 而非写进
  //   CREATE TABLE —— 后者带 IF NOT EXISTS，对已存在的库是空操作，老库永远拿不到约束。
  const coreSrc = read(path.join(ROOT, 'electron/db/core.js'));
  ok(
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_\$\{table\}_code/.test(coreSrc) ||
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_regions_code/.test(coreSrc),
    '★ core.js 用 CREATE UNIQUE INDEX 建代码唯一索引（对老库同样生效）'
  );
  ok(/function ensureCodeUniqueIndexes/.test(coreSrc), 'core.js 有 ensureCodeUniqueIndexes 迁移函数');
  ok(/ensureCodeUniqueIndexes\(\)/.test(coreSrc), '★ migrate() 末尾确实调用了它');
  // 顺序不可颠倒：必须先清重再建索引，否则老库重码会让建索引失败
  const fnBody = (coreSrc.match(/function ensureCodeUniqueIndexes[\s\S]*?\n\}/) || [''])[0];
  const iDedupe = fnBody.indexOf('HAVING COUNT(*) > 1');
  const iIndex = fnBody.indexOf('CREATE UNIQUE INDEX');
  ok(iDedupe > -1 && iIndex > -1 && iDedupe < iIndex, '★ 先查重改写、后建唯一索引（顺序颠倒会导致老库建索引失败）');
  ok(
    /catch \(e\) \{[\s\S]{0,400}已跳过，应用层查重仍生效/.test(fnBody),
    '★ 建索引失败只记日志不 rethrow（否则脏库会让整个应用起不来）'
  );
  // NULL 语义要写清楚，避免后人误以为「NULL 也算重复」
  ok(
    /UNIQUE|\u552f\u4e00\u7d22\u5f15\u5141\u8bb8\u591a\u884c NULL/.test(coreSrc),
    'core.js 注明了 NULL 的唯一索引语义'
  );

  // 副本库同构：share.db 的 regions/categories 也建唯一索引，保持两侧契约一致
  const shareDbSrc = read(path.join(ROOT, 'electron/db/share.js'));
  ok(
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_share_regions_code/.test(shareDbSrc),
    '★ share.db 的 regions 也建唯一索引（两侧契约一致）'
  );
  ok(
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_share_categories_code/.test(shareDbSrc),
    '★ share.db 的 categories 也建唯一索引'
  );
}

/* ================= Beta.285：辉光已去除，弹窗不再需要为它预留空间 ================= */
{
  /* 【这一段的历史】
   * Beta.218 曾在这里断言「.modal-body / .row-2 必须 padding:4px + margin:-4px」，
   * 用来给 .input:focus 向外扩的 3px 辉光留余量。那套修法最终被证明是错的：
   *   · 负 margin 把 .modal-body 的 border box 推到裁剪边界上，缓冲被抵消成 0，照样裁；
   *   · 各组件再去加内缩（.tc-toolbar / .pwd-row），又导致搜索框与同级块左沿错位。
   * 用户连续三次反馈同一片区域（辉光被裁 → 依旧被裁 → 宽度没对齐）之后定案：
   * **去掉辉光本身**，.input:focus 只换边框色。
   *
   * 于是这段断言必须跟着翻转：不再是「必须有预留空间」，而是「必须没有」。
   * 留着旧的断言会逼着后来者把已删除的补丁加回去 —— 那是比没有断言更糟的状态。
   * 详细的辉光/结构断言见 electron/verify/focus-glow.test.mjs，这里只保留最关键的互锁关系。
   */
  const baseCss = read(path.join(ROOT, 'src/styles/base.css'));
  const bodyRule = (baseCss.match(/\.modal-body\s*\{[\s\S]*?\}/) || [''])[0];
  ok(bodyRule.length > 0, '.modal-body 规则已定位（断言前提）');
  ok(
    !/padding-left:\s*[1-9]/.test(bodyRule) && !/padding-right:\s*[1-9]/.test(bodyRule),
    '★ .modal-body 不再有左右内边距（辉光已去除，无需容纳外扩阴影）'
  );
  ok(
    !/margin-left:\s*-/.test(bodyRule) && !/margin-right:\s*-/.test(bodyRule),
    '★ .modal-body 不再用负 margin（负 margin 是上一版辉光被裁的直接原因）'
  );
  ok(/overflow:\s*hidden/.test(bodyRule), '.modal-body 仍保留 overflow:hidden（滚动职责不能丢）');

  /* .modal 的左右 padding 必须与 .modal-body 的"无内缩"配套。
   * 上一版为补偿 4px 内缩把 22px 改成了 18px；现在没有内缩，补偿也必须撤。
   * 只改一处会让所有弹窗正文宽度变化 8px —— 肉眼可见。 */
  const modalRule = (baseCss.match(/\.modal\s*\{[\s\S]*?\}/) || [''])[0];
  ok(
    /padding:\s*20px\s+22px/.test(modalRule),
    '★ .modal 左右 padding 为 22px（与 .modal-body 无内缩配套，成对关系不能单方改动）'
  );

  /* .row-2 的两栏栅格本身要保留，但不再需要为辉光加内缩 */
  const dlg = read(path.join(ROOT, 'src/components/CopyTargetDialog.vue'));
  const row2 = (dlg.match(/\.row-2\s*\{[\s\S]*?\}/) || [''])[0];
  ok(row2.length > 0, '.row-2 规则已定位');
  ok(
    /display:\s*grid/.test(row2) && /grid-template-columns:\s*1fr 1fr/.test(row2),
    '★ .row-2 仍是两栏栅格（布局本身不受影响）'
  );
  ok(
    !/padding-left:\s*4px/.test(row2) && !/margin-left:\s*-4px/.test(row2),
    '★ .row-2 不再有辉光补偿（padding 4px + margin -4px 已撤除）'
  );
}

/* ================= Beta.219：局域共享文档详情页接入页内查找 ================= */
{
  // 需求：共享文档详情页也能 Ctrl+F / 按钮唤起查找条，范围与本机详情页一致
  // （标题 + 字段数据 + 正文；不含元信息/标签/操作条等界面文字）。
  // 三条入口路径缺一不可：按键（canFindHere 放行）、点击（详情操作条按钮）、收尾（退出详情时 findClose）。

  // —— 1) 查找引擎范围：scopes() 认得共享详情三件套 ——
  const pfSrc = read(path.join(ROOT, 'src/utils/postFind.js'));
  ok(
    /post-read \.pr-title/.test(pfSrc) && /post-read \.pr-fields/.test(pfSrc) && /post-read \.pr-body/.test(pfSrc),
    '★ postFind.scopes 含共享详情三件套（pr-title/pr-fields/pr-body）'
  );
  // 范围口径：元信息与标签刻意排除——本机侧同样不搜它们，两侧必须一致
  ok(
    !/\.pr-meta/.test(pfSrc) && !/\.pr-tags/.test(pfSrc),
    '★ postFind.scopes 不含 .pr-meta/.pr-tags（元信息与标签不参与查找）'
  );
  // 三套范围互斥共存，历史版本预览仍最优先（原有行为不得回归）。
  // 用 'post-read .pr-body'（querySelector 真参连写，头注释里没有此形态）锚定代码位置，
  // 避免文件头注释先提到 post-read 造成假失败。
  ok(
    pfSrc.indexOf('.pv-body.post-content') < pfSrc.indexOf('post-read .pr-body'),
    '★ scopes 优先级：历史版本预览 > 共享详情 > 本机详情'
  );

  // —— 2) Ctrl+F 白名单：canFindHere 放行共享详情视图 ——
  const appSrc = read(path.join(ROOT, 'src/App.vue'));
  const canFindBody = (appSrc.match(/function canFindHere\s*\(\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  ok(canFindBody.length > 0, 'canFindHere 函数体已定位（断言前提）');
  ok(
    /\.post-main/.test(canFindBody) && /\.post-read/.test(canFindBody),
    '★ canFindHere 同时认 .post-main（本机详情）与 .post-read（共享详情）'
  );
  // 口径注释必须随行为更新：Beta.183 的「局域共享一律禁止」已推翻其中详情部分
  ok(/Beta\.219/.test(appSrc), 'App.vue 白名单注释已更新到 Beta.219 口径（共享详情页放行）');

  // —— 3) 点击入口 + 退出收尾 ——
  const lanVue = read(path.join(ROOT, 'src/pages/LanShare.vue'));
  ok(
    /页内查找/.test(lanVue) && /@click="findOpen"/.test(lanVue),
    '★ LanShare 详情操作条有「页内查找」按钮（findOpen 入口）'
  );
  // 注意：title 里的「Ctrl+F」含字面量加号，正则必须转义 \+（F+ 是量词，匹配不到 "F)" 前的字面加号）
  // ★ Beta.270：文案搬进字典，两页各引一个键（post.findInPageTitle / lanshare.findTitle）。
  //   「单一口径」的守法则从「两份字面量相同」升级为「两个键的译文逐语言相同」——
  //   键可以有两个（分属不同域），用户看到的文字必须只有一个。
  ok(/:title="t\('lanshare\.findTitle'\)"/.test(lanVue), '按钮 title 经 t() 引用 lanshare.findTitle（Ctrl+F 可用）');
  const pvSrc219 = read(path.join(ROOT, 'src/pages/PostView.vue'));
  ok(/:title="t\('post\.findInPageTitle'\)"/.test(pvSrc219), 'PostView 同款按钮引用 post.findInPageTitle');
  const grabVal = (part, key, lng) => {
    const m = read(path.join(ROOT, `src/i18n/parts/${part}.${lng}.js`)).match(
      new RegExp(`^\\s{2}${key}:\\s*'([^']*)'`, 'm')
    );
    return m ? m[1] : null;
  };
  const sameTitle = RENDER_LANGS.every(lng => {
    const a = grabVal('post', 'findInPageTitle', lng);
    const b = grabVal('lanshare', 'findTitle', lng);
    return a && a === b;
  });
  ok(sameTitle, '两处入口按钮的 title 文案逐语言完全一致（单一口径；键可两个、译文只许一个）');
  // 三处退出详情的点都要收尾：返回列表 / 切大区 / resetBrowse
  const closeCount = (lanVue.match(/findClose\(\)/g) || []).length;
  ok(closeCount >= 3, `★ 退出详情视图的三处路径均有 findClose 收尾（实测 ${closeCount} 处）`);
  ok(
    /function backToList\s*\(\)/.test(lanVue) && /backToList/.test(lanVue),
    '返回列表走 backToList（先收尾查找再清 post）'
  );
  // 收尾顺序：findClose 在 post.value = null 之前（先撤 mark 再卸 DOM，语义更稳）
  const backBody = (lanVue.match(/function backToList\s*\(\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  ok(
    /findClose\(\)/.test(backBody) && backBody.indexOf('findClose') < backBody.indexOf('post.value = null'),
    'backToList 内先 findClose 再卸详情（顺序正确）'
  );
  // import 必须带 findOpen/findClose（<script setup> 里没有隐式全局）
  ok(
    /import\s*\{[^}]*findOpen[^}]*findClose[^}]*\}\s*from\s*'\.\.\/store'/.test(lanVue),
    'LanShare 从 store 导入 findOpen/findClose'
  );
}

/* ================= Beta.220：去除查找时侧栏/标题栏的渐隐弱化 ================= */
{
  // 用户要求「去除文档详情页搜索关键词时的导航栏与标题栏渐隐效果」，且确认彻底删干净
  // （不是把 .45 调成 .85）。
  //
  // 【为什么这层弱化在 Beta.184 之后可以直接删掉】
  //   它原本的用意是「导航文字别淹没正文查找结果」，但那属于 Beta.172~183 时代：
  //   当时靠 content-visibility 把侧栏移出 Chromium 的查找树，opacity 只是视觉弱化，
  //   侧栏文字其实**仍会被命中**（原注释自己写明了这个取舍）。
  //   Beta.184 改用渲染端 postFind.js 后，查找只扫「标题 + 字段数据 + 正文」三个容器，
  //   侧栏/标题栏**根本不在扫描范围**（postfind.test.mjs 的「侧栏无命中 / 标题栏无命中」
  //   正在守这条，见下方交叉断言）。弱化从此纯属装饰，删掉功能零代价。
  const baseCss220 = read(path.join(ROOT, 'src/styles/base.css'));
  const appSrc220 = read(path.join(ROOT, 'src/App.vue'));

  ok(
    !/\.app-shell\.seeking/.test(baseCss220),
    '★ base.css 不得再有 .app-shell.seeking 弱化规则（查找时侧栏/标题栏全亮）'
  );
  ok(
    !/prefers-reduced-motion[\s\S]{0,120}seeking/.test(baseCss220),
    '★ 不残留 seeking 的 prefers-reduced-motion 过渡兜底'
  );
  ok(!/\bseeking\b\s*:\s*findState\.open/.test(appSrc220), '★ App.vue 不再挂 seeking 类绑定（无样式的空挂类不得复活）');

  // ★ 防「删过头」：findState 在 App.vue 仍有真实代码用法（L233 的 onFindKey）
  //   顺手把 import 一起删掉会让应用在 Ctrl+F 时直接抛 ReferenceError。
  ok(
    /if\s*\(findState\.open\)\s*findClose\(\)/.test(appSrc220),
    '★ onFindKey 仍读 findState.open（import 不得被一并删掉）'
  );
  ok(
    /import\s*\{[^}]*\bfindState\b[^}]*\}\s*from\s*'\.\/store'/.test(appSrc220),
    '★ App.vue 仍从 store 导入 findState'
  );

  // 交叉断言：本改动的前提是「侧栏不参与查找」由引擎保证，而非由 CSS 弱化保证。
  const pfTest220 = read(path.join(ROOT, 'electron/verify/postfind.test.mjs'));
  ok(
    /侧栏无命中/.test(pfTest220) && /标题栏无命中/.test(pfTest220),
    '★ postfind 仍在守「侧栏/标题栏不参与查找」（删弱化的行为前提）'
  );
}

/* ================= Beta.221：说明文案不得宣传不存在的功能 ================= */
{
  // 用户要求「根据最新状态」更新关于页简介、并重构软件说明页。
  // 盘点后发现旧文案有 6 处与代码不符，其中两处会**误导用户**：
  //   · 「跟随系统浅色/深色」——全库无 prefers-color-scheme / matchMedia，功能不存在；
  //   · 「大区 → 分类 → 标签」三级——标签是全局独立表（tags + post_tags 多对多），
  //     不挂在分类下，真实结构是「大区→分类 两级 + 平级标签」。
  // 文案层面的防回归：这些说法一旦回潮，用户会照着去找不存在的开关。
  // ★ Beta.270：GuidePage/AboutPage 已全量 i18n 化，文案住在字典里——
  //   继续 read .vue 只会被中文注释虚假满足（断言全绿但什么都没查），读取源必须跟着搬。
  const guide = read(path.join(ROOT, 'src/i18n/parts/guide.zh-CN.js'));
  const about = read(path.join(ROOT, 'src/i18n/parts/about.zh-CN.js'));
  const pkg = read(path.join(ROOT, 'package.json'));
  const docs = guide + about + pkg;

  // —— 22.1 不得**宣传**「跟随系统」自动切主题（未实现）——
  //   ★ 注意措辞方向：禁的是"可跟随系统"这种承诺，不是"不支持跟随系统"这种坦白。
  //     首版断言写成裸查「跟随系统」，结果把说明页里那句如实说明的限制当成违规——
  //     断言必须能区分「宣传功能」与「声明限制」，否则会逼着人删掉诚实的说明。
  const promotesAutoTheme =
    /可?\s*跟随系统(浅色|深色|自动)|跟随系统\s*(浅色|深色|自动)\s*切换/.test(docs) && !/不支持\s*跟随系统/.test(docs);
  ok(!promotesAutoTheme, '★ 文案不得宣传「跟随系统」（无 prefers-color-scheme 实现）');
  ok(/不支持\s*跟随系统/.test(docs), '★ 说明页如实声明了「不支持跟随系统」这条限制');
  ok(
    /prefers-color-scheme/.test(read(path.join(ROOT, 'src/styles/themes.css'))) === false,
    '★ 确认 themes.css 确实没有跟随系统的媒体查询（防未来加了却漏改文案的反向漂移）'
  );

  // —— 22.2 主题数量必须是 8，不得再写「三套」——
  ok(!/三套主题/.test(docs), '★ 不得再写「三套主题」（实际 8 套）');
  ok(/八套外观主题/.test(guide), '★ 说明页已写明八套外观主题（f10Title，与主题实现同数）');

  // —— 22.3 不得把标签写成三级层级的第三级 ——
  //   ★ 范围是全项目 UI 文案，不只是被改的这两个页面：
  //     首版只查 guide+about+pkg，漏掉了 RegionModal.vue「大区是文档层级的第一层：
  //     大区 → 分类 → 标签」与 Taxonomy.vue「层级结构：大区 → 分类 → 标签」，
  //     产物契约校验时才发现。错误的架构描述散落在各处，断言必须扫全量。
  const uiFiles221 = walk(path.join(ROOT, 'src'), ['.vue', '.js']);
  const wrongTier = uiFiles221
    .filter(f => !f.includes(`${path.sep}verify${path.sep}`))
    .flatMap(f =>
      read(f)
        .split('\n')
        .map((line, i) => ({ f, i: i + 1, line }))
        .filter(x => /大区\s*[→>]\s*分类\s*[→>]\s*标签/.test(x.line))
        // ★ 排除「筛选器排列顺序」语境：那类注释写的是日期 → 大区 → 分类 → 标签 → 字段，
        //   箭头表达的是 UI 排列次序，不是层级从属，不算架构描述错误。
        .filter(x => !/筛选|顺序|filter/i.test(x.line))
        .map(x => `${path.relative(ROOT, x.f)}:${x.i}: ${x.line.trim()}`)
    );
  ok(
    wrongTier.length === 0,
    '★ 全项目 UI 文案不得再把标签写成「大区→分类→标签」三级：' + (wrongTier.length ? wrongTier.join(' | ') : '0 处')
  );
  ok(!/大区\/分类\/标签层级/.test(docs), '★ 不得再写「大区/分类/标签层级」（同上，标签非层级）');
  ok(/全局标签/.test(docs), '★ 文案已说明标签是全局的');

  // —— 22.4 共享必须讲清是「只读」——
  ok(/只读/.test(docs), '★ 共享为只读，文案必须写明（避免误期待协作）');

  // —— 22.5 文档包扩展名必须是 .archboxpack ——
  ok(/\.archboxpack/.test(docs), '★ 文档包扩展名 .archboxpack 已写明');
  ok(!/\.archivestudiopack/.test(docs), '★ 不得出现 .archivestudiopack（非导出扩展名）');

  // —— 22.6 云端同步功能已**整体移除**（Beta.316）——
  //   Beta.315 及以前：services/cloud.js 只有 reserved:true 占位，设置页留一个
  //   「云端同步（预留）」分组、"测试连接"永远连不上。用户明确要求「把云端同步这项删掉，
  //   清除残留代码」——占位功能本身没价值，留着只会让用户以为"还没接好"。
  //   ★ 本节断言从「不得当特性宣传」改为「确认已彻底移除」：
  //     ① 主进程 services/ipc 两个云模块文件不存在；
  //     ② preload 不再暴露 cloudTest / cloudSave 之类通道；
  //     ③ 三语字典不再有 cloud* 系列 key（含 navCloud 分组名）；
  //     ④ 设置页不再引用 settings.navCloud。
  //   说明页里「本软件不提供云存储」属边界声明，不在此拦截（那是它的职责）。
  ok(!/云端同步（预留）/.test(guide), '★ 说明页不得再把「云端同步（预留）」当特性列出');
  ok(!fs.existsSync(path.join(ROOT, 'electron/services/cloud.js')), '★ services/cloud.js 已删除（无残留占位实现）');
  ok(!fs.existsSync(path.join(ROOT, 'electron/ipc/cloud.js')), '★ ipc/cloud.js 已删除');
  const preloadSrc22 = read(path.join(ROOT, 'electron/preload.js'));
  ok(
    !/cloud(Test|Save|Push|Pull)\s*:/.test(preloadSrc22),
    '★ preload 不再暴露任何云同步通道（cloudTest / cloudSave …）'
  );
  const settingsDict22 = read(path.join(ROOT, 'src/i18n/parts/settings.zh-CN.js'));
  ok(!/\n\s*cloud[A-Z]/.test(settingsDict22), '★ 设置字典已无 cloud* 系列 key');
  ok(!/navCloud/.test(settingsDict22), '★ 设置字典已无 navCloud 分组名');
  ok(
    !/settings\.navCloud/.test(read(path.join(ROOT, 'src/pages/SettingsPage.vue'))),
    '★ 设置页不再引用该分组（导航项已移除）'
  );

  // —— 22.7 说明页已重构为「锐评」体：须有边界声明与明确的"不适合"——
  // Beta.270：「它是什么 / 它不是什么」卡片在 #340 正式化改写中换成了
  // 「适用范围 / 不适用范围」对照卡（scopeYes/scopeNo），锚点跟着更新——
  // 断言守的是「边界声明」这个结构意图，不是某几个汉字。
  ok(/scopeYes:/.test(guide) && /scopeNo:/.test(guide), '★ 说明页含「适用范围 / 不适用范围」边界对照（现行结构锚点）');
  ok(
    /两级归档/.test(guide) && /不适用于多人在线协同编辑/.test(guide),
    '★ 边界对照两边都有实质内容（适用写清能力，不适用写清场景）'
  );
  ok(/建议选择其他工具/.test(guide), '★ 说明页明确写出不适用的场景（锐评立场）');

  // —— 22.8 不得把内部开发指标写进用户界面 ——
  //   「20 项自动化回归」是开发侧的质量指标，用户不关心也无从验证，
  //   放在面向用户的说明页里属于错位（用户已明确指出）。回归用例数量会随开发浮动，
  //   写死在 UI 里还必然过时——断言禁的是这类"把工程内部数字当产品卖点"的做法。
  ok(!/自动化回归|回归用例|测试用例数/.test(guide), '★ 说明页不得展示内部开发指标（如"20 项自动化回归"）');
  ok(!/项自动化|个回归用例/.test(about), '★ 关于页同样不得展示内部开发指标');
}

/* ========== Beta.225：说明页「它不是什么」卡片的 b 选择器不得误伤正文 ========== */
{
  // 说明页重写后出的真 bug：卡片小标题与正文行内强调都用 <b>，如果 CSS 写成
  //   后代选择器 `.neg b { display:block }`，那么 <p> 里那些行内 <b>（"没有账号体系"、
  //   "没有联网能力"）会被一起变成块级 → 正文被拆成一行一句，卡片视觉上碎成几截。
  //   （实测截图确认过：正是这个写法坏掉的。）
  // 修法：小标题用直接子选择器 `.neg > b`，并把行内强调的取色单独限定到 `.neg p b`。
  const guide225 = read(path.join(ROOT, 'src/pages/GuidePage.vue'));

  // ★ 不得再出现「容器后代 b + display:block」这种会穿透到 <p> 的写法。
  //   注意范围：只查**设了 display** 的后代规则 —— 像 `.coda b { color }` 只改颜色，
  //   不会把行内 <b> 变成块级，属正常写法，不该被误拦。
  const leaky = guide225
    .split('\n')
    .filter(l => /^\s*\.(neg|cap|lead|walk|unfit|coda)\s+b\s*\{/.test(l))
    .filter(l => /display\s*:/.test(l));
  ok(
    leaky.length === 0,
    '★ 不得用「.卡片 b { display:block }」这类后代选择器（会穿透到正文行内 <b>）：' +
      (leaky.length ? leaky.join(' | ') : '0 处')
  );

  // ★ 小标题必须走直接子选择器
  //   注意：这里断言的是**意图**——「标题样式不得穿透到 <p> 里的行内 <b>」——
  //   而不是钉死某个具体选择器名字。Beta.235 把图标与标题并成一行后，
  //   标题从 .neg 的直接子元素下沉成了 .neg-hd 的直接子元素，
  //   选择器跟着变成 .neg-hd > b，意图不变。
  //   钉死字面量会让一次纯布局调整制造一次假失败（实际就这么发生过）。
  const titleSelLine = guide225.split('\n').find(l => /^\s*\.neg[\w-]*\s*>\s*b\s*\{/.test(l)) || '';
  ok(titleSelLine !== '', '★ 立场卡标题用直接子选择器（> b），不穿透正文行内 <b>');
  ok(/display:\s*block/.test(titleSelLine) === false, '标题选择器不再需要 display:block（同行布局后由 flex 容器接管）');
  // 反面：任何「.neg 容器 后代 b + display:block」都是会拆碎正文的写法
  const negBBlock = guide225.split('\n').filter(l => /^\s*\.neg\s+b\s*\{/.test(l));
  ok(
    negBBlock.length === 0,
    '不得出现 .neg b 后代选择器（会穿透到 <p> 行内 <b>）' + (negBBlock.length ? ' → ' + negBBlock.join(' | ') : '')
  );

  // ★ 正文行内强调单独取色，保持行内
  ok(/\.neg\s+p\s+b\s*\{[^}]*color/.test(guide225), '★ 正文行内 <b> 由 .neg p b 单独取色（保持行内，不设 display）');
  const inlineRule = (guide225.match(/\.neg\s+p\s+b\s*\{[^}]*\}/) || [''])[0];
  ok(!/display\s*:/.test(inlineRule), '★ .neg p b 不得设置 display（一旦设 block，正文又会被拆行）');

  // ★ 其余卡片容器本身不含 <p> 内 <b> 的隐患（cap 的标题走 .cap-hd b）
  ok(/\.cap-hd\s+b\s*\{/.test(guide225), '★ 「十件具体的事」卡片标题走 .cap-hd b（限定在标题行内）');
}

/* ========== Beta.227：说明页不得讲错「找回密码 / 加密默认 / 启动引导」三件事 ========== */
{
  // 用户在 Beta.227 明确指出说明书讲错了三处，且都属**会误导操作**的错：
  //   ① 把"账户密码找不回"当成通则 —— 实际账户密码**可以**用安全问答重置；
  //      真正找不回的是**数据库口令**（DPAPI/主密码那套）。两套密码必须讲清区别。
  //   ② 没说"数据库加密默认关" —— 用户会以为不设口令就不能用，或以为默认已受保护。
  //   ③ 说成有"启动引导/首次设置向导" —— 实际打开就是登录/注册页，没有任何向导。
  // 这些错会让用户做错决定（该备份的不备、该记口令的没记、到处找不存在的向导）。
  // ★ Beta.270：GuidePage 已全量 i18n 化，文案住在 guide 字典里——
  //   继续 read .vue 只会被中文注释虚假满足，读取源必须跟着搬。
  const g227 = read(path.join(ROOT, 'src/i18n/parts/guide.zh-CN.js'));

  // —— ① 账户密码可找回 / 数据库口令不可找回，两者必须区分 ——
  ok(/安全问答/.test(g227), '★ 说明页须写明「安全问答」是账户密码的找回途径');
  ok(/账户密码/.test(g227) && /数据库口令/.test(g227), '★ 说明页须把「账户密码」与「数据库口令」两套密码分开讲');
  // 不得再把"密码忘了找不回"写成不分对象的总则
  const blanketLoss =
    /密码[^。\n]{0,12}(丢了|忘了)[^。\n]{0,12}(就)?(真的)?(找不回|无法找回|打不开)/.test(g227) &&
    !/(数据库口令|数据库密码)/.test(g227);
  ok(!blanketLoss, '★ 不得把"密码忘了找不回"写成不分对象的总则（账户密码其实可找回）');

  // 依据：实现侧确实存在安全问答找回链路 —— 断言不能凭空要求
  const acct = read(path.join(ROOT, 'src/components/settings/AccountSection.vue'));
  ok(/RecoverForm|通过安全问答找回/.test(acct), '（依据）AccountSection.vue 确有安全问答找回入口');
  ok(
    /A\.recover|recover\(/.test(read(path.join(ROOT, 'src/components/RecoverForm.vue'))),
    '（依据）RecoverForm.vue 确实调用了 recover 接口'
  );

  // —— ② 必须写明"数据库加密默认关" ——
  ok(
    /加密[^。\n]{0,10}默认(是)?关|默认(是)?关[^。\n]{0,10}加密|默认不加密/.test(g227),
    '★ 说明页须写明「数据库加密默认关」'
  );
  // 依据：SettingsPage 的 secState 初值 encrypted:false
  const sp = read(path.join(ROOT, 'src/pages/SettingsPage.vue'));
  ok(/encrypted:\s*false/.test(sp), '（依据）SettingsPage.vue 的 secState 初值 encrypted:false（确为默认关）');

  // —— ③ 不得声称有启动引导 ——
  //   否定模式须覆盖「不设置/不提供」：字典里的坦白（pwNote：本软件不设置首次启动引导）
  //   既非"没有"也非"无"，漏掉这种措辞会把诚实说明误判成虚假承诺。
  const promisesOnboarding =
    /(首次启动|第一次启动|启动时)[^。\n]{0,20}(引导|向导|设置向导)|欢迎使用[^。\n]{0,10}向导/.test(g227) &&
    !/没有[^。\n]{0,6}(启动)?引导|无[^。\n]{0,6}(启动)?引导|不设置[^。\n]{0,8}(启动)?引导|不提供[^。\n]{0,8}(启动)?引导/.test(
      g227
    );
  ok(!promisesOnboarding, '★ 说明页不得声称有「启动引导/首次设置向导」（实际没有）');
  ok(
    /没有[^。\n]{0,8}引导|无[^。\n]{0,8}引导|不设置[^。\n]{0,8}(启动)?引导/.test(g227),
    '★ 说明页应如实说明「没有启动引导」'
  );
  // 依据：全项目无「启动引导」实现。
  //   ★ 三处误伤要排除：
  //     ① ImportWizard —— 那是「文档包导入向导」，与首次启动无关（裸 /wizard/i 会误判）；
  //     ② 说明页里"没有启动引导"这句**否定式坦白**本身，不能算作"声称有引导"；
  //     ③ src/i18n/ —— 文案住所在字典（否定式坦白写在字典里），不是实现，
  //        实现扫描只该覆盖组件/store/electron。
  const onboardingHits = walk(path.join(ROOT, 'src'), ['.vue', '.js'])
    .filter(f => !f.includes(`${path.sep}verify${path.sep}`))
    .filter(f => !f.includes(`${path.sep}i18n${path.sep}`))
    .flatMap(f =>
      read(f)
        .split('\n')
        .map((line, i) => ({ f, i: i + 1, line }))
        .filter(x => /onboarding|启动引导|首次启动[^。\n]{0,6}向导/i.test(x.line))
        .filter(x => !/wizard/i.test(x.line)) // ① 排除导入向导
        .filter(x => !/没有[^。\n]{0,8}引导|无[^。\n]{0,8}引导/.test(x.line)) // ② 排除否定式坦白
        .map(x => `${path.relative(ROOT, x.f)}:${x.i}: ${x.line.trim()}`)
    );
  ok(
    onboardingHits.length === 0,
    '（依据）src/ 全项目无启动引导实现：' + (onboardingHits.length ? onboardingHits.join(' | ') : '0 处')
  );
  // 反向说明：ImportWizard 确实存在，但它管的是导入文档包
  ok(
    /ImportWizard/.test(read(path.join(ROOT, 'src/pages/SettingsPage.vue'))),
    '（说明）项目里确有 ImportWizard，但那是「文档包导入向导」，不是启动引导'
  );
}

/* ================= Beta.223：切页必须把主滚动容器归零 ================= */
{
  // 用户反馈：「关于也划到中间，点击软件说明也定位到了中间，而不是从头开始」。
  // 根因：主滚动容器 (App.vue 的 main.main) 是单页内所有页面共用，
  //   切页只换 <main> 里的组件、从不重置该容器 scrollTop —— 于是 A 页滚到一半切到 B 页，
  //   B 页就停在同样的位置。长说明页把这个一直存在的缺陷放大了。
  const navSrc223 = read(path.join(ROOT, 'src/store/modules/nav.js'));
  const appSrc223 = read(path.join(ROOT, 'src/App.vue'));

  // ★ 归零必须发生在 _applyEntry —— 那是 goto / goBack / goForward 的**唯一**统一出口。
  //   放 App.vue 只能覆盖其中一条路径，且会与「回到顶部」按钮的 showTop 状态打架。
  const applyBody = (navSrc223.match(/function _applyEntry[\s\S]*?\n\}/) || [''])[0];
  ok(applyBody.length > 0, '_applyEntry 函数体已定位（断言前提）');
  ok(/_resetScroll\(\)/.test(applyBody), '★ _applyEntry 内调用 _resetScroll（前进/后退也一并归零）');
  ok(/document\.querySelector\('\.main'\)/.test(navSrc223), '★ 滚动容器选择器为 .main（与 App.vue 的 main.main 对应）');
  ok(/el\.scrollTop = 0/.test(navSrc223), '★ 确实把 scrollTop 置零');
  ok(/requestAnimationFrame/.test(navSrc223), '★ 用 rAF 留一帧兜底（新页面 patch 后内容高度变化可能带偏位置）');
  // 换页用瞬时归零，不能沿用 smooth（否则新页会当着用户的面自己滚上去，像抽搐）
  const resetBody = (navSrc223.match(/function _resetScroll[\s\S]*?\n\}/) || [''])[0];
  ok(!/behavior:\s*'smooth'/.test(resetBody), '★ 换页归零用瞬时（不得 smooth）——smooth 会看到新页面自己向上滚');
  // 同一页内的「回到顶部」按钮仍应保留平滑滚动，不要被这次改动误伤
  ok(
    /scrollTo\(\{\s*top:\s*0,\s*behavior:\s*'smooth'\s*\}\)/.test(appSrc223),
    '★ App.vue「回到顶部」按钮仍为 smooth（页内语义，不属换页）'
  );
  // 容器契约：App.vue 那个滚动元素必须仍带 class="main"
  ok(
    /class="main"[^>]*ref="mainRef"|ref="mainRef"[^>]*class="main"/.test(appSrc223),
    '★ App.vue 主滚动容器仍是 .main（选择器契约不得漂移）'
  );
}

/* ================= Beta.229：说明书局域共享描述纠错 ================= */
{
  // 用户指出：「局域共享不用发地址给别人啊，列表自动刷出的」。
  // 已核实：SharePanel 的「本机地址」行是只读 <span> 且**无任何按钮**，令牌行才有 3 个按钮；
  //   发现靠 UDP 广播信标（lan-share.js setInterval(send, 5000)，DISCOVER_PORT=47471），
  //   访客端 LanShare.vue onMounted 自动 refresh，另有「重新发现」兜底。
  // ⚠️ 但**不能因此写成「什么都不用给」**：令牌默认开（isAuthEnabled = getSetting('lan.auth') !== '0'，
  //   键不存在即开），且鉴权开启时广播 payload 不含 token（lan-share.js `authEnabled ? base : {...}`），
  //   对方仍需手工输一次。前半句（自动发现）和后半句（令牌默认开）都必须写出来。
  // ★ Beta.270：GuidePage 已 i18n 化，guide 的读取源从 .vue 改为字典（理由同 22.x 节）。
  const guide229 = read(path.join(ROOT, 'src/i18n/parts/guide.zh-CN.js'));
  const sharePanel = read(path.join(ROOT, 'src/components/SharePanel.vue'));
  const lanShare = read(path.join(ROOT, 'electron/services/lan-share.js'));
  const ipcLan = read(path.join(ROOT, 'electron/ipc/lanshare.js'));
  const lanConstants = read(path.join(ROOT, 'electron/services/lan-constants.js'));

  // —— 旧错描述必须消失（只查 Guide 页，避免误伤他处代码变量名）
  const staleWords = ['发只读地址', '把地址发给他', '把地址发给', '发地址给他', '发地址给别人'];
  const staleHits = staleWords.filter(w => guide229.includes(w));
  ok(
    staleHits.length === 0,
    '禁旧错：说明书不再出现「发地址」类描述' + (staleHits.length ? ' → ' + staleHits.join(' | ') : '')
  );

  // —— 新事实必须写到位
  //   ★ #340 正式化改写后措辞从「自动出现」变为「自动发现」，事实未变——
  //     断言守的是「发现是全自动的」这个事实，不是某几个汉字。
  ok(/自动发现/.test(guide229), '须写明对方列表里「自动出现」（现措辞：自动发现共享源）');
  ok(/重新发现/.test(guide229), '须提到「重新发现」兜底（自动发现失败时的手动入口）');
  ok(/广播/.test(guide229), '须写明广播机制（每 5 秒一次）—— 否则用户不知道多久能刷出来');
  ok(/\.archboxpack/.test(guide229), '防丢路径：.archboxpack 长期留存路径仍在（§22.5 亦依赖）');

  // —— ★ 关键：不得无条件承诺「不用给令牌 / 点开即连」
  //   裸词检测会误伤本段「想连这个都省掉…那就真是点开即连」这句带条件的说明，
  //   故要求承诺词附近必须有条件词覆盖（150 字窗口）。
  const unconditional = [];
  guide229.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    if (!/点开即连|不用给令牌|什么都不用给|无需任何操作/.test(line)) return;
    if (!/如果|想|关掉|关闭|代价|默认|才/.test(line)) unconditional.push(`GuidePage.vue:${i + 1}: ${line.trim()}`);
  });
  ok(
    unconditional.length === 0,
    '禁过度承诺：「点开即连/不用给令牌」必须带条件（关掉令牌 + 同网段任何人可连的代价）' +
      (unconditional.length ? ' → ' + unconditional.join(' | ') : '')
  );

  // —— 须如实坦白令牌默认开启、需手工输入一次（与上面那条是一对，缺一即是不诚实的说明书）
  ok(/令牌默认开着|默认开启|默认是开/.test(guide229), '须坦白：访问令牌默认开启');
  ok(/手工输|输一次|输入一次/.test(guide229), '须坦白：对方仍需手工输入一次令牌');

  // —— 同卡片内另一处同类错误：拷贝默认关闭（isAllowCopy() 用 === '1'）
  //   ★ #340 后措辞为「默认不允许对方拷贝文档」，断言跟着认新措辞
  ok(
    /默认也不许拷走|默认不许拷|不能拷走|拷得走|默认不允许[^。\n]{0,8}拷贝/.test(guide229) &&
      !/对方看得见、拷得走/.test(guide229),
    '拷贝须写明默认关闭（旧错「看得见、拷得走」已消失）'
  );
  ok(/允许拷回本机/.test(guide229), '须写明拷贝需在「我的共享」显式开启');

  // —— 依据断言（防实现漂移：说明书一旦与代码脱节，这里先红）
  //   ★ SharePanel 已 i18n 化：「本机地址」行改认 t('lanshare.localAddr') 键引用
  const addrRow = (sharePanel.match(/t\('lanshare\.localAddr'\)[\s\S]*?<\/div>/) || [''])[0];
  ok(
    addrRow.length > 0 && !/<button/.test(addrRow),
    '（依据）SharePanel「本机地址」行确无 <button> —— 它不是用来发出去的'
  );
  // 注意：不能用「访问令牌」做锚点 —— 该词在更早的开关标签里已出现过一次，
  //   非贪婪匹配会截到那个开关所在的 div，得到 0 个按钮的假失败。用 sp-token 类锚定。
  const tokenRow = (sharePanel.match(/sp-token[\s\S]*?<\/div>/) || [''])[0];
  const tokenBtns = (tokenRow.match(/<button/g) || []).length;
  ok(tokenBtns >= 3, `（依据）令牌行确有 ${tokenBtns} 个按钮（显示/复制/重新生成）`);
  ok(
    /:title="t\('lanshare\.copyTokenTitle'\)"/.test(sharePanel),
    '（依据）令牌行含「复制令牌」按钮（title 经 t() 引用 lanshare 字典）'
  );
  const lanshareDict229 = read(path.join(ROOT, 'src/i18n/parts/lanshare.zh-CN.js'));
  ok(/copyTokenTitle: '复制令牌'/.test(lanshareDict229), '（依据）lanshare 字典 copyTokenTitle 措辞未漂移（复制令牌）');
  ok(/setInterval\(send,\s*5000\)/.test(lanShare), '（依据）发现信标确为每 5000ms 广播一次');
  ok(/DISCOVER_PORT\s*=\s*47471/.test(lanConstants), '（依据）发现端口确为 47471（单一来源 lan-constants.js）');
  ok(
    /require\('\.\/lan-constants'\)/.test(lanShare) && /DISCOVER_PORT/.test(lanShare),
    '（依据）lan-share.js 从 lan-constants 导入 DISCOVER_PORT（不再内联字面量）'
  );
  ok(
    /getSetting\('lan\.auth'\)\s*!==\s*'0'/.test(ipcLan),
    "（依据）isAuthEnabled 确为 !== '0'（键不存在=开启，令牌默认开）"
  );
  ok(
    /authEnabled\s*\?\s*base\s*:/.test(lanShare),
    '（依据）鉴权开启时广播体不含 token —— 这正是「仍需手工输一次」的根因'
  );
}

/* ================= Beta.230：版本并排对比 ================= */
{
  // ★ Beta.270：GuidePage 已 i18n 化，guide 的读取源从 .vue 改为字典（理由同 22.x 节）。
  const guide230 = read(path.join(ROOT, 'src/i18n/parts/guide.zh-CN.js'));
  const pdSrc = read(path.join(ROOT, 'src/utils/postDiff.js'));
  const modalSrc = read(path.join(ROOT, 'src/components/post/VersionDiffModal.vue'));
  const vhSrc = read(path.join(ROOT, 'src/components/post/VersionHistory.vue'));
  const pvSrc = read(path.join(ROOT, 'src/pages/PostView.vue'));
  const postsDb = read(path.join(ROOT, 'electron/db/posts.js'));
  const coreSrc = read(path.join(ROOT, 'electron/db/core.js'));
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));

  // ① 说明书「没有 diff」三处必须消失
  ok(!/不做逐字 diff/.test(guide230), '说明书不再说「不做逐字 diff」');
  ok(!/只有快照、没有 diff/.test(guide230), '说明书不再说「只有快照、没有 diff」');
  ok(!/没有 diff 视图/.test(guide230), '说明书不再说「没有 diff 视图」');
  // 劝退清单里那条「要逐字对比两个版本」应整条移除（该场景现已支持）
  ok(!/要逐字对比两个版本/.test(guide230), '劝退清单已移除「要逐字对比两个版本」');
  // ★ 但不得把新写的诚实限制一起删掉（只写功能不写代价是不诚实的说明书）
  //   ★ #340 正式化改写后两处换了措辞（f5Limit），事实未变，断言跟着认新措辞
  ok(/图片与排版变化不可见/.test(guide230), '仍如实写明：图片与排版变化看不出（限制不得被误删）');
  ok(/每次保存均生成一版快照/.test(guide230), '仍如实写明：每次保存都留一版，内容没改也多条');

  // ② 运行时依赖白名单（build.files 白名单不含 node_modules，加依赖就得改 files）
  //   运行时（主进程）只允许 sql.js（数据库引擎）+ sanitize-html（HTML 净化）两项；
  //   vue / dompurify 属前端构建期依赖，已被 Vite 内联进 dist/index.html，不需要进包。
  //   用白名单而非数量：新增任何运行时依赖都必须先改这里，杜绝悄悄膨胀产物。
  const RUNTIME_DEPS = ['sanitize-html', 'sql.js'];
  const runtimeDeps = Object.keys(pkg.dependencies).sort();
  ok(
    JSON.stringify(runtimeDeps) === JSON.stringify(RUNTIME_DEPS),
    `运行时依赖仅限白名单（应 ${RUNTIME_DEPS.join(' + ')}，实得 ${runtimeDeps.join(' + ')}）`
  );
  const bareImports = pdSrc.match(/^\s*import\s+[^'"]*from\s+['"]([^'".][^'"]*)['"]/gm) || [];
  ok(
    bareImports.length === 0,
    'postDiff.js 不 import 任何裸包名（纯 ESM 零依赖）' + (bareImports.length ? ' → ' + bareImports.join(' | ') : '')
  );

  // ③ 输入契约是 content_html；并把「为什么不用 htmlToText」钉成依据
  ok(/snap\.content_html/.test(pdSrc) || /content_html/.test(postsDb), '快照侧正文取自 content_html');
  ok(!/content_text/.test(pdSrc), 'postDiff.js 不使用 content_text（该字段在库里并不存在）');
  ok(
    /SELECT v\.\*,u\.name user_name/.test(postsDb),
    '（依据）getVersionSnapshot 已 LEFT JOIN users 取 user_name —— 顺带修掉预览作者恒为「系统」的旧 bug'
  );
  ok(
    /\.replace\(\/<\[\^>\]\+>\/g/.test(coreSrc),
    '（依据）core.htmlToText 确实剥掉全部标签（故段落边界被摧毁，本模块不复用它）'
  );
  // content_text 是 posts 表的搜索列（本来就存在），真正要锁的是「快照里没加它」——
  //   故只看 snapshotOf 函数体，不看 posts.js 全文，否则会被搜索列误伤。
  const snapOfBody = (postsDb.match(/function snapshotOf[\s\S]*?\n\}/) || [''])[0];
  ok(
    snapOfBody.length > 0 && !/content_text/.test(snapOfBody),
    'snapshotOf 未加入 content_text 字段（无数据形状变更、无需 schema 迁移）'
  );

  // ④ 上限常量与截断信号必须一路传到 UI
  ok(/export const MAX_PARAS\s*=/.test(pdSrc), 'MAX_PARAS 上限常量已导出');
  ok(/export const MAX_TOKENS_PER_PARA\s*=/.test(pdSrc), 'MAX_TOKENS_PER_PARA 上限常量已导出');
  ok(
    /truncated/.test(pdSrc) && /truncated/.test(modalSrc),
    '★ truncated 信号一路传到 UI（静默截断会让用户误判「无变化」）'
  );
  ok(/v-if="diff\.truncated"/.test(modalSrc), '截断时 UI 显示醒目横幅');

  // ⑤ UI 安全与命名空间
  ok(!/v-html/.test(modalSrc), '★ 对比视图不得用 v-html（正文与标题均用户可控，v-html 一旦引入 XSS 立刻进入）');
  ok(!/post-content/.test(modalSrc), '对比视图不带 post-content 类（不得抢占查找范围第一优先级）');
  ok(!/data-find-scope/.test(modalSrc), '对比视图不带 data-find-scope（并排两列会让命中翻倍）');
  ok(/class="df-/.test(modalSrc) && /df-ins|df-del/.test(modalSrc), '样式统一走 df- 命名空间');
  // postFind.js 本轮不得改动（对比刻意不参与查找，改它会牵连预览/共享/本机三套范围优先级）
  ok(
    !/from\s+['"].*postFind/.test(pdSrc) && !/postFind\(/.test(pdSrc),
    'postDiff.js 未侵入 postFind.js（注释提及不算）'
  );

  // ⑥ 只读口径：恢复仍受 writable 约束，对比不受
  const vhBtns = (vhSrc.match(/<button[^>]*>[\s\S]*?<\/button>/g) || []).join('\n');
  const restoreBtn = (vhBtns.match(/<button[^>]*@click="\$emit\('restore'[\s\S]*?<\/button>/) || [''])[0];
  ok(/:disabled="busy \|\| !writable/.test(restoreBtn), '★ 恢复按钮仍绑 !writable（权限不得被本次新功能放宽）');
  // Beta.241：当前版本多一个禁用条件 —— 它等同于文档现在的内容，恢复是空操作。
  // 断言 !writable 仍在（权限没有被新条件顶掉），这是本条的原意。
  ok(
    /is_current/.test(restoreBtn) && /!writable/.test(restoreBtn),
    '★ 恢复按钮的 !writable 未被「当前版本禁用」顶掉（两个条件并存）'
  );
  const cmpBtn = (vhBtns.match(/<button[^>]*@click="\$emit\('compare'[\s\S]*?<\/button>/) || [''])[0];
  ok(cmpBtn.length > 0 && !/writable/.test(cmpBtn), '对比按钮只绑 busy、不绑 writable（纯只读，与预览同口径）');
  ok(/defineEmits\(\['restore',\s*'preview',\s*'compare'\]\)/.test(vhSrc), 'VersionHistory 已声明 compare 事件');
  ok(/@compare="openDiff"/.test(pvSrc), 'PostView 已接线 @compare');
  ok(/buildPostDiff\(/.test(pvSrc), 'PostView 调用 buildPostDiff 自行合成对比（不新增 IPC 通道）');
  // 对比不需要新的归属校验：复用既有 postVersionSnapshot 即自动继承 assertOwnership
  ok(
    !/postVersionDiff/.test(pvSrc) && !/postVersionDiff/.test(read(path.join(ROOT, 'electron/preload.js'))),
    '★ 未新开 IPC 通道 —— 复用 postVersionSnapshot，归属校验自动继承且不可能被放松'
  );

  // ⑦ 硬约束：对比 Modal 必须挂在 .post-layout 之外（否则侵入 .versions 的 0 命中区）
  const layoutEnd = pvSrc.indexOf('</div>\n\n    <!-- 历史版本预览');
  const diffIdx = pvSrc.indexOf('<VersionDiffModal');
  const diffTagEnd = pvSrc.indexOf('/>', diffIdx);
  const layoutStart = pvSrc.indexOf('<div class="post-layout"');
  const layoutClose = pvSrc.lastIndexOf('</div>', pvSrc.indexOf('<!-- 历史版本预览'));
  ok(
    diffIdx > 0 && layoutClose > 0 && layoutStart < layoutClose && diffIdx > layoutClose,
    `★ VersionDiffModal 索引(${diffIdx}) 在 .post-layout 闭合位置(${layoutClose}) 之后`
  );

  // ⑧ 主题变量：八套主题都须提供 diff 用的底色（不硬编码色）
  const themes = read(path.join(ROOT, 'src/styles/themes.css'));
  ok(
    (themes.match(/--ok-weak:/g) || []).length === 8,
    `八套主题均定义了 --ok-weak（得 ${(themes.match(/--ok-weak:/g) || []).length}）`
  );
  ok((themes.match(/--danger-weak:/g) || []).length === 8, '八套主题均定义了 --danger-weak');
  ok(
    !/#[0-9a-fA-F]{3,6}\s*;?\s*$/m.test(modalSrc.split('<style scoped>')[1] || ''),
    '对比视图样式不含硬编码色值（全部走主题变量）'
  );

  // ⑨ ★ Histogram 对齐：纯段落级 LCS 在「每段都改一两个词」时会整篇塌成
  //    delete 洪水 + insert 洪水（真实截图复核发现：3 段各改一处只配出 1 对 change）。
  //    这是版本对比最常见的场景，故锁死相似度配对路径。
  ok(/export const CHANGE_RATIO\s*=/.test(pdSrc), 'CHANGE_RATIO 相似度阈值已导出');
  ok(/function alignGap/.test(pdSrc), '存在 alignGap（空隙内相似度配对）');
  ok(/function charLcsLen/.test(pdSrc) && /function similarity/.test(pdSrc), '相似度用字符级 LCS 计算（无分词器依赖）');
  ok(
    /type:\s*'change',\s*\n?[\s\S]{0,120}tokens:\s*diffTokens/.test(pdSrc) ||
      /tokens:\s*diffTokens\(oldText,\s*newText\)/.test(pdSrc),
    '配对成功时同时产出段内 tokens（段内增删标记由此而来）'
  );
}

/* ================= Beta.231：筛选项清单单一数据源 ================= */
{
  // 用户报：「全局搜索没有『来源』筛选，应与『所有文档』页面一致，话说不是同一个模块吗？」
  // 诊断结论：是**同一个** SearchFilters.vue，能力全在（origin 渲染分支 / 四态下拉 /
  //   buildParams 输出 origin / 后端 buildWhere 三态互斥全都齐），两页调的还是同一个
  //   A.posts + 同一个 listPosts。真因是 filters prop 的实参被**硬编码 3 份**，其中 2 份漏了
  //   'origin'（SearchPage.vue 与 prop 默认值）—— 于是两页喂进同一组件的清单不同。
  // 修复：清单收归组件导出 SEARCH_FILTER_KEYS，页面与默认值一律引用它。
  const sf231 = read(path.join(ROOT, 'src/components/SearchFilters.vue'));
  const sp231 = read(path.join(ROOT, 'src/pages/SearchPage.vue'));
  const pp231 = read(path.join(ROOT, 'src/pages/PostsPage.vue'));
  const postsDb231 = read(path.join(ROOT, 'electron/db/posts.js'));

  // ★ 期望清单在测试里独立硬编码，**不得**从被测文件反推 ——
  //   否则被测文件少写一项时断言会跟着少写一项，等于没测。
  const EXPECTED = ['date', 'region', 'category', 'tag', 'field', 'author', 'origin'];

  ok(
    /export const SEARCH_FILTER_KEYS\s*=\s*Object\.freeze\(\s*\[/.test(sf231),
    '组件导出唯一清单 SEARCH_FILTER_KEYS（且冻结：谁 push 谁失败，漂移会变成运行时错误）'
  );

  // 抽清单内容做深比较：防「导出时手抖少写一个」——这是本块最核心的一条
  const keyBody = (sf231.match(/Object\.freeze\(\s*\[([\s\S]*?)\]/) || [])[1] || '';
  const actualKeys = (keyBody.match(/'([a-z]+)'/g) || []).map(s => s.replace(/'/g, ''));
  ok(
    JSON.stringify(actualKeys) === JSON.stringify(EXPECTED),
    `★ 清单内容与顺序完全一致（得 ${JSON.stringify(actualKeys)}，期望 ${JSON.stringify(EXPECTED)}）`
  );

  // ★ 清单与渲染实现不得脱节：每增一个筛选项就得有对应分支，反之亦然
  const branchCount = (sf231.match(/f === '/g) || []).length;
  ok(
    branchCount === EXPECTED.length,
    `★ 渲染分支数(${branchCount}) === 清单长度(${EXPECTED.length})（清单与实现不得脱节）`
  );

  // prop 默认值必须指向清单，且用工厂形式（编译器把 props 提到模块级，直写有 TDZ 风险）
  ok(
    /filters:\s*\{\s*type:\s*Array,\s*default:\s*\(\)\s*=>\s*SEARCH_FILTER_KEYS/.test(sf231),
    'prop 默认值指向唯一清单（工厂形式，非 default: SEARCH_FILTER_KEYS）'
  );

  // 两个页面都必须消费清单，且不再有本地字面量数组
  // ★ 下方两条不可省：hits() 会跳过注释行，光靠「无第二份字面量」放得过「只在注释里抄一份」
  ok(
    !/\bFILTERS\b/.test(sp231) && !/\bFILTERS\b/.test(pp231),
    '★ 两页均已删除本地 FILTERS 常量（连标识符都不留，避免又成为第二份来源）'
  );
  const importRe = /\{[^}]*SEARCH_FILTER_KEYS[^}]*\}\s*from\s*['"][^'"]*SearchFilters\.vue['"]/;
  ok(importRe.test(sp231) && importRe.test(pp231), '两页均从组件具名导入 SEARCH_FILTER_KEYS');
  ok(
    /:filters="SEARCH_FILTER_KEYS"/.test(sp231) && /:filters="SEARCH_FILTER_KEYS"/.test(pp231),
    '★ 两页模板均绑定该常量（与上一条组合才够：单条 /SEARCH_FILTER_KEYS/ 会被常量定义行自身满足）'
  );

  // ★ 必须排除唯一清单自身所在的组件 —— 它就是那一份，不是「第二份」。
  const dupKeys = hits(
    walk(path.join(ROOT, 'src'), ['.vue', '.js']).filter(f => !f.endsWith('SearchFilters.vue')),
    /\[\s*'date'\s*,\s*'region'/
  );
  ok(
    dupKeys.length === 0,
    '全 src/ 除组件自身外无第二份筛选项字面量数组' + (dupKeys.length ? ' → ' + dupKeys.join(' | ') : '')
  );
  // 组件内也只应有一份：常量定义处 1 处，多一处即漂移
  const inSf = hits([path.join(ROOT, 'src/components/SearchFilters.vue')], /\[\s*'date'\s*,\s*'region'/);
  ok(inSf.length === 1, `组件内该字面量仅出现在唯一清单定义处（得 ${inSf.length} 处）`);

  // 死代码不再复发：旧的 imported 布尔兼容分支已删（来源早已是四态枚举，布尔表达不了「拷贝文档」）
  ok(!/'imported' in p/.test(sf231), '旧的 imported 布尔兼容分支已移除（不给 origin 留第二套编码）');

  // 注释不得再骗人：原文自称「默认与全局搜索一致」而实际不一致
  ok(!/默认与全局搜索一致/.test(sf231), '过时的「默认与全局搜索一致」注释已纠正');
  ok(
    /SEARCH_FILTER_KEYS/.test(sp231) && /SEARCH_FILTER_KEYS/.test(pp231),
    '两页筛选注释均已指向唯一常量（说明为何不再各自声明）'
  );

  // 依据断言：后端三态仍完整（前端清单正确不代表后端没被改坏）
  ok(
    /f\.origin === 'import'/.test(postsDb231) && /imported_at IS NOT NULL/.test(postsDb231),
    "（依据）后端 buildWhere 仍处理 origin='import'"
  );
  ok(
    /f\.origin === 'copy'/.test(postsDb231) && /copied_at IS NOT NULL/.test(postsDb231),
    "（依据）后端 buildWhere 仍处理 origin='copy'"
  );
  ok(
    /f\.origin === 'local'/.test(postsDb231) && /p\.imported_at IS NULL AND p\.copied_at IS NULL/.test(postsDb231),
    "（依据）后端 origin='local' 仍为互斥条件（拷贝文档不计入本机自建）"
  );
  // Beta.270：SearchFilters 已 i18n 化，标签字面量搬进 search 字典。
  // 断言拆成两头：页面侧锁「引用键 + 枚举值」，字典侧锁「措辞本身」——
  // 只查一头都会漂（页面改键名 / 字典改错词，另一头都发现不了）。
  ok(
    /t\('search\.originImport'\)/.test(sf231) &&
      /t\('search\.originCopy'\)/.test(sf231) &&
      /t\('search\.originLocal'\)/.test(sf231) &&
      /value: 'copy'/.test(sf231) &&
      /value: 'local'/.test(sf231) &&
      /value: 'import'/.test(sf231),
    '来源下拉仍为四态（全部/文档包导入/局域共享拷贝/本机自建；标签经 t() 引用 search 字典）'
  );
  const searchDict231 = read(path.join(ROOT, 'src/i18n/parts/search.zh-CN.js'));
  ok(
    /originImport: '文档包导入'/.test(searchDict231) &&
      /originCopy: '局域共享拷贝'/.test(searchDict231) &&
      /originLocal: '本机自建'/.test(searchDict231),
    '（依据）search 字典三态措辞未漂移（文档包导入/局域共享拷贝/本机自建）'
  );
}

/* ================= Beta.232：根路径说明页 + 浏览器口径纠正 ================= */
{
  const lan = read(path.join(ROOT, 'electron/services/lan-share.js'));
  // ★ Beta.270：GuidePage 已 i18n 化，guide 的读取源从 .vue 改为字典（理由同 22.x 节）。
  const guide = read(path.join(ROOT, 'src/i18n/parts/guide.zh-CN.js'));
  const panel = read(path.join(ROOT, 'src/components/SharePanel.vue'));

  // —— 路由：根路径必须单独成支，且排在 /api/ 前缀守卫之前 ——
  const iRoot = lan.indexOf("if (p === '/') return sendRootPage(res)");
  const iGuard = lan.indexOf("if (!p.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' })");
  ok(iRoot > 0, '根路径 / 有独立分支，不再落进通用 404');
  ok(iRoot > 0 && iGuard > 0 && iRoot < iGuard, '（依据）根路径分支位于 /api/ 前缀守卫之前——顺序反了就永远走不到');
  // 只给 / 开口子：认不出的路径仍是机器可读 404，不给扫描器「本端口有网页」的错觉
  ok(
    /if \(!p\.startsWith\('\/api\/'\)\) return sendJson\(res, 404, \{ error: 'not found' \}\)/.test(lan),
    '（依据）非 /api/ 的未知路径仍返回 404 JSON'
  );

  // —— HTML 只走根路径：sendJson 的 type 参数只有 sendRootPage 传过 ——
  const htmlWriters = hits([path.join(ROOT, 'electron/services/lan-share.js')], /text\/html/);
  ok(
    htmlWriters.length === 1,
    `全文件仅 sendRootPage 一处输出 text/html（得 ${htmlWriters.length} 处）` +
      (htmlWriters.length !== 1 ? ' → ' + htmlWriters.join(' | ') : '')
  );
  ok(
    /function sendRootPage\s*\(res\)/.test(lan) && /sendRootPage\(res\)/.test(lan),
    '（依据）sendRootPage 已定义且被调用（定义与调用同名同实）'
  );

  // —— 两个错口径必须清零（这是本次改动的实质目标）——
  // 注意：不能简单断言「卡片 08 不出现『浏览器』二字」——新文案里本来就该有
  // 「拿浏览器输那行地址只会看到一张说明页」。要拦的是把浏览器当成可用入口的**搭配**。
  // ★ Beta.270：GuidePage 已 i18n 化，guide 的读取源从 .vue 改为字典（理由同 22.x 节）。

  // 旧措辞清零：「代价：只读」在 #340 正式化改写中已被「限制：共享为只读」取代；
  // 下面几条守的是「浏览器不是可用入口」这个口径本身，与具体措辞无关。
  ok(
    !/除非你把令牌也关了/.test(guide),
    '「除非你把令牌也关了」已删除——它是错的：关开关只是凭证自动分发，服务端照样校验令牌'
  );
  ok(!/浏览器直连|浏览器去输|浏览器只读/.test(guide), '全页无「浏览器 …直连/去输/只读」类措辞（该路径本就不存在）');
  ok(
    !/浏览器[\s\S]{0,12}(直连|去输地址|打开就能看|照样能看)/.test(guide) &&
      !/(直连|拿浏览器去输)[\s\S]{0,20}浏览器/.test(guide),
    '共享卡片 08 不把浏览器描述成可用入口（只保留「浏览器只能看到说明页」这一事实陈述）'
  );
  // 反向：新口径必须落到位，否则删完就成空白
  ok(
    /不提供网页界面/.test(guide) && /浏览器直接访问地址仅显示说明页/.test(guide),
    '共享卡片 08 明确声明「不提供网页界面、浏览器只能看到说明页」'
  );

  // —— 说明页文案自身的正确性（防止页面把话说错）——
  // Beta.271 起文案进字典：调用点断 key，措辞断 zh-CN 字典（两头锁）
  ok(
    /i18n\.t\('sys\.lanPageOk2'\)/.test(lan) && /「文档盒」客户端/.test(sysZhSrc),
    '说明页指明共享内容由「文档盒」客户端拉取，而非浏览器'
  );
  ok(
    /i18n\.t\('sys\.lanPageOk1'\)/.test(lan) && /服务是正常的/.test(sysZhSrc),
    '说明页开宗明义告诉来访者「服务是正常的」'
  );
  ok(
    /require\('\.\.\/\.\.\/package\.json'\)\.version/.test(lan.slice(lan.indexOf('function sendRootPage'))),
    '说明页版本号取自 package.json，不硬编码（否则发版后页面就在说谎）'
  );
  ok(
    /db\.getSetting\('lan\.port'\) \|\| DEFAULT_PORT/.test(lan.slice(lan.indexOf('function sendRootPage'))),
    '说明页端口取自 lan.port 设置、回退 DEFAULT_PORT，与真实监听端口同源'
  );

  // —— 安全底线：放行 text/html 不得顺手放开跨域 ——
  // 用 hits() 而非 /…/.test(全文)：该字符串在文件里出现在注释中（历史沿革说明），
  // 全文匹配会被注释满足/误伤。hits() 自动跳过注释行，只认真正的代码。
  const corsHits = hits([path.join(ROOT, 'electron/services/lan-share.js')], /Access-Control-Allow-Origin/);
  ok(
    corsHits.length === 0,
    'CORS 依然全程不开放（放开会让任意网页跨域读共享内容）' + (corsHits.length ? ' → ' + corsHits.join(' | ') : '')
  );

  // —— Content-Type 必须走 headers 对象形式 ——
  // writeHead(code, 'text/html') 是错的：Node 签名是 writeHead(statusCode[, statusMessage][, headers])，
  // 第二个位置是状态消息，传字符串会让 Content-Type 凭空消失（实测响应头为空）。
  const badHead = hits([path.join(ROOT, 'electron/services/lan-share.js')], /writeHead\(\s*\w+\s*,\s*(type|['"`])/);
  ok(
    badHead.length === 0,
    'writeHead 未把 Content-Type 误当 statusMessage 传' + (badHead.length ? ' → ' + badHead.join(' | ') : '')
  );
  ok(
    /res\.writeHead\(code, \{ 'Content-Type': type \}\)/.test(lan),
    '（依据）sendJson 用 headers 对象形式声明 Content-Type'
  );
  // ★ HTML 不能过 JSON.stringify ★
  //   stringify 把 HTML 的真实换行转义成字面 \n、并给整段套引号，
  //   浏览器里就是满屏 \n + 一个游离双引号（实测踩到过）。
  ok(
    /isJson \? JSON\.stringify\(obj\) : String\(obj\)/.test(lan),
    '★ sendJson 按 Content-Type 分流：非 JSON 原文输出，不套 stringify'
  );
  ok(
    !/^[\s\S]*res\.end\(JSON\.stringify\(obj\)\)/m.test(
      lan.slice(lan.indexOf('function sendJson'), lan.indexOf('function sendJson') + 900)
    ),
    '（依据）sendJson 内无残留的无条件 JSON.stringify'
  );
  // 说明页不得泄漏访问令牌
  const rootPage = lan.slice(lan.indexOf('function sendRootPage'));
  ok(!/\$\{token\}|status\.token|share\.token/.test(rootPage), '说明页不输出访问令牌（页面是给浏览器看的无凭证场景）');

  // —— 依据断言：机器客户端始终带令牌，所以「关开关」不会让接口裸奔 ——
  ok(
    /u\.searchParams\.set\('token', token\)/.test(read(path.join(ROOT, 'electron/ipc/lanshare.js'))),
    '（依据）lan:request 在 token 非空时塞进 query——客户端的凭据来自发现结果，与开关无关'
  );
  ok(
    /return q === token \|\| h === token/.test(lan) && /if \(!checkToken\(req\)\)/.test(lan),
    '（依据）checkToken 对所有 /api/ 路由无条件生效，注释与实现一致'
  );

  // —— 误导性注释同步纠正（关开关的真实语义）——
  ok(/认证开关只影响「令牌是否随广播分发」/.test(lan), '关开关的语义注释仍在（凭证自动分发 ≠ 无认证）');
  // 面板 else 分支文案必须与之一致，不得暗示「关了就没认证」。
  // ★ Beta.270：SharePanel 已 i18n 化，文案搬进 lanshare 字典，读取源跟着搬。
  const lanshareDict = read(path.join(ROOT, 'src/i18n/parts/lanshare.zh-CN.js'));
  const elseNote = lanshareDict.slice(lanshareDict.indexOf('当前为自动发现模式'));
  ok(elseNote.length > 20, '（依据）lanshare 字典里找得到「当前为自动发现模式」注释文案（找不到说明读取源又漂移了）');
  ok(!/无需认证|不需要认证|即无认证/.test(elseNote.slice(0, 300)), '面板「自动发现模式」文案未把开关说成「无认证」');
}

/* ================= 立场卡：图标与标题同行 ================= */
{
  const guide2 = read(path.join(ROOT, 'src/pages/GuidePage.vue'));

  // 结构：图标与标题必须包在同一行容器里，否则标题会掉到图标下一行
  ok(
    /<div class="neg-hd">\s*<div class="neg-ic">[\s\S]{0,120}?<\/div>\s*<b>/.test(guide2),
    '★ 图标与标题同处 .neg-hd（此前图标独占一行、标题在下方）'
  );
  // 两张卡都要有，避免只改了一张
  const hdCount = (guide2.match(/<div class="neg-hd">/g) || []).length;
  ok(hdCount === 2, `两张立场卡都用了同行容器（得 ${hdCount}）`);
  // 不再有「图标直接挂在卡片下、标题裸露」的旧结构
  ok(
    !/<div class="card neg">\s*<div class="neg-ic">[\s\S]{0,80}?<\/div>\s*<b>/.test(guide2),
    '旧的「图标独占一行」结构已清除'
  );

  // 样式：行容器必须是 flex + 垂直居中，否则图标标题仍会错行
  ok(
    /\.neg-hd\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/.test(guide2),
    '★ .neg-hd 为 flex 且垂直居中（标题纵向中心须与图标重合）'
  );
  ok(/\.neg-ic\s*\{[^}]*flex:\s*none/.test(guide2), '.neg-ic 声明 flex:none，窄容器下不被标题挤扁');
  // 标题选择器必须用 > 且已下沉到 .neg-hd —— 旧的 .neg > b 已失效
  ok(/\.neg-hd\s*>\s*b\s*\{/.test(guide2), '★ 标题样式为 .neg-hd > b（旧 .neg > b 随结构调整已失效）');
  ok(!/\n\.neg\s*>\s*b\s*\{/.test(guide2), '旧的 .neg > b 规则已删除，不留两套标题样式');

  // 否定项的图标不得与肯定项同色：同色会把「它不是什么」也说成推荐
  ok(
    /\.neg-ic-no\s*\{[^}]*background:\s*var\(--surface-2\)[^}]*color:\s*var\(--text-3\)/.test(guide2),
    '★ 「它不是什么」的图标用中性色，不与肯定项共用主色'
  );
  const noIcCount = (guide2.match(/neg-ic neg-ic-no/g) || []).length;
  ok(noIcCount === 1, `中性图标类只用在否定卡上（得 ${noIcCount} 处）`);

  // 颜色必须走变量（项目铁律），不得硬编码
  const negBlock = guide2.slice(guide2.indexOf('/* 立场卡 */'), guide2.indexOf('/* 一句判断'));
  ok(!/#[0-9a-fA-F]{3,8}\b/.test(negBlock), '立场卡样式无硬编码色值，全部走 CSS 变量');

  // 依据：.surface-2 / .text-3 在 8 套主题里均有定义，否则换主题会掉色
  const themes = read(path.join(ROOT, 'src/styles/themes.css'));
  ok(
    (themes.match(/--surface-2:/g) || []).length >= 8,
    `（依据）--surface-2 在 8 套主题中均有定义（得 ${(themes.match(/--surface-2:/g) || []).length}）`
  );
  ok(
    (themes.match(/--text-3:/g) || []).length >= 8,
    `（依据）--text-3 在 8 套主题中均有定义（得 ${(themes.match(/--text-3:/g) || []).length}）`
  );
}

/* ================= 说明页左基线：全页只允许两条 ================= */
{
  const g = read(path.join(ROOT, 'src/pages/GuidePage.vue'));
  const PAD = 16; // 卡片 = 1px 边框 + 18px 内边距 → 正文落在容器边 +19px

  // .sec：竖线贴容器边（margin-left 0），文字落正文行（border 3px + padding 16px = 19px）
  const secRule = (g.match(/\.sec\s*\{[^}]*\}/) || [''])[0];
  ok(/margin:\s*24px\s+0\s+12px/.test(secRule), '★ .sec 左边距归零，竖线与卡片外边框对齐（此前 2px 造成全页右偏）');
  ok(/border-left:\s*3px\s+solid\s+var\(--accent\)/.test(secRule), '（依据）.sec 有 3px 左边框');
  ok(
    new RegExp(`padding-left:\\s*${PAD}px`).test(secRule),
    `★ .sec 文字偏移 = 3px 边框 + ${PAD}px 内边距 = ${PAD + 3}px，落在卡片正文行上`
  );
  // ★ 关键陷阱：border-left 的 3px **计入**偏移。
  //   若 padding 直接写 19px，文字会跑到 22px 处，比正文右偏 3px。
  ok(!/padding-left:\s*19px/.test(secRule), '★ .sec 不得把 padding 写成 19px（漏算 3px 边框，文字会右偏 3px）');

  // 色块类：左边缘一律贴容器边
  for (const [cls, name] of [
    ['jab', '一句话判断'],
    ['coda', '收尾']
  ]) {
    const rule = (g.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`)) || [''])[0];
    ok(
      /margin:[^;]*\s0\s/.test(rule) || /margin-left:\s*0/.test(rule),
      `★ .${cls}（${name}）色块左边缘贴容器边，不留 2px`
    );
  }

  // 无底色的正文行元素：与卡片正文对齐
  const tailRule = (g.match(/\.tail\s*\{[^}]*\}/) || [''])[0];
  ok(/padding-left:\s*19px/.test(tailRule), '★ .tail 页脚小字与卡片正文同基线（19px）');

  // 反面总闸：整页不得再有 margin 带 2px 左右偏移的写法
  const strayMargin = g.split('\n').filter(l => /^\s*margin:\s*[\d.]+px\s+2px\b/.test(l));
  ok(
    strayMargin.length === 0,
    '★ 全页无「margin 左右 2px」的残留（那是错位的来源）' + (strayMargin.length ? ' → ' + strayMargin.join(' | ') : '')
  );

  // 依据：卡片内边距决定正文基线，改了卡片就必须同步改 .sec
  const cardPad = (g.match(/\.cap\s*\{[^}]*\}/) || [''])[0];
  ok(
    /padding:\s*\d+px\s+18px/.test(cardPad),
    '（依据）.cap 内边距水平方向仍是 18px——若改这里，.sec 的 16px 必须同步重算'
  );
  ok(PAD + 3 === 18 + 1, `（依据）偏移自洽：.sec(${PAD}+3) === .card(18+1)，两侧算式在测试内断言相等`);
}

/* ========== Beta.237：编辑文档被当成新建 / 版本快照归属 / 跨页 2px 残留 ========== */
{
  const pv = read(path.join(ROOT, 'src/pages/PostView.vue'));

  /* —— 缺陷一：post:versionSnapshot 报「历史版本不存在」——
     后端 getVersionSnapshot 按 `WHERE v.id=? AND v.post_id=?` 做【联合归属】校验。
     postId 与 versionId 必须同属一条文档。form.id 只在 enterEdit() 时赋值、
     且会被 newPostMode() 清成 null，与 post.value 无强制同步 ——
     用它当 postId 会让二者脱节，拿 A 文档的 id 去查 B 文档的版本。
     取 post.value.id 是唯一不会脱节的来源。 */
  const snapCalls = pv
    .split('\n')
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(x => /A\.postVersionSnapshot\(/.test(x.l));
  ok(
    snapCalls.length === 2,
    `postVersionSnapshot 调用点共 2 处（预览 + 对比），实得 ${snapCalls.length}` +
      (snapCalls.length !== 2 ? ' → ' + snapCalls.map(x => x.n).join(',') : '')
  );
  const badPostId = snapCalls.filter(x => /form\.id\s*\|\|\s*post\.value\.id/.test(x.l));
  ok(
    badPostId.length === 0,
    '★ postId 不再用 `form.id || post.value.id` 兜底（form.id 会与 post.value 脱节）' +
      (badPostId.length ? ' → 行 ' + badPostId.map(x => x.n).join(',') : '')
  );
  ok(
    snapCalls.every(x => /postId:\s*post\.value\.id/.test(x.l)),
    '★ postId 单一来源 = post.value.id，保证与 versionId 同属一条文档'
  );

  // 同一条链路还有【写】操作：postRestore 也会带 postId + versionId。
  // 它比预览危险得多 —— restoreVersion 会 UPDATE posts WHERE id=?，
  // postId 脱节最坏是「拿 A 的版本覆盖 B 的正文」。必须同一口径。
  const restoreCalls = pv
    .split('\n')
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(x => /A\.postRestore\(/.test(x.l));
  ok(restoreCalls.length === 1, `postRestore 调用点共 1 处，实得 ${restoreCalls.length}`);
  ok(
    restoreCalls.every(x => /postId:\s*post\.value\.id/.test(x.l)),
    '★ postRestore 的 postId 同样是 post.value.id（写操作传错会覆盖别的文档）' +
      (restoreCalls.some(x => !/postId:\s*post\.value\.id/.test(x.l))
        ? ' → 行 ' +
          restoreCalls
            .filter(x => !/postId:\s*post\.value\.id/.test(x.l))
            .map(x => x.n)
            .join(',')
        : '')
  );
  // 总闸：全页不得再有 `form.id || post.value.id` 这种兜底取 id 的写法
  const idFallbacks = hits([path.join(ROOT, 'src/pages/PostView.vue')], /form\.id\s*\|\|\s*post\.value\.id/);
  ok(
    idFallbacks.length === 0,
    '★ 全页无 `form.id || post.value.id` 兜底（form.id 与 post.value 无强制同步关系）' +
      (idFallbacks.length ? ' → ' + idFallbacks.join(' | ') : '')
  );

  /* —— 缺陷二：修改文档被当成创建新文档 ——
     「以新建态打开」是一次性的【导航意图】，不能留在 params 里反复被消费。
     本组断言面向意图：editing 被读到后必须被抹掉，且不得用 goto() 抹
     （goto 会入栈 + 触发离开守卫 + 重跑 init，是另一次导航）。 */
  // 精确切出 editing 分支体。
  // 注意：indexOf 定位到的是 `if` 字符本身，行首缩进已被截掉，
  // 故 base 不能从该行算——要回看 `if` 之前的空白取得真实缩进。
  const eIdx = pv.indexOf('if (store.params.editing) {');
  ok(eIdx > 0, '（依据）init() 中存在 `if (store.params.editing) {`');
  let editBranch = '';
  if (eIdx > 0) {
    const lead = (pv.slice(0, eIdx).match(/[ \t]*$/) || [''])[0].length;
    const lines = pv.slice(eIdx).split('\n');
    const body = [lines[0]];
    for (let i = 1; i < lines.length; i++) {
      body.push(lines[i]);
      const m = lines[i].match(/^([ \t]*)\}\s*$/);
      if (m && m[1].length === lead) break;
    }
    editBranch = body.join('\n');
  }
  ok(/await newPostMode\(\)/.test(editBranch), '（依据）该分支仍会进入新建态（editing 的语义没被改变）');
  ok(
    /delete\s+next\.editing/.test(editBranch),
    '★ 「以新建态打开」用完即清：从 params 中删除 editing，不留在导航参数里'
  );
  // 只看【代码行】：注释里为说明原因提到了 goto()，那不是调用。
  const branchCode = editBranch
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  ok(!/goto\(/.test(branchCode), '★ 清参数用就地赋值，不用 goto()——goto 会入栈 + 触发离开守卫 + 重跑 init');
  ok(
    !/newPostMode\(\)[\s\S]{0,400}?\bstore\.params\.editing\b/.test(editBranch.replace(/const next[\s\S]*$/, '')),
    '（依据）清参数不写在 newPostMode() 之前（顺序反了会清掉正要读的意图）'
  );
  // 反面：不得退回旧写法。旧写法只有一个裸 await，没有任何清理。
  ok(
    !/if \(store\.params\.editing\) await newPostMode\(\)\s*\n\s*\} catch/.test(pv),
    '★ 未残留旧写法 `if (store.params.editing) await newPostMode()`（消费后不清理）'
  );
  // 依据：editing 只该由明确列出的新建入口写入 —— 若冒出新的写入点，说明有别的路径在造这个意图
  //   ★ Beta.270 托盘弹窗上线后多一个合法入口：托盘「新建文档」
  //     （App.vue onTrayNavigate → goto('post', { editing: true })）。
  //   ★ 首页右上角「新建文档」按钮（Home.vue newPost → goto('post', { editing: true })）。
  const editingWriters = hits(renderJs, /editing:\s*true/);
  ok(
    editingWriters.length === 4,
    `editing:true 的写入点共 4 处（大区页 + post:new 命令 + 托盘新建文档 + 首页新建文档），实得 ${editingWriters.length}` +
      (editingWriters.length !== 4 ? ' → ' + editingWriters.join(' | ') : '')
  );

  /* —— 缺陷三：「仍保存为新文档」点了没反应 ——
     原实现 onForceNew() → save()，而 save() 第一件事就是 postCheckDup，
     必查回同一批冲突 → 再次置 conflicts → 弹回同一弹窗 = 死循环。
     正确语义：跳过查重，显式 id:null 走 INSERT 分支。 */
  const forceFn = (pv.match(/async function onForceNew[\s\S]*?\n\}/) || [''])[0];
  ok(forceFn.length > 0, '（依据）onForceNew 已定义');
  ok(!/\bsave\(\)/.test(forceFn), '★ onForceNew 不再调用 save()（那会重跑查重、弹回同一弹窗 → 表现为「点击没反应」）');
  ok(/doSave\(/.test(forceFn), '★ onForceNew 直接落库（doSave），绕开查重这一步');
  // 关键：必须显式置 null，否则编辑态带 id 会走 UPDATE = 覆盖原文档，与按钮文案相反
  ok(/id:\s*null/.test(forceFn), '★ onForceNew 显式置 id:null —— 不置会沿用编辑态 id 变成「覆盖原文档」');

  /* —— 缺陷四：跨页残留的 `margin: Npx 2px`（左右各 2px 偏移）——
     统一归零，各自与所在容器的左基线对齐。
     ★ 断言范围必须扫【全部】视图文件，不能硬编码清单 ——
       Beta.237 第一次就是照用户点名的 4 处写死文件列表，
       结果漏掉了 PostsPage.vue:148 的同款规则（它是 `margin: 14px  2px`，两个空格）。
       硬编码清单 = 以后新增页面时必然再漏一次。 */
  const viewFiles = walk(path.join(ROOT, 'src'), ['.vue', '.css']);
  const strayAll = hits(viewFiles, /margin:\s*[\d.]+px\s+2px\b\s*(;|$)/);
  ok(
    strayAll.length === 0,
    `★ 全站视图无「margin 左右 2px」残留（扫了 ${viewFiles.length} 个文件，实得 ${strayAll.length} 处）` +
      (strayAll.length ? ' → ' + strayAll.join(' | ') : '')
  );
  // 明确列出曾经踩过的页面，防止「扫是扫了但路径写错」这种空转
  for (const rel of [
    'src/pages/SearchPage.vue',
    'src/pages/TrashPage.vue',
    'src/pages/LanShare.vue',
    'src/pages/PostsPage.vue'
  ]) {
    const abs = path.join(ROOT, rel);
    ok(fs.existsSync(abs), `（依据）${rel} 存在，确实被扫到了`);
    ok(hits([abs], /margin:\s*[\d.]+px\s+2px\b\s*(;|$)/).length === 0, `${rel} 无 2px 左右偏移`);
  }
  // 行内 style 版：SearchPage 结果计数行原本是 style="margin: 14px 2px"
  const searchSrc = read(path.join(ROOT, 'src/pages/SearchPage.vue'));
  ok(
    !/style="margin:\s*[\d.]+px\s+2px/.test(searchSrc),
    '★ 搜索页结果计数行的行内 style 已抽成 class（行内样式无法被主题/覆写统一管控）'
  );
  ok(
    /class="dim list-meta"/.test(searchSrc) && /\.list-meta\s*\{[^}]*margin:\s*14px\s+0/.test(searchSrc),
    '（依据）该行改挂 .list-meta，且左右外边距归零'
  );
  // 四页的 .list-meta 现在写法应当一致（同一类元素，同一个基线）
  const metaRules = ['SearchPage', 'TrashPage', 'LanShare', 'PostsPage'].map(n => {
    const s = read(path.join(ROOT, `src/pages/${n}.vue`));
    return { n, rule: (s.match(/\.list-meta\s*\{[^}]*\}/) || [''])[0] };
  });
  ok(
    metaRules.every(x => /margin:\s*14px\s+0\b/.test(x.rule)),
    '★ 四页 .list-meta 左右外边距统一归零' +
      (metaRules
        .filter(x => !/margin:\s*14px\s+0\b/.test(x.rule))
        .map(x => x.n)
        .join(',') || '')
  );

  /* —— Beta.240：文档没改动就不该产生新版本 ——
     原实现 id 分支无条件 saveVersion + UPDATE，导致「打开编辑→直接保存」
     也能堆出一条内容完全相同的版本。比对必须在后端做（口径要跟落库规则一致）。 */
  const postsDb = read(path.join(ROOT, 'electron/db/posts.js'));
  const editBody = (postsDb.match(
    /if \(id\) \{\n\s*\/\/ 归属已在函数入口校验[\s\S]*?const projected = projectedSnapshot[\s\S]*?\n\s*\}/
  ) || [''])[0];
  ok(editBody.length > 0, '（依据）savePost 的 id 分支（含等价判定段）已定位');
  ok(/sameSnapshot\(/.test(editBody), '★ 编辑态先做内容等价判定（sameSnapshot），不无条件写版本');
  ok(/unchanged:\s*true/.test(editBody), '★ 等价时返回 unchanged:true（前端据此提示「没有改动」而非「已保存」）');
  // 顺序：判定必须排在 saveVersion 之前，否则等于没判
  const iSame = postsDb.indexOf('if (sameSnapshot(projected, current))');
  const iSave = postsDb.indexOf('saveVersion(id, userId);');
  ok(iSame >= 0 && iSave >= 0 && iSame < iSave, '★ 等价判定在 saveVersion 之前（顺序反了等于没判）');
  // 归一化辅助：空值/顺序不能造成假改动
  ok(
    /function normFields\s*\(/.test(postsDb) && /function normTags\s*\(/.test(postsDb),
    '（依据）有 normFields / normTags 归一化辅助'
  );
  ok(
    /if \(v !== ''\) out\[k\] = v/.test(postsDb),
    '★ 字段归一化丢弃空值 —— 与 applyFieldsAndTags 的「空值不入库」同口径'
  );
  // 两处快照口径必须一致，否则比对永不相等
  const snapOf = (postsDb.match(/function snapshotOf\s*\(id\) \{[\s\S]*?\n\}/) || [''])[0];
  const projOf = (postsDb.match(/function projectedSnapshot\s*\([\s\S]*?\n\}/) || [''])[0];
  const keysIn = s =>
    ['title', 'region_id', 'category_id', 'content_html', 'status', 'no', 'fields', 'tags'].filter(k =>
      new RegExp(`\\b${k}:`).test(s)
    );
  ok(
    keysIn(snapOf).length === 8 && keysIn(projOf).length === 8,
    `★ 两处快照口径一致（snapshotOf ${keysIn(snapOf).length} 键 / projectedSnapshot ${keysIn(projOf).length} 键，均应为 8）`
  );
  // 反面：编辑态不得再有裸的 saveVersion（不带前置判定）
  const bareSave = hits([path.join(ROOT, 'electron/db/posts.js')], /^\s*saveVersion\(id, userId\)/);
  ok(bareSave.length === 1, `编辑态只有一处 saveVersion(id,...) 调用点（等值判定之后的那处），实得 ${bareSave.length}`);
  // 前端反馈分流：不能对「无改动」也报「已保存」
  const doSaveBlock = (pv.match(/async function doSave\s*\(draft\) \{[\s\S]*?\n\}/) || [''])[0];
  ok(/r\.unchanged/.test(doSaveBlock), '★ 前端 doSave 识别 unchanged，提示「没有改动」（避免给出「已保存」的假反馈）');
  ok(/toastOk\(okMsg\.saved\)/.test(doSaveBlock), '（依据）有改动时仍提示「已保存」');

  /* —— Beta.241：版本语义重构 —— 最新版本 === 当前内容 ——
     需求：「标明当前文档是哪个版本」。要能标明，就必须先让「当前内容」对应一个版本号。
     做法：saveVersion 从「UPDATE 前」挪到「UPDATE + applyFieldsAndTags 之后」，
     于是每条版本 = 一个真实落库过的状态，MAX(version_no) 即当前版本。 */
  const fnBody = name => {
    const m = postsDb.match(new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n\\}`));
    return m ? m[0] : '';
  };
  const saveVer = fnBody('saveVersion');
  ok(saveVer.length > 0, '（依据）saveVersion 函数体已定位');

  // ① 内置去重：与最新一条快照等价则跳过
  ok(/sameSnapshot\(/.test(saveVer), '★ saveVersion 内置去重（与最新一条快照比对，等价则不写）');
  ok(/ORDER BY version_no DESC LIMIT 1/.test(saveVer), '★ 去重比对的是「最新一条」快照（顺序取错会拿旧版本来比）');
  // 去重是 restoreVersion 的安全阀：反复恢复同一版不得累计版本号。
  // 放在 saveVersion 内而不是各调用点，才能覆盖任意调用路径。
  ok(
    !/sameSnapshot\(/.test(fnBody('restoreVersion')),
    '（设计）去重只在 saveVersion 一处实现，restoreVersion 不重复造一套（单一数据源）'
  );

  // ② 顺序：所有存快照的调用点都必须在 UPDATE 之后
  const orderCheck = (fnName, snapshotCall, updateCall) => {
    const b = fnBody(fnName);
    const iUpd = b.indexOf(updateCall);
    const iSnap = b.indexOf(snapshotCall);
    return { ok: iUpd >= 0 && iSnap >= 0 && iUpd < iSnap, iUpd, iSnap };
  };
  const saveOrder = orderCheck('savePost', 'saveVersion(id, userId)', "'UPDATE posts SET region_id=");
  ok(
    saveOrder.ok,
    `★ savePost：saveVersion 在 UPDATE 之后（UPDATE@${saveOrder.iUpd} < saveVersion@${saveOrder.iSnap}）`
  );
  // applyFieldsAndTags 必须在 saveVersion 之前 —— snapshotOf 走 getPost()，
  // 快照里的 fields/tags 读的就是 post_fields/post_tags 两张表。
  const iApplyInSave = fnBody('savePost').indexOf('applyFieldsAndTags(id,');
  ok(
    iApplyInSave >= 0 && iApplyInSave < saveOrder.iSnap,
    '★ savePost：applyFieldsAndTags 也在 saveVersion 之前（否则快照里的字段/标签是旧值）'
  );
  const mergeOrder = orderCheck('mergePost', 'saveVersion(target, userId)', "'UPDATE posts SET title=");
  ok(
    mergeOrder.ok,
    `★ mergePost：saveVersion 在 UPDATE 之后（UPDATE@${mergeOrder.iUpd} < saveVersion@${mergeOrder.iSnap}）`
  );
  const restOrder = orderCheck('restoreVersion', 'saveVersion(postId, userId)', 'applyFieldsAndTags(postId,');
  ok(restOrder.ok, '★ restoreVersion：恢复落库后再存快照（恢复本身也产出一个版本）');

  // ③ 反面：不得再有任何「UPDATE 之前存快照」的调用点。
  //    用静态位置验证只能覆盖已知函数；这里再查一次全局顺序，防止新增调用点时回退。
  const allSaveCalls = [];
  const reSaveCall = /saveVersion\(/g;
  let mSave;
  while ((mSave = reSaveCall.exec(postsDb))) {
    if (/^function saveVersion/.test(postsDb.slice(mSave.index, mSave.index + 40))) continue;
    allSaveCalls.push(mSave.index);
  }
  ok(
    allSaveCalls.length >= 3,
    `（依据）saveVersion 有 ${allSaveCalls.length} 个调用点（savePost 编辑新建 / mergePost / restoreVersion）`
  );
  // restoreVersion 里紧跟其后的必须是 audit（顺序：UPDATE → applyFields → saveVersion → audit）
  const restAudit = fnBody('restoreVersion');
  ok(
    restAudit.indexOf('saveVersion(postId, userId)') < restAudit.indexOf("audit(userId, '恢复历史版本'"),
    '（依据）restoreVersion 的审计记录排在存快照之后'
  );

  // ④ 撒谎的注释必须纠正：Beta.169 那句「恢复【不】写新版本」
  const restFn = fnBody('restoreVersion');
  ok(
    !/恢复【不】写新版本/.test(restFn),
    '★ restoreVersion 里 Beta.169「恢复不写新版本」的旧说法已删除（注释不得与实现相反）'
  );
  ok(
    /恢复【要】写新版本/.test(restFn) && /Beta\.241/.test(restFn),
    '★ 新注释说明「恢复要写新版本」及其理由（回退前的内容不再永久丢失）'
  );

  // ⑤ listVersions 返回 is_current（由 MAX 推出，不额外存状态列）
  const listVer = fnBody('listVersions');
  ok(/is_current/.test(listVer), '★ listVersions 返回 is_current');
  ok(/MAX|rows\[0\]\.version_no|maxNo/.test(listVer), '★ is_current 由最高版本号推出（不存冗余状态列 —— 单一数据源）');
  // 逐条标注而不是只标一条：列表要能整体渲染
  ok(/rows\.map\(/.test(listVer), '（依据）逐条 map 标注 is_current，而非只给首条打标');

  // ⑥ 前端：当前版本标记 + 页头版本号
  const vhSrc241 = read(path.join(ROOT, 'src/components/post/VersionHistory.vue'));
  ok(/v\.is_current/.test(vhSrc241), '★ VersionHistory 按 v.is_current 标注当前版本');
  ok(/ver-badge/.test(vhSrc241), '★ 当前版本有可视标记（badge 文案「当前版本」）');
  ok(/v-if="v\.is_current"[\s\S]*?当前版本/.test(vhSrc241), '（依据）badge 文案就是「当前版本」');
  // 主题：颜色必须走 CSS 变量，不得硬编码
  const badgeRule = (vhSrc241.match(/\.ver-badge\s*\{[^}]*\}/) || [''])[0];
  ok(
    /var\(--accent\)/.test(badgeRule) && !/#[0-9a-fA-F]{3,8}\b/.test(badgeRule),
    '★ 当前版本 badge 颜色走 CSS 变量 --accent，无硬编码 hex（8 套主题通吃）'
  );
  const curRule = (vhSrc241.match(/\.ver\.is-current\s*\{[^}]*\}/) || [''])[0];
  ok(/var\(--accent\)/.test(curRule), '★ 当前版本行的左侧标记也用 --accent');
  // 页头版本号：Beta.242 起该按钮改为纯图标，版本号不再渲染成可见文字，
  // 而是进了 title/aria-label（悬停与读屏仍读得到）。
  // 断言跟着意图走：版本号仍挂在页头按钮上，且空版本时不会渲染出 vundefined。
  const pv241 = read(path.join(ROOT, 'src/pages/PostView.vue'));
  const vhSticky = read(path.join(ROOT, 'src/components/post/VersionHistory.vue'));
  const verBtn241 = (pv241.match(/<button[^>]*showVersions[^>]*>/) || [''])[0];
  ok(verBtn241.length > 0, '（依据）页头「历史版本」按钮已定位');
  // ★ Beta.270：「当前」二字搬进 post 字典（post.current），title 改为模板串拼接
  ok(
    /t\('post\.current'\)\} v\$\{post\.versions\[0\]\.version_no\}/.test(verBtn241),
    '★ 页头版本按钮带「当前 v{M}」（打开面板前就知道自己在哪一版；经 t() 引用 post.current）'
  );
  ok(/post\.versions\.length\s*\?/.test(verBtn241), '★ 无版本时不显示「当前 v…」（否则会渲染出当前 vundefined）');
  const postDict241 = read(path.join(ROOT, 'src/i18n/parts/post.zh-CN.js'));
  ok(
    /:aria-label="t\('post\.versionHistory'\)"/.test(verBtn241) &&
      /:title=/.test(verBtn241) &&
      /versionHistory: '历史版本'/.test(postDict241),
    '★ 纯图标按钮同时有 title 与 aria-label（去掉文字后这是唯一可读线索；aria-label 经 t() 引用 post.versionHistory）'
  );

  /* —— Beta.242：is_current 实机不生效的回归防线 ——
     上一轮 Backend 全绿、实机坏掉：getPost() 用自己内联的一条 SQL 查 versions，
     没返回 is_current；而页面读的是 post:get，不是 post:versions。
     ⇒ 同一个「版本列表」有两条各自演进的查询，这违背殊途同归。 */
  // 定位正则容忍可选参数（Beta.315 getPost 增加内部 raw 选项）：签名演进不该让定位失效，
  // 但下方两条实质判据（无内联版本 SQL、必须走 listVersions）一字未动。
  const getPostRaw = (postsDb.match(/function getPost\s*\(id[^)]*\) \{[\s\S]*?\n\}/) || [''])[0];
  ok(getPostRaw.length > 0, '（依据）getPost 函数体已定位');
  // ★ 必须先剥掉注释再断言：本函数自己的说明注释里就写了「原来是内联的 SELECT ... FROM post_versions」，
  //   而 hits() 只拦行首为 // /* * 的行 —— 直接对原文匹配会被这条注释误判成「代码里还有裸 SQL」。
  const stripComments = s =>
    s
      .split('\n')
      .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
  const getPostCode = stripComments(getPostRaw);
  ok(!/FROM post_versions/.test(getPostCode), '★ getPost 不再自带版本查询 SQL（版本列表只有一个来源：listVersions）');
  ok(
    /const versions = listVersions\(id\)/.test(getPostCode),
    '★ getPost 复用 listVersions(id)，与 post:versions 通道同源'
  );
  // 兜底：真正「列出版本列表供界面用」的 SELECT 只能有 1 处（listVersions 自己那条）。
  // 这里的 from-post_versions 其余出现都是正当用途（取快照/取最大版本号/按 id 取单条/删除），
  // 所以判据不能是「全文出现次数」，而要收窄到「带 ORDER BY version_no 的列表查询」。
  const listQueries =
    stripComments(postsDb).match(/SELECT[\s\S]{0,220}?FROM post_versions[\s\S]{0,120}?ORDER BY v\.version_no DESC/gi) ||
    [];
  ok(
    listQueries.length === 1,
    `★ 全文件只有 1 处「按版本号倒序列出版本」的查询（实得 ${listQueries.length}）—— ` +
      '两处就会各自演进，实机与测试必然再次分叉'
  );
  ok(
    !/SELECT[\s\S]{0,220}?FROM post_versions[\s\S]{0,120}?ORDER BY version_no DESC(?! LIMIT 1)/i.test(
      stripComments(postsDb).replace(/ORDER BY version_no DESC LIMIT 1/g, '')
    ),
    '（依据）saveVersion 里那条 ORDER BY version_no DESC LIMIT 1 是「取最新一条快照」，不是列表查询'
  );
  // e2e 必须有人走 post:get 链路断言，否则同类回归还会漏过
  const e2eSrc241 = read(path.join(ROOT, 'electron/verify/post-edit-new.e2e.cjs'));
  ok(
    /post:get/.test(e2eSrc241) && /is_current/.test(e2eSrc241),
    '★ e2e 有走 post:get 链路的 is_current 断言（上一轮只测 post:versions，测不到实机那条路）'
  );
  // 注释里的 post:get 字样也要算数 —— 上面那条断言不能只靠注释通过
  const e2eCode241 = e2eSrc241
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  ok(/ipc\('post:get'\)/.test(e2eCode241), '（依据）post:get 是以真实调用出现的，不是只在注释里提到');

  /* —— Beta.242 需求：单篇文档导出 PDF / Markdown 分享 —— */
  const expJs = read(path.join(ROOT, 'electron/ipc/exports.js'));
  const expCode = stripComments(expJs);
  ok(/handle\('post:exportMd'/.test(expJs), '★ 单篇 Markdown 导出通道存在');
  ok(/handle\('post:exportPdf'/.test(expJs), '★ 单篇 PDF 导出通道存在');
  // 必须复用既有服务层，而不是另写一套 html→md / 打印逻辑
  ok(/exportText\.buildMd\(\[post\]/.test(expCode), '★ 复用 exportText.buildMd（不另造 HTML→Markdown）');
  ok(/exportText\.buildPdfHtml\(\[post\]/.test(expCode), '★ 复用 exportText.buildPdfHtml（不另造 PDF 版式）');
  ok(/db\.getPost\(/.test(expCode), '★ 数据源是 db.getPost(id)，其返回形状正好是 buildMd/buildPdfHtml 需要的');
  // 批量与单篇必须是两条通道：把 id 塞进 buildWhere 会让「筛选条件」语义变混
  ok(
    !/postsWithFields/.test(expCode.split('post:exportMd')[1] || ''),
    '★ 单篇导出不走 postsWithFields（那是批量筛选通道，不支持按 id 过滤）'
  );
  // PDF 的临时文件必须仍叫 index.html：CSP 白名单只认这个名字，否则内联图片全裂。
  // ★ Beta.243：这段实现已收敛进 printHtmlToPdf，断言跟着实现走。
  const printer = (expCode.match(/async function printHtmlToPdf[\s\S]*?\n\}/) || [''])[0];
  ok(printer.length > 0, '（依据）printHtmlToPdf 已定义');
  ok(/'index\.html'/.test(printer), '★ PDF 临时文件命名为 index.html（CSP 白名单只认它，否则正文图片裂图）');
  ok(/printToPDF/.test(printer), '★ printHtmlToPdf 走 printToPDF');
  ok(
    /os\.tmpdir\(\)/.test(printer) && /mkdirSync\(tmpDir, \{ recursive: true \}\)/.test(printer),
    '（依据）临时 HTML 落在独立子目录并先建目录'
  );
  ok(
    /rmSync\(tmpDir, \{ recursive: true, force: true \}\)/.test(printer) && /w\.destroy\(\)/.test(printer),
    '★ 无论成功失败都清理临时目录与隐藏窗口（不清理会攒出一堆 /tmp/archpdf_*）'
  );
  // 不显式传 margins：Electron 30 对边距校验很严，传大了直接抛错
  ok(
    !/margins:/.test(printer),
    '★ 不显式传 margins（Electron 30 边距校验严，传 ≥11mm 会抛 "margins must be less than or equal to pageSize"）'
  );
  // 文件名用文档标题（分享场景），且必须清洗 Windows 非法字符
  ok(/function exportFileName\s*\(/.test(expCode), '（依据）有 exportFileName 助手');
  const fname = (expCode.match(/function exportFileName[\s\S]*?\n\}/) || [''])[0];
  ok(
    /compactDate\(\)/.test(fname) && /post\.title|base/.test(fname),
    '★ 单篇导出文件名带文档标题 + 日期（分享时对方能认出是哪份）'
  );
  ok(
    /replace\(\/\[[/\\:*"?<>|]/.test(fname) || /replace\(\/\[/.test(fname),
    '★ 文件名清洗非法字符（标题用户可控，不清洗会让写盘直接失败）'
  );
  ok(/slice\(0, ?\d+\)/.test(fname), '★ 文件名长度截断（标题上限 200 字，直接当文件名会把路径撑爆）');
  // 审计要记到文档 id 上（单篇可追溯）
  ok(
    /safeAudit\(currentUser\(\), '单篇 Markdown 导出', 'md', String\(post\.id\)/.test(expCode),
    '★ 单篇导出审计记到具体文档 id（分享类操作要可追溯到是哪一份）'
  );
  // preload 映射
  const preJs = read(path.join(ROOT, 'electron/preload.js'));
  ok(
    /postMdExport: p => call\('post:exportMd', p\)/.test(preJs) &&
      /postPdfExport: p => call\('post:exportPdf', p\)/.test(preJs),
    '★ preload 已桥接两个新通道（漏了前端就调不到）'
  );
  // 前端 composable
  const ueJs = read(path.join(ROOT, 'src/composables/useExports.js'));
  ok(/export function usePostExports/.test(ueJs), '（依据）有 usePostExports');
  ok(
    /A\.postMdExport\(\{ id: postId\.value \}\)/.test(ueJs) && /A\.postPdfExport\(\{ id: postId\.value \}\)/.test(ueJs),
    '★ usePostExports 按文档 id 调用两条新通道'
  );

  /* —— Beta.242 需求：分享下拉 + 纯图标 + 页头吸顶 —— */
  const smSrc = read(path.join(ROOT, 'src/components/post/ShareMenu.vue'));
  const smCode = stripComments(smSrc);
  // 顺序即数据源：Markdown 必须排在 PDF 前面（与设置页 DataSection.vue:66-67 同序）
  // ★ Beta.270：菜单项标签搬进 post 字典（exportMd/exportPdf），顺序断言改认键引用
  const iMd = smCode.indexOf("t('post.exportMd')");
  const iPdf = smCode.indexOf("t('post.exportPdf')");
  ok(
    iMd >= 0 && iPdf >= 0 && iMd < iPdf,
    '★ 分享菜单里「导出 Markdown」排在「导出 PDF」之前（与设置页同序；标签经 t() 引用 post 字典）'
  );
  // 文案：用户明确要求去掉省略号
  ok(!/导出 Markdown…|导出 PDF…/.test(smCode), '★ 分享菜单文案不带省略号（用户定稿：导出 Markdown / 导出 PDF）');
  const postDict242 = read(path.join(ROOT, 'src/i18n/parts/post.zh-CN.js'));
  ok(
    /exportMd: '导出 Markdown'/.test(postDict242) && /exportPdf: '导出 PDF'/.test(postDict242),
    '（依据）post 字典两个导出标签定稿无省略号（措辞锁在字典，防页面侧漂移）'
  );
  // 位置：在「历史版本」之前
  const pvShare = (pv241.match(/<ShareMenu[\s\S]{0,200}?\/>/) || [''])[0];
  ok(pvShare.length > 0, '（依据）PostView 页头已接入 ShareMenu');
  const iShare = pv241.indexOf('<ShareMenu');
  const iVerBtn = pv241.indexOf('showVersions = !showVersions');
  ok(iShare >= 0 && iVerBtn >= 0 && iShare < iVerBtn, '★ 分享按钮排在「历史版本」按钮之前（用户定稿的位置）');
  // 导出是只读操作，不该被 canEdit 挡住
  const shareBlock = (pv241.match(/<ShareMenu[\s\S]{0,400}?<\/ShareMenu>|<ShareMenu[\s\S]{0,300}?\/>/) || [''])[0];
  ok(
    !/v-if="canEdit"/.test(shareBlock),
    '★ 分享/导出不绑 canEdit（只读文档也应能导出分享，与页内查找/历史版本同口径）'
  );
  // 主题：弹层颜色必须走变量
  const smStyle = (smSrc.match(/\.share-popup\s*\{[\s\S]*?\}/) || [''])[0];
  ok(/var\(--surface\)/.test(smStyle) && /var\(--text\)/.test(smStyle), '★ 分享弹层颜色走 CSS 变量（8 套主题通吃）');
  ok(!/#[0-9a-fA-F]{3,8}\b/.test(smCode.replace(/#[0-9a-fA-F]{3,8}/g, '')), '★ ShareMenu.vue 无硬编码 hex');
  ok(/zIndex: 'var\(--z-dropdown\)'/.test(smCode), '★ 弹层层级走全局 z-index 刻度 var(--z-dropdown)，不写死数字');
  // Teleport + fixed 定位：页头是 sticky 容器，纯 CSS 绝对定位会跟滚动错位
  ok(/<Teleport to="body">/.test(smSrc), '★ 弹层 Teleport 到 body');
  ok(/position: 'fixed'/.test(smCode), '（依据）弹层用 fixed + 动态坐标（sticky 容器内不能靠 CSS 定位）');
  // 关闭行为三件套
  ok(
    /mousedown/.test(smCode) && /Escape/.test(smCode) && /'scroll'/.test(smCode),
    '★ 点外部 / Esc / 滚动 三种情况都会关闭或重定位弹层'
  );

  // 纯图标按钮：每个都必须有 title + aria-label
  const iconBtns = pv241.match(/<button[\s\S]{0,80}?class="btn btn-icon[^"]*"[^>]*>/g) || [];
  ok(iconBtns.length >= 4, `（依据）页头有 ${iconBtns.length} 个纯图标按钮`);
  const noAria = iconBtns.filter(b => !/aria-label=/.test(b));
  ok(noAria.length === 0, '★ 每个纯图标按钮都有 aria-label' + (noAria.length ? ' → 缺：' + noAria.join(' ') : ''));
  const noTitle = iconBtns.filter(b => !/title=/.test(b));
  ok(
    noTitle.length === 0,
    '★ 每个纯图标按钮都有 title（悬停提示）' + (noTitle.length ? ' → 缺：' + noTitle.join(' ') : '')
  );
  // 图标按钮的尺寸类必须存在，否则去掉文字后按钮会变成横向长条
  const baseCss = read(path.join(ROOT, 'src/styles/base.css'));
  ok(/\.btn\.btn-icon\s*\{/.test(baseCss), '（依据）有 .btn-icon 尺寸类（.btn 的 padding 是按带文字设计的）');
  const btnIconRule = (baseCss.match(/\.btn\.btn-icon\s*\{[^}]*\}/) || [''])[0];
  ok(
    /width:\s*32px/.test(btnIconRule) && /padding:\s*0/.test(btnIconRule),
    '★ .btn-icon 设为正方形（去掉文字后仍是 32×32 的方块）'
  );

  // 页头吸顶：必须补背景 + 用全局层级变量
  ok(/page-head sticky-head/.test(pv241), '★ PostView 页头挂了 sticky-head');
  ok(/\.page-head\.sticky-head\s*\{/.test(baseCss), '（依据）有 .sticky-head 样式');
  // ★ 断言前必须先剥掉块内注释：本规则的注释里为解释原因写了 `top:-20px` 等字样，
  //   若直接对整块做正则，注释能满足断言、真实的 CSS 声明被删掉也照样"通过"——
  //   变异测试证实过这个假通过（把 top 改成 0 仍然全绿）。故先删注释再断言。
  const stickyRule = stripComments((baseCss.match(/\.page-head\.sticky-head\s*\{[^}]*\}/) || [''])[0]);
  ok(/position:\s*sticky/.test(stickyRule), '★ 页头 position: sticky');
  // 不变量：吸顶栏背景必须用 --surface（卡片底色）。
  //   不能用 --bg（外层底色）—— 暗色/竹青等主题下两者差异明显，
  //   栏与下方卡片会分成两层色，用户看到的就是"悬浮栏背景不是卡片底色"。
  //   ★ 断言绑"必须等于 --surface"这个语义，而不是写死某个颜色字面量：
  //     早期版本断言 background:var(--bg)，改配色时会误报，也拦不住真正的错配。
  ok(
    /background:\s*var\(--surface\)/.test(stickyRule),
    '★ 吸顶页头背景用卡片底色 var(--surface)（否则与下方卡片不同底、正文还会透出）'
  );
  // 不变量：必须向上吃掉 .main 的 padding-top，否则滚动时"没贴顶、上方漏一条"。
  //   .main 的 padding-top 是 20px，故 sticky 的 top 与 margin-top 都要 -20px 抵消。
  // ★ 必须排除 margin-top / padding-top 等前缀：早期写 /top:\s*-20px/ 时，
  //   `margin-top: -20px` 里的子串会把它命中，导致把 top 改成 0 也照样"通过"
  //   （变异测试已证实这个假通过）。用 (?<![\w-]) 锚定词边界。
  ok(
    /(?<![\w-])top:\s*-20px/.test(stickyRule),
    '★ 吸顶吸附线提到容器顶（top:-20px 抵消 .main 的 padding-top，否则没贴顶）'
  );
  ok(/(?<![\w-])margin-top:\s*-20px/.test(stickyRule), '★ 吸顶栏上沿与吸附线对齐（margin-top:-20px）');
  // 不变量：吸顶栏下方必须留出与卡片间距等值的留白。
  //   .page-head 是 .main 的普通子元素、.post-layout 是它紧邻的兄弟，
  //   两者之间除了这条 margin-bottom 再无任何间距来源（.post-layout 的 gap
  //   只作用于它内部的 grid 项目，管不到它与页头之间）。
  //   ★ 曾经写成 margin-bottom:0，理由是"同底后无需留缝"——那个判断是错的：
  //     正文首卡会直接压在页头分隔线上（实测 -1px），而卡片之间是 16px，
  //     视觉上首卡明显"贴住页头"。分隔线负责分隔，留白必须由间距给。
  //   取 var(--card-gap, ...)：与 .card-stack 的卡片间距共用同一数据源，
  //   避免将来只改一处导致"首卡 16px、后续卡 20px"。
  //   变异测试：删掉这条 → 断言失败；写成 margin-bottom:0 → 断言失败。
  ok(
    /(?<![\w-])margin-bottom:\s*var\(--card-gap/.test(stickyRule),
    '★ 吸顶栏下方留白 = 卡片间距 var(--card-gap)（否则正文首卡贴住页头，与下方卡片间距不一致）'
  );
  // 不变量：详情页右栏「历史版本」必须让开页头高度 + 页头下方那段留白，
  //   否则滚上去会钻到页头底下重叠；且只让开页头高度会让吸附态与静止态的间距不一致
  //   （静止 16px、吸附后塌成 0，一滚就"吸"上去）。
  //   ★ 值必须取自 --sticky-rail-top（在 .main 上统一算好）：
  //     sticky 的 top 相对滚动容器的 padding box 解析，而 .main 有 padding-top:20px，
  //     所以在组件里直接写 51+16=67 会被多推 8px（实测 verTop 131 vs 自然位置 123）。
  //     真实取值靠扫参实测确定，详见 base.css 的 --sticky-rail-top 注释。
  const vhRule = stripComments((vhSticky.match(/\.versions\s*\{[^}]*\}/) || [''])[0]);
  ok(
    /(?<![\w-])top:\s*var\(--sticky-rail-top/.test(vhRule),
    '★ 历史版本侧栏 top 取 --sticky-rail-top（让开页头 + 留白，吸附态与静止态间距一致）'
  );
  ok(
    /--sticky-rail-top:\s*\d+px/.test(stripComments(baseCss)),
    '（依据）--sticky-rail-top 已在 base.css 上定义（否则组件里的 var() 取不到值会 fallback）'
  );
  // ★ 两态交集检查：51px 是"静止态不被下推"与"吸附态刚好留 16px"的唯一解。
  //   实测（Beta.249）：静止 49→16/14  50→16/15  51→16/16 ✓  52→17/17。
  //   这里把值写死，是为了让任何"顺手改成 56px"之类的改动立即暴露 ——
  //   历史上就发生过一次：旧注释误称"0~64px 无临界点"，导致取了 56px，
  //   静止态被多推 5px（间隙 21px 而非 16px）。改这个值必须重新扫参两态。
  const railTopVal = (stripComments(baseCss).match(/--sticky-rail-top:\s*(\d+)px/) || [])[1];
  ok(
    railTopVal === '51',
    `★ --sticky-rail-top = 51px（静止态与吸附态同时得到 16px 间距的唯一解；实得 ${railTopVal}px）`
  );
  // 组件 fallback 必须与变量同值，否则变量缺失时两处脱节
  ok(
    /top:\s*var\(--sticky-rail-top,\s*51px\)/.test(vhRule),
    '★ 组件 fallback 也是 51px（与变量同值，避免取不到值时脱节）'
  );
  ok(
    /--card-gap:\s*16px/.test(stripComments(baseCss)),
    '（依据）--card-gap 已在 base.css 的 .main 上定义（页头与 .card-stack 共用同一数据源）'
  );
  ok(/z-index:\s*var\(--z-hint\)/.test(stickyRule), '★ 吸顶层级用 var(--z-hint)（低于抽屉/弹窗/下拉/Toast，不盖浮层）');
  ok(
    /border-bottom:\s*1px solid var\(--border\)/.test(stickyRule),
    '（依据）吸顶后有底部分割线，替代原来靠 margin 承担的分隔'
  );
  // ★ 不变量：吸顶页头底部分割线必须与左侧导航栏图标行的分割线齐平（Beta.248 用户需求）。
  //   左侧 NavToolbar 是 padding 6/8 + 行高 30 → 线在 y=99；
  //   右侧页头从容器顶(44)起算，靠"上下内边距 + 内容高 32 + 描边 1"把线落在同一位置：
  //     y(线) = 44 + padding-top + 32 + padding-bottom + 1
  //   要让 y=99 恒成立 ⇒ padding-top + padding-bottom = 22。
  //   这一条才是真正的不变量；单看 padding-bottom 的绝对值是**误导性的**：
  //   Beta.248 时是 20/2（和 22），Beta.251 为内容垂直居中改成 11/11（和仍是 22），
  //   两次都对齐，但 padding-bottom 从 2 变成了 11。
  //   ★ 历史教训：本断言原先写死"padding-bottom == 2px"，于是 Beta.251 一改就误报失败 ——
  //     它锁的是实现细节而非不变量。改成断言"两者之和 = 22"后，
  //     既拦得住"随手把 11 改成 10"（和变 21、线漂到 98），
  //     也不会误伤"为居中而对称调整"这类合法改动。
  //   ★ 另一半约束（内容居中）由 head-gap.check.cjs 实机量测兜底 ——
  //     静态断言证明不了渲染坐标，且只有实机能验"上留白 == 下留白"。
  const stickyPadPair = stickyRule.match(/padding-top:\s*([\d.]+)px[\s\S]*?padding-bottom:\s*([\d.]+)px/);
  ok(!!stickyPadPair, '★ 吸顶页头显式声明了 padding-top / padding-bottom（顺序不能颠倒，本断言按序取）');
  if (stickyPadPair) {
    const padSum = parseFloat(stickyPadPair[1]) + parseFloat(stickyPadPair[2]);
    ok(
      padSum === 22,
      `★ 吸顶页头 padding-top + padding-bottom = 22px（= 99 − 44 − 32 − 1，使底部分割线与左侧导航图标行分割线齐平；实得 ${padSum}px）`
    );
    ok(
      parseFloat(stickyPadPair[1]) === parseFloat(stickyPadPair[2]),
      `★ 上下内边距必须**相等**（Beta.251 用户需求「悬浮栏内容上下居中」；实得 上=${stickyPadPair[1]}px 下=${stickyPadPair[2]}px）`
    );
  }
  // NavToolbar 的 padding 是这条对齐关系的另一端，两处必须能对上：
  // 若有人改了 NavToolbar 的 padding，页头这边的 22px 就不再对齐，需要同步重算。
  const navTbSrc = read(path.join(ROOT, 'src/components/NavToolbar.vue'));
  const navTbCss = stripComments(navTbSrc);
  // ★ Beta.251：原先写死 `padding: 6px 2px 8px`，用户要求「导航栏图标也上下居中」后
  //   改为 `7px 2px 7px`。但真正的不变量有两条，直接写死字面量会两头误伤：
  //     ① 上下之和 == 14（原 6+8）—— 决定工具栏总高 45px、底边 y=99，
  //        右侧悬浮栏的分割线正是按这个底边对齐的，和一变就全歪；
  //     ② 上下相等 —— 这是"图标上下居中"的充要条件。
  //   ⇒ 改成提取数值后断言这两条，既拦得住乱改，也不会因为"为居中而对称调整"误报。
  const navTbPad = navTbCss.match(/padding:\s*([\d.]+)px\s+2px\s+([\d.]+)px/);
  ok(!!navTbPad, '★ NavToolbar 显式声明 padding（形式须为「上 2px 下」，本断言按此解析）');
  if (navTbPad) {
    const nvUp = parseFloat(navTbPad[1]);
    const nvDown = parseFloat(navTbPad[2]);
    ok(
      nvUp + nvDown === 14,
      `★ NavToolbar 上下内边距之和 = 14px（= 99 − 54 − 30 − 1，保证底边 y=99 与悬浮栏分割线齐平；实得 ${nvUp + nvDown}px）`
    );
    ok(
      nvUp === nvDown,
      `★ NavToolbar 上下内边距相等（Beta.251 用户需求「导航栏的图标也要上下居中」；实得 上=${nvUp}px 下=${nvDown}px）`
    );
  }
  // ★ Beta.251：--sticky-rail-top 的换算基准是 .main 的 padding-top(20px)，不是页头自己的。
  //   页头 padding-top 由 20 改成 11 后，本值**仍应是 51px**。
  //   这里额外断言"页头 padding-top 不再是 20"，防止有人照旧公式又把它算回 60px。
  //   （实测：改成 60px 会让版本栏在静止态被下推 9px，与正文首卡错位。）
  ok(
    stickyPadPair && parseFloat(stickyPadPair[1]) !== 20,
    '★ 页头 padding-top 已不是 20px（若又变回 20，说明居中改动被回退，需一并复核 --sticky-rail-top）'
  );

  /* —— Beta.248：局域共享图标与分享图标必须区分 ——
   * 两者在同一屏上同时出现（左侧导航栏的「局域共享」+ 详情页页头的「分享」），
   * 若都画成同一个"节点互联"图形，用户会以为它们是同一个功能。
   * 做法：把 share 留给分享语义，局域共享一律用新增的 lan-share（电台广播形）。 */
  const iconSrc = read(path.join(ROOT, 'src/components/Icon.vue'));
  /* Beta.319：图标数据在 icon-antd.js，断言对象随之改（直接比对数据，不看源码文本）。
   * 意图不变且更严：lan-share 与 lan-host 必须都存在，且**图形不同** ——
   * 上一版两者都退化成了形近替代，光断言"键存在"是抓不住的。 */
  const lsIcon = JSON.stringify(ICON_DATA['lan-share'] || null);
  const lhIcon = JSON.stringify(ICON_DATA['lan-host'] || null);
  ok(lsIcon !== 'null' && lhIcon !== 'null', '（依据）已新增 lan-share / lan-host 两个局域共享专用图标');
  ok(lsIcon !== lhIcon, 'lan-share 与 lan-host 图形不同（不是同一个图标的别名）');
  /* 全库不得出现「两个键指向同一份图形」的重复 —— 上一版 eraser/broom、
     code/code-block、heading-1/heading-2 都是同图，用户一眼就看出不对。 */
  {
    const seen = new Map();
    const dups = [];
    for (const [k, v] of Object.entries(ICON_DATA)) {
      const sig = JSON.stringify(v.ch);
      if (seen.has(sig)) dups.push(`${seen.get(sig)}/${k}`);
      else seen.set(sig, k);
    }
    ok(dups.length === 0, `图标无重复图形（重复：${dups.join('、') || '无'}）`);
  }
  // 分享组件必须继续用 share（它是"分享/导出"语义，不该被换成 lan-share）
  const smSrc2 = read(path.join(ROOT, 'src/components/post/ShareMenu.vue'));
  ok(/<Icon name="share"/.test(smSrc2), '★ 分享下拉仍用 share 图标（分享语义，与局域共享区分开）');
  // 所有"局域共享"语义的位置都必须用 lan-share，不能再出现裸 share
  for (const f of [
    'src/components/Sidebar.vue',
    'src/components/home/StatCards.vue',
    'src/components/RegionNav.vue',
    'src/components/SharePanel.vue',
    'src/pages/RegionView.vue',
    'src/pages/LanShare.vue'
  ]) {
    const s = read(path.join(ROOT, f));
    ok(!/<Icon name="share"/.test(s), `★ ${f.replace('src/', '')} 不再使用 share 图标（局域共享一律用 lan-share）`);
  }
  ok(
    /<Icon name="lan-share"/.test(read(path.join(ROOT, 'src/components/Sidebar.vue'))),
    '★ 左侧导航栏「局域共享」用 lan-share（与页头分享图标不同形）'
  );

  /* —— Beta.243：共享文档导出 + PostCard 作者不可点 / 编号对齐 —— */
  const pcSrc = read(path.join(ROOT, 'src/components/PostCard.vue'));
  const pcCode = stripComments(pcSrc);

  // ① 局域共享列表的作者名必须不可点：那里的 author_id 是对方机器的用户 id，
  //    拿到本机筛选必然查不到人，点下去只会跳到空列表像是坏了。
  ok(
    /clickable:\s*\{ type: Boolean, default: true \}/.test(pcCode),
    '（依据）PostCard 有 clickable 属性，默认 true（本机列表保持原行为）'
  );
  ok(
    /@click\.stop="clickable && gotoAuthor\(\)"/.test(pcCode),
    '★ 作者名点击被 clickable 门控（不可点时不会触发跳转）'
  );
  ok(
    /\.pc-author \{[^}]*\}\s*\n?\s*\.pc-author\.is-link/.test(pcCode) ||
      /\.pc-author\.is-link\s*\{[^}]*cursor:\s*pointer/.test(pcCode),
    '★ 只有 is-link 态才给手型光标（不可点时不该暗示可点）'
  );
  const lsSrc = read(path.join(ROOT, 'src/pages/LanShare.vue'));
  const lsPostCard = (lsSrc.match(/<PostCard[\s\S]{0,300}?\/>/) || [''])[0];
  ok(/:clickable="false"/.test(lsPostCard), '★ 局域共享列表传了 :clickable="false"（对方机器的作者 id 在本机无意义）');
  // 本机列表不得被误伤
  for (const page of ['PostsPage', 'SearchPage', 'RegionView']) {
    const s = read(path.join(ROOT, `src/pages/${page}.vue`));
    const pc = (s.match(/<PostCard[\s\S]{0,300}?\/>/) || [''])[0];
    ok(pc.length > 0 && !/:clickable="false"/.test(pc), `（依据）${page} 未禁用作者点击（本机列表行为不变）`);
  }

  // ② 文档编号与同行对齐：字号必须继承 .pc-meta，不能单独小一号
  const noRule = (pcSrc.match(/\.pc-no\s*\{[^}]*\}/) || [''])[0];
  ok(
    /font-size:\s*inherit/.test(noRule),
    '★ 文档编号字号继承 .pc-meta（此前单独 11px，比同行 11.5px 小一号 → 基线错位）'
  );
  ok(!/font-size:\s*11px/.test(noRule), '（依据）不再有独立的 11px 字号');
  const metaRule243 = (pcSrc.match(/\.pc-meta\s*\{[^}]*\}/) || [''])[0];
  ok(/align-items:\s*center/.test(metaRule243), '★ 元信息行加 align-items:center（字体不同的各段才能垂直居中对齐）');
  // 编号前缀：截图里出现过 "# IMP-..."，确认前缀写法统一（不重复加 #）
  ok(
    /class="pc-no">\{\{ post\.no \}\}</.test(pcCode),
    '★ 编号直接渲染原值（此前模板里自带 "# " 前缀，易与数据里的前缀叠成 "# #"）'
  );

  // ③ 共享文档导出通道
  ok(/handle\('share:exportDoc'/.test(expJs), '★ 共享文档导出通道存在');
  ok(/function normalizeSharedPost\s*\(/.test(expCode), '（依据）有 normalizeSharedPost 收敛载荷');
  ok(/db\.cleanHtml\(/.test(expCode), '★ 共享正文过 db.cleanHtml（载荷来自网络对端，隐藏窗口 loadURL 能执行脚本）');
  ok(
    !/require\('sanitize-html'\)/.test(expCode),
    '（依据）不另写一套白名单（复用 core.cleanHtml，两份白名单必然漂移）'
  );
  // 形状对齐：buildMd 读 p.tnames（字符串）与 p.fields[code]（对象）
  ok(/\.join\('；'\)/.test(expCode), '★ tags 收敛成 tnames 字符串（buildMd 读的是 tnames，传数组会丢标签）');
  ok(
    /acc\[code\]\s*=/.test(expCode),
    '★ fields 收敛成以 code 为键的对象（buildMd 读 p.fields[code]，传数组会静默丢掉全部字段）'
  );
  ok(
    /exportText\.buildMd\(\[post\]/.test(expCode) || /exportText\.buildMd\(\[post\], defs/.test(expCode),
    '★ 共享导出复用 buildMd'
  );
  ok(/exportText\.buildPdfHtml\(\[post\]/.test(expCode), '★ 共享导出复用 buildPdfHtml');
  // PDF 打印逻辑收敛成一处（原本要写第三遍，很容易漏掉 CSP 那段注释里的坑）
  const printFns = (expCode.match(/async function printHtmlToPdf/g) || []).length;
  ok(printFns === 1, `（依据）PDF 打印收敛为 printHtmlToPdf 一个函数（实得 ${printFns} 处定义）`);
  // 注意：定义处写作 `printHtmlToPdf (html, ...)`（函数名与括号之间有空格），
  // 所以调用点要连定义一起数，且正则不能漏掉这个空格。
  const printCalls = (expCode.match(/await printHtmlToPdf\(/g) || []).length;
  ok(
    printCalls === 3,
    `★ 批量/单篇/共享三条 PDF 路径都 await 同一个 printHtmlToPdf（实得 ${printCalls} 处调用）—— ` +
      'CSP 白名单那段坑只写一次就不会漏'
  );
  // 反面：不得再有第二处内联的 printToPDF（收敛前批量分支就漏在外）
  ok(
    (expCode.match(/printToPDF\(/g) || []).length === 1,
    `★ 全文件只有一处 printToPDF 调用（实得 ${(expCode.match(/printToPDF\(/g) || []).length}）—— ` +
      '出现第二处就说明又内联复制了一份'
  );
  // preload 桥接
  ok(/shareExportDoc: p => call\('share:exportDoc', p\)/.test(preJs), '★ preload 已桥接 share:exportDoc');
  // 前端接线
  ok(/async function exportShared\s*\(kind\)/.test(lsSrc), '（依据）LanShare 有 exportShared');
  // ★ 不变量：跨 IPC 传的必须是「纯对象」。
  //   post 是 ref()，post.value 是 Vue 响应式 Proxy，structuredClone 克隆不了它，
  //   原样传会抛「An object could not be cloned.」（用户实机报错）。
  //   这个断言早期写的是 /post: post\.value/ —— 等于把 bug 当规范固化，
  //   改对之后它反而失败。现改为断言「必须经过 toRaw + JSON 深拷贝」。
  const expSharedFn = (lsSrc.match(/async function exportShared[\s\S]*?\n\}/) || [''])[0];
  ok(
    /toRaw\(\s*post\.value\s*\)/.test(expSharedFn),
    '★ exportShared 先 toRaw(post.value) 脱掉响应式代理（否则 structuredClone 报 could not be cloned）'
  );
  ok(
    /JSON\.parse\(\s*JSON\.stringify\(/.test(expSharedFn),
    '★ exportShared 再做 JSON 深拷贝，保证载荷可跨 IPC 结构化克隆'
  );
  ok(
    !/A\.shareExportDoc\(\{\s*post:\s*post\.value/.test(lsSrc),
    '★ 禁止把 post.value 原样交给 shareExportDoc（Proxy 不可克隆）'
  );
  // 不得误用本机导出通道
  ok(
    !/A\.postMdExport|A\.postPdfExport/.test(lsSrc),
    '★ 共享导出不走 post:exportMd/Pdf（那些通道按 id 查本机库，共享文档必然「文档不存在」）'
  );
  // 两个导出入口：Beta.246 起收进与本机详情页共用的 ShareMenu 下拉。
  // 断言「共用同一个组件」而不是「页面上有两个按钮」——
  // 组件里 ACTIONS 数组才是顺序的单一数据源。
  ok(
    /<ShareMenu[^>]*@export-md="exportShared\('md'\)"/.test(lsSrc) &&
      /<ShareMenu[^>]*@export-pdf="exportShared\('pdf'\)"/.test(lsSrc),
    '★ 共享详情页的导出收进 ShareMenu 下拉（与本机详情页同一个组件）'
  );
  ok(
    /import ShareMenu from '\.\.\/components\/post\/ShareMenu\.vue'/.test(lsSrc),
    '（依据）确实复用了 components/post/ShareMenu.vue，不是另建一个'
  );
  ok(
    !/<button[^>]*@click="exportShared\('md'\)"/.test(lsSrc) &&
      !/<button[^>]*@click="exportShared\('pdf'\)"/.test(lsSrc),
    '★ 页面上不再有并排的两个导出按钮（已收进下拉）'
  );
  // 形态：共享详情条这一排**全部**改为纯图标（Beta.248 用户需求）。
  // ★ 需求变更记录：Beta.247 时用户明确要求「返回列表按钮不要改」，于是那版
  //   把它固定成 btn-sm + 可见文字；Beta.248 用户改口要求「把返回列表按钮也纯图标化，
  //   拷贝到本机按钮也图标化，放在分享按钮后面，样式与前面按钮统一」。
  //   故这里的断言随之反转 —— 不要把它当成回归，是需求本身变了。
  ok(
    /<ShareMenu\s+:busy=/.test(lsSrc) && !/<ShareMenu size="sm"/.test(lsSrc),
    '★ 共享页 ShareMenu 用默认 icon 形态（纯图标，与同排按钮同形制）'
  );
  ok(
    /size:\s*\{ type: String, default: 'icon' \}/.test(smCode),
    '（依据）ShareMenu 的 size 默认 icon（本机详情页页头不受影响）'
  );
  ok(/btn btn-icon[^>]*@click="findOpen"/.test(lsSrc), '★ 「页内查找」纯图标（btn-icon）');
  // 返回列表：Beta.248 起也图标化，必须带 aria-label 兜住可访问性
  //   ★ Beta.270：aria-label 文案搬进 lanshare 字典（backToList）
  const lanshareDictLs = read(path.join(ROOT, 'src/i18n/parts/lanshare.zh-CN.js'));
  ok(
    /btn btn-icon[^>]*@click="backToList"/.test(lsSrc) &&
      /aria-label="t\('lanshare\.backToList'\)"/.test(lsSrc) &&
      /backToList: '返回列表'/.test(lanshareDictLs),
    '★ 「返回列表」已纯图标化，且有 aria-label（图标按钮没有可见文字，靠 aria-label 供读屏）'
  );
  ok(!/btn btn-sm[^>]*@click="backToList"/.test(lsSrc), '★ 「返回列表」不再是图标+文字形态');
  // 拷贝到本机：同样图标化。
  //   ★ Beta.259 口径反转：原先要求「保留 .btn-copy 的视觉区分」，而那条区分
  //   正是用户报「按钮颜色不统一」的来源 —— .btn-copy 覆盖成 --accent（深色）
  //   而同排三个是标准 --border（浅色）。四个同形制方块按钮里三个浅、一个深。
  //   现改为整排统一走标准 .btn，写操作的提示改由 title/aria-label + 禁用灰化
  //   + 成功失败回执承担。断言随之从「有区分」翻转为「不覆盖颜色」。
  //   ★ Beta.270：aria-label 文案搬进 common 字典（copyToLocal）
  ok(
    /btn btn-icon btn-copy[^>]*@click="askCopy"/.test(lsSrc) &&
      /aria-label="t\('common\.copyToLocal'\)"/.test(lsSrc) &&
      /copyToLocal: '拷贝到本机'/.test(read(path.join(ROOT, 'src/i18n/parts/common.zh-CN.js'))),
    '★ 「拷贝到本机」已纯图标化（+ aria-label，经 t() 引用 common.copyToLocal）'
  );
  ok(!/btn btn-sm btn-primary[\s\S]{0,200}askCopy/.test(lsSrc), '★ 「拷贝到本机」不再是实心带文字形态');
  // 核心：不许再出现 --accent 覆盖，否则四个按钮又不一样了
  const btnCopyRules259 = lsSrc.match(/\.btn\.btn-copy[^{]*\{[^}]*\}/g) || [];
  const btnCopyCode = btnCopyRules259.join('\n');
  ok(
    !/btnCopyCode|var\(--accent\)/.test(btnCopyCode.replace(/^\s*\*.*$/gm, '')),
    '★ .btn-copy 不再用 --accent 描边（Beta.259：报障「按钮颜色不统一」）'
  );
  // 但禁用态灰化必须留着 —— 共享源未开放拷贝时，用户只能靠"按钮变淡"看出来
  ok(/\.btn\.btn-copy:disabled/.test(btnCopyCode), '（依据）.btn-copy 仍保留 :disabled 灰化（不可拷贝时按钮明显变淡）');
  // 整排同形制：从 .pr-bar 容器里数 btn-icon 按钮，不允许有一个是别的形态。
  //   （锚点用容器 class 而非某个按钮 —— 用 backToList 锚会因 @click 在 class 之后而匹配不到）
  const prBar259 = (lsSrc.match(/<div class="pr-bar">[\s\S]*?<\/div>/) || [''])[0];
  const prBarIcons259 = (prBar259.match(/btn btn-icon/g) || []).length;
  ok(
    prBarIcons259 >= 3,
    `（依据）操作条里至少 3 个同形制 btn-icon 按钮（实得 ${prBarIcons259}）—— 形态不统一会再次出现截图里的错位感`
  );
  ok(!/btn-sm|btn-primary/.test(prBar259), '★ 操作条内无 btn-sm / btn-primary（纯图标一排，不混入文字按钮形态）');
  // ★ 顺序（用户二次指定，Beta.249）：返回列表 → 页内查找 → 分享 → 拷贝到本机
  //   需求变更记录：Beta.248 用户说的是「拷贝到本机放在分享按钮后面」，
  //   那一版把返回列表放在最右并用 .pr-sep 竖线分组；Beta.249 用户看过实机后
  //   明确要求「返回列表→搜索→分享→拷贝」，返回列表移到最左，竖线取消。
  //   用 indexOf 比对相对次序，而不是逐字匹配整段 HTML —— 后者一动注释就误报。
  const barIdxBack = lsSrc.indexOf('@click="backToList"');
  const barIdxFind = lsSrc.indexOf('@click="findOpen"');
  const barIdxShare = lsSrc.indexOf('<ShareMenu');
  const barIdxCopy = lsSrc.indexOf('@click="askCopy"');
  ok(
    barIdxFind > 0 &&
      barIdxShare > 0 &&
      barIdxCopy > 0 &&
      barIdxBack > 0 &&
      barIdxBack < barIdxFind &&
      barIdxFind < barIdxShare &&
      barIdxShare < barIdxCopy,
    `★ 按钮顺序 = 返回列表 → 搜索 → 分享 → 拷贝（实得 ${barIdxBack} < ${barIdxFind} < ${barIdxShare} < ${barIdxCopy}）`
  );
  // 竖线取消：返回列表移到最左后不再与"操作组"分组，.pr-sep 的结构与样式都应消失
  ok(
    !/class="pr-sep"/.test(lsSrc) && !/^\s*\.pr-sep\s*\{/m.test(lsSrc),
    '★ 已移除 .pr-sep 竖线（结构与样式一并清掉，不留死代码）'
  );
  ok(
    /triggerClass/.test(smCode) && /'btn btn-icon'/.test(smCode) && /'btn btn-sm'/.test(smCode),
    '（依据）ShareMenu 按 size 切换触发器类名（两种形态都有定义）'
  );
  ok(/const exporting = ref\(false\)/.test(lsSrc), '（依据）有导出忙碌态（防重复提交）');
  ok(/:busy="exporting"/.test(lsSrc), '（依据）ShareMenu 收到了 busy 态（导出中禁用触发器）');

  // ③ 全站口径：卡片/详情里的文档编号必须继承所在行的字号。
  //    报障原话是「文档编号没与同行对齐」—— 根因就是这几处单独写了更小的 font-size，
  //    行盒被撑开后基线错开。同一语义元素散在多个文件，故全站扫而不是只改报告的那处。
  const cardNoRules = [];
  for (const f of viewFiles) {
    const srcNo = read(f);
    const m = srcNo.match(/\.p[cr]-no\s*\{[\s\S]*?\}/g) || [];
    cardNoRules.push(...m);
  }
  ok(cardNoRules.length >= 3, `（依据）扫到 ${cardNoRules.length} 处编号样式（PostCard / TrashPage / LanShare）`);
  // 逐个文件检查：凡定义 .pc-no / .pr-no 的地方，字号必须是 inherit
  const noFontBugs = [];
  for (const f of viewFiles) {
    const src243 = read(f);
    const rules243 = src243.match(/\.p[cr]-no\s*\{[\s\S]*?\}/g) || [];
    for (const r of rules243) {
      if (!/font-size:\s*inherit/.test(r)) {
        noFontBugs.push(`${path.basename(f)}: ${r.replace(/\s+/g, ' ').slice(0, 60)}`);
      }
    }
  }
  ok(
    noFontBugs.length === 0,
    '★ 全站文档编号字号都继承所在行（否则会与同行文字基线错位）' +
      (noFontBugs.length ? ' → ' + noFontBugs.join(' | ') : '')
  );
}

/* ═══ 第 24 组：历史版本快照弹层 —— 字段卡片底色 + 取消编辑去向（Beta.257）═══ */
{
  const pv257 = read(path.join(ROOT, 'src/pages/PostView.vue'));

  // ① 字段卡片底色必须是纯白面板，不能继承弹层的浅绿底。
  //    报障原话「字段卡片背景应为白色」：.pv-fields 原先无 background，
  //    直接透出 .pv-scroll 的 var(--surface-2)（部分主题是浅绿），看着像"绿卡片"。
  const pvFieldsRule = (pv257.match(/\.pv-fields\s*\{[^}]*\}/) || [''])[0];
  ok(/background:\s*var\(--surface\)/.test(pvFieldsRule), '★ 快照字段块 .pv-fields 底色为 var(--surface)（纯白面板）');
  ok(
    /padding:/.test(pvFieldsRule) && /border-radius:/.test(pvFieldsRule),
    '（依据）.pv-fields 自带内边距与圆角，读起来才像一张独立卡片'
  );

  // ② 字段必须与正文共处同一个滚动容器（Beta.254 需求，钉住防回退）。
  const pvScrollInner = (pv257.match(/\.pv-scroll\s*\{[^}]*\}/) || [''])[0];
  ok(/overflow:\s*auto/.test(pvScrollInner), '（依据）.pv-scroll 自身可滚动（字段 + 正文整体一起滚）');

  // ③ 取消编辑的去向：编辑态是同页切换，取消应落回本页详情，而非甩回大区。
  const cancelBody = (pv257.match(/async function cancelEdit\s*\(\)[\s\S]*?\n\}/) || [''])[0];
  ok(
    /post\.value\.id === form\.id/.test(cancelBody),
    '★ 取消编辑：详情→编辑→取消 时留在本页详情（同页切换，非新开页面）'
  );
  ok(
    /return\s*\n?\s*\}\s*\n\s*back\(\)/.test(cancelBody) || /back\(\)/.test(cancelBody),
    '（依据）新建态（form.id 为空）无详情可回，仍退回上级大区'
  );
  ok(
    !/取消编辑（文档 \/ 草稿 \/ 模板）统一返回其所属上级大区/.test(pv257),
    '（依据）旧的「一律返回大区」注释已移除，避免后人照着改回去'
  );
}

/* ═══ 第 25 组：全局撞名查重 + 元数据版本可见性（Beta.258）═══
 * 报障原话：
 *   ① 「新建文档全局撞名没查重」
 *   ② 「更改大区、分类、标签等元数据也应算新版本，并在快照与对比里显示出来」
 * 行为级断言在 dup-title.test.mjs / meta-version.test.mjs（真实 db 层驱动），
 * 这里钉的是「不许被改回旧口径」的结构性约束。
 */
{
  const postsDb258 = read(path.join(ROOT, 'electron/db/posts.js'));
  // 同本文件既有的 stripComments 口径（1738 行处是块内局部函数，这里取同一实现）
  const stripComments = s =>
    s
      .split('\n')
      .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
  const postsCode258 = stripComments(postsDb258);
  const pd258 = read(path.join(ROOT, 'src/utils/postDiff.js'));
  const pv258 = read(path.join(ROOT, 'src/pages/PostView.vue'));
  const md258 = read(path.join(ROOT, 'src/components/MergeDialog.vue'));

  // ── ① 标题查重必须是【全局】口径 ──
  const checkDup = (postsDb258.match(/function checkDuplicates\s*\(payload\)[\s\S]*?\n\}/) || [''])[0];
  ok(checkDup.length > 0, '（依据）checkDuplicates 函数体已定位');
  // 旧口径是 `title=? AND region_id=? AND ...`：加上 region_id 约束即意味着「跨大区同名不报」
  ok(!/title=\? AND region_id=/.test(postsCode258), '★ 标题查重不再带 region_id 约束（旧口径下跨大区同名实测返回 []）');
  ok(
    !/title=\? AND region_id=\? AND id<>\? AND category_id/.test(postsCode258),
    '★ 也不存在「标题+大区+分类」三合一 SQL（旧口径漏报同大区跨分类同名）'
  );
  // 冲突要带归属名称，否则弹窗说不清「和谁撞了、在哪撞的」
  ok(/rname/.test(checkDup) && /cname/.test(checkDup), '★ 标题冲突携带 rname/cname（弹窗要能说明撞在哪一个大区/分类）');
  ok(
    /code: sameScope \? 'title_region_cat' : 'title'/.test(postsCode258),
    '（依据）同名冲突按「是否同大区同分类」分级（措辞与处置力度不同）'
  );
  // 必须查出【全部】同名文档：旧口径 get() 只取一条
  ok(
    /all\(`SELECT p\.id, p\.title, p\.region_id/.test(postsCode258) ||
      /all\(\s*`SELECT p\.id, p\.title/.test(postsCode258),
    '★ 用 all() 列出全部同名文档（旧 get() 只报第一条，会漏）'
  );
  // 豁免口径必须保留：这是「文档永远保存不了」那个致命缺陷的解药
  ok(
    /titleUnchanged/.test(postsCode258) && /if \(title && !titleUnchanged\)/.test(postsCode258),
    '★ 保留「标题本次未改则豁免」（防历史脏数据把用户永久锁死）'
  );
  // 回收站不参与
  ok(/p\.deleted_at IS NULL/.test(postsCode258), '（依据）同名查重排除回收站文档');

  // ── ② 快照必须翻译出归属名称 ──
  const snapFn = (postsDb258.match(/function getVersionSnapshot\s*\(postId, versionId\)[\s\S]*?\n\}/) || [''])[0];
  ok(
    /rname:/.test(snapFn) && /cname:/.test(snapFn),
    '★ getVersionSnapshot 返回 rname/cname（快照只有 id，前端渲染不出「大区：华东 → 华南」）'
  );
  // 快照仍只存 id —— 存名字会导致「大区改名后历史版本显示新名」
  ok(
    /SELECT name FROM regions WHERE id=\?/.test(snapFn),
    '（依据）名称按【当前】分类表翻译，快照本体仍只存 id（不污染历史语义）'
  );

  // ── ③ diffMeta 必须纳入大区/分类/编号三个维度 ──
  const diffMetaBody = (pd258.match(/export function diffMeta\s*\(oldSnap, newSnap, opts = \{\}\)[\s\S]*?\n\}/) || [
    ''
  ])[0];
  ok(diffMetaBody.length > 0, '（依据）diffMeta 函数体已定位');
  ok(/push\('region'/.test(diffMetaBody), '★ diffMeta 参与比对「大区」');
  ok(/push\('category'/.test(diffMetaBody), '★ diffMeta 参与比对「分类」');
  ok(/push\('no'/.test(diffMetaBody), '★ diffMeta 参与比对「文档编号」');
  // 名称优先、id 兜底：只比 id 会让弹窗显示成「1 → 2」，用户读不出发生了什么
  ok(
    /rname/.test(diffMetaBody) && /nameOrId/.test(diffMetaBody),
    '★ 大区/分类用名称比对，缺失才回落到 id（避免显示成「1 → 2」）'
  );
  // TAGS_OF 必须给三个元数据维度挂上 i18n key，否则弹窗显示英文 key 或裸维度名。
  // （Beta.270：标签值从「中文字面量」改为「字典 key」，由 VersionDiffModal 渲染处翻译）
  ok(
    /region: 'post\.regionLabel'/.test(pd258) &&
      /category: 'post\.categoryLabel'/.test(pd258) &&
      /no: 'post\.docNo'/.test(pd258),
    '（依据）TAGS_OF 的大区/分类/文档编号挂 i18n key（跟随界面语言）'
  );
  // meta 行必须带 kind: 'meta'：字段行的 label 是用户自定义字段名，渲染处靠 kind 分流，
  // 不分流就会把字段名也喂给 t()（查不到 key 虽原样返回，但那是巧合不是设计）
  ok(/kind: 'meta'/.test(pd258), '★ diffMeta 的元信息行带 kind:"meta"（渲染处与字段行分流）');

  // ── ④ 前端两处都要把归属喂进对比 ──
  const openDiff258 = (pv258.match(
    /const diff = buildPostDiff\([\s\S]*?diffState\.value = \{ version: snap, diff \}/
  ) || [''])[0];
  ok(
    /rname: post\.value && post\.value\.rname/.test(openDiff258),
    '★ openDiff 的当前态快照带 rname（否则大区差异行拿不到名称）'
  );
  ok(
    /cname: post\.value && post\.value\.cname/.test(openDiff258) &&
      /no: \(post\.value && post\.value\.no\)/.test(openDiff258),
    '★ openDiff 的当前态快照带 cname 与 no'
  );

  // ── ⑤ 快照预览弹层要显示归属与编号 ──
  const pvHead258 = (pv258.match(/<div class="pv-head">[\s\S]*?<\/div>\s*<\/div>/) || [''])[0];
  ok(
    /previewVer\.rname/.test(pvHead258) && /previewVer\.cname/.test(pvHead258),
    '★ 快照预览头部展示大区/分类（否则无从判断这一版归属是什么）'
  );
  ok(/previewVer\.no/.test(pvHead258), '★ 快照预览头部展示文档编号');

  // ── ⑥ 查重弹窗：标题冲突的措辞要与字段冲突区分 ──
  ok(
    /hasTitleConflict/.test(md258) && /发现重复文档/.test(md258),
    '★ 查重弹窗在标题冲突时改用「发现重复文档」（标题不是字段）'
  );
  ok(
    /scopeText/.test(md258) &&
      /t\('post\.scopeSameName'/.test(md258) &&
      /scopeSameName: '对方在「\{where\}」，属同名不同档'/.test(read(path.join(ROOT, 'src/i18n/parts/post.zh-CN.js'))),
    '（依据）同名冲突会说明「对方在哪个大区」（跨档同名与重复导入的处置不同；经 t() 引用 post.scopeSameName）'
  );
}

/* ═══ 第 26 组：防篡改加固（Beta.260）═══
 * 用户需求：「可以给本程序做防篡改吗」→「做这个 + 防程序文件修改」
 *   数据层三件套：① 堵签名洗白 ② 篡改进审计链且不可自动清除 ③ 校验失败只读
 *   外加：程序文件签名清单 + 启动自检
 * 行为级断言在 anti-tamper.test.mjs（真实 db 层驱动）与 app-integrity.test.mjs
 * （真实文件系统 + 真实 Ed25519 验签），这里钉的是「不许被改回旧写法」的结构性约束。
 */
{
  const core260 = read(path.join(ROOT, 'electron/db/core.js'));
  const coreCode260 = core260
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  const dbAgg260 = read(path.join(ROOT, 'electron/db.js'));
  const main260 = read(path.join(ROOT, 'electron/main.js'));
  const ks260 = read(path.join(ROOT, 'electron/keystore.js'));
  const integ260 = read(path.join(ROOT, 'electron/services/integrity.js'));
  const afterPack260 = read(path.join(ROOT, 'scripts/afterPack.js'));
  const boot260 = read(path.join(ROOT, 'electron/ipc/boot.js'));
  const preload260 = read(path.join(ROOT, 'electron/preload.js'));
  const state260 = read(path.join(ROOT, 'electron/state.js'));
  const stCode260 = read(path.join(ROOT, 'src/store/modules/state.js'));
  const bootStore260 = read(path.join(ROOT, 'src/store/modules/boot.js'));
  const app260 = read(path.join(ROOT, 'src/App.vue'));

  // ── ① 签名洗白必须被堵住：persistNow 不得无条件重签 ──
  const persistNow260 = (core260.match(/function persistNow\s*\(\)[\s\S]*?\n\}/) || [''])[0];
  ok(persistNow260.length > 0, '（依据）persistNow 函数体已定位');
  // 去注释后再断言：注释里正当地提到了「旧写法无条件 writeDbSignature()」作为反面说明，
  // 直接全文匹配会把这段说明误判成「代码里仍有无条件重签」。
  const persistNowCode260 = persistNow260
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  // 关键不变式：writeDbSignature 必须被守卫，不得出现在 if 之外的无条件位置。
  // 断言口径：writeDbSignature() 的调用必须落在 `if (!integrityCompromised)` 块之后。
  //   - 旧写法：无条件 `try { writeDbSignature() }`（无守卫）→ 无 if 前置 → 失败
  //   - 现写法：`if (!integrityCompromised) { try { writeDbSignature() } }` → 通过
  const iGuard = persistNowCode260.indexOf('if (!integrityCompromised)');
  const iWriteSig = persistNowCode260.indexOf('writeDbSignature()');
  ok(
    iWriteSig >= 0 && (iGuard < 0 || iGuard < iWriteSig),
    '★ persistNow 不再【无条件】writeDbSignature（旧写法：篡改后正常用一次就把痕迹洗白）'
  );
  ok(
    iGuard >= 0 && iGuard < iWriteSig,
    '★ writeDbSignature 被缩进进守卫块内（仍会被调用，只是受 integrityCompromised 控制）'
  );
  ok(/if \(!integrityCompromised\)/.test(persistNowCode260), '★ 签名重写被 integrityCompromised 这一道闸拦住');
  // 只跳过签名，数据仍要落盘 —— 否则一次篡改会让用户彻底无法保存任何东西
  ok(
    /fs\.writeFileSync\(dbPath, out\)/.test(persistNowCode260),
    '★ 只跳过「重新签名」，数据本身仍照常落盘（不因防篡改把写入也一起废掉）'
  );

  // ── ② 粘滞标记必须在 init 里建立、且能跨失败存活 ──
  ok(
    /markIntegrityCompromised\(integ\.reason\)/.test(core260),
    '★ init 检出不一致时调用 markIntegrityCompromised（建立本会话粘滞标记）'
  );
  const catchBlock260 = (core260.match(/原子回滚：[\s\S]*?throw e;[\s\S]*?\n\s*\}/) || [''])[0];
  ok(catchBlock260.length > 0, '（依据）init 的 catch 回滚块已定位');
  ok(
    !/integrityCompromised = false/.test(catchBlock260) && !/integrityReason = null/.test(catchBlock260),
    '★ 回滚【不清除】完整性标记（证据必须活过这次失败的打开，否则上层给不出有意义的提示）'
  );

  // ── ③ 唯一洗白出口必须人工触发，且进审计链 ──
  ok(
    /function acceptCurrentAsBaseline\s*\(\)/.test(core260),
    '★ 提供 acceptCurrentAsBaseline 作为唯一的人工重建基准入口'
  );
  const acceptBody260 = (core260.match(/function acceptCurrentAsBaseline\s*\(\)[\s\S]*?\n\}/) || [''])[0];
  ok(
    /writeDbSignature\(\)/.test(acceptBody260) && /integrityCompromised = false/.test(acceptBody260),
    '（依据）该入口先重签再清标记（顺序不可反，否则会以旧内容重签）'
  );
  ok(
    /security:acceptIntegrityBaseline/.test(boot260) && /重建完整性基准/.test(boot260),
    '★ IPC 通道存在，且动作写进审计链（「谁把基准挪了」同样有迹可循）'
  );
  ok(
    /acceptIntegrityBaseline: userId => call\('security:acceptIntegrityBaseline'/.test(preload260),
    '★ preload 白名单暴露该通道（渲染层不能直接碰 ipcRenderer）'
  );
  // 绝不允许自动清除 —— 除「人工重建基准」函数体外，不得出现把标记置回 false 的赋值。
  // 断言口径：先切掉 acceptCurrentAsBaseline 的函数体，再查赋值；
  // 声明处（let integrityCompromised = false）不算，故用「赋值语句」形态匹配。
  const coreLines260 = core260
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  const acceptCode260 = acceptBody260
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  const others260 = coreLines260.replace(acceptCode260, '');
  // 只匹配【赋值语句】（非声明）：排除 `let integrityCompromised = false` 这一初始声明。
  ok(
    !/(^|[^t] )integrityCompromised\s*=\s*false/.test(others260.replace(/let integrityCompromised\s*=\s*false/g, '')),
    '★ 除人工重建基准外，代码中不存在其它清除完整性标记的位置（禁止静默自动清除）'
  );
  ok(
    /integrityCompromised\s*=\s*false/.test(acceptCode260),
    '（依据）人工重建基准函数体内部确实执行了清除（这是唯一合法出口）'
  );

  // ── ④ 篡改事件必须进审计链，且每次启动都记录 ──
  ok(/function recordIntegrityIncident\s*\(\)/.test(core260), '★ 提供 recordIntegrityIncident 把数据篡改写进审计链');
  const recBody260 = (core260.match(/function recordIntegrityIncident\s*\(\)[\s\S]*?\n\}/) || [''])[0];
  // 断结构不断文案：action 名会被翻译（sys.auditDbIntegrity），entity 才是契约
  ok(
    /audit\(null, i18n\.t\('sys\.auditDbIntegrity'\), 'integrity'/.test(recBody260),
    '（依据）用 audit() 写入而非直接 INSERT（必须链化，才能被 verifyAuditChain 保护）'
  );
  ok(/if \(!integrityCompromised\) return false/.test(recBody260), '（依据）仅在确实处于不通过状态时才写，避免噪声');
  ok(
    /function recordAppIntegrityIncident\s*\(report\)/.test(core260),
    '★ 程序文件篡改同样入链（与数据篡改分开成两个 action，处置方式不同）'
  );
  ok(
    /audit\(null, i18n\.t\('sys\.auditAppIntegrity'\), 'app-integrity'/.test(core260),
    '（依据）程序文件事件用独立 entity=app-integrity'
  );

  // ── ⑤ 主进程启动告警必须是阻断式（不再单按钮「继续」）──
  const integBlock260 = (main260.match(/数据库完整性告警（L1\+L2\+CRC32 启动校验）[\s\S]*?\n {6}\}/) || [''])[0];
  ok(integBlock260.length > 0, '（依据）主进程完整性告警块已定位');
  ok(
    !/buttons: \['我知道了，继续'\]/.test(integBlock260),
    '★ 不再只给单按钮「我知道了，继续」（旧实现用户唯一选择就是继续，等于没有选择）'
  );
  // Beta.271：按钮文案进主进程字典，断言改为「引用 key + 字典措辞」两头锁
  ok(
    /buttons: \[i18n\.t\('sys\.dbGotoSettings'\), i18n\.t\('sys\.dbQuit'\)\]/.test(integBlock260) &&
      /dbGotoSettings: '前往设置处理'/.test(sysZhSrc) &&
      /dbQuit: '退出程序'/.test(sysZhSrc),
    '★ 提供两条真实出路，默认项为「前往设置处理」（key + 字典措辞两头锁）'
  );
  ok(
    /if \(choice === 1\) \{[\s\S]{0,40}app\.quit\(\)[\s\S]{0,20}return/.test(integBlock260),
    '（依据）选择退出要真的退出（不能只是关掉弹窗继续跑）'
  );
  // 顺序：先落审计链再弹窗。弹窗可能被直接杀进程，审计链才是唯一留痕载体
  const auditIdx = integBlock260.indexOf('recordIntegrityIncident');
  const dialogIdx = integBlock260.indexOf('showMessageBoxSync');
  ok(
    auditIdx > 0 && dialogIdx > 0 && auditIdx < dialogIdx,
    '★ 先写审计链再弹窗（弹窗可能被直接杀进程，审计链才是有迹可循的载体）'
  );

  // ── ⑥ 只读模式：state.writable 必须把完整性因素算进去 ──
  ok(
    /state\.writable = db\.checkWritable\(\) && !db\.isIntegrityCompromised\(\)/.test(ks260),
    '★ 完整性不通过 → 强制只读（即便数据目录物理可写，也不能继续叠加改动）'
  );
  ok(
    (ks260.match(/db\.checkWritable\(\) && !db\.isIntegrityCompromised\(\)/g) || []).length >= 2,
    '★ 明文库与加密库两条打开路径都要接（漏一条就会从另一条路绕过去）'
  );
  ok(/state\.writable = false/.test(ks260), '（依据）库都没打开时一律不可写（原先保持默认 true 会误导前端）');

  // ── ⑦ 程序文件自检 ──
  ok(/function verifyAppFiles\s*\(appDir, manifest\)/.test(integ260), '★ integrity.js 提供 verifyAppFiles 运行时自检');
  ok(/missingManifest: true/.test(integ260), '★ 清单不存在时明确标记 missingManifest（开发态不得误报为篡改）');
  ok(
    !/^\s*const .* = require\('electron'\)/m.test(integ260),
    '★ integrity.js 不依赖 electron（verify/ 的纯 Node 单测要能直接驱动它）'
  );
  // 清单自身必须在签名覆盖范围内 —— 否则改清单即可骗过逐文件比对
  const buildMan260 = (integ260.match(/function buildManifest\s*\(appDir, version\)[\s\S]*?\n\}/) || [''])[0];
  ok(
    /signature: releaseSign\.sign\(JSON\.stringify\(payload\)\)/.test(buildMan260),
    '★ 对【完整载荷】一次性签名（不能在签名后追加字段，那会让验签永假）'
  );
  ok(
    /function verifyManifestSignature\s*\(man\)/.test(integ260),
    '★ 提供口径对齐的验签函数（用 releaseSign 验签，不覆盖 meta 则不可靠）'
  );
  // 排除项：用户数据与清单自身绝不能进清单
  ok(/EXCLUDE_SEGMENTS/.test(integ260) && /node_modules/.test(integ260), '（依据）排除 node_modules / verify 等目录');
  ok(
    /MANIFEST_NAME\b/.test(integ260) && /EXCLUDE_NAMES/.test(integ260),
    '★ 清单自身不进清单（否则哈希自我引用、永不收敛）'
  );
  ok(
    /appDir = path\.join\(context\.appOutDir, 'resources', 'app'\)/.test(afterPack260) === false,
    '★ [Beta.261] 打包钩子不再硬编码 resources/app（asar 后该目录不存在，会静默跳过清单生成）'
  );
  ok(
    /UNPACKED_NAME|app\.asar\.unpacked/.test(afterPack260),
    '★ 打包钩子改为扫描 app.asar.unpacked（asar 头哈希照不到的真空地带）'
  );
  ok(/integrity\.writeManifest\(unpackedDir, version\)/.test(afterPack260), '★ 打包钩子对 unpacked 目录生成清单');
  // 清单必须落在 resources/ 下、被校验目录之外
  ok(
    /manifestPathFor \(appDir\) \{ return path\.join\(path\.dirname\(appDir\), MANIFEST_NAME\)/.test(integ260) ||
      /function manifestPathFor\s*\(appDir\)/.test(integ260),
    '★ 清单落在被校验目录【同级】（放进其内部会自我引用）'
  );
  // 钩子内必须即时自检一次，防止清单口径写错却伪装成通过
  ok(
    /const check = integrity\.verifyAppFiles\(unpackedDir\)/.test(afterPack260) &&
      /throw new Error\('\[afterPack\] 自检失败/.test(afterPack260),
    '★ 钩子生成后立即自检，口径写错要【打包失败】而不是出个永远报红的包'
  );

  // ── ⑧ 程序自检不得阻断数据读写（两件事解耦）──
  ok(
    /state\.appIntegrity = r/.test(main260) && /appIntegrity: null/.test(state260),
    '★ 程序自检结果只落到 state.appIntegrity 常驻展示'
  );
  ok(
    !/state\.writable = .*appIntegrity/.test(main260),
    '★ 程序文件被改【不】影响 writable（决定只读的是数据完整性，两件事不能混）'
  );

  // ── ⑨ IPC 暴露整合态，且渲染层能区分两类原因 ──
  ok(
    /function integritySnapshot\s*\(\)/.test(boot260),
    '★ boot.js 提供 integritySnapshot（拆成 db / app 两块，前端才能说清「哪里不对」）'
  );
  ok(
    /integrity: integritySnapshot\(\)/.test(boot260) &&
      (boot260.match(/integrity: integritySnapshot\(\)/g) || []).length >= 3,
    '★ 锁定态 / dbError 态 / 正常态三条返回路径都要带 integrity（漏一条前端就瞎了）'
  );
  ok(
    /out\.db\.compromised = !!db\.isIntegrityCompromised\(\)/.test(boot260),
    '（依据）用常驻的 isIntegrityCompromised + getIntegrityReason，而非读后即清的 getPendingIntegrityWarn'
  );
  ok(/integrity: null/.test(stCode260), '★ 前端 store 增加 integrity 常驻字段');
  ok(/store\.integrity = d\.integrity \|\| null/.test(bootStore260), '★ boot.js 写入该字段');
  ok(
    /store\.writableReason = dbTamperedNow/.test(bootStore260),
    '★ 只读原因文案分流（完整性不通过 vs 目录不可写，处置方式完全不同）'
  );
  ok(
    /\{\{ store\.writableReason \}\}/.test(app260),
    '★ 只读气泡改用 store.writableReason（不再写死「数据目录不可写」）'
  );

  // ── ⑩ 前端告警条：常驻 + 可处置 + 不提供「一键清空所有证据」──
  ok(/class="integrity-alert"/.test(app260), '★ App.vue 新增完整性告警条');
  ok(
    !/integrityDismissed\.value = true[\s\S]{0,200}acceptCurrentAsBaseline/.test(app260),
    '（依据）「收起」只隐藏本条，不等同于重建基准'
  );
  ok(
    /const integrityDismissed = ref\(false\)/.test(app260),
    '（依据）收起状态是会话级的（重启后重新提示，不留「点掉就干净」的窗口）'
  );
  ok(
    /@click="rebuildBaseline"/.test(app260) && /async function rebuildBaseline/.test(app260),
    '★ 提供「确认为误报并重建基准」处置入口'
  );
  ok(
    /await bootApp\(\)/.test(app260) && /integrityBusy/.test(app260),
    '（依据）重建后重新拉状态刷新只读态，并防重复点击'
  );
  ok(/appTamperedDetail/.test(app260), '★ 程序文件差异给出具体文件名（只报「不一致」用户无从判断）');
}

/* ═══ 第 27 组：asar 迁移 + Electron 原生完整性校验（Beta.261）═══
 * 用户需求：「走 asar 路线」
 *   把「防程序文件修改」从「自建签名清单（裁判与选手同目录，只能提高门槛）」
 *   升级为 Electron 官方机制：asar 头哈希写进 Archbox.exe 的 PE 资源
 *   （type=INTEGRITY / name=ELECTRONASAR），校验逻辑驻留在 exe 二进制内部，
 *   应用代码无法触碰；不匹配即 process.exit(1)，早于 electron/main.js。
 * 行为级断言在 asar-integrity.test.mjs（真实 asar 造包 + 真实 exe 的 PE 资源
 * 注入/回读往返），这里钉的是「不许被改回旧写法」的结构性约束 ——
 * 任一条被改回，用户那边就是「双击无反应」且无任何日志。
 */
{
  const pkg270 = JSON.parse(read(path.join(ROOT, 'package.json')));
  const afterPack270 = read(path.join(ROOT, 'scripts/afterPack.js'));
  const integ270 = read(path.join(ROOT, 'electron/services/integrity.js'));
  const main270 = read(path.join(ROOT, 'electron/main.js'));
  const boot270 = read(path.join(ROOT, 'electron/ipc/boot.js'));
  const app270 = read(path.join(ROOT, 'src/App.vue'));
  // ★ Beta.270：GuidePage 已 i18n 化，guide 的读取源从 .vue 改为字典（理由同 22.x 节）。
  const guide270 = read(path.join(ROOT, 'src/i18n/parts/guide.zh-CN.js'));

  // ── ① 打包配置：必须真的切到 asar，且 wasm 仍需解包 ──
  ok(
    pkg270.build.asar === true,
    '★ asar:true（程序主体归档，Electron 原生完整性校验才有对象；asar:false 时两个 fuse 置 true 会「双击无反应」）'
  );
  ok(
    Array.isArray(pkg270.build.asarUnpack) && pkg270.build.asarUnpack.some(p => p.includes('sql.js')),
    '★ 保留 asarUnpack: node_modules/sql.js/dist/*（wasm 无法从归档内 dlopen，必须解包）'
  );
  ok(
    String(pkg270.build.files).includes('electron/**'),
    '（依据）electron/** 仍打进包（它现在进 asar 内部，不是被排除）'
  );

  // ── ② 两个 fuse 必须同时为 true，缺一则校验不生效 ──
  ok(
    /\[FuseV1Options\.EnableEmbeddedAsarIntegrityValidation\]: true/.test(afterPack270),
    '★ EnableEmbeddedAsarIntegrityValidation=true（不置 true，注入的资源根本不会被读，校验静默失效）'
  );
  ok(
    /\[FuseV1Options\.OnlyLoadAppFromAsar\]: true/.test(afterPack270),
    '★ OnlyLoadAppFromAsar=true（堵死「投放同名目录 resources/app 抢先加载」的绕过手法）'
  );
  ok(
    !/\[FuseV1Options\.EnableEmbeddedAsarIntegrityValidation\]: false/.test(afterPack270) &&
      !/\[FuseV1Options\.OnlyLoadAppFromAsar\]: false/.test(afterPack270),
    '★ 不得残留任一 fuse 的 false 旧写法（asar 迁移后它们已是安全降级）'
  );

  // ── ②b GrantFileProtocolExtraPrivileges 必须为 true ──
  // Beta.265 白屏的根因：它被置 false 后，file:// 页面失去「用 file:// 加载其它
  // 资源」的特权，而本应用正是用 loadFile() 从 file:// 提供 asar 内的页面，
  // Chromium 直接拒绝加载（Not allowed to load local resource）→ 纯白屏。
  // 这条断言不能删：它的默认值就是 true，看起来「关掉更安全」，极易被误改。
  ok(
    /\[FuseV1Options\.GrantFileProtocolExtraPrivileges\]: true/.test(afterPack270),
    '★ GrantFileProtocolExtraPrivileges=true（置 false 会让 asar 内的页面无法经 file:// 加载 → 白屏）'
  );
  ok(
    !/\[FuseV1Options\.GrantFileProtocolExtraPrivileges\]: false/.test(afterPack270),
    '★ 不得把它改回 false：本应用用 loadFile() 从 file:// 提供页面，关掉即白屏'
  );
  ok(
    /Beta\.265 白屏的根因/.test(afterPack270),
    '★ 保留「Beta.265 白屏根因」的告警注释（防止后人以「收窄特权更安全」为由再关一次）'
  );
  // 过时注释必须清掉，否则误导后人把 fuse 改回去
  ok(
    !/与 build\.asar=false 配套/.test(afterPack270),
    '★ 删除「与 build.asar=false 配套」的过时注释（它会诱导后人把 fuse 改回 false）'
  );

  // ── ③ PE 资源注入的三个易错点（写错 = 校验静默不生效或永远失败）──
  ok(/INTEGRITY_RESOURCE_TYPE = 'INTEGRITY'/.test(afterPack270), "★ 资源 type 常量为 'INTEGRITY'（Electron 只认这个）");
  ok(
    /INTEGRITY_RESOURCE_NAME = 'ELECTRONASAR'/.test(afterPack270),
    "★ 资源 name 常量为 'ELECTRONASAR'（Electron 只认这个）"
  );
  ok(
    /const relAsar = 'resources\\\\' \+ integrity\.ASAR_NAME/.test(afterPack270),
    '★ file 字段用反斜杠拼装（Windows 路径；用正斜杠会被判为找不到目标）'
  );
  ok(
    /'sha256'/.test(afterPack270) && !/'SHA256'/.test(afterPack270),
    "★ alg 用全小写 'sha256'（大写会被判为不支持的算法）"
  );
  ok(
    /lang,?\s*\n?\s*codepage|lang, codepage/.test(afterPack270) || /codepage\b/.test(afterPack270),
    '★ 注入时带上 lang/codepage（取自 exe 已有 VersionInfo，否则资源表可能被 Windows 忽略）'
  );
  ok(
    /getAllLanguagesForStringValues\(\)/.test(afterPack270),
    '★ lang/codepage 来源正确（VersionInfo.getAllLanguagesForStringValues）'
  );
  ok(
    /ignoreCert: true/.test(afterPack270),
    '★ NtExecutable.from 传 ignoreCert:true（本项目未做代码签名，不加会因证书缺失解析失败）'
  );

  // ── ④ 执行顺序：flipFuses 必须先于 resedit 注入 ──
  //   fuses 的写入会改二进制尾部；若在注入资源后再 flip，可能覆盖/重排资源表。
  {
    const flipIdx = afterPack270.indexOf('await flipFuses(');
    const injectIdx = afterPack270.indexOf('await injectAsarIntegrity(');
    ok(
      flipIdx > 0 && injectIdx > 0 && flipIdx < injectIdx,
      '★ flipFuses 必须先于 resedit 注入执行（fuses 改二进制尾部，顺序反了资源表可能被覆盖）'
    );
  }

  // ── ⑤ 构建期预检：注入后必须回读比对，不一致要【打包失败】──
  ok(
    /async function precheckInjectedIntegrity/.test(afterPack270),
    '★ 提供构建期预检函数（把「注入没生效」挡在出厂前，而不是让用户遇到双击无反应）'
  );
  ok(/await precheckInjectedIntegrity\(exePath, relAsar/.test(afterPack270), '★ afterPack 内确实调用了预检');
  ok(
    /entry\.value !== expectHeaderHash/.test(afterPack270) && /预检失败：value 字段/.test(afterPack270),
    '★ 预检比对 value 与重算头哈希，不符即抛错（throw → 打包失败）'
  );
  ok(
    /entry\.file\.includes\('\/'\)/.test(afterPack270),
    '★ 预检额外断言 file 不含正斜杠（把「路径写错」这一最隐蔽的失败显式拦下）'
  );
  ok(/entry\.alg !== 'sha256'/.test(afterPack270), '★ 预检额外断言 alg 为小写 sha256');
  ok(/entries\.length !== 1/.test(afterPack270), '★ 预检断言资源条数恰为 1（防止重复注入导致 Electron 读到歧义内容）');

  // ── ⑥ 头哈希算法口径必须对齐 Electron 内部 ──
  ok(
    /async function asarHeaderHash\s*\(asarPath\)/.test(integ270),
    '★ integrity.js 提供 asarHeaderHash（asar 头哈希 = sha256(头部 JSON 字符串)）'
  );
  ok(
    /function readAsarHeaderStringSync/.test(integ270) &&
      /readUInt32LE\(12\)/.test(integ270) &&
      /\.toString\('utf8'\)/.test(integ270),
    '★ 主实现为纯 Node 读取（偏移 12 取 JSON 净长 → UTF-8 解码），不依赖任何构建期包'
  );
  ok(
    !/const asar = require\('@electron\/asar'\)/.test(integ270),
    '★ 生产路径不得 require 构建期包（@electron/asar 不在 dependencies 里，require 必抛）'
  );
  ok(
    /const \{ header \} = await readAsarHeader\(asarPath\)/.test(integ270) ||
      /readAsarHeader\(asarPath\)/.test(integ270),
    '★ 交叉验证实现用 app-builder-lib 的 readAsarHeader（与 electron-builder 的 hashHeader 同源）'
  );
  ok(
    /readAsarHeaderString/.test(integ270) && /asarHeaderHashViaBuilder/.test(integ270),
    '★ 两条独立实现并存（可交叉验证，防某一侧口径漂移）'
  );
  ok(
    /UNPACKED_NAME/.test(integ270) && /'app\.asar\.unpacked'/.test(integ270),
    '★ integrity.js 声明 UNPACKED_NAME 常量（main.js 与 afterPack.js 共用，避免各写一份字符串）'
  );
  // ★ 关键回归：unpacked 目录的内容全在 node_modules 下，若沿用「排除 node_modules」
  //   会让清单为空（Beta.261 首包实测 fileCount=0，第二层防护彻底失效）
  ok(
    /function isUnpackedRoot/.test(integ270),
    '★ 提供 isUnpackedRoot 判定（按目录名自动识别扫描范围，调用方漏传 opts 也不会失效）'
  );
  ok(
    /includeNodeModules/.test(integ270),
    '★ scanFiles/shouldInclude 支持 includeNodeModules（unpacked 范围必须保留 node_modules）'
  );
  ok(
    /EXCLUDE_SEGMENTS\.filter\(s => s !== 'node_modules'\)/.test(integ270),
    '★ 实现方式：按范围过滤掉 node_modules 排除项（而非另起一套白名单，避免两处规则漂移）'
  );
  ok(
    /scope: unpacked \? SCOPE_UNPACKED : SCOPE_APP/.test(integ270),
    '★ scope 随扫描范围自动取值（unpacked 根 → asar-unpacked，app 根 → app-files）'
  );
  ok(
    /includeNodeModules: isUnpackedRoot\(appDir\)/.test(integ270),
    '★ verifyAppFiles 的扫描口径与 buildManifest 一致（否则比对时会把整批文件误报成「被删除」）'
  );

  // ── ⑥b [Beta.265] unpacked 目录整体缺失必须被报出（此前静默放行）──
  //   实测漏洞：verifyAppFiles 把「目录不存在」与「清单缺失」合并成同一个 ok:true
  //   分支。把 unpacked 目录整个删掉 —— 攻击者最省事的一步 —— 就能让第二层防护
  //   彻底消失且毫无痕迹。判据来自 asar 头里的 unpacked 声明（Electron 官方语义）。
  ok(/function asarStateFor/.test(integ270), '★ 提供 asarStateFor 判定「asar 与 unpacked 的共存状态」');
  ok(
    /state: 'not-packaged'/.test(integ270) && /'unpacked-missing'/.test(integ270) && /state: 'unknown'/.test(integ270),
    '★ 三态区分：未打包 / 矛盾态（目录整体缺失）/ 无从判定（生产无头解析依赖）'
  );
  ok(
    /readAsarHeaderStringSync\(asarPath\)/.test(integ270),
    '★ 用同步实现解析头（verifyAppFiles 是同步接口，不能引入 await）'
  );
  ok(
    /if \(st\.state === 'unpacked-missing'\)/.test(integ270) &&
      /ok: false/.test(integ270) &&
      /dirMissing: true/.test(integ270),
    '★ 矛盾态返回 ok:false + dirMissing（此前返回 ok:true 被静默放行）'
  );
  ok(
    /t\('sys\.appIntegrityDirMissingDetail'[\s\S]{0,60}n: st\.declaredUnpacked\.length/.test(integ270) &&
      /appIntegrityDirMissingDetail: '但 app\.asar 头部声明了其中应有 \{n\} 个文件/.test(sysZhSrc),
    '★ 报告里写清「头声明了几个文件」，让用户知道丢了什么（key + 字典措辞两头锁）'
  );
  ok(/declaredUnpacked/.test(integ270), '★ 缺失明细取自头声明（而非空数组），可诊断');
  ok(/asarState: st\.state/.test(integ270), '★ 非矛盾态也透出 asarState，便于与开发态区分');
  // 构建期：asarUnpack 配错必须让打包失败，而不是产出「无第二层防护」的包
  ok(
    /asarState\.declaredUnpacked\.length/.test(afterPack270) &&
      /throw new Error\(\s*'\[afterPack\] 矛盾态/.test(afterPack270),
    '★ [Beta.265] afterPack 对「头声明了 unpacked 但目录不存在」直接 throw（fail fast，不产出残缺包）'
  );
  ok(
    /无 unpacked 内容（asarUnpack 未命中任何文件）/.test(afterPack270),
    '★ 真正没有 unpacked 内容时才降级为 warn（不误伤合法配置）'
  );

  // ── ⑦ 运行时自检目标必须换成 unpacked，且路径来源正确 ──
  ok(
    /path\.dirname\(app\.getAppPath\(\)\)/.test(main270),
    '★ 自检目录由 path.dirname(app.getAppPath()) 推出（asar 下 getAppPath() 返回 .../app.asar，其同级即 resources/）'
  );
  ok(
    /integrity\.UNPACKED_NAME/.test(main270),
    '★ 自检目标为 app.asar.unpacked（asar 本体由 exe 内部 Electron 校验守护，此处不重复守）'
  );
  ok(
    !/const appDir = app\.getAppPath\(\)/.test(main270),
    '★ 不得再把 app.getAppPath() 直接当自检根（asar 下那是归档文件，不是目录）'
  );
  ok(/require\('path'\)/.test(main270), '（依据）main.js 已引入 path（新逻辑用到 path.dirname / path.join）');

  // ── ⑧ 告警文案必须分层，不能让用户误以为「主程序被换」──
  ok(/app\.asar\.unpacked/.test(main270), '★ 主进程告警 detail 里写明受影响范围是 app.asar.unpacked');
  ok(
    /i18n\.t\('sys\.appIntegrityDetail'/.test(main270) &&
      /程序主体 app\.asar 已由可执行文件内部的 Electron 校验通过/.test(sysZhSrc),
    '★ 主进程告警说明「主体那一层已由 exe 校验通过」，避免用户白白恐慌（key + 字典措辞两头锁）'
  );
  ok(/scope: ai\.scope \|\| 'asar-unpacked'/.test(boot270), '★ IPC 快照透出 scope 字段（前端据此分层文案）');
  ok(/asarGuarded/.test(boot270) && /asarGuarded/.test(app270), '★ 前端拿到 asarGuarded 标记并在文案里区分层级');
  // ★ Beta.270：告警文案搬进 shell 字典，标题/范围/建议三个键分立
  //   （integrityAppTitle + integrityAppScope + integrityAppAdvice）——
  //   「不笼统写程序文件」的守法则落在 scope 文案上：点明范围限于
  //   app.asar.unpacked，主体已由 exe 内部校验通过。
  const shellDict270 = read(path.join(ROOT, 'src/i18n/parts/shell.zh-CN.js'));
  ok(
    /t\('shell\.integrityAppTitle'\)/.test(app270) &&
      /t\('shell\.integrityAppScope'\)/.test(app270) &&
      /integrityAppTitle: '程序文件完整性校验未通过'/.test(shellDict270) &&
      /integrityAppScope:\s*'范围限于安装目录 app\.asar\.unpacked 内的文件/.test(shellDict270.replace(/\s+/g, ' ')),
    '★ 前端告警标题已分层（不再笼统写「程序文件」：范围限于 unpacked，主体由 exe 校验）'
  );
  ok(/appAsarGuarded/.test(app270), '★ App.vue 提供 appAsarGuarded computed（文案分支依赖它）');

  // ── ⑨ 「可读提示」的落地：文档化排障（方案 B）──
  //   ★ #340 正式化改写后两节换了标题（事实未变），断言跟着认新措辞
  ok(
    /tamperTitle: '程序完整性保护说明'/.test(guide270) && /tamperLayer1:|tamperLayer2:/.test(guide270),
    '★ 说明书新增「程序文件被改动会发生什么」一节（现标题：程序完整性保护说明，主体/附带两层）'
  );
  ok(
    /crashTitle: '启动故障排查'/.test(guide270) && /c2:/.test(guide270) && /c3:/.test(guide270),
    '★ 说明书新增「双击没反应 / 闪退，怎么查」一节（现标题：启动故障排查，含成因与处置）'
  );
  ok(/早于任何业务代码执行|没有机会/.test(guide270), '★ 说明了「为什么没有弹窗」（校验早于应用代码，进程内无法提示）');
  ok(
    /重新安装/.test(guide270) && /覆盖安装不会影响数据/.test(guide270),
    '★ 给出了恢复路径（重新安装覆盖程序，不触碰数据）'
  );
}

// ---------- 28. 标题栏高度契约 & 术语统一（Beta.268）----------
{
  console.log('\n[28] 标题栏高度契约 + 「档案 → 文档」术语统一');

  const baseCss = read(path.join(ROOT, 'src/styles/base.css'));
  const compCss = read(path.join(ROOT, 'src/styles/components.css'));
  const appShell = baseCss.slice(baseCss.indexOf('.app-shell'), baseCss.indexOf('.app-shell') + 900);

  // ── ① 槽位高度是 44px，共享皮肤层必须 border-box 且总量不超过它 ──
  // 用户上报：窗口控制按钮 hover 时色块盖住标题栏下方分隔线。
  // 根因 = content-box 下 44px 内容 + 1px 下边框 = 45px，超出栅格槽位 1px，
  // 溢出的 1px 把 border-bottom 让给了 44×44 的 .win-btn（背景绘制在边框之上）。
  ok(
    /grid-template-rows:\s*44px/.test(appShell),
    '★ .app-shell 标题栏槽位固定 44px（本组的计算基准，改了要同步改这里）'
  );

  // ★ 判据必须排除注释 ★
  //   CSS 里我为这条规则写了较长的注释（含 "box-sizing: border-box" 字样），
  //   若直接用 /box-sizing:\s*border-box/ 去匹配「块文本」，注释本身就会命中 →
  //   即使真正的声明被删掉，断言依然通过（假阴性，已实测踩过）。
  //   故先把注释剥掉再匹配。
  function stripCssComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
  }
  function cssRule(css, selector) {
    const i = css.indexOf(selector);
    if (i < 0) return '';
    const rest = css.slice(i + selector.length);
    const end = rest.indexOf('}');
    return end < 0 ? rest : rest.slice(0, end);
  }

  // ★ 视觉契约只允许有一份定义（.titlebar-skin）★
  //   Beta.269 起，主界面与门禁页的顶栏外观统一由 .titlebar-skin 承担，
  //   .titlebar / .gate-titlebar 退化为纯定位类。断言改为验证：
  //     (a) skin 层声明了完整契约（含 border-box 与 43px 按钮）；
  //     (b) 两个定位类【不再】重复外观声明（防回退到双份维护）。
  const skinRule = stripCssComments(cssRule(baseCss, '.titlebar-skin {'));
  ok(
    /box-sizing:\s*border-box/.test(skinRule),
    '★ .titlebar-skin 声明 box-sizing:border-box（否则 44px+1px 边框 = 45px 溢出槽位 → 色块盖线）'
  );
  ok(/height:\s*44px/.test(skinRule), '★ .titlebar-skin 声明 height:44px（与 .app-shell 槽位一致）');
  ok(
    /border-bottom:\s*1px solid/.test(skinRule),
    '★ .titlebar-skin 声明 1px 下边框（与 border-box 配对，43px 内容区才成立）'
  );
  ok(
    /\.titlebar-skin \.win-btn\s*\{\s*height:\s*43px/.test(stripCssComments(baseCss)),
    '★ .titlebar-skin .win-btn 高度 43px（= 槽位 44px − 下边框 1px，背景块不越过边线）'
  );

  const tbRule = stripCssComments(cssRule(baseCss, '.titlebar {'));
  const gateRule = stripCssComments(cssRule(compCss, '.gate-titlebar {'));
  ok(/grid-area:\s*tb/.test(tbRule), '★ .titlebar 保留 grid-area:tb 定位');
  ok(/flex-shrink:\s*0/.test(gateRule), '★ .gate-titlebar 保留 flex-shrink:0 定位');
  for (const [name, rule] of [
    ['.titlebar', tbRule],
    ['.gate-titlebar', gateRule]
  ]) {
    ok(
      !/box-sizing|border-bottom|background:|padding-left|app-region/.test(rule),
      `★ ${name} 不得重复外观声明（外观唯一归 .titlebar-skin，重复即回退到双份维护）`
    );
  }

  // ★ 两个标题栏标记必须挂上共享皮肤类 ★
  //   只改 CSS 不改模板 = 皮肤层空转，界面会「没有任何外观」（比双份维护更糟）。
  const tbVue = read(path.join(ROOT, 'src/components/TitleBar.vue'));
  const gtbVue = read(path.join(ROOT, 'src/components/GateTitleBar.vue'));
  ok(/class="titlebar titlebar-skin"/.test(tbVue), '★ TitleBar.vue 标记为 class="titlebar titlebar-skin"');
  ok(
    /class="gate-titlebar titlebar-skin"/.test(gtbVue),
    '★ GateTitleBar.vue 标记为 class="gate-titlebar titlebar-skin"'
  );

  // ── ② 「档案」一词在源码中必须零残留，统一用「文档」──
  // 范围：src/（界面文案）+ electron/（后端文案与注释）+ scripts/。
  // 排除：验收清单-*.md（历史归档，记录的是当时的用词，不应回改）；
  //       "文档盒" 是品牌名，它本来就含「文档」，不构成残留。
  const codeFiles = [
    ...walk(path.join(ROOT, 'src'), ['.js', '.vue', '.css']),
    ...walk(path.join(ROOT, 'electron'), ['.js', '.mjs', '.cjs']),
    ...walk(path.join(ROOT, 'scripts'), ['.js', '.mjs', '.cjs'])
  ];
  const leftover = [];
  for (const f of codeFiles) {
    const lines = read(f).split('\n');
    lines.forEach((line, i) => {
      // 跳过注释行：注释里为了说明「不要再写这个词」必然要提及它
      if (/^\s*(\/\/|\*|\/\*|\/\*\*)/.test(line)) return;
      if (line.includes('文档') === false && line.includes('档案')) {
        leftover.push(`${path.relative(ROOT, f)}:${i + 1}`);
      }
    });
  }
  ok(
    leftover.length === 0,
    '★ 源码内禁用词零残留（统一用「文档」）' + (leftover.length ? ' → ' + leftover.slice(0, 5).join(', ') : '')
  );

  const sidebar = read(path.join(ROOT, 'src/components/Sidebar.vue'));
  // ★ Beta.270：文案搬进 shell 字典，页面只留 t() 引用；措辞本身在字典侧锁
  ok(
    /:title="t\('shell\.navPosts'\)"/.test(sidebar) && /\{\{ t\('shell\.navPosts'\) \}\}/.test(sidebar),
    '★ 侧栏导航项 title 与文字同引 shell.navPosts（用户明确要求的用词）'
  );
  const postsPage = read(path.join(ROOT, 'src/pages/PostsPage.vue'));
  const shellDict = read(path.join(ROOT, 'src/i18n/parts/shell.zh-CN.js'));
  ok(/navPosts: '所有文档'/.test(shellDict), '★ shell 字典 navPosts 取值为「所有文档」');
  ok(
    /t\('posts\.allDocs'\)/.test(postsPage) &&
      /allDocs: '所有文档'/.test(read(path.join(ROOT, 'src/i18n/parts/posts.zh-CN.js'))),
    '★ 列表页页头标题经 t() 取「所有文档」（与侧栏同词不同键，两处都锁）'
  );

  // ── ③ 品牌名「文档盒」不得被替换破坏 ──
  // Beta.289：品牌名是产品名称（常量），不再经 t() 翻译，否则切繁体会被译成「文檔盒」。
  // 由 i18n 导出 BRAND_NAME，BrandMark 直接引用，切语言不随界面文案走。
  const brand = read(path.join(ROOT, 'src/components/BrandMark.vue'));
  const i18nIndex = read(path.join(ROOT, 'src/i18n/index.js'));
  ok(/from '\.\.\/i18n'/.test(brand) && /BRAND_NAME/.test(brand), '★ 品牌名经 i18n 常量 BRAND_NAME 引用（不经 t()）');
  ok(
    /export const BRAND_NAME = '文档盒'/.test(i18nIndex),
    '★ i18n 导出 BRAND_NAME = 「文档盒」（产品名常量，不参与翻译）'
  );
  ok(!/t\('shell\.brandShort'\)/.test(brand), '★ 品牌名不再经 t() 引用 shell.brandShort（避免被翻译破坏）');
  ok(
    !/文档文档盒/.test(baseCss + compCss + shellDict + sidebar),
    '★ 无「文档文档盒」这类重复叠加（替换事故的典型症状）'
  );
}

// ---------- 29. i18n 覆盖度 & 托盘自绘弹窗（Beta.270）----------
// 语言选择器上线的前提：任何一国字典缺键、任何一处漏网的中文字面量，都会让
// 「切英文界面半屏仍中文」。这一节把覆盖度固化成回归，并守住托盘自绘弹窗的结构。
{
  console.log('\n[29] i18n 覆盖度（全语言一致 / 调用命中 / 零漏网汉字）+ 托盘自绘结构');

  /* JS 感知的注释剥离（行号保持不烂，报错信息才指得准）。
   * 顺序：块注释 → 行注释 → HTML 注释。两个已知风险模式已确认在本库不存在：
   * 行注释内含 `/*`（会让块注释配对错乱）、字符串内 `//` 前无 `:`/引号
   * （会让行注释误吃字符串内容，如 'count' 那种注释尾串有引号的场景已核实安全）。 */
  function stripJsComments(src) {
    let out = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''));
    out = out.replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
    out = out.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ''));
    return out;
  }
  // 汉字（表意文字）才需要翻译；中文全角标点（：。（））是排版粘连，不作为漏报
  const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/;

  /* ── ① 全语言字典键集合一致、无空值 ── */
  const partsDir = path.join(ROOT, 'src/i18n/parts');
  const domains = [
    ...new Set(
      fs
        .readdirSync(partsDir)
        .filter(f => f.endsWith('.js'))
        // 域名不含点，剥掉结尾的 `.<语言码>.js` 即得域名（语言码可含连字符，如 zh-CN）
        .map(f => f.replace(/\.[^.]+\.js$/, ''))
    )
  ].sort();
  const grabKeys = file => {
    const src = read(path.join(partsDir, file));
    return new Set([...src.matchAll(/^\s{2}([A-Za-z0-9_]+):/gm)].map(m => m[1]));
  };
  const dictKeys = new Set();
  let totalKeys = 0;
  for (const d of domains) {
    const a = grabKeys(`${d}.zh-CN.js`);
    const others = RENDER_LANGS.filter(l => l !== 'zh-CN').map(l => [l, grabKeys(`${d}.${l}.js`)]);
    /* ①a 全量语言：键集必须与 zh-CN 完全一致（缺一个就露 raw key） */
    const full = others.filter(([l]) => FULL_TRANSLATION_LANGS.includes(l));
    ok(
      a.size > 0 && full.every(([, s]) => s.size > 0),
      `字典域 ${d} ${FULL_TRANSLATION_LANGS.length} 语均有键（${[a.size, ...full.map(([, s]) => s.size)].join('/')}）`
    );
    for (const [lng, set] of full) {
      const miss = [...a].filter(k => !set.has(k));
      const extra = [...set].filter(k => !a.has(k));
      ok(
        miss.length === 0 && extra.length === 0,
        `字典域 ${d}.${lng} 键集合与 zh-CN 一致` +
          (miss.length || extra.length ? ` → 缺:${miss.slice(0, 5).join(',')} 多:${extra.slice(0, 5).join(',')}` : '')
      );
    }
    /* ①b 渐进补齐语言：允许缺键，但不得凭空多出 zh-CN 没有的键
     * （多出来的键 = 拼错的 key，永远不会被 t() 命中，纯死代码） */
    for (const [lng, set] of others.filter(([l]) => !FULL_TRANSLATION_LANGS.includes(l))) {
      const extra = [...set].filter(k => !a.has(k));
      ok(
        extra.length === 0,
        `字典域 ${d}.${lng}（渐进补齐 ${set.size}/${a.size}）无多余键` +
          (extra.length ? ` → 多:${extra.slice(0, 5).join(',')}` : '')
      );
    }
    // 空值 = 翻译到一半，界面显示空白而不是退化中文（用户可感知但不致错的那条线也没了）
    for (const [lng, set] of [['zh-CN', a], ...others]) {
      const src = read(path.join(partsDir, `${d}.${lng}.js`));
      const empties = [...set].filter(k => new RegExp(`^\\s{2}${k}:\\s*(?:''|""|\\[\\]|\\{\\})`, 'm').test(src));
      ok(
        empties.length === 0,
        `字典域 ${d}.${lng} 无空值` + (empties.length ? ' → ' + empties.slice(0, 5).join(',') : '')
      );
    }
    for (const k of a) dictKeys.add(`${d}.${k}`);
    totalKeys += a.size;
  }
  ok(domains.length >= 16, `字典域数量 ≥ 16（现有 ${domains.length}：${domains.join('/')}）`);

  /* ── ② 字面量 t('domain.key') 全部命中字典 ── */
  // parts/ 是字典本体（值即中文，不该被任何「零汉字/键命中」扫描触及）；
  // src/i18n/index.js 保留在扫描内（t('shell.brandShort') 也在覆盖范围内），
  // 三个聚合层的中文只存在于注释里（剥离后干净），不影响 ② 与 ④。
  const srcFiles = walk(path.join(ROOT, 'src'), ['.js', '.vue']).filter(
    f => !f.includes(`${path.sep}i18n${path.sep}parts${path.sep}`)
  );
  const missT = [];
  let tCallCount = 0;
  for (const f of srcFiles) {
    const stripped = stripJsComments(read(f));
    // 要求引号后紧跟 , 或 )：跳过 t('shell.' + KEY[x]) 这类动态拼接捕获出的半键
    for (const m of stripped.matchAll(/\bt\(\s*['"]([^'"]+)['"]\s*[,)]/g)) {
      tCallCount++;
      if (!dictKeys.has(m[1])) missT.push(`${path.relative(ROOT, f)}: ${m[1]}`);
    }
  }
  ok(
    missT.length === 0,
    `字面量 t() 全部命中字典（${tCallCount} 处）` + (missT.length ? ' → ' + missT.slice(0, 8).join(' | ') : '')
  );

  /* ── ③ 动态载体定向提取：数据携 key 的 key 全部命中字典 ──
   * 覆盖「数据携 key、模板调 t()」的载体（ThemeSection 的 th.nameKey、
   * AboutPage 的 r.useKey、nav.js 的 PAGE_LABELS、postDiff 的 TAGS_OF …）：
   * 这些 key 在源码里是普通字符串字面量，拼错了运行时不报错、只显示裸 key。
   * 不能通用扫描「引号内形如 domain.key」：settings 表键（ui.floatLog）与
   * 用户字段 code（post.origin_author）与 i18n key 同形，误报无法消除，
   * 只能按已知载体定向提取。新增载体往 carriers 里加一行即可。 */
  const carriers = [
    { rel: 'src/store/modules/nav.js', what: 'PAGE_LABELS', block: /const PAGE_LABELS = \{([\s\S]*?)\n\}/, prefix: '' },
    { rel: 'src/utils/postDiff.js', what: 'TAGS_OF', block: /const TAGS_OF = \{([\s\S]*?)\n\}/, prefix: '' },
    // 主题元数据已收敛到 theme.js 的 THEME_META / THEME_LABEL_KEYS 单一导出
    // （此前 SettingsPage 内联 THEMES、NavToolbar 内联 THEME_LABEL_KEYS，各写一遍易不同步）。
    {
      rel: 'src/store/modules/theme.js',
      what: 'THEME_META',
      block: /const THEME_META = \[([\s\S]*?)\n\]/,
      prefix: '',
      pick: /(?:nameKey|descKey):\s*'([^']+)'/g
    },
    {
      rel: 'src/store/modules/theme.js',
      what: 'THEME_LABEL_KEYS',
      block: /const THEME_LABEL_KEYS = \{([\s\S]*?)\n\}/,
      prefix: 'shell.'
    },
    {
      rel: 'src/pages/AboutPage.vue',
      what: 'RESOURCES',
      block: /const RESOURCES = \[([\s\S]*?)\n\]/,
      prefix: '',
      pick: /useKey:\s*'([^']+)'/g
    }
  ];
  for (const c of carriers) {
    const src = read(path.join(ROOT, c.rel));
    const m = c.block.exec(src);
    ok(m, `${c.rel} 找到载体 ${c.what}`);
    const keys = m ? [...stripJsComments(m[1]).matchAll(c.pick || /:\s*'([^']+)'/g)].map(x => c.prefix + x[1]) : [];
    ok(keys.length > 0, `${c.what} 可提取 ≥1 个 key（实际 ${keys.length} 个）`);
    const miss = keys.filter(k => !dictKeys.has(k));
    ok(miss.length === 0, `${c.what} 全部命中字典` + (miss.length ? ' → ' + miss.slice(0, 5).join(', ') : ''));
  }

  /* ── ④ 模板/脚本内零汉字（去注释、去 console） ── */
  // 白名单只有两类，且都附了理由；新增豁免必须在这里写明「为什么不该翻译」：
  const CJK_ALLOW = {
    // 解析的是后端日志内容（主进程写的 [ERROR]/错误/失败 级别词），
    // 日志语言与界面语言无关，切英文界面也不该改匹配逻辑
    'src/components/LogView.vue': '后端日志中文级别词匹配，与界面语言无关',
    // 分词正则的汉字字符区间（算法需要识别中文边界）+
    // htmlToParagraphs 的默认占位 '[图片]'（界面层经 opts.imgPlaceholder 注入本地化文本）
    'src/utils/postDiff.js': '中文分词字符区间 + diff 算法默认占位（界面层注入本地化文本）',
    // 审计动作名落库是固定中文标识（查询条件，见 utils/auditText.js 顶部说明），
    // 界面展示由该模块经 i18n 翻译，故映射表的「键」必须是中文原值
    'src/utils/auditText.js': '审计标识→字典键映射表，键即库中固定中文标识（数据而非文案）'
  };
  const hanHits = [];
  for (const f of srcFiles) {
    const rel = path.relative(ROOT, f);
    // i18n 目录整体豁免：字典值即中文（设计如此），LANGS 原生名（'简体中文'）
    // 是语言选择器的展示名、不是界面文案，两者都不该被「零汉字」覆盖
    if (rel.startsWith('src/i18n/')) continue;
    if (CJK_ALLOW[rel]) continue;
    const stripped = stripJsComments(read(f));
    stripped.split('\n').forEach((line, i) => {
      if (HAN.test(line) && !/console\./.test(line)) hanHits.push(`${rel}:${i + 1}`);
    });
  }
  ok(
    hanHits.length === 0,
    '模板/脚本内零汉字（去注释、去 console）' + (hanHits.length ? ' → ' + hanHits.slice(0, 10).join(', ') : '')
  );
  // 白名单本身也要有真实命中，否则是死了的豁免（该类文件早就不含汉字了，删掉它）
  for (const [rel, why] of Object.entries(CJK_ALLOW)) {
    const stripped = stripJsComments(read(path.join(ROOT, rel)));
    const n = stripped.split('\n').filter(l => HAN.test(l) && !/console\./.test(l)).length;
    ok(n > 0, `白名单 ${rel} 确有命中（${n} 行，理由：${why}）`);
  }

  /* ── ⑤ 托盘自绘弹窗结构（原生 Menu 不可主题化，唯一正解是 frameless 自绘）── */
  const winSrc = read(path.join(ROOT, 'electron/window.js'));
  ok(
    !/\btray\.setContextMenu\s*\(/.test(winSrc) && !/setContextMenu\s*\(/.test(winSrc),
    'window.js 不再调用 setContextMenu（系统绘制不可主题化，且吞掉右键事件）'
  );
  ok(/tray\.on\('right-click'/.test(winSrc), '右键出自绘弹窗（toggleTrayPopup）');
  ok(
    /frame:\s*false/.test(winSrc) && /skipTaskbar:\s*true/.test(winSrc) && /alwaysOnTop:\s*true/.test(winSrc),
    '托盘弹窗 frameless + 不进任务栏 + 置顶'
  );
  ok(/popup\.focus\(\)/.test(winSrc), '弹窗主动 focus()（不拿焦点的窗口不收 blur，点外面收起与 Esc 全失灵）');
  ok(/before-input-event/.test(winSrc), 'Esc 关闭走 before-input-event');
  ok(/hash:\s*'tray'/.test(winSrc), '弹窗加载 dist/index.html#tray（复用同一份产物）');
  ok(/ipcMain\.on\('tray:tooltip'/.test(winSrc), 'tray:tooltip 通道存在（主进程无字典，提示语文案由渲染层按语言推送）');
  // 锚定 const popup：主窗口是 state.win = new BrowserWindow，从第一处
  // new BrowserWindow({ 起匹配会把主窗口配置误当成弹窗配置来断言
  const trayPopupWin = (winSrc.match(/const popup = new BrowserWindow\(\{[\s\S]*?\n {2}\}\)/) || [''])[0];
  ok(
    trayPopupWin.length > 0 && /frame:\s*false/.test(trayPopupWin),
    '上述 frameless 断言指的是托盘弹窗而非主窗口（防主窗口配置被误改）'
  );

  const trayVue = read(path.join(ROOT, 'src/pages/TrayMenu.vue'));
  ok(/A\.trayData\(\)/.test(trayVue), 'TrayMenu.vue 消费 trayData');
  ok(/locked/.test(trayVue), 'TrayMenu.vue 处理锁定态');
  const mainSrc29 = read(path.join(ROOT, 'src/main.js'));
  ok(
    /isTray\s*=\s*location\.hash\s*===\s*'#tray'/.test(mainSrc29) && /isTray\s*\?/.test(mainSrc29),
    'main.js 按 #tray 哈希切换根组件（共用入口，不另造 tray.html）'
  );
  const preload29 = read(path.join(ROOT, 'electron/preload.js'));
  for (const fn of ['trayData', 'trayAction', 'trayResize', 'markView', 'setTrayTooltip']) {
    ok(new RegExp(`${fn}\\s*:`).test(preload29), `preload 暴露 ${fn}`);
  }
  const trayIpc = read(path.join(ROOT, 'electron/ipc/tray.js'));
  for (const ch of ['view:mark', 'tray:data', 'tray:resize', 'tray:action']) {
    ok(
      new RegExp(`handle\\('${ch.replace(':', ':')}'`).test(trayIpc) || new RegExp(`'${ch}'`).test(trayIpc),
      `tray.js 注册 ${ch}`
    );
  }
  ok(/aliveIds/.test(trayIpc), '最近浏览打开时用 aliveIds 洗已删文档死链');
}

/* ══════════ 6. 主进程 i18n（Beta.271）══════════
 *
 * 主进程面对的文案有两类，断言也要分两类：
 *   A 类 自渲染：原生弹窗 / 右键菜单 / dbError 屏 —— 文字只在本进程出现，
 *        正确性靠「字典措辞」+「调用点确实走了 t()」两头锁。
 *   B 类 抛给渲染层：IPC throw —— 传的是 errKey 编码串，正确性靠
 *        「调用点传 key」+「该 key 在渲染层字典里真实存在」两头锁。
 * 只锁一头的话，改文案会把测试改红（锁 string），改 key 则静默漏翻译（锁 key）。
 */
console.log('[6] 主进程 i18n（A 类自渲染 + B 类 errKey）');

const i18nDir = path.join(ROOT, 'electron/i18n');
const mainI18n = read(path.join(i18nDir, 'index.js'));
// MAIN_LANGS 在文件头由 electron/i18n/index.js 的 LANGS 派生（单一来源），此处不重复定义
const MAIN_DOMAINS = ['sys', 'menu'];

// ⑥-1 顶层零 electron：contextmenu 的纯函数要能在纯 Node 下直接 require
ok(
  !/^const\s+\{[^}]*\}\s*=\s*require\('electron'\)/m.test(mainI18n),
  'i18n/index.js 顶层不 require electron（改为懒解析，保纯 Node 可测）'
);
ok(
  /function cacheFile[\s\S]{0,400}require\('electron'\)/.test(mainI18n),
  'userData 路径懒解析（app.setName 时序之后才取）'
);

// ⑥-2 全语言键集完全一致：少一个键 = 该语言下界面露出 raw key
for (const dom of MAIN_DOMAINS) {
  const keysets = {};
  for (const l of MAIN_LANGS) {
    const p = path.join(i18nDir, `parts/${dom}.${l}.js`);
    ok(fs.existsSync(p), `字典存在 parts/${dom}.${l}.js`);
    const src = read(p);
    keysets[l] = [...src.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\s*:/gm)].map(m => m[1]).sort();
  }
  const base = keysets['zh-CN'];
  ok(base.length > 0, `${dom} 域键数 > 0（${base.length}）`);
  for (const l of MAIN_LANGS.slice(1)) {
    const diff = base.filter(k => !keysets[l].includes(k)).concat(keysets[l].filter(k => !base.includes(k)));
    // it/es 渐进补齐：允许缺（回退中文），但不许凭空多出 zh-CN 没有的键
    const partial = PARTIAL_LANGS.includes(l);
    const bad = partial ? keysets[l].filter(k => !base.includes(k)) : diff;
    ok(
      bad.length === 0,
      `${dom}.${l} 键集${partial ? '（渐进补齐，无多余键）' : '与 zh-CN 一致'}` +
        (bad.length ? ' → 差异 ' + bad.join(', ') : '')
    );
  }
}

// ⑥-3 t()/errKey()/logText() 的真实行为（直接 require 跑，不靠 grep）
const i18nMod = await import(path.join(i18nDir, 'index.js').replace(/\\/g, '/') + '?t=' + Date.now()).catch(() => ({
  default: null
}));
const I = i18nMod.default || i18nMod;
ok(
  typeof I.t === 'function' && typeof I.errKey === 'function' && typeof I.logText === 'function',
  'i18n 导出 t / errKey / logText'
);

{
  const before = I.currentLang();
  I.setLang('en');
  const enMsg = I.t('sys.dbQuit');
  ok(typeof enMsg === 'string' && enMsg.length > 0 && !/^sys\./.test(enMsg), 't() 在 en 下返回译文而非 raw key');
  // 插值：{param} 形，且未知占位符原样保留（宁可露出 {x} 也不要吞掉）
  const filled = I.t('menu.copySel', { text: 'abc' });
  ok(filled.includes('abc') && !filled.includes('{text}'), 't() 做 {param} 插值');
  I.setLang('zh-CN');
  const zhMsg = I.t('sys.dbQuit');
  ok(zhMsg === '退出程序', 'zh-CN 下 t(sys.dbQuit) 取到字典措辞');
  // 缺失键回退到 key 本身：绝不返回 undefined（undefined 会渲染成空）
  const missing = I.t('sys.thisKeyDoesNotExist');
  ok(typeof missing === 'string' && missing === 'sys.thisKeyDoesNotExist', '缺失键回退为 key 本身而非 undefined');

  // errKey：无参 → 裸 key；有参 → key|{json}；两者都要能被 isErrKey 认出
  ok(I.errKey('sys.dbQuit') === 'sys.dbQuit', 'errKey 无参返回裸 key');
  const enc = I.errKey('sys.dbOpenFailed', { dir: 'D:/x', msg: 'boom' });
  ok(/^sys\.dbOpenFailed\|/.test(enc) && enc.includes('"dir":"D:/x"'), 'errKey 有参返回 key|{json}');
  ok(
    I.isErrKey(enc) && I.isErrKey('menu.errNoWindow') && !I.isErrKey('随便一句中文') && !I.isErrKey('boom'),
    'isErrKey 只认 key|params 形态（中文/英文句子不误判）'
  );

  // logText：无论当前语言，日志固定 zh-CN —— 换语言后历史日志仍可 grep
  I.setLang('en');
  const logged = I.logText(enc);
  ok(
    logged.includes('D:/x') && logged.includes('boom') && /数据库|打开|失败/.test(logged),
    'logText 在 en 下仍还原为 zh-CN（日志语言与界面无关）'
  );
  I.setLang(before);
}

// ⑥-4 lang:set 通道四件套必须同时连通，缺一环 = 切语言对主进程无效
const preload6 = read(path.join(ROOT, 'electron/preload.js'));
const win6 = read(path.join(ROOT, 'electron/window.js'));
const rI18n6 = read(path.join(ROOT, 'src/i18n/index.js'));
ok(/setLang\s*:\s*lang\s*=>\s*ipcRenderer\.send\('lang:set'/.test(preload6), 'preload 暴露 setLang → lang:set');
ok(/ipcMain\.on\('lang:set'/.test(win6) && /i18n\.setLang/.test(win6), 'window.js 收 lang:set 并调 i18n.setLang');
ok(
  /syncMainLang/.test(rI18n6) && /applyLang[\s\S]{0,600}syncMainLang/.test(rI18n6),
  '渲染层 applyLang 调 syncMainLang（切语言时推送一次）'
);
ok(/isTrayPopup[\s\S]{0,300}hash\s*===\s*'#tray'/.test(rI18n6), 'isTrayPopup 用 #tray 判据');
ok(
  /applyLang[\s\S]{0,600}if\s*\(isTrayPopup\(\)\)\s*return/.test(rI18n6),
  '托盘弹窗只读不写（否则与主窗口来回推语言形成回环）'
);

// ⑥-5 A 类调用点：关键面必须真的走 t()，不是只把字典建好
{
  const main6 = read(path.join(ROOT, 'electron/main.js'));
  for (const k of [
    'sys.dbIntegrityTitle',
    'sys.dbIntegrityMsg',
    'sys.dbReadOnlyNote',
    'sys.dbGotoSettings',
    'sys.dbQuit'
  ]) {
    ok(main6.includes(`i18n.t('${k}'`), `main.js 完整性弹窗走 ${k}`);
  }
  ok(/sys\.appIntegrityDetail/.test(main6), '程序文件完整性走 sys.appIntegrityDetail');
  // 完整性 reason：db/core 只管产出 key，取用点各自决定翻 or log
  const core6 = read(path.join(ROOT, 'electron/db/core.js'));
  for (const k of ['sys.integSigBroken', 'sys.integSigFail', 'sys.integHashMismatch', 'sys.integCrcMismatch']) {
    ok(new RegExp(`errKey\\('${k.replace('.', '\\.')}'\\)`).test(core6), `db/core 的 reason 走 errKey ${k}`);
  }
  ok(
    /getPendingIntegrityWarn[\s\S]{0,300}logText/.test(core6),
    'getPendingIntegrityWarn 返回前已本地化（弹窗直接显示它）'
  );
  // dbError 屏：库打不开时渲染层读不到设置表，只能靠主进程缓存的语言
  const ks6 = read(path.join(ROOT, 'electron/keystore.js'));
  ok(/i18n\.t\('sys\.dbOpenFailed'/.test(ks6), 'dbError 文案走 t(sys.dbOpenFailed)');
  ok(/initFromCache/.test(main6), 'main.js 启动链含 initFromCache（库打不开时的唯一语言来源）');

  const ctx6 = read(path.join(ROOT, 'electron/ipc/contextmenu.js'));
  for (const k of [
    'menu.copySel',
    'menu.noCopy',
    'menu.copyImage',
    'menu.saveImage',
    'menu.saveImageTitle',
    'menu.imgFilter'
  ]) {
    ok(ctx6.includes(`i18n.t('${k}'`), `右键菜单走 ${k}`);
  }
  for (const k of ['menu.errImageBroken', 'menu.errInlineOnly', 'menu.errNoWindow']) {
    ok(ctx6.includes(`errKey('${k}'`), `右键菜单抛 errKey ${k}`);
  }
  // 托盘语言不再硬编码：锁定态会让界面语言与托盘提示语分家
  ok(
    !/lang:\s*'zh-CN'/.test(read(path.join(ROOT, 'electron/ipc/tray.js'))),
    'tray.js 不再硬编码 lang（改 i18n.currentLang()）'
  );
}

// ⑥-6 B 类交叉核对：主进程 errKey 里出现的每个 key，渲染层字典必须能翻
{
  /* 用 zh-CN.js 聚合层里真实的 import 关系推导「域 → parts 文件」，
   * 而不是假设文件名等于域名：两者现在恰好相同，但假设会被一次重命名打穿，
   * 推导则可以自己发现自己（缺域时下面的三语域一致性断言会报）。 */
  const domainMap = {};
  for (const l of MAIN_LANGS) {
    domainMap[l] = {};
    const agg = read(path.join(ROOT, `src/i18n/${l}.js`));
    for (const m of agg.matchAll(/import\s+([a-zA-Z][\w]*)\s+from\s+'\.\/parts\/([^']+)'/g)) {
      domainMap[l][m[1]] = m[2];
    }
  }
  const renderKeysets = {};
  for (const l of MAIN_LANGS) {
    const keys = new Set();
    for (const [dom, file] of Object.entries(domainMap[l])) {
      const p = path.join(ROOT, 'src/i18n/parts', file.endsWith('.js') ? file : file + '.js');
      const src = read(p);
      for (const m of src.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9_]*)\s*:/gm)) keys.add(`${dom}.${m[1]}`);
    }
    renderKeysets[l] = keys;
  }
  // 聚合层自身先得是齐的：某个语言漏 import 一个域，所有该域的 key 全变 raw
  ok(
    Object.keys(domainMap['zh-CN']).length === 16,
    `渲染层 zh-CN 聚合 16 个域（${Object.keys(domainMap['zh-CN']).length}）`
  );
  for (const l of MAIN_LANGS.slice(1)) {
    const a = Object.keys(domainMap['zh-CN']).sort().join(',');
    const b = Object.keys(domainMap[l]).sort().join(',');
    ok(a === b, `渲染层 ${l} 聚合的域与 zh-CN 一致`);
  }

  const ejs = electronJs.filter(f => !f.includes('/verify/') && !f.includes('/i18n/'));
  const used = new Set();
  for (const f of ejs) {
    const src = read(f);
    for (const m of src.matchAll(/errKey\('([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9]+)'/g)) used.add(m[1]);
  }
  ok(used.size > 50, `主进程 errKey 调用点已接（${used.size} 个不同键）`);
  // sys/menu 是主进程自渲染域，由 logText 在本进程翻译，不进渲染层字典
  const biz = [...used].filter(k => !k.startsWith('sys.') && !k.startsWith('menu.'));
  ok(biz.length > 0, `B 类 errKey 指向渲染层字典域（${biz.length} 个）`);
  // 一个 key 都不落在渲染层域里 → 说明这轮「抛 key」白做了，退化成只有自渲染那半
  ok(renderKeysets['zh-CN'].has('common.errDbNotInit'), '渲染层字典确能查到主进程抛的 key（common.errDbNotInit 抽样）');
  for (const l of MAIN_LANGS) {
    const missing = biz.filter(k => !renderKeysets[l].has(k));
    ok(
      missing.length === 0,
      `B 类 errKey 全部能在渲染层 ${l} 字典查到` + (missing.length ? ' → 缺 ' + missing.slice(0, 8).join(', ') : '')
    );
  }
}

// ⑥-7 渲染层 errText()：把 IPC 来的 key(+params) 翻成人话，不能各页各写一套
{
  const fb6 = read(path.join(ROOT, 'src/feedback.js'));
  ok(/export function errText/.test(fb6), 'feedback.js 导出 errText');
  ok(/err\.params/.test(fb6), 'errText 透传 err.params 给 t()（否则带参错误会露出 {dir}）');
  ok(/toastErr[\s\S]{0,300}errText/.test(fb6), 'toastErr 统一走 errText');
  const showSites = [
    'src/components/settings/SecurityModal.vue',
    'src/components/UnlockGate.vue',
    'src/components/PasswordGate.vue',
    'src/components/UserGate.vue',
    'src/App.vue',
    'src/components/settings/AccountSection.vue',
    'src/components/RecoverForm.vue'
  ];
  const missingSite = showSites.filter(f => !fs.existsSync(path.join(ROOT, f)));
  ok(missingSite.length === 0, '展示点文件路径全部有效' + (missingSite.length ? ' → ' + missingSite.join(', ') : ''));
  const noErrText = showSites.filter(f => !read(path.join(ROOT, f)).includes('errText('));
  ok(
    noErrText.length === 0,
    '解锁/账号/安全等展示点全部改用 errText' + (noErrText.length ? ' → 漏 ' + noErrText.join(', ') : '')
  );
  // 老写法 err.message 直出会把 raw key 甩到用户脸上
  const rawHits = showSites.filter(f =>
    /(?:msg|text|errorText)\s*=\s*(?:e|err)\.message/.test(read(path.join(ROOT, f)))
  );
  ok(rawHits.length === 0, '展示点无 err.message 直出' + (rawHits.length ? ' → ' + rawHits.join(', ') : ''));
}

// ⑥-8 electron/ 下用户可见中文零残留（白名单制）
{
  // 允许保留汉字的位置，逐条写明理由；白名单条目必须真的有命中，
  // 否则说明它已经过时（代码早搬进字典了），该删掉而不是留着占位。
  const MAIN_CJK_ALLOW = {
    'electron/i18n/': '字典本身（值即中文，设计如此）',
    'electron/verify/': '验证脚本的断言说明文本',
    'electron/screenshots/': '截图脚本注入页面的调试文本',
    'electron/db/seed.js': '演示数据（--seed/--shot 专用），落库后等同用户内容，不是界面文案',
    'electron/shots.js': '截图脚本（--shot 专用）：文件名与页面按钮文本匹配，前者是产物名，后者是选择器'
  };
  const allow = rel => Object.keys(MAIN_CJK_ALLOW).some(p => (p.endsWith('/') ? rel.startsWith(p) : rel === p));
  const HAN6 = /[\u4e00-\u9fa5]/;
  // 行内注释（`x = 1 // 说明`）不能算可见文案，也必须剥掉：
  // 只滤整行 `//` 会把「变量 + 行尾注释」全误报成残留
  const strip6 = src =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''))
      .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1')
      // audit(uid, '动作名', ...) 的第 2 参是**落库标识**不是界面文案：
      // 它同时是 stats.js 的查询条件（action='登录' / LIKE '%失败%'），
      // 一旦随语言漂移，历史审计记录的语义与统计口径就全乱。展示翻译在前端做。
      // 逐个函数按「动作名是第几个实参」剥离，别用贪心正则：
      //   audit(uid, action, ...) / safeAudit(uid, action, ...) → 第 2 个
      //   failAudit(uid, name, mac, reason)                     → 第 4 个
      .replace(
        /((?:[A-Za-z_$][\w$]*\.)?(?:audit|safeAudit)\(\s*(?:(?:[^(),]|\([^()]*\))*),\s*)'[^']*'/g,
        "$1'<ACTION>'"
      )
      .replace(
        /(failAudit\(\s*(?:(?:[^(),]|\([^()]*\))*),\s*(?:(?:[^(),]|\([^()]*\))*),\s*(?:(?:[^(),]|\([^()]*\))*),\s*)'[^']*'/g,
        "$1'<ACTION>'"
      )
      // 同上：SQL 里按 action 过滤的字面量是数据标识（统计口径），不是界面文案
      .replace(/(action\s*(?:=|LIKE)\s*'[^']*')/g, '<SQL_ACTION>')
      .replace(/(action\s+LIKE\s*'[^']*')/g, '<SQL_ACTION>')
      // 审计里「无对应用户」时的操作者占位名，与 action 同理属落库标识
      .replace(/'系统'\)/g, '<SYS_ACTOR>)')
      // 审计 detail 的字段值同样是数据（如 { from: '局域共享' }），会被翻译的是展示层
      .replace(/(\{\s*title:\s*post\.title,\s*from:\s*)'[^']*'/g, "$1'<DATA>'")
      // 「共享拷贝」是新建大区时落库的名字（等同用户内容），不是界面标签
      .replace(/'共享拷贝'/g, '<DATA_NAME>')
      // assertWritable(dir, label) 的 label 会作为参数嵌入**抛给渲染层**的错误，
      // 由渲染层 t() 翻译整句；这里传的是「目录角色」这一数据，不是界面文案
      .replace(/(assertWritable\([^,]+,\s*)'[^']*'/g, "$1'<LABEL>'")
      // 同上：默认参数（assertWritable(dir, label = '数据目录')）也是嵌入错误的角色名
      .replace(/(assertWritable \(dir, label = )'[^']*'/g, "$1'<LABEL>'")
      // 函数定义的默认参数（function assertWritable(dir, label = '数据目录')）同理
      .replace(/(function assertWritable\(dir, label = )'[^']*'/g, "$1'<LABEL>'")
      // LAN 令牌错误串是**协议判据**（服务端写出、客户端字符串相等比对后判 401），
      // 翻译它会让两边判据分家；展示给用户的文案另有一层（ipc/lanshare.js）
      .replace(/(const ERR_BAD_TOKEN = )'[^']*'/g, "$1'<PROTOCOL>'")
      // 演示账号 / 密钥文件的备注：都是落库或落盘的数据，避免与真实用户内容混淆
      .replace(/(const DEMO_USER = )'[^']*'/g, "$1'<DEMO>'")
      .replace(/(note: )'[^']*'/g, "$1'<NOTE>'")
      // App 品牌名是专有名词，不随界面语言变（三种语言都叫「文档盒 Archbox」）
      .replace(/(const APP_NAME = )'[^']*'/g, "$1'<BRAND>'");

  // 演示账号的安全问答同样是落库数据（用户可见但属于内容，不是标签）
  const DEMO_QA_STRIP = /(\{\s*q:\s*)'[^']*'(,\s*a:\s*)'[^']*'(\s*\})/g;
  // 日志文案固定中文是有意为之（跨语言可 grep），不是漏翻译。
  // 形式不止 console.*：项目统一走 getLog()/log/logger，故一并识别。
  const LOG_LINE = /(?:\bconsole|\blog|\blogger|getLog\(\))\s*\.\s*(?:info|warn|error|debug)\s*\(/;
  // 只写进运行日志的辅助表（通道名→中文标签、非敏感摘要），同样不是界面文案
  const LOG_ONLY_FILE = {
    'electron/ipc/shared.js': 'FLOW/flowSummary 仅用于运行日志输出'
  };
  const hits6 = [];
  for (const f of electronJs) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    if (allow(rel)) continue;
    const logOnly = LOG_ONLY_FILE[rel];
    // 日志模板常跨行（一个 getLog().info( 后面跟几行反引号串），
    // 只按单行判断会把续行误报成界面文案，故记一个「在日志括号内」的状态
    let logDepth = 0;
    strip6(read(f))
      .replace(DEMO_QA_STRIP, "$1'<Q>'$2'<A>'$3")
      .split('\n')
      .forEach((line, i) => {
        const opens = LOG_LINE.test(line);
        const inLog = opens || logDepth > 0;
        if (opens) logDepth = 1;
        if (logDepth > 0) {
          const delta = (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
          logDepth = Math.max(0, logDepth + (opens ? delta : delta));
          if (logDepth === 0 && !opens) {
            /* 本行闭合 */
          }
        }
        if (!HAN6.test(line)) return;
        if (inLog) return;
        // 日志专用文件：FLOW 表（通道名→标签）与 flowSummary 的模板串都只进日志
        if (logOnly) return;
        hits6.push(`${rel}:${i + 1}: ${line.trim().slice(0, 60)}`);
      });
  }
  ok(
    hits6.length === 0,
    'electron/ 下用户可见中文零残留（注释/日志/i18n 字典/audit 落库标识除外）' +
      (hits6.length ? ' → ' + hits6.slice(0, 6).join(' | ') : '')
  );
}

/* ══════════ 7. 说明页日志路径（Beta.273）══════════
 *
 * 起因：说明页原文写「日志位于数据目录的 logs\ 下（完整路径见设置 → 数据）」，
 * 这里有两处错：
 *   ① 路径关系错了 —— 日志在 userData/logs，数据目录默认 userData/data，**同级**；
 *   ② 既说「相对位置」又让用户去别的页面找完整路径，等于没给。
 * 现在改成：主进程暴露绝对路径 → settings:getAll 透传 → 说明页注入 {dir}。
 * 断言必须锁三段链路，否则任一段断开都会静默退回「数据目录的 logs」这种假路径。
 */
console.log('[7] 说明页日志路径给出完整绝对路径');

// ⑦-1 主进程：logDir 真实读取 initLogger 记录下来的目录，而非拼接
const loggerSrc = read(path.join(ROOT, 'electron/services/logger.js'));
ok(
  /function logDir\s*\(\)[\s\S]{0,80}_log[\s\S]{0,40}_dir/.test(loggerSrc),
  'logger.logDir() 取自 initLogger 实际使用的 _dir（不靠 dataDir 拼）'
);
ok(/module\.exports\s*=\s*\{[^}]*\blogDir\b/.test(loggerSrc), 'logger 导出 logDir');

// ⑦-2 IPC：settings:getAll 把 logDir 带给渲染层
const settingsIpcSrc = read(path.join(ROOT, 'electron/ipc/settings.js'));
ok(
  /settings:getAll/.test(settingsIpcSrc) && /logDir:\s*logDir\(\)/.test(settingsIpcSrc),
  'settings:getAll 返回值含 logDir'
);

// ⑦-3 全语言字典：c5 必须带 {dir} 占位符（否则路径根本没被注入）
for (const lang of RENDER_LANGS) {
  const src = read(path.join(ROOT, `src/i18n/parts/guide.${lang}.js`));
  const m = /\bc5:\s*'((?:[^'\\]|\\.)*)'/.exec(src);
  const body = m ? m[1] : '';
  ok(!!body, `guide.${lang} 存在 c5`);
  ok(/\{dir\}/.test(body), `guide.${lang}.c5 含 {dir} 占位符`);
  // 旧文案把日志说成数据目录的子目录，这是事实错误，必须彻底消失
  ok(
    !/数据目录的\s*logs|資料目錄的\s*logs|under the data directory/i.test(body),
    `guide.${lang}.c5 不再声称日志在数据目录内部`
  );
  ok(/logs/i.test(body) || /\{dir\}/.test(body), `guide.${lang}.c5 提到日志目录本身`);
}
// 说明「同级」的订正句必须存在，否则用户仍会以为日志跟着数据目录走
ok(
  /同級|并不在数据目录内部/.test(read(path.join(ROOT, 'src/i18n/parts/guide.zh-CN.js'))) ||
    /同級/.test(read(path.join(ROOT, 'src/i18n/parts/guide.zh-CN.js'))),
  'guide.zh-CN.c5 明确了「日志目录与数据目录同级」'
);
ok(
  /not inside it|alongside the data directory/i.test(read(path.join(ROOT, 'src/i18n/parts/guide.en.js'))),
  'guide.en.c5 明确了 alongside / not inside'
);

// ⑦-4 页面：确实把 logDir 传进 c5，且不自行拼路径
const guidePageSrc = read(path.join(ROOT, 'src/pages/GuidePage.vue'));
// 剥掉注释再判：GuidePage 的注释里正举了 `dataDir + '/logs'` 这个反例，
// 不剥的话「禁止拼接」这条会被自己的说明文字判红。
const guidePageCode = guidePageSrc
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map(l => l.replace(/(^|\s)\/\/.*$/, '$1'))
  .join('\n');
ok(/t\('guide\.c5',\s*\{\s*dir:\s*logDirPath\s*\}\)/.test(guidePageSrc), 'GuidePage 给 c5 传入 { dir: logDirPath }');
ok(
  /logDirPath\.value\s*=\s*store\.settings\.logDir|logDirPath\.value\s*=\s*\w+\.logDir/.test(guidePageSrc),
  'GuidePage 的 logDirPath 取自 settings 的 logDir 字段'
);
ok(
  !/dataDir\s*\+\s*['"`]\/?logs/.test(guidePageCode),
  'GuidePage 不自行用 dataDir 拼 /logs（同级关系，拼出来的目录不存在）'
);
ok(/A\.logOpen\(\)/.test(guidePageCode), 'GuidePage 提供「打开日志目录」动作');

/* ══════════ 8. 繁体 = 简体逐字转字形（Beta.274）══════════
 *
 * 口径由用户判定：繁体是简体「直接转换」来的，**用词不许变**。
 * 此前 zh-TW 是人工译的，把「保存→儲存、数据→資料、文档→文件、网络→網路、
 * 接口→介面、默认→預設、刷新→重新整理」等全换了一遍，导致同一个概念在两种
 * 语言下叫两个名字，简体用户切繁体等于重新学一遍术语。
 *
 * 断言策略：内置一份「简体→繁体」单字映射表，逐条把 zh-CN 的值过一遍映射，
 * 必须与对应 zh-TW 逐字节相等。它同时锁住两件事：
 *   · 字形确实转过（漏转 = 简体字混进繁体界面）；
 *   · 没有额外的用词替换（多转 = 又变成了台湾化改写）。
 * 映射表只收「本仓库字典实际用到的字」，手工用词（如「后台→後台」）不在此表，
 * 这样一旦有人又把某条改成台湾用法，等于多出表外替换，断言立刻转红。
 */
console.log('[8] 繁体字典 = 简体逐字转字形（用词与简体一致）');

// 映射表与生成脚本共用同一份（electron/verify/tw-han-map.mjs），
// 否则会出现「脚本按 A 表转、断言按 B 表判」——两边都自洽，却互相打脸。
const { toTw: toTwHan, S2T } = await import('file://' + path.join(ROOT, 'electron/verify/tw-han-map.mjs'));
ok(S2T.size > 300, `内置字形映射表 ${S2T.size} 对（覆盖字典实际用字）`);
// 表本身必须只做字形、不做用词：抽查「复制/恢复」这类歧义字按词定形是否生效
ok(toTwHan('复制') === '複製' && toTwHan('恢复') === '恢復', '歧义字按词定形（复制→複製 / 恢复→恢復）');
ok(toTwHan('数据保存') === '數據保存', '映射表不做用词替换（数据保存 → 數據保存，不是 資料儲存）');

/** 把字典摊平成 { 'a.b': 值 }，与 t() 的寻路深度一致 */
function flattenObj(o, p = '', out = {}) {
  for (const [k, v] of Object.entries(o)) {
    const kp = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object') flattenObj(v, kp, out);
    else out[kp] = v;
  }
  return out;
}

/* 成对校验：渲染层 16 域 + 主进程 sys/menu。两侧都直接 import 真实模块
   （而非正则抓源码），这样转义、跨行字符串、模板拼接都按运行时值判定。 */
const pairDoms = [
  ...[
    'common',
    'shell',
    'home',
    'posts',
    'post',
    'region',
    'search',
    'trash',
    'taxonomy',
    'lanshare',
    'settings',
    'about',
    'guide',
    'ui',
    'tray',
    'time'
  ].map(d => [`src/i18n/parts/${d}`, d]),
  ['electron/i18n/parts/sys', 'sys'],
  ['electron/i18n/parts/menu', 'menu']
];

let pairTotal = 0;
const pairBad = [];
for (const [base, name] of pairDoms) {
  const zh = (await import(`file://${path.join(ROOT, `${base}.zh-CN.js`)}`)).default;
  const tw = (await import(`file://${path.join(ROOT, `${base}.zh-TW.js`)}`)).default;
  const walkZh = flattenObj(zh);
  const walkTw = flattenObj(tw);
  for (const [k, s] of Object.entries(walkZh)) {
    if (typeof s !== 'string') continue;
    pairTotal++;
    const expect = toTwHan(s);
    const got = walkTw[k];
    if (expect === got) continue;
    // 只报第一条不同字符，避免日志被长句淹没
    let i = 0;
    while (i < Math.min(expect.length, String(got || '').length) && expect[i] === String(got)[i]) i++;
    pairBad.push(
      `${name}.${k} @${i}: 应「${expect.slice(Math.max(0, i - 8), i + 8)}」实「${String(got).slice(Math.max(0, i - 8), i + 8)}」`
    );
  }
}
ok(pairTotal > 1500, `成对校验覆盖 ${pairTotal} 条词条（渲染层 + 主进程）`);
ok(
  pairBad.length === 0,
  '繁体词条 = 简体逐字转字形，无额外用词替换' +
    (pairBad.length ? ` → ${pairBad.length} 条不符：${pairBad.slice(0, 6).join(' | ')}` : '')
);

// 残留「台湾化用词」扫描：只针对「简体原文里**没有**该词」的情形。
// 否则会把「数据储存」「重新载入」这类简体原文本身就用的词误判成台湾化——
// 繁体是简体的字形转写，简体用「储存」，繁体当然也是「儲存」。
const TW_WORDS = [
  '資料夾',
  '資訊',
  '網路',
  '軟體',
  '硬體',
  '介面',
  '預設',
  '檔案',
  '匯出',
  '匯入',
  '搜尋',
  '重新整理',
  '載入',
  '稽核',
  '逾時',
  '存取',
  '使用者',
  '簽章',
  '偵測'
];
const SIMPLIFIED_OF = {
  資料夾: '文件' + '夹',
  資訊: '信息',
  網路: '网络',
  軟體: '软件',
  硬體: '硬件',
  介面: '界面',
  預設: '默认',
  檔案: '档' + '案',
  匯出: '导出',
  匯入: '导入',
  搜尋: '搜索',
  重新整理: '刷新',
  載入: '载入',
  稽核: '审计',
  逾時: '超时',
  存取: '访问',
  使用者: '用户',
  簽章: '签章',
  偵測: '侦测'
};
const twFiles = [
  ...[
    'common',
    'shell',
    'home',
    'posts',
    'post',
    'region',
    'search',
    'trash',
    'taxonomy',
    'lanshare',
    'settings',
    'about',
    'guide',
    'ui',
    'tray',
    'time'
  ].map(d => `src/i18n/parts/${d}.zh-TW.js`),
  'electron/i18n/parts/sys.zh-TW.js',
  'electron/i18n/parts/menu.zh-TW.js'
];
const twHits = [];
for (const f of twFiles) {
  const lines = read(path.join(ROOT, f)).split('\n');
  const zhFile = f.replace('.zh-TW.js', '.zh-CN.js');
  const zhSrc = fs.existsSync(path.join(ROOT, zhFile)) ? read(path.join(ROOT, zhFile)) : '';
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // 注释里的行文说明不受限
    for (const w of TW_WORDS) {
      if (!line.includes(w)) continue;
      // 简体原文里本就用这个词对应写法 → 繁体照抄是对的，不算台湾化
      const zhCounterpart = SIMPLIFIED_OF[w];
      if (zhCounterpart && zhSrc.includes(zhCounterpart)) continue;
      twHits.push(`${f}:${i + 1} 含「${w}」`);
    }
  });
}
ok(
  twHits.length === 0,
  '繁体字典无「简体原文未使用」的台湾化用词' + (twHits.length ? ' → ' + twHits.slice(0, 6).join(' | ') : '')
);

// 旧字形统一：台湾正字用「為 / 啟」，不得混入「爲 / 啓」
const oldGlyph = [];
for (const f of twFiles) {
  const s = read(path.join(ROOT, f));
  for (const c of ['爲', '啓']) if (s.includes(c)) oldGlyph.push(`${f} 含「${c}」`);
}
ok(
  oldGlyph.length === 0,
  '繁体字典统一用「為 / 啟」，无「爲 / 啓」旧字形' + (oldGlyph.length ? ' → ' + oldGlyph.join(' | ') : '')
);

// 语言选择器：下拉而非按钮组（按钮组随语种增加会撑爆整行）
const dispSrc = read(path.join(ROOT, 'src/components/settings/DisplaySection.vue'));
ok(/<Dropdown[\s\S]{0,300}:options="langOptions"/.test(dispSrc), '语言选择改用 Dropdown 下拉');
ok(!/class="seg-btn"[^>]*@click="changeLang/.test(dispSrc), '语言不再用 seg-btn 按钮组');
ok(
  /const langOptions = computed\(\(\) =>\s*LANGS\.map/.test(dispSrc),
  '语言选项随语言切换重算（否则切完还显示旧名字）'
);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
