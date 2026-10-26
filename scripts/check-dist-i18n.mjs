/**
 * 构建后体检：产物里只允许存在**当前**字典，且繁体必须是简体字形转写。
 *
 * 为什么需要这一步（Beta.276 实测）：
 * 打包器把 `src/i18n/parts/*.zh-TW.js` 的模块体额外内联了一份到产物里，形成
 * `Vf = { common: …, shell: … }` 这类「定义后再无引用」的死字典 —— 上一代台湾化译法
 * （儲存／稽核／介面／網路／資料夾）因此留在包里，grep 与二进制扫描都会判成
 * 「语言包没换干净」，包体也白胖 6 KB。源码里搜不到这些串（`grep -r 儲存 src/` 为空），
 * 只能在产物上处理。
 *
 * 判定方式：**结构签名聚类**，不靠词表。
 *   压缩产物里每个字典对象都有一组稳定的顶层键（`title,desc,purgeAll,…` /
 *   `common,shell,home,…`）。同一份字典在产物里出现两次时，两份的键序列完全相同。
 *   同签名里「有活引用」的那份留下，其余且块外零引用的剔除。
 *   早先按「块内含旧译词」判定漏掉过一整份回收站旧字典（它的旧译是
 *   「資源回收筒／文件／還原」，一个黑名单词都不沾），所以改成看结构。
 *
 * 两轮清理：
 *   1. 聚合对象（`{common:…,shell:…}`）先处理，避免先删子字典再删聚合时索引失效；
 *   2. 单域字典。
 *
 * 安全阀：每一步都要求修剪后语法仍成立、体积只减不增；不满足就跳过并告警。
 * 清理后仍残留旧译 → **中止打包**（说明字典本身没重建干净，不能靠剪枝掩盖）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 台湾化旧译：这些词在「简体原文」里根本不存在，出现即是上一代译法的残留。
// 注意别把「儲存」放进黑名单：简体原文里就有「数据储存」这种写法，
// 逐字转形的结果本来就是「數據儲存」，它不是意译。
const STALE = ['稽核', '介面', '網路', '資料夾', '檔案'];
// 上一代台湾化译法里「换个词」而不是「换字形」的那批
const STALE_ZH_TW = ['資源回收筒', '實體清除', '檢視', '檔案', '資料夾', '網路', '介面', '稽核'];

const hasStaleText = s => STALE.some(w => s.includes(w)) || STALE_ZH_TW.some(w => s.includes(w));

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
const DOM = DOMAINS.join('|');
const isDomain = k => DOMAINS.includes(k);

const file = path.resolve(process.argv[2] || 'dist', 'index.html');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!fs.existsSync(file)) {
  console.error(`[i18n-check] 找不到 ${file}`);
  process.exit(1);
}

let html = fs.readFileSync(file, 'utf8');
const size0 = html.length;

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 从 `start` 处的 `{` 起做括号配平 */
function braceEnd(src, start) {
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 块内顶层键序列 —— 字典的「指纹」 */
function keySig(blk) {
  const out = [];
  const re = /([A-Za-z_$][\w$]*):/g;
  let m;
  while ((m = re.exec(blk))) {
    let d = 0;
    for (let k = 0; k < m.index; k++) {
      const c = blk[k];
      if (c === '{' || c === '[') d++;
      else if (c === '}' || c === ']') d--;
    }
    if (d === 1) out.push(m[1]);
  }
  return out;
}

/** 该标识符在 `[a, b)` 之外还有没有出现（判断「块外零引用」用）。
 *  必须全局扫 + 后行断言：切片后 indexOf 会把 `$f` 判进 `$host:e=>` 里。 */
function refsOutside(src, name, a, b) {
  const re = new RegExp(`(?<![\\w$])${escRe(name)}(?![\\w$])`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(src))) if (m.index < a || m.index >= b) out.push(m.index);
  return out;
}

/** 该位置是否是 `{ … <domain>: <name> }` 里的聚合引用。
 *  ★ 一律用「从头切到 pos」再锚 `$` 判尾部：早先用 `slice(pos-20, pos)` 开窗，
 *    `common:xf,shell:Sf,home:` 正好 25 字符，窗口把开头的 `,` 截掉了，判定恒为 false ——
 *    所有待删字典因此都被当成「仍被聚合引用」而拒不删除。
 *  ★ 也不能在 `:` 后写 ` ?$`：那样同样要求末尾有空格，压缩产物是 `home:Af` 没有空格。 */
function isAggRef(src, pos) {
  return new RegExp(`[{,] ?(?:${DOM}):$`).test(src.slice(0, pos));
}

/** 该位置是否是 `{ "zh-CN": ko, "zh-TW": ah, en: bh }` 这类语言→字典映射里的引用。
 *  ★ 只看前缀，不要看后一位：`pos` 是标识符起点，后面紧跟的就是标识符本身，
 *    早先那条 `^[\s,}]` 因而永远为 false，映射表引用被当成活引用，旧聚合对象删不掉。 */
function isMapRef(src, pos) {
  return /["']?(?:zh-CN|zh-TW|en)["']?:$/.test(src.slice(0, pos));
}

/** 真·活引用：不是聚合表项、也不是语言映射表项 */
function liveRefs(src, name, a, b) {
  return refsOutside(src, name, a, b).filter(p => !isAggRef(src, p) && !isMapRef(src, p));
}

function syntaxOk(src) {
  const a = src.indexOf('<script');
  const b = src.lastIndexOf('</script>');
  if (a < 0 || b < 0) return false;
  try {
    new Function(src.slice(a, b).replace(/^<script[^>]*>/, ''));
    return true;
  } catch {
    return false;
  }
}

/** 摘掉 `[at, end]` 这段，顺带吃掉一侧的分隔符（`}, ` 或 `},`）。
 *  只吃一侧：两侧都吃会剩 `… time: Uf Vf = {`，语法直接崩。 */
function cutBlock(src, at, end) {
  let from = at;
  let to = end + 1;
  if (src[to] === ',') {
    to += 1;
    if (src[to] === ' ') to += 1;
  } else if (from >= 3 && src.slice(from - 3, from) === '}, ') from -= 3;
  else if (from >= 1 && src[from - 1] === ',') from -= 1;
  return src.slice(0, from) + src.slice(to);
}

// ---- 候选块：顶层键 >= 4 的中等对象（太小的是配置/图标之类，别乱动） ----
function scanBlocks(src) {
  const out = [];
  // `\b` 前面不能再接 `.`：`window.__postFind={…}` 这种挂在对象上的成员赋值不是字典，
  // 早先按裸标识符匹配把 `__postFind` 也收了进来，删它必崩语法，只能报警跳过刷屏。
  const re = /(?<![.\w$])([A-Za-z_$][\w$]*) ?= ?\{/g;
  let m;
  while ((m = re.exec(src))) {
    const at = m.index;
    const end = braceEnd(src, at);
    if (end < 0) continue;
    // 不跳 lastIndex：压缩产物里 `…},Xf={…}` 首尾相连，跳过去会把紧邻的下一个字典漏掉，
    // 于是同签名里只剩 1 份、「活引用」判断也就跟着错，最终删掉在用的那一份。
    const blk = src.slice(at, end + 1);
    if (blk.length > 30000) continue;
    const keys = keySig(blk);
    if (keys.length < 4) continue;
    out.push({ name: m[1], at, end, sig: keys.join(','), keys });
  }
  return out;
}

// 聚合对象先删：它内部引用的是子字典，先处理子字典会让聚合对象的边界判断失效
const isAggBlock = b => b.keys.every(isDomain);

/** 把语言映射表里指向 `name` 的整项摘掉（`{"zh-TW": Vf,` → 删掉这一段） */
function dropMapEntries(src, name) {
  const re = new RegExp(`(["']?(?:zh-CN|zh-TW|en)["']?:\\s*)${escRe(name)}(\\s*,?\\s*)`, 'g');
  const next = src.replace(re, (_, _k, tail) => (tail.includes(',') ? '' : tail));
  return syntaxOk(next) ? next : src;
}

/** 该标识符是不是当前语言映射表里指向的那份（`{"zh-TW": ah}` 里的 ah） */
function isMapTarget(src, name) {
  const re = new RegExp(`["']?(?:zh-CN|zh-TW|en)["']?: ?${escRe(name)}(?![\\w$])`, 'g');
  return re.test(src);
}

/* ★★ Beta.279 事故复盘：体检脚本曾把**繁体中文字典整份删掉** ★★
 *
 * 现象：构建日志写「繁体无旧译残留」，实际包里根本没有繁体 —— 切繁体后所有词条
 *   都回退成简体（t() 的回退链是 当前语言 → zh-CN → key）。
 *
 * 根因：`isMapTarget` 原来只要「某处出现过 `zh-TW: xxx`」就算映射表指向。
 *   而产物里除了语言映射表 `{"zh-CN":xo,"zh-TW":??,en:nh}`，还有语言选项列表
 *   `[{key:"zh-TW",name:"繁體中文"},…]` —— 它同样含 `zh-TW`。
 *   打包时 zh-TW 分支被折叠/内联成 `{"zh-CN":xo,en:nh}`（zh-TW 与 zh-CN 同引用），
 *   映射表里再无 `zh-TW:` 字样，于是：
 *     · 繁体聚合对象 nh 不被认作「当前在用」（pickKeep 落到「块内无旧译」那份）；
 *     · 下一轮垃圾回收判它「块外零引用」→ 整块剪掉；
 *     · 体检只查「有没有旧译词」，删掉之后自然一个都没有 → 报「无残留」，绿灯。
 *
 * 修法两条，缺一不可：
 *   ① 认「当前字典」改为**正向求解**：先定位语言映射表对象，把里面所有值标识符
 *      （不论 key 写成 zh-TW 还是被折叠）全当活引用。这样即使 zh-TW 分支被折叠，
 *      它的值（= 繁体聚合对象）依然在白名单里。
 *   ② 删完之后**自检**：被删的块里若含有任一简繁差异字（S2T 表里的繁体字形），
 *      说明删掉的是一份真正的繁体字典，立即回滚该删除并报错退出，绝不静默。
 *      宁可包大几 KB，也不能让繁体在包里消失 —— 这是"删对了"和"删惨了"的分界线。
 */

/* ---- 简体↔繁体字形差异表（与 electron/verify/tw-han-map.mjs 同一口径） ---- */
const TW_CHARS = (() => {
  try {
    const p = new URL('../electron/verify/tw-han-map.mjs', import.meta.url);
    const src = fs.readFileSync(p, 'utf8');
    const m = src.match(/S2T_CHARS\s*=\s*['"]([^'"]+)['"]/);
    if (!m) return '';
    // 表是「简繁」成对拼接的字符串，取其奇数位字符即繁体字形集合
    return m[1]
      .split('')
      .filter((_, i) => i % 2 === 1)
      .join('');
  } catch {
    return '';
  }
})();
const TW_SET = new Set(TW_CHARS.split(''));
/** 文本里出现的简繁差异字数（含 0 说明是纯简体/英文，删了也不至于丢繁体） */
const twCharCount = s => {
  let n = 0;
  for (const ch of s) if (TW_SET.has(ch)) n++;
  return n;
};

/** 语言映射表里所有值的标识符：`{"zh-CN":xo,"zh-TW":ah,en:nh}` → [xo, ah, nh]
 *  这是判定「谁是当前字典」的**唯一权威**。注意不能只认 `zh-TW:` 前缀 ——
 *  打包器会把与 zh-CN 同引用的分支折叠掉（`{"zh-CN":xo,en:nh}`），
 *  zh-TW 的字样随之消失，只认前缀就会把繁文字典当成孤儿删掉（Beta.279 事故）。 */
function currentDictNames(src) {
  const out = new Set();
  // 映射表对象本体：以任意语言 key 开头、内部全是「key: 标识符」
  const re = /\{[^{}]*"(?:zh-CN|zh-TW)"\s*:[^{}]*\}/g;
  let m;
  while ((m = re.exec(src))) {
    const body = m[0];
    if (!/["']?(?:zh-CN|zh-TW|en)["']?\s*:/.test(body)) continue;
    for (const v of body.matchAll(/["']?(?:zh-CN|zh-TW|en)["']?\s*:\s*([A-Za-z_$][\w$]*)/g)) {
      out.add(v[1]);
    }
  }
  return out;
}

/** 清理死字典：先把旧聚合对象整条拔掉，再逐轮清理掉出来的散件。
 *
 * 引用关系是环状的，单看一次「块外有没有引用」谁也删不动：
 *   活聚合 ko ──> xf（当前简体）
 *   旧聚合 ah ──> Vf（上一代繁体）
 *   ah 自己只被语言映射表 {"zh-TW": ah} 引用
 * 压缩产物里同一份字典常常躺了两三代（简体 / 上一代繁体 / 英文），
 * 所以按「**它引用的那套里确实混着旧字典**」来认旧聚合对象，认出来就连根拔。
 */
function collectGarbage(src) {
  let h = src;
  const log = [];
  const keptForTw = []; // 因含大量繁体字形而被守护下来的块（正常情况下应为空）

  const scan = () => {
    const g = new Map();
    for (const b of scanBlocks(h)) {
      if (!g.has(b.sig)) g.set(b.sig, []);
      g.get(b.sig).push(b);
    }
    return [...g.values()];
  };
  // 同一签名的组里，「当前在用」的那份是这么认的：
  //   1) 语言映射表 `{"zh-TW": ah}` 指向的那份是**当前**字典，必须留下 ——
  //      它引用的子字典可能是旧的（打包器内联了上一代 trash），但聚合表本身在线上；
  //   2) 其次优先取真活代码引用的那份；
  //   3) 再次排除块内含旧译词的那份（旧副本的 title 还写着「資源回收筒」）；
  //   4) 都排除不掉才退化为取最后一份。
  // 语言映射表指向的标识符集合（每轮重算：h 在删块后变化）
  let curDicts = new Set();
  const pickKeep = list => {
    const mapped = list.filter(b => curDicts.has(b.name) || isMapTarget(h, b.name));
    if (mapped.length) return mapped[mapped.length - 1];
    const notStale = list.filter(b => !hasStaleText(h.slice(b.at, b.end + 1)));
    const pool = notStale.length ? notStale : list;
    const withLive = pool.filter(b => liveRefs(h, b.name, b.at, b.end + 1).length);
    return withLive.length ? withLive[withLive.length - 1] : pool[pool.length - 1];
  };

  // ---- 第一阶段：旧聚合对象连根拔 ----
  curDicts = currentDictNames(h);
  for (const list of scan()) {
    const agg = list.filter(b => isAggBlock(b));
    if (!agg.length) continue;
    const keepAgg = pickKeep(agg);
    for (const a of agg) {
      if (a.name === keepAgg.name) continue;
      // 映射表引用不算「有人用」：`{"zh-TW": ah}` 本身就是旧字典的挂号处，
      // 不把它当活的，否则 ah 永远删不掉（踩过：所有分支都返回 false，一轮删 0 个）。
      if (liveRefs(h, a.name, a.at, a.end + 1).length) continue;
      // 它引用的子字典：逐个在「它自己所属的签名组」里找对应的同名块，看是不是旧货
      const subs = [
        ...h.slice(a.at, a.end + 1).matchAll(new RegExp(`[{,] ?(?:${DOM}): ?([A-Za-z_$][\\w$]*)`, 'g'))
      ].map(m => m[1]);
      if (!subs.length) continue;
      const staleSub = subs.filter(n => {
        const own = scan().find(l => l.some(b => b.name === n));
        if (!own || own.length < 2) return false;
        return pickKeep(own).name !== n; // 它不是这一组里保下来的那份，就是旧货
      });
      // 只在「这套引用里确实混着旧字典」时才连根拔，避免误伤活字典
      if (!staleSub.length) continue;
      // 守护：待删块若仍是繁体字形密集的（非区块含繁字数 ≥ 40），它是真繁文字典，不删
      const guard = twCharCount(h.slice(a.at, a.end + 1));
      if (guard >= 40) {
        keptForTw.push({ name: a.name, tw: guard });
        continue;
      }
      const next = cutBlock(h, a.at, a.end);
      if (next.length >= h.length || !syntaxOk(next)) continue;
      log.push({ name: a.name, bytes: h.length - next.length, agg: true });
      h = next;
      h = dropMapEntries(h, a.name);
    }
  }

  // ---- 第二阶段：剩下的散件按轮清 ----
  // 组里只剩一份、块外零引用、不是语言映射表指向的那份 —— 就是旧聚合被拔掉后留下的孤儿。
  for (let round = 0; round < 60; round++) {
    let changed = false;
    curDicts = currentDictNames(h);
    for (const list of scan()) {
      for (const b of list) {
        if (isMapTarget(h, b.name)) continue; // 当前繁体/简体/英文用的就是它
        if (refsOutside(h, b.name, b.at, b.end + 1).length) continue; // 还有地方引用，不归这轮管
        // 守护：同上 —— 含大量繁体字形说明它是一份真繁文字典，宁可留着也不删
        const guard = twCharCount(h.slice(b.at, b.end + 1));
        if (guard >= 40) {
          keptForTw.push({ name: b.name, tw: guard });
          continue;
        }
        const next = cutBlock(h, b.at, b.end);
        if (next.length >= h.length || !syntaxOk(next)) {
          console.warn(`[i18n-check] ${b.name} 形态可疑，跳过（不冒险改产物）`);
          continue;
        }
        log.push({ name: b.name, bytes: h.length - next.length, agg: isAggBlock(b) });
        h = next;
        changed = true;
        break;
      }
      if (changed) break;
    }
    if (!changed) break;
  }

  return { html: h, log, keptForTw };
}

const { html: cleaned, log: done, keptForTw } = collectGarbage(html);
html = cleaned;

for (const d of done) {
  console.log(`[i18n-check] 剔除${d.agg ? '旧聚合对象' : '旧字典死副本'} ${d.name}（${d.bytes} 字节）`);
}
for (const k of keptForTw) {
  console.log(`[i18n-check] 保留疑似繁文字典 ${k.name}（含 ${k.tw} 个繁体字形，不冒险删）`);
}

// 先落盘再判定：判定失败会 exit(1)，若写盘在后，清理结果永远落不了盘
fs.writeFileSync(file, html);

// ---- 仍残留旧译 → 中止打包 ----
const left = STALE.map(w => [w, (html.match(new RegExp(w, 'g')) || []).length]).filter(([, n]) => n > 0);
if (left.length) {
  console.error('[i18n-check] 产物仍含台湾化旧译：' + left.map(([w, n]) => `${w}×${n}`).join(' '));
  console.error('[i18n-check] 这些条目落在活字典里，不能靠剪枝解决；请执行 npm run i18n:sync 重建繁体字典后重新打包');
  process.exit(1);
}

/* ---- 反向自检：繁体字典必须**全量**在产物里（Beta.279 事故的验收线）----
 *
 * 上一版只检查「有没有旧译词」，于是把繁体整份删光之后检查反而全绿 ——
 * 这是最危险的一类假通过：报告说没问题，功能已经全坏。
 *
 * 现在的判据是正面的：把 16 个 parts/*.zh-TW.js 的**每一条**词条都拿来在产物里找，
 * 一条都找不到就判失败。为什么是逐条而不是抽样：抽样靠运气，逐条才是证明。
 *
 * 【比对口径的两个坑，都踩过】
 *   ① 产物里字符串经过序列化，原文里的反斜杠（Windows 路径 `\data`）会变成 `\\data`，
 *      拿源码原文直接 includes 会误判成「缺失」。故原文与「JSON 转义后的形态」都试一次。
 *   ② 不能拿「简体字串」当判据去搜产物 —— 简体在，不代表繁体在；
 *      反过来也一样。只认 zh-TW 文件里的原值。
 */
{
  const DOMS = [
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
  const missing = [];
  let total = 0;
  for (const d of DOMS) {
    const p = path.join(root, 'src', 'i18n', 'parts', `${d}.zh-TW.js`);
    if (!fs.existsSync(p)) {
      missing.push(`${d}: 文件不存在`);
      continue;
    }
    let mod;
    try {
      mod = (await import(pathToFileURL(p).href)).default;
    } catch (e) {
      missing.push(`${d}: 无法加载（${e.message}）`);
      continue;
    }
    for (const [k, v] of Object.entries(mod)) {
      if (typeof v !== 'string') continue;
      total++;
      // 原样 或 JSON 转义后形态 命中即算在
      const esc = JSON.stringify(v).slice(1, -1);
      if (!html.includes(v) && !html.includes(esc)) missing.push(`${d}.${k}`);
    }
  }
  if (missing.length) {
    console.error(
      `[i18n-check] ★ 繁体中文字典缺失 ${missing.length} 条（共 ${total} 条）：` +
        missing.slice(0, 8).join(' , ') +
        (missing.length > 8 ? ' …' : '')
    );
    console.error('[i18n-check] 用户切繁体后会整片回退成简体。');
    console.error('[i18n-check] 常见原因：① index.html 被上次产物覆盖，构建把旧产物当输入；');
    console.error('[i18n-check]           ② 压缩器把 zh-TW 模块图 tree-shake 掉了（见 src/i18n/index.js 注释）。');
    process.exit(1);
  }
  console.log(`[i18n-check] 繁体字典完整：${total} 条词条全部在产物内（16 域）`);
}

console.log(
  `[i18n-check] dist/index.html ${(size0 / 1024).toFixed(2)} kB -> ${(html.length / 1024).toFixed(2)} kB，繁体无旧译残留`
);
