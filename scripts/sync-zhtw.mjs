/**
 * 繁体字典同步：渲染层 + 主进程，一次跑完。
 *
 * 为什么要两条链路都覆盖：
 *   渲染层是 `export default { ... }`，主进程是 `module.exports = { ... }`；
 *   前者还有跨行字符串（用 + 拼接），后者同一行写完。只用一条正则扫两边，
 *   跨行那些条目会被静默跳过，停在旧译——回归时才暴露。
 *
 * 口径见 electron/verify/tw-han-map.mjs：只转字形，不改用词。
 *
 * 运行：node scripts/sync-zhtw.mjs          预演
 *       node scripts/sync-zhtw.mjs --write  落盘
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toTw } from '../electron/verify/tw-han-map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');

const RENDER = [
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
const MAIN = ['sys', 'menu'];

/** 按 JS 字面量规则转义：\ → \\ ，' → \' ，换行 → \n（先反斜杠后引号，顺序不能反） */
const esc = s => toTw(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');

let folded = 0; // 跨行条目将被压平为单行（格式变化提示，不是「值不符」）
let changed = 0; // 值不符条目数（第二循环统计）
let untouched = 0;
let added = 0; // zh-TW 缺失、本次补入的键数（第三循环统计）

for (const [dir, doms] of [
  ['src/i18n/parts', RENDER],
  ['electron/i18n/parts', MAIN]
]) {
  for (const d of doms) {
    const zhPath = path.join(ROOT, dir, `${d}.zh-CN.js`);
    const twPath = path.join(ROOT, dir, `${d}.zh-TW.js`);
    const zh = (await import(`file://${zhPath}`)).default;
    const lines = fs.readFileSync(twPath, 'utf8').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const m = /^ {2}([A-Za-z0-9_]+):/.exec(lines[i]);
      if (!m || typeof zh[m[1]] !== 'string') {
        out.push(lines[i]);
        i++;
        continue;
      }
      const key = m[1];
      // 找到该条目结束：行尾以 ', 结尾（跨行条目会有多行）
      let j = i;
      while (j < lines.length && !lines[j].trimEnd().endsWith("',")) j++;
      if (j >= lines.length) {
        out.push(lines[i]);
        i++;
        continue;
      }
      out.push(`  ${key}: '${esc(zh[key])}',`);
      if (j > i) folded++;
      i = j + 1;
    }
    if (WRITE) fs.writeFileSync(twPath, out.join('\n'));
  }
}

/* ★ 漏键补齐（Beta.322 修）：上面那个循环只会「改写已经存在的行」，
 *   新增的 key 根本进不到 zh-TW 文件里 —— 表现为切到繁体后界面直接显示 key 名，
 *   而脚本还报「已一致」，因为它按下标逐行比对，多出来的键不在比对范围。
 *   这里把 zh-CN 里有、zh-TW 里没有的键补进去，位置紧跟它前一个已存在的同级键。 */
for (const [dir, doms] of [
  ['src/i18n/parts', RENDER],
  ['electron/i18n/parts', MAIN]
]) {
  for (const d of doms) {
    const zhPath = path.join(ROOT, dir, `${d}.zh-CN.js`);
    const twPath = path.join(ROOT, dir, `${d}.zh-TW.js`);
    const zh = (await import(`file://${zhPath}`)).default;
    const twSrc = fs.readFileSync(twPath, 'utf8');
    const twLines = twSrc.split('\n');
    const have = new Set(twLines.map(l => (/^ {2}([A-Za-z0-9_]+):/.exec(l) || [])[1]).filter(Boolean));
    const missing = Object.keys(zh).filter(k => typeof zh[k] === 'string' && !have.has(k));
    if (!missing.length) continue;
    added += missing.length;
    /* 逐键插入：找 zh-CN 里它前面最近一个「tw 里已有」的键，插到那行之后。
       前一个键找不到（说明是文件最前面的新键）就插到 export default { 之后。 */
    const zhKeys = Object.keys(zh);
    for (const key of missing) {
      const idx = zhKeys.indexOf(key);
      let anchor = -1;
      for (let p = idx - 1; p >= 0; p--) {
        const pk = zhKeys[p];
        if (have.has(pk)) {
          anchor = twLines.findIndex(l => new RegExp(`^ {2}${pk}:`).test(l));
          if (anchor >= 0) break;
        }
      }
      const line = `  ${key}: '${esc(zh[key])}',`;
      if (anchor >= 0) twLines.splice(anchor + 1, 0, line);
      else {
        const head = twLines.findIndex(l => /^export default \{/.test(l));
        twLines.splice(head + 1, 0, line);
      }
      have.add(key);
    }
    if (WRITE) fs.writeFileSync(twPath, twLines.join('\n'));
  }
}

// 统计实际变化行数（对比转换前后）
// 注意：与第一循环的 folded 严格分开——第一循环数的是「跨行条目将被
// 压平」的格式变化，本循环数的才是「值与 toTw 预期不符」的真实回归。
for (const [dir, doms] of [
  ['src/i18n/parts', RENDER],
  ['electron/i18n/parts', MAIN]
]) {
  for (const d of doms) {
    const zh = (await import(`file://${path.join(ROOT, dir, `${d}.zh-CN.js`)}`)).default;
    const tw = (await import(`file://${path.join(ROOT, dir, `${d}.zh-TW.js`)}`)).default;
    for (const k of Object.keys(zh)) {
      if (typeof zh[k] !== 'string') continue;
      if (toTw(zh[k]) === tw[k]) untouched++;
      else changed++;
    }
  }
}

console.log(
  `不符条目 ${changed}，已一致 ${untouched}` +
    (added ? `，补入缺失键 ${added}` : '') +
    (folded ? `（另有 ${folded} 个跨行条目${WRITE ? '已' : '将'}压平为单行，属格式变化）` : '') +
    (WRITE ? '（已写入）' : '（预演，加 --write 落盘）')
);
if (changed || added) process.exitCode = 1;
