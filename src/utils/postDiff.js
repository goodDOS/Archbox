/**
 * 文档版本对比算法（纯 ESM，零依赖，运行在渲染进程）。
 *
 * 用途：把「当前正文」与「某历史版本快照正文」做**段落级 + 段内标出增删**的比对，
 * 供 VersionDiffModal 并排展示。
 *
 * ── 为什么自己切段落，不用后端已有的 htmlToText（electron/db/core.js:48） ──
 *   htmlToText 是 `replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')`，
 *   会把 `<p>a</p><p>b</p>` 压成 `"a b"` —— **段落边界被摧毁**，
 *   而段落级正是本功能的核心需求。postdiff.test.mjs 用例 1 把这条钉死。
 *
 * ── 为什么算法跑在渲染进程 ──
 *   ① core.js 的 htmlToText 不可用（见上）；
 *   ② 渲染进程已有 detached DOM 解析先例（utils/sanitize.js:44-67）；
 *   ③ 输出经 Vue 文本插值渲染，**全程不碰 v-html** → 零 XSS 面。
 *
 * ── 语义坑（务必读） ──
 *   post_versions 存的是**改动前**的状态（saveVersion 在 UPDATE 之前调用），
 *   所以对比必须「历史快照 + 当前 content_html」两次读取，不存在「上一版」。
 */

export const MAX_PARAS = 2000;
export const MAX_TOKENS_PER_PARA = 4000;

// 块级标签：每个都是段落边界。行内标签（b/span/a…）不断段。
const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'BLOCKQUOTE',
  'PRE',
  'SECTION',
  'ARTICLE',
  'TR',
  'TD',
  'TH'
]);

const IMG_PLACEHOLDER = '[图片]';

/**
 * 正文里的图片在对比结果里的**原子标记**。
 *
 * ============ 为什么不再把图片拍成 "[图片]" 文本 ============
 * 用户明确要求「版本对比应当显示图片而不是占位符」。旧实现把 <img> 变成一段占位文本，
 * 于是对比结果里只剩「[图片]」几个字：换了一张图看不出来、改尺寸看不出来、
 * 甚至增删图片也只是多/少一行文字，得回去数。
 *
 * ============ 改成什么 ============
 * 段落文本里放一个不可见的分隔标记 + 一个短 id，图片本体另存在 paragraphs 返回的
 * images 表里（token → { src, alt }）。这样：
 *   · 文本 diff 仍按字符走（图片作为一个整体参与对齐，不会把 base64 拆成碎片）；
 *   · 界面拿到 diff 行后可以把 token 换成真正的 <img>。
 *
 * ★ 为什么 token 里放「按图源算出的短 id」而不是序号 ★
 *   同一张图在旧版和新版里必须得到**同一个** token，否则「这张图没变」
 *   会被判成「删一张 + 插一张」。所以 id 由 src 内容派生，与出现顺序无关。
 * ★ 为什么用不可见字符包起来 ★
 *   要保证 token 不与正文里的任何文字粘连（否则 tokenize 会把它当普通字母切碎）。
 *   用 U+0000 作边界：HTML 文本节点里不可能出现它，且 normText 不会把它归一成空格。
 */
/**
 * token 的边界字符 U+0000（NUL）。
 *
 * ★ 为什么是 NUL ★
 *   HTML 文本节点里不可能出现它（解析器把 NUL 当替换字符），
 *   正文的用户输入也无法构造它 —— 于是它永远不可能与真实文字混淆，
 *   用来做「不可见分隔符」是最稳的。
 * ★ 为什么用 String.fromCharCode(0) 而不是在正则里写字面量 ★
 *   ESLint 的 no-control-regex 会拦下任何含 \x00 的正则字面量（这条规则是对的：
 *   绝大多数情况下控制字符正则都是 bug）。这里是**唯一正当**的例外，
 *   所以用变量拼接，让规则不必为这一处开豁免口子。
 */
const NUL = String.fromCharCode(0);

const IMG_TOKEN_OPEN = NUL + 'IMG:';
const IMG_TOKEN_CLOSE = NUL;

/** 图片 token 的正则（供界面层把 token 换回 <img>） */
export const IMG_TOKEN_RE = new RegExp(`${NUL}IMG:([0-9a-f]{8})${NUL}`, 'g');

/**
 * 不带 `g` 标志的同源副本，专供「只判有无」的场景。
 *
 * ★ 为什么需要这个副本 ★
 *   带 `g` 的正则对象在 `.test()` / `.exec()` 之后会留下 lastIndex 状态：
 *   对同一个字符串连调两次 `.test()`，第二次从上一次停下的位置继续找，
 *   于是「有没有图片」的判定会时真时假。这类 bug 只在特定点击顺序下复现，
 *   极难排查。需要布尔结果的地方一律用这个无状态副本。
 */
const IMG_TOKEN_TEST = new RegExp(`${NUL}IMG:[0-9a-f]{8}${NUL}`);

/**
 * 由图片 src 派生一个稳定的 8 位短 id（FNV-1a 32 位）。
 * 同一张图（同 src）在任意版本里得到同一个 id —— 这是「未换图不算改动」的关键。
 */
function imgIdOf(src) {
  const s = String(src || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * 把一段文本里的图片 token 拆成片段，供界面渲染。
 * @returns {Array<{t:'text',text:string}|{t:'img',id:string,src:string,alt:string}>}
 *   images 表里查不到的 id（理论上不会发生）退化为文字占位符，绝不丢内容。
 */
export function splitImgTokens(text, images) {
  const s = String(text == null ? '' : text);
  const map = images || {};
  const out = [];
  let last = 0;
  // 每次进来重置：外部可能刚在别处用过同一正则对象
  IMG_TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = IMG_TOKEN_RE.exec(s))) {
    if (m.index > last) out.push({ t: 'text', text: s.slice(last, m.index) });
    const hit = map[m[1]];
    if (hit) out.push({ t: 'img', id: m[1], src: hit.src, alt: hit.alt || '' });
    else out.push({ t: 'text', text: '' });
    last = m.index + m[0].length;
  }
  IMG_TOKEN_RE.lastIndex = 0; // 用完复位，不让状态漏给下一个调用方
  if (last < s.length) out.push({ t: 'text', text: s.slice(last) });
  return out;
}

/** 段落里除图片 token 外是否还有别的文字（纯图片段 → true） */
export function isImgOnly(text) {
  const s = String(text == null ? '' : text);
  if (!IMG_TOKEN_TEST.test(s)) return false;
  return !s.replace(IMG_TOKEN_RE, '').trim();
}

/**
 * HTML → 段落数组。
 *
 * 规则：
 *  - 块级标签起新段；`<br>` 断段
 *  - 取 textContent（顺带自动解码 &amp; &lt; &nbsp; 等实体）
 *  - 空白归一 `\s+ → ' '` 后 trim。
 *    ★ 这一步至关重要：contenteditable 常重排折行，不归一会把「纯折行变化」
 *      误报成「改了」，这是最毁信任的假阳性。
 *  - 图片 → 占位文本（让增删可见；同位置换图不可见，属已知限制）。
 *    占位文本可经 opts.imgPlaceholder 注入（界面走 i18n），缺省为 '[图片]'。
 */
export function htmlToParagraphs(html, opts = {}) {
  return htmlToParagraphsEx(html, opts).paragraphs;
}

/**
 * htmlToParagraphs 的完整版：同时返回图片表与**每个段落自己的图片序号**。
 *
 * 【为什么需要「段落 → 图片序号」】
 *   段落数组是纯文本（全局第 N 张图 = 第 N 个 token）。但 diff 比对后会重新排序/增删，
 *   界面拿到的每个 op 只知道「旧段第 3 段、新段第 5 段」。若每格都从第一段开始数 token，
 *   计数就会错位（同一段被引用两次、或某段被插到前面），grid 里的 slot 号对不上。
 *   所以这里顺带给出 oldSlots/newSlots，由 diffParagraphs 带进每个 op，界面直接查表。
 *
 * @returns {{paragraphs:string[], images:Object<string,{src:string,alt:string}>,
 *            slots:Array<Array<{id:string, src:string, alt:string}>>}}
 */
export function htmlToParagraphsEx(html, opts = {}) {
  const src = String(html || '');
  if (!src.trim()) return { paragraphs: [], images: {}, slots: [] };
  if (typeof document === 'undefined') {
    // 无 DOM 环境（如误在主进程调用）：退化为正则剥标签，至少不崩。
    // 图片在这里退化成占位文本 —— 无 DOM 就没法拿到真实 src，属可接受降级。
    const imgPh = opts.imgPlaceholder || IMG_PLACEHOLDER;
    const paragraphs = src
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<img\b[^>]*>/gi, imgPh)
      .replace(/<\/?(p|div|h[1-6]|li|blockquote|pre|section|article|tr|td|th|br)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .split('\n')
      .map(normText)
      .filter(Boolean);
    return { paragraphs, images: {}, slots: paragraphs.map(() => []) };
  }
  const doc = document.implementation.createHTMLDocument('');
  const root = doc.createElement('div');
  root.innerHTML = src;
  return walkBlocks(root);
}

function normText(s) {
  return String(s == null ? '' : s)
    .replace(/[\s\u00a0\u3000]+/g, ' ')
    .trim();
}

function walkBlocks(node) {
  const out = [];
  /** 每段的图片序号：与 out 同步 flush，索引一一对应 */
  const slotList = [];
  /** 全篇图片表：短 id → { src, alt }（同一张图只存一份） */
  const images = {};
  /** 当前段已收集到的图片（按出现顺序），flush 时并入 slotList */
  let curSlots = [];
  let buf = '';

  /* ★ 图片必须作为「整段的一个 token 整体」写入文本，且不能参与空白归一 ★
   *   normText 会把连续空白压成一个空格，token 里没有空白，安全；
   *   但 token 前后若紧贴文字（`图<img>说明`），归一后仍连在一起 —— 这没关系，
   *   tokenize 遇到 \u0000 会单独切出来（见 imgTokenize 分支）。 */
  const flush = () => {
    // ★ 不能对整段做 normText 后再放 token：normText 只压空白，不删 \u0000，所以安全。
    //   但首尾 trim 会把 token 前后的空白吃掉，这正是我们要的（避免纯间距变化被判改动）。
    const t = normText(buf);
    if (t && !isImgOnly(t)) {
      // 段内有实际文字
      out.push(t);
      slotList.push(curSlots);
    } else if (curSlots.length) {
      // ★ 纯图片段（<p><img></p>）：文字全空但有图，必须单独成段 ★
      //   旧实现在这里会整段丢弃（因为 textContent 是空的），
      //   于是「单独的插图」在对比里完全不可见。
      out.push(curSlots.map(s => tokenOf(s.id)).join(''));
      slotList.push(curSlots);
    }
    buf = '';
    curSlots = [];
  };

  const walk = el => {
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3) {
        buf += child.nodeValue;
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName.toUpperCase();
      if (tag === 'IMG') {
        const src = child.getAttribute('src') || '';
        const id = imgIdOf(src);
        if (!images[id]) images[id] = { src, alt: child.getAttribute('alt') || '' };
        buf += tokenOf(id);
        curSlots.push({ id, src, alt: child.getAttribute('alt') || '' });
        continue;
      }
      if (tag === 'BR') {
        flush();
        continue;
      }
      if (tag === 'SCRIPT' || tag === 'STYLE') continue;
      const isBlock = BLOCK_TAGS.has(tag);
      if (isBlock) flush();
      walk(child);
      if (isBlock) flush();
    }
  };
  walk(node);
  flush();
  return { paragraphs: out, images, slots: slotList };
}

/** 图片 token 的统一写法：一处生成，避免开闭字符写歪 */
function tokenOf(id) {
  return `${IMG_TOKEN_OPEN}${id}${IMG_TOKEN_CLOSE}`;
}

/**
 * 段内切分：CJK 逐字 + 拉丁整词 + 空白独立成词。
 *
 * ★ 逐字是正确选择：中文改金额/日期/人名往往就是 1–2 个字（「100 万」→「120 万」），
 *   逐字恰好匹配「标出增删」的直觉；按词切反而连带高亮一整个词，看不出改了什么。
 *   不引入分词器依赖。
 */
export function tokenize(text) {
  const s = String(text == null ? '' : text);
  /* ★ 图片 token 必须整体作为一个切分单位（Beta.322）★
   *   正则里若按普通字符切，\u0000IMG:ab12cd34\u0000 会被拆成 [\u0000, IMG, :, ab12cd34, \u0000]，
   *   于是「换一张图」会被判成「改了 5 个片段」，绿红高亮一片碎屑。
   *   这里把整个 token 放在最前面作为最高优先级的备选分支。 */
  const re = new RegExp(`${NUL}IMG:[0-9a-f]{8}${NUL}|[一-鿿㐀-䶿豈-﫿]|[A-Za-z0-9]+|[ \\t]+|[^\\s]`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push(m[0]);
    if (m.index === re.lastIndex) re.lastIndex++; // 零宽保护
  }
  return out;
}

/** 剥掉公共前后缀，缩小 DP 规模（LCS 本身已能容忍移位，但省下的不只是时间） */
function stripCommonPrefixSuffix(a, b) {
  let s = 0;
  const maxS = Math.min(a.length, b.length);
  while (s < maxS && a[s] === b[s]) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  return { aMid: a.slice(s, ea), bMid: b.slice(s, eb), head: a.slice(0, s), tail: ea < a.length ? a.slice(ea) : [] };
}

/**
 * LCS 对齐 → 操作序列。
 * 返回 [{ type: 'equal'|'insert'|'delete'|'change', old: number|null, new: number|null }]
 */
function lcs(a, b) {
  const n = a.length;
  const m = b.length;
  // 0 行 0 列哨兵，全部指向同一格，避免分支
  const dp = new Int32Array((n + 1) * (m + 1));
  const W = m + 1;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * W + j] =
        a[i] === b[j] ? dp[(i + 1) * W + (j + 1)] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + (j + 1)]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', old: i, new: j });
      i++;
      j++;
    } else if (dp[(i + 1) * W + j] >= dp[i * W + (j + 1)]) {
      ops.push({ type: 'delete', old: i, new: null });
      i++;
    } else {
      ops.push({ type: 'insert', old: null, new: j });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: 'delete', old: i, new: null });
    i++;
  }
  while (j < m) {
    ops.push({ type: 'insert', old: null, new: j });
    j++;
  }
  return ops;
}

/** 段内 diff：返回 [{ t: 'eq'|'del'|'ins', text: string }]，已按展示顺序排好 */
export function diffTokens(oldText, newText) {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  // 超长段落不再细算：整体标记为「改」，避免 O(n·m) 爆掉
  if (a.length > MAX_TOKENS_PER_PARA || b.length > MAX_TOKENS_PER_PARA) {
    return [
      { t: 'del', text: String(oldText || '') },
      { t: 'ins', text: String(newText || '') }
    ];
  }
  const ops = lcs(a, b);
  const out = [];
  for (const op of ops) {
    if (op.type === 'equal') out.push(mkSeg('eq', a[op.old]));
    else if (op.type === 'delete') out.push(mkSeg('del', a[op.old]));
    else out.push(mkSeg('ins', b[op.new]));
  }
  /* 合并相邻同类 token，减少 DOM 节点。
   * ★ 图片 token 绝不能并进文字片段 ★（Beta.322）
   *   并进 text 后界面就只能把它当字符串输出，于是又变回「露出控制字符」或
   *   「整段只能显示成文字」。图片单独成段、带 id 与 side，模板才能渲染成 <img>。 */
  const merged = [];
  for (const seg of out) {
    const last = merged[merged.length - 1];
    if (seg.t === 'img') {
      merged.push(seg);
      continue;
    }
    if (last && last.t === seg.t) last.text += seg.text;
    else merged.push(seg);
  }
  return merged;
}

/**
 * 构造一个 diff 片段。图片 token 单独成型（t:'img' + id + side），文字则是普通片段。
 * side 说明「这张图属于哪一侧」：
 *   'eq'  → 两侧都有（同一张图）
 *   'del' → 只在旧版（被删掉的图）
 *   'ins' → 只在新版（新加的图）
 * 界面据此在左右两格各显示自己那一侧的图。
 */
function mkSeg(t, raw) {
  const tok = String(raw == null ? '' : raw);
  const m = new RegExp(`^${NUL}IMG:([0-9a-f]{8})${NUL}$`).exec(tok);
  if (m) return { t: 'img', id: m[1], side: t };
  return { t, text: tok };
}

/**
 * 相似度阈值：两段字符级 LCS 长度 / 较长者，**大于等于**它即认为「同一段被改过」
 * 而非「一删一增」。
 *
 * ★ 为什么是 >= 而不是 >，且位置要卡得这么准 ★
 *   纯图片段（`<p><img></p>`）在段落文本里就是一个 token，长度 14 个字符。
 *   换一张图 → 两段各 14 字符、只有 id 那段不同 → 字符级 LCS 长度 7 → 相似度**正好 0.5**。
 *   若判定写成 `s > CHANGE_RATIO`，这个最常见的「换图」恰好被排除在配对之外，
 *   于是对比结果变成「删一段 + 插一段」，界面上左右分居两行、格栅框也没了，
 *   用户看不到「同一位置换了图」这个事实。改成 >= 后，换图落在 change 行，
 *   左格旧图（灰+红框）右格新图（绿框），一眼能看出是替换。
 *   而「改了金额」「改了日期」这类正文改动的相似度都远高于 0.5，
 *   真要判成一删一增的是完全不相干的两段（相似度接近 0），
 *   把边界从 > 放到 >= 影响的只是恰好 0.5 这一种情形，不会造成误配。
 */
export const CHANGE_RATIO = 0.5;

/** 字符级最长公共子序列长度（求相似度用；段长有限，O(n·m) 可接受） */
function charLcsLen(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return 0;
  let prev = new Int32Array(m + 1);
  let cur = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    cur[0] = 0;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      cur[j] = ai === b.charCodeAt(j - 1) ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    const t = prev;
    prev = cur;
    cur = t;
  }
  return prev[m];
}

export function similarity(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x === y) return 1;
  if (!x || !y) return 0;
  return charLcsLen(x, y) / Math.max(x.length, y.length);
}

/**
 * ★ Histogram 式对齐（Beta.230 修正）。
 *
 * 为什么不能只靠段落级 LCS：它把「整段字符串全等」才算 equal。
 * 于是「每段都改了 1~2 个字」这种**最常见**的版本对比场景，
 * 段落 LCS 会一个都匹配不上 —— 整篇塌成 delete 洪水 + insert 洪水，
 * 用户看到的是「全删了 + 全加了」，而不是「每段都动过」。
 * 实测：3 段各改一处 → LCS 只配出 1 对 change，另外 2 段变成一删一增，
 * 段内删除线根本没机会标出来。
 *
 * 做法（LCS 相等锚点 + 空隙内相似度配对，等价于 git diff --histogram）：
 *  ① 段落级 LCS 找出「完全没动」的段落，作为左右对齐的锚点
 *  ② 每个空隙（两侧都非空）内按相似度贪心配对，配上的合成 change
 *  ③ 配不上的老实用 delete / insert
 *
 * ★ oldBase / newBase 是「空隙起点在全篇段落数组里的绝对下标」★
 *   aChunk/bChunk 只是切片，chunk 内序号 0 对应全篇第 oldBase 段。
 *   界面要按这个绝对下标去 slots 里取该段的图片，给相对下标会**整篇错位**：
 *   第 0 段插图时相对下标恰为 0，看上去还能对；第 3 段之后就开始取到别段的图，
 *   而文字却是对的 —— 这种错最难发现（实测测试 20b 就是这么红的）。
 */
function alignGap(aChunk, bChunk, oldBase = 0, newBase = 0) {
  const out = [];
  if (!aChunk.length) {
    bChunk.forEach((text, k) => out.push({ type: 'insert', newIndex: newBase + k, new: newBase + k, newText: text }));
    return out;
  }
  if (!bChunk.length) {
    aChunk.forEach((text, k) => out.push({ type: 'delete', oldIndex: oldBase + k, old: oldBase + k, oldText: text }));
    return out;
  }
  // 相似度贪心配对：每个旧段去未占用的新段里找最像的一个
  const usedB = new Set();
  const pairOf = new Map(); // oldIdx -> newIdx
  aChunk.forEach((oldText, i) => {
    let best = -1;
    let bestSim = CHANGE_RATIO;
    for (let j = 0; j < bChunk.length; j++) {
      if (usedB.has(j)) continue;
      const s = similarity(oldText, bChunk[j]);
      // >= ：恰好 0.5（纯图片段换图）也要配对成 change，理由见 CHANGE_RATIO 注释
      if (s >= bestSim && s > 0) {
        bestSim = s;
        best = j;
      }
    }
    if (best >= 0) {
      usedB.add(best);
      pairOf.set(i, best);
    }
  });

  let j = 0;
  for (let i = 0; i < aChunk.length; i++) {
    const pj = pairOf.has(i) ? pairOf.get(i) : -1;
    if (pj >= 0) {
      // 把配对位置之前的未配对新段先吐出来，保持左右大致对齐
      for (; j < pj; j++)
        if (!usedB.has(j)) out.push({ type: 'insert', newIndex: newBase + j, new: newBase + j, newText: bChunk[j] });
    }
    const oldText = aChunk[i];
    if (pj >= 0) {
      const newText = bChunk[pj];
      out.push({
        type: 'change',
        oldIndex: oldBase + i,
        newIndex: newBase + pj,
        // old/new 是 oldIndex/newIndex 的短别名。下游既要取段落文本、又要取该段的
        // 图片槽位（buildPostDiff），统一成同名能少一层心智负担；
        // 但二者必须同值 —— 「图没挂上而文字是对的」这类错最难发现，测试 18 专门盯它。
        old: oldBase + i,
        new: newBase + pj,
        oldText,
        newText,
        tokens: diffTokens(oldText, newText)
      });
      j = pj + 1;
    } else {
      out.push({ type: 'delete', oldIndex: oldBase + i, old: oldBase + i, oldText });
    }
  }
  for (; j < bChunk.length; j++)
    if (!usedB.has(j)) out.push({ type: 'insert', newIndex: newBase + j, new: newBase + j, newText: bChunk[j] });
  return out;
}

/**
 * 段落级 diff。
 * @returns {{ ops, stats: {insert,delete,change,equal}, truncated: boolean }}
 */
export function diffParagraphs(oldParas, newParas, opts = {}) {
  const limit = opts.maxParas || MAX_PARAS;
  let truncated = false;
  let a = Array.isArray(oldParas) ? oldParas.slice() : [];
  let b = Array.isArray(newParas) ? newParas.slice() : [];
  if (a.length > limit) {
    a = a.slice(0, limit);
    truncated = true;
  }
  if (b.length > limit) {
    b = b.slice(0, limit);
    truncated = true;
  }

  // ★ 完全一致快速路径：归一化后全等即直接返回。
  //   命中率极高 —— saveVersion 没有去重，大量相邻版本逐字节相同，
  //   这条路径是「打开就能秒出结果」的关键。
  if (!truncated && a.length === b.length && a.every((x, i) => x === b[i])) {
    return {
      ops: a.map((text, i) => ({
        type: 'equal',
        oldIndex: i,
        newIndex: i,
        old: i,
        new: i,
        oldText: text,
        newText: text
      })),
      stats: { insert: 0, delete: 0, change: 0, equal: a.length },
      truncated: false
    };
  }

  const { aMid, bMid, head, tail } = stripCommonPrefixSuffix(a, b);

  // ① 段落级 LCS 只用来找「完全没动」的锚点，按锚点把两侧切成若干空隙
  const anchors = lcs(aMid, bMid);
  // ② 每个空隙交给 alignGap 做相似度配对
  const ops = [];
  let ai = 0;
  let bi = 0;
  let aChunk = [];
  let bChunk = [];
  /* 空隙起点下标：每次收集新一段空隙时记下来，flush 时传给 alignGap。
   * ★ 必须记绝对值，不能靠 chunk 内序号 ★
   *   段落索引会被下游用来查「该段的图片槽位」（slots）与「该段文本」（aMid/bMid）。
   *   拿相对下标去查绝对数组，第 0 段还能勉强对上，第 1 段起就整体偏移，
   *   结果是「文字对、图错」，几乎无法凭肉眼定位。 */
  let aChunkBase = 0;
  let bChunkBase = 0;
  /* ★ 入参是**全篇绝对下标**，取文本时要还原成 aMid/bMid 的局部下标（减 head）★
   *   第一版这里写成 aMid[idx] 直接取，于是 head 非空时：
   *     · 前几段取到 undefined（→ chunk 里混进空洞，该行文字与图全丢）；
   *     · 之后整体错位一段（→ 文字对、图错，比崩更难看）。
   *   单测 20b/18e 就是被这个坑红的，务必保持减法。 */
  const pushA = absIdx => {
    const local = absIdx - head.length;
    if (local < 0 || local >= aMid.length) return; // 越界不压入，宁缺不错位
    if (aChunk.length === 0) aChunkBase = absIdx;
    aChunk.push(aMid[local]);
  };
  const pushB = absIdx => {
    const local = absIdx - head.length;
    if (local < 0 || local >= bMid.length) return;
    if (bChunk.length === 0) bChunkBase = absIdx;
    bChunk.push(bMid[local]);
  };
  const flushGap = () => {
    if (aChunk.length || bChunk.length) {
      for (const o of alignGap(aChunk, bChunk, aChunkBase, bChunkBase)) ops.push(o);
    }
    aChunk = [];
    bChunk = [];
  };
  for (const op of anchors) {
    if (op.type === 'equal') {
      flushGap();
      // op.old / op.new 是 aMid/bMid 的局部下标 → 对外一律给全篇绝对下标
      ops.push({
        type: 'equal',
        oldIndex: head.length + op.old,
        newIndex: head.length + op.new,
        old: head.length + op.old,
        new: head.length + op.new,
        oldText: aMid[op.old],
        newText: bMid[op.new]
      });
      ai = op.old + 1;
      bi = op.new + 1;
    } else if (op.type === 'delete') {
      pushA(head.length + op.old);
      ai = op.old + 1;
    } else {
      pushB(head.length + op.new);
      bi = op.new + 1;
    }
  }
  // 收尾：把尚未纳入空隙的残余段（lcs 返回的尾部 delete/insert）并入最后一段空隙。
  // ★ 这里的 ai/bi 是 aMid/bMid 的**局部**下标，转成全篇绝对下标必须 + head.length ★
  //   aMid/bMid 是剥掉公共前缀后的切片，直接 pushA(ai) 会把「全篇第 5 段」
  //   记成「全篇第 1 段」，于是该行去 slots 里取到的是另一段的图（或取不到）。
  flushGap();
  for (; ai < aMid.length; ai++) pushA(head.length + ai);
  for (; bi < bMid.length; bi++) pushB(head.length + bi);
  flushGap();

  // ops 先放剥掉的前缀（它们两侧完全相同，必然 equal）——
  // ★ 不放回去的话，两篇只有末尾不同的长文会显示成「什么都没改」。
  if (head.length) {
    head.forEach((text, i) => {
      ops.unshift({ type: 'equal', oldIndex: i, newIndex: i, old: i, new: i, oldText: text, newText: text });
    });
  }
  // tail 同理追加到末尾，其 newIndex 需按尾部总长修正
  if (tail.length) {
    const newBase = b.length - tail.length;
    tail.forEach((text, i) => {
      ops.push({
        type: 'equal',
        oldIndex: a.length - tail.length + i,
        newIndex: newBase + i,
        old: a.length - tail.length + i,
        new: newBase + i,
        oldText: text,
        newText: text
      });
    });
  }

  const stats = { insert: 0, delete: 0, change: 0, equal: 0 };
  for (const o of ops) stats[o.type]++;

  // 变化段落挂到配对行上：change 行自带 tokens；insert/delete 另一侧为空
  for (const o of ops) {
    if (o.type === 'insert') o.pair = { left: null, right: o.newText };
    else if (o.type === 'delete') o.pair = { left: o.oldText, right: null };
  }

  return { ops, stats, truncated };
}

const TAGS_OF = {
  // ★ Beta.270：值改为 i18n key 而非中文字面量——对比弹窗要跟随界面语言。
  //   渲染处（VersionDiffModal）对 kind==='meta' 的行调 t(m.label)；字段行
  //   （kind==='field'，label 是用户自定义字段名）不翻译，t() 对查不到的 key
  //   原样返回也不会误伤，但显式分流不依赖那个副作用。
  //   大区/分类/标签/编号复用新建文档页的同名标签键，同一概念单一来源。
  title: 'post.metaTitle',
  status: 'post.metaStatus',
  fields: 'post.metaFields',
  tags: 'post.tagsLabel',
  // ★ Beta.258：补齐大区/分类/编号三个元数据维度。
  //   旧实现只比 title/status/fields/tags，于是「只把文档从华东大区移到华南」
  //   这种改动在对比弹窗里显示为「完全一致」—— 而它确实已经写出了新版本。
  //   用户点对比就是为了看清"改了什么"，漏掉归属维度等于这个功能对
  //   一大类改动（纯元数据调整）完全失效。
  region: 'post.regionLabel',
  category: 'post.categoryLabel',
  no: 'post.docNo'
};

/**
 * 元信息差异（标题/状态/字段/标签/大区/分类/编号）。
 * ★ 必须一起比：snapshotOf 存了 8 个键，只比正文会出现
 *   「只改了标题、正文一字未动」却显示「完全相同」的错误结论。
 *
 * ── 字段为什么必须【逐项】展开（本次修复）──
 *   旧实现把整个 fields 拼成一行 `NO:xxx  DT:yyy  ABS:zzz` 再整串比对，
 *   只答「字段变了没有」，答不了「哪个字段变成了什么」。
 *   而字段恰恰是文档最核心的信息（编号/日期/密级/经办人…），
 *   用户点「对比」最想看的往往就是这一块。
 *   拼成一行还有个隐蔽的坑：任何一个字段变动都会让**整行**被判为差异，
 *   旧值/新值各是一长串，肉眼得逐字找不同 —— 信息在，但不可用。
 *   ⇒ 改为按字段 code 逐个生成行，每行只承载一个字段的旧值→新值。
 *
 * ── 大区/分类/编号为什么用「名称」比而不是「id」比 ──
 *   快照里存的是 region_id / category_id / no。直接比 id 也能判出差异，
 *   但弹窗会显示成「1 → 2」，用户完全读不出发生了什么。
 *   调用方（PostView.openDiff）会传入带 rname/cname 的对象，
 *   此处优先用名称，缺失才回落到 id —— 保证后端/单测直接传 id 时也不崩。
 *
 * @param {object} oldSnap
 * @param {object} newSnap
 * @param {object} [opts]
 * @param {(code:string)=>string} [opts.fieldLabel] code → 可读字段名（来自 field_defs）
 */
export function diffMeta(oldSnap, newSnap, opts = {}) {
  const rows = [];
  const push = (k, oldV, newV) => {
    if (oldV !== newV) rows.push({ label: TAGS_OF[k] || k, old: oldV, new: newV, kind: 'meta' });
  };
  push('title', String(oldSnap?.title ?? ''), String(newSnap?.title ?? ''));

  // ---- 归属与编号：名称优先，id 兜底（快照只有 id，名称由调用方补）----
  const nameOrId = (snap, nameKey, idKey) => {
    const nm = snap && snap[nameKey];
    if (nm != null && String(nm) !== '') return String(nm);
    const id = snap && snap[idKey];
    return id == null || id === '' ? '' : String(id);
  };
  push('region', nameOrId(oldSnap, 'rname', 'region_id'), nameOrId(newSnap, 'rname', 'region_id'));
  push('category', nameOrId(oldSnap, 'cname', 'category_id'), nameOrId(newSnap, 'cname', 'category_id'));
  push('no', String(oldSnap?.no ?? ''), String(newSnap?.no ?? ''));

  // ---- 字段：逐项展开 ----
  // 两侧所有出现过的 code 取并集，保证「新增字段有值」与「旧字段被清空」都能被看见：
  // 只看其中一侧的 key 会漏掉另一侧独有的字段（新增/删除的字段就此隐身）。
  const of = (oldSnap && typeof oldSnap.fields === 'object' && oldSnap.fields) || {};
  const nf = (newSnap && typeof newSnap.fields === 'object' && newSnap.fields) || {};
  const codes = Array.from(new Set([...Object.keys(of), ...Object.keys(nf)])).sort();
  const labelOf = typeof opts.fieldLabel === 'function' ? opts.fieldLabel : c => c;
  for (const code of codes) {
    const ov = of[code] == null ? '' : String(of[code]);
    const nv = nf[code] == null ? '' : String(nf[code]);
    if (ov === nv) continue; // 该字段本次没动，不进对比结果
    const name = labelOf(code) || code;
    // 字段名后带上 code，避免多个字段重名时无法区分到底是哪一个
    const label = name === code ? code : `${name}（${code}）`;
    rows.push({ label, old: ov, new: nv, kind: 'field' });
  }

  const tagsText = t => (Array.isArray(t) ? t.slice().sort().join('、') : '');
  push('tags', tagsText(oldSnap?.tags), tagsText(newSnap?.tags));
  push('status', String(oldSnap?.status ?? ''), String(newSnap?.status ?? ''));
  return rows;
}

/**
 * 一次性拿到全部对比结果。
 * @param {string} oldHtml 历史版本正文 HTML
 * @param {string} newHtml 当前正文 HTML
 * @param {object} [opts] { oldSnap, newSnap, fieldLabel, maxParas, imgPlaceholder }
 */
export function buildPostDiff(oldHtml, newHtml, opts = {}) {
  // 图片占位文本只在「无 DOM 环境」降级时用到（界面传 t('post.diffImg')），
  // 算法层只认字符串、不 import i18n —— 保持纯函数，单测才能在 Node 里跑。
  const oldEx = htmlToParagraphsEx(oldHtml, { imgPlaceholder: opts.imgPlaceholder });
  const newEx = htmlToParagraphsEx(newHtml, { imgPlaceholder: opts.imgPlaceholder });
  const d = diffParagraphs(oldEx.paragraphs, newEx.paragraphs, opts);
  const meta = diffMeta(opts.oldSnap, opts.newSnap, { fieldLabel: opts.fieldLabel });

  /* ★ 给每个 op 挂上「左右各自的图片列表」★
   *   op 只知道 oldIndex/newIndex 的段落索引（注意：**不是** op.old / op.new，
   *   diffParagraphs 用的是 oldIndex / newIndex，取值时不要图省事写错）；
   *   段落里的 token 顺序与 slots 一一对应，界面据此把第 n 个 token 换成第 n 张图
   *   （同一段可能有多张图）。两侧图片表合并成一张：id 由 src 派生，同图同 id，合并不冲突。 */
  const images = { ...oldEx.images, ...newEx.images };
  const ops = (d.ops || []).map(op => ({
    ...op,
    oldImgs: op.oldIndex != null ? oldEx.slots[op.oldIndex] || [] : [],
    newImgs: op.newIndex != null ? newEx.slots[op.newIndex] || [] : []
  }));

  return {
    ...d,
    ops,
    images,
    // ★ 元信息也参与判定：只改标题而正文一字未动时，
    //   若仍报 identical，用户会以为「改了但对比不出来」——那比报错更糟。
    identical:
      !d.truncated && meta.length === 0 && d.stats.insert === 0 && d.stats.delete === 0 && d.stats.change === 0,
    meta,
    oldParaCount: oldEx.paragraphs.length,
    newParaCount: newEx.paragraphs.length
  };
}

// 供 e2e 取证（同 postFind.js:194-196 的做法）
if (typeof window !== 'undefined') {
  window.__postDiff = {
    htmlToParagraphs,
    isImgOnly,
    tokenize,
    diffTokens,
    diffParagraphs,
    diffMeta,
    buildPostDiff,
    MAX_PARAS
  };
}

export default {
  htmlToParagraphs,
  htmlToParagraphsEx,
  splitImgTokens,
  isImgOnly,
  tokenize,
  diffTokens,
  diffParagraphs,
  diffMeta,
  buildPostDiff,
  MAX_PARAS
};
