/**
 * 维护脚本：由 {域}.zh-CN.js 重算 {域}.zh-TW.js 的**字形**（不改用词）。
 *
 * 口径：繁体就是简体逐字转字形。「保存」在两种语言里都叫「保存」，不改成「儲存」；
 * 「数据」不改「資料」、「文档」不改「檔案」、「网络」不改「網路」。同一概念在两种
 * 语言下只有一个名字，用户切语言不必重学术语。
 *
 * 两级转换（缺一不可）：
 *   1. 词组表 —— 「复/注/并/钟」是一简对多繁的歧义字：
 *      复制→複製 但 恢复→恢復；合并→合併 但 并且→並且。按词定形，逐字切必然出错。
 *   2. 单字表 —— 其余字形一对一转（含台湾正字「為/啟」，不用大陆旧体「爲/啓」）。
 *
 * 实现要点：**不按行改写**。字典里有跨行字符串，逐行处理会把换行留在引号外破坏语法
 * （踩过：shell 的 integrityRebuildConfirmBody）。改为按字符串字面量边界扫描，
 * 只改值区间；键序、注释、空行、缩进原样保留，diff 只有值的变化。
 *
 * 依赖：/tmp/twtable.json（由维护者用 OpenCC 单字层生成，见 README 说明）。
 * 之所以不把 opencc 装成开发依赖：它只为这一次性维护存在，装进项目会让 CI 多一份不确定性。
 *
 * 运行：node scripts/gen-zhtw.mjs          预演
 *       node scripts/gen-zhtw.mjs --write  落盘
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOMAINS = [
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
];
const WRITE = process.argv.includes('--write');

const { chars, phrases } = JSON.parse(fs.readFileSync('/tmp/twtable.json', 'utf8'));
const S2T = new Map();
for (let i = 0; i + 1 < chars.length; i += 2) S2T.set(chars[i], chars[i + 1]);
const PHRASES = Object.entries(phrases).sort((a, b) => b[0].length - a[0].length);

/** 先按词定形，再把剩下的字逐个转 */
function toTw(s) {
  // 用占位符锁住已定形的词，避免其内部字被第二次替换
  const holes = [];
  let out = s;
  for (const [zh, tw] of PHRASES) {
    if (!out.includes(zh)) continue;
    out = out.split(zh).join(`\u0000${holes.length}\u0000`);
    holes.push(tw);
  }
  out = [...out].map(c => S2T.get(c) || c).join('');
  // NUL（\u0000）作为占位符标记，是有意为之，非控制字符注入
  // eslint-disable-next-line no-control-regex
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => holes[Number(i)]);
}

let total = 0;
const skipped = [];

const ZH = {};
for (const d of DOMAINS) {
  ZH[d] = (await import(`file://${path.join(ROOT, `src/i18n/parts/${d}.zh-CN.js`)}`)).default;
}

for (const d of DOMAINS) {
  const twPath = path.join(ROOT, `src/i18n/parts/${d}.zh-TW.js`);
  let src = fs.readFileSync(twPath, 'utf8');
  const re = /(\n {2,4})([A-Za-z0-9_]+): '((?:[^'\\\n]|\\.)*)'/g;
  const edits = [];
  let m;
  while ((m = re.exec(src))) {
    const [, indent, key, raw] = m;
    const start = m.index + indent.length + key.length + 3;
    // ★ 输入取自 **zh-CN**，不是当前 zh-TW：繁体是「由简体生成」的结果，
    //   拿现有繁体当输入只会把它自己原地转一遍（儲存 → 儲存），永远改不掉旧译法。
    const simplified = ZH[d][key];
    if (typeof simplified !== 'string') continue;
    // 换行在源码里写成 \n 两个字符，转字形前先还原成真实换行（换行本身不参与转换），
    // 转完再转义回去——否则带换行的条目只能跳过，永远停在旧译（踩过）。
    // 写回源码需按 JS 字面量规则重新转义：先 ' 再 \\（顺序不能反，
    // 否则会把 \\n 的转义又加倍一次），换行最后压成 \\n。
    // 反斜杠这一条踩过：路径「Archbox\data」在生成后变成了「Archboxdata」，
    // 因为简体值里的 \\ 被当普通字符写出去，JS 解析时又把 \d 吃掉了。
    const want = toTw(simplified).replace(/'/g, "\\'").replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
    if (want === raw) continue;
    edits.push({ start, end: start + raw.length, v: want });
  }
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    src = src.slice(0, e.start) + e.v + src.slice(e.end);
    total++;
  }
  if (WRITE) fs.writeFileSync(twPath, src);
}

console.log(`共 ${total} 条` + (WRITE ? '（已写入）' : '（预演，加 --write 落盘）'));
if (skipped.length) console.log('含真实换行的条目未处理（需人工核对）:', skipped.join(', '));
