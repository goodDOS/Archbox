/**
 * 编辑器 emoji 面板契约（Beta.322）。
 *
 * 【为什么单独一场】
 *   用户要求「把 emoji 添加进文档编辑栏」。这件事看着小，但踩坑点全在细节：
 *
 *   ① 图标必须来自图标库。项目硬规矩「图标只用库、不手绘」，漏了就会有人拿个
 *      「😀」字符当按钮 —— 它会跟着主题字号变化、在缺 emoji 字体的机器上显示方块。
 *   ② 读屏可达性：九个卡通脸对读屏用户是完全无法区分的一排按钮，
 *      每个格子必须带 aria-label（含具体字符）。
 *   ③ 分类标签必须走 i18n。若各语言各写一遍中文标签，切语言后就是中英混排。
 *   ④ 字符表是**唯一来源**：面板渲染与测试都读 src/utils/emoji.js，
 *      不允许在组件里再内联一份（否则两处会漂移）。
 *   ⑤ EmojiPicker 自己不能碰编辑器实例。它只 emit，由 PostView 用 chainRun 插入，
 *      这样插入自动进撤销栈、与其它工具栏命令同一路径。
 *
 * 运行：node electron/verify/emoji-picker.test.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness } from './_harness.mjs';
import { EMOJI_GROUPS } from '../../src/utils/emoji.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { ok, section, done } = createHarness();
const read = p => readFileSync(path.join(root, p), 'utf8');

const pickerSrc = read('src/components/post/EmojiPicker.vue');
const postViewSrc = read('src/pages/PostView.vue');
const postZh = read('src/i18n/parts/post.zh-CN.js');
const iconsSrc = read('src/components/icon-antd.js');
const genIconsSrc = read('scripts/gen-icons.mjs');

/* ---------- 1. 字符表 ---------- */
section('1. 字符表（src/utils/emoji.js 是唯一来源）');
ok(Array.isArray(EMOJI_GROUPS) && EMOJI_GROUPS.length >= 8, `分类数 ${EMOJI_GROUPS.length}（≥8）`);
const total = EMOJI_GROUPS.reduce((n, g) => n + g.items.length, 0);
ok(total >= 400, `字符总数 ${total}（≥400，够日常写作用）`);

const keys = EMOJI_GROUPS.map(g => g.key);
ok(new Set(keys).size === keys.length, '分类 key 无重复');
ok(keys[0] === 'frequent', '第一组是「常用」（面板打开即可点，不用先翻分类）');
ok(
  EMOJI_GROUPS.every(g => g.items.length >= 5),
  '每组至少 5 个字符（避免空组或摆设组）'
);

/* 字符表里不能有非 emoji 的“字符”：所有条目都必须是单个 grapheme（含 ZWJ 组合） */
const badItems = [];
for (const g of EMOJI_GROUPS) {
  for (const e of g.items) {
    if (typeof e !== 'string' || !e.length) badItems.push(`${g.key}:空`);
    // ZWJ 组合（如 🧑‍💻）长度大于 1 是正常的；这里只挡掉空白与纯 ASCII
    else if (/^\s*$/.test(e) || /^[A-Za-z0-9]$/.test(e)) badItems.push(`${g.key}:${e}`);
  }
}
ok(badItems.length === 0, '无空白/纯 ASCII 条目' + (badItems.length ? ' → ' + badItems.slice(0, 5).join(',') : ''));

const dupes = [];
// 常用组与其它组刻意允许重复（常用就是从各类里挑出来的），只查同组内重复
const innerDupes = [];
for (const g of EMOJI_GROUPS) {
  if (new Set(g.items).size !== g.items.length) innerDupes.push(g.key);
}
ok(innerDupes.length === 0, '同组内无重复字符' + (innerDupes.length ? ' → ' + innerDupes.join(',') : ''));

/* ---------- 2. 组件不内联字符表、不碰编辑器实例 ---------- */
section('2. 组件边界');
ok(/from '\.\.\/\.\.\/utils\/emoji'/.test(pickerSrc), 'EmojiPicker 从 utils/emoji 引入字符表（不内联副本）');
ok(!/😀|👍|❤️/.test(pickerSrc), '★ 组件源码里没有内联 emoji 字面量（否则与字符表两处漂移）');
ok(/defineEmits\(\['pick'\]\)/.test(pickerSrc), '只 emit pick，不自己插入');
ok(
  !/useEditor|editor\.value|\.chain\(\)/.test(pickerSrc),
  '★ EmojiPicker 不持有编辑器实例（插入统一由宿主 chainRun 执行）'
);

/* ---------- 3. 图标来自库 ---------- */
section('3. 图标来源');
ok(/'face-smile':\s*\[/.test(genIconsSrc), 'gen-icons.mjs 登记了 face-smile（图标只用库，不手绘字符）');
/* 引号风格兼容两种：原始 JSON.stringify 产出双引号，仓库整体过 prettier 后是单引号。
   断言的本意是「face-smile 在产物里」，不是引号风格 —— 两种都放行。 */
ok(/^ {2}["']face-smile["']: \{/m.test(iconsSrc), '生成的 icon-antd.js 含 face-smile');
ok(/<Icon name="face-smile"/.test(pickerSrc), '组件用的是 Icon 组件而非 emoji 字符当图标');

/* ---------- 4. 可访问性 ---------- */
section('4. 可访问性');
ok(/:title="t\('post\.tbEmoji'\)"/.test(pickerSrc), '触发器有 title（经 t()）');
ok(/:aria-label="t\('post\.tbEmoji'\)"/.test(pickerSrc), '★ 触发器有 aria-label（纯图标按钮唯一可读线索）');
ok(/aria-haspopup="dialog"/.test(pickerSrc), '触发器声明 aria-haspopup="dialog"');
ok(
  /:aria-label="t\('post\.emojiInsertHint',\s*\{\s*e\s*\}\)"/.test(pickerSrc),
  '★ 每个格子带具体字符的 aria-label（一排卡通脸对读屏用户必须可区分）'
);
ok(/role="tablist"/.test(pickerSrc) && /role="tab"/.test(pickerSrc), '分类栏用 tablist/tab 语义');
ok(/:aria-selected="/.test(pickerSrc), '分类按钮带 aria-selected');

/* ---------- 5. 交互与主题 ---------- */
section('5. 交互约定');
ok(/computeFixedPosition/.test(pickerSrc), '弹层定位复用 computeFixedPosition（不另写一套）');
ok(/Teleport to="body"/.test(pickerSrc), '弹层 Teleport 到 body（sticky 页头里绝对定位会错位）');
ok(/name="pop-mask"/.test(pickerSrc) && /name="pop"/.test(pickerSrc), '复用全局 pop / pop-mask 进出动画');
ok(/Escape/.test(pickerSrc), 'Esc 可关闭');
ok(/stopPropagation/.test(pickerSrc), '★ Esc 在本组件内 stopPropagation（否则会连带动到全局查找栏/弹窗）');
ok(/navigator\.clipboard\.writeText/.test(pickerSrc) === false, '组件本身不做剪贴板（由宿主统一处理）');
const pickerStyle = pickerSrc.split('<style')[1] || '';
ok(!/#[0-9a-fA-F]{3,8}\b/.test(pickerStyle.replace(/\/\*[\s\S]*?\*\//g, '')), '★ 样式无硬编码色值（8 套主题通吃）');
ok(/var\(--surface\)/.test(pickerStyle) && /var\(--accent\)/.test(pickerStyle), '配色全走 CSS 变量');

/* ---------- 6. 宿主接入 ---------- */
section('6. PostView 接入');
ok(/import EmojiPicker from '\.\.\/components\/post\/EmojiPicker\.vue'/.test(postViewSrc), 'PostView 已引入');
ok(/<EmojiPicker[\s\S]{0,120}@pick="onEmojiPick"/.test(postViewSrc), '已挂 pick 事件');
ok(/<EmojiPicker[\s\S]{0,120}:disabled="!store\.writable"/.test(postViewSrc), '★ 只读态禁用（与其它工具栏按钮同口径）');
/* 插入走 chainRun：自动进撤销栈，与加粗/列表等命令同一条路径 */
const onPick = (/async function onEmojiPick\(([\s\S]*?)\n\}/.exec(postViewSrc) || [null, ''])[1];
ok(/chainRun\(c => c\.insertContent\(emoji\)\)/.test(onPick), '★ 插入走 chainRun + insertContent（进撤销栈）');
ok(/navigator\.clipboard\.writeText\(emoji\)/.test(onPick), '复制模式写系统剪贴板');
ok(/setRestoreFocus/.test(onPick), '★ 插入前把焦点还给编辑器（否则面板关掉后光标丢失）');

/* ---------- 7. i18n 三语齐全 ---------- */
section('7. i18n');
const EMOJI_KEYS = [
  'tbEmoji',
  'emojiCategories',
  'emojiInsertHint',
  'emojiCopyMode',
  'emojiCopied',
  'emojiCopyFailed',
  ...EMOJI_GROUPS.map(g => 'emojiCat' + g.key.charAt(0).toUpperCase() + g.key.slice(1))
];
const missZh = EMOJI_KEYS.filter(k => !new RegExp(`^ {2}${k}:`, 'm').test(postZh));
ok(
  missZh.length === 0,
  `post.zh-CN 有全部 ${EMOJI_KEYS.length} 个键` + (missZh.length ? ' → 缺：' + missZh.join(',') : '')
);

const LANGS = ['zh-TW', 'en', 'ja', 'ko', 'ar', 'ru', 'fr', 'de', 'is'];
const missLangs = [];
for (const lg of LANGS) {
  const src = read(`src/i18n/parts/post.${lg}.js`);
  const miss = EMOJI_KEYS.filter(k => !new RegExp(`^ {2}${k}:`, 'm').test(src));
  if (miss.length) missLangs.push(`${lg}(${miss.length})`);
}
ok(missLangs.length === 0, `★ 其余 9 语同步齐全` + (missLangs.length ? ' → 缺：' + missLangs.join(', ') : ''));

/* 繁体与简体逐字对应（由 sync-zhtw 保证，这里做抽检） */
const twSrc = read('src/i18n/parts/post.zh-TW.js');
ok(/emojiCatSymbols: '符號'/.test(twSrc), '繁体「符号」→「符號」（逐字转字形）');

done();
