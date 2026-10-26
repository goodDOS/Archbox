/**
 * 设置页卡片间距契约（Beta.324 追加）。
 *
 * 【为什么要有这一场】
 *   用户发来设置页截图，只说四个字：「没做好间隔」。
 *   现象是「每页条数」的说明文字（pageSizeTip）紧贴着下一张卡的边框，看起来像
 *   说明文字压在了卡片上。根因**不是**间距写小了，而是 **卡片套卡片**：
 *
 *     Beta.322 的 DisplaySection 自己是 <div class="card sec">，里面又塞了
 *     FontSection（它也是 <div class="card sec">）。于是 DOM 是
 *       .card.sec
 *         ├─ p.tip            ← margin-top: 8px，贴着它的是下面那张卡的 1px 边框
 *         └─ .card.sec        ← 第二层边框
 *     两层边框上下相贴、只隔 8px，视觉上就是「文字压在一张卡的框上」。
 *
 *   ★ 这个坑的隐蔽处：CSS 写得完全正确，`.card-stack > .card + .card` 也没问题 ——
 *     问题在于**嵌套的卡片根本不在 .card-stack 的直接子元素链上**，那条规则管不到它。
 *     所以靠肉眼看 CSS 是查不出来的，必须回 DOM 结构。
 *
 * 【本条测试锁什么】
 *   1. 任何设置分区组件，都不得在自身是 .card 的情况下再渲染另一个 .card；
 *   2. 设置分区组件必须把卡片平铺给 SettingsPage 的 .card-stack（中间不得隔一层
 *      会吃掉「直接子元素」关系的包装 div —— 除非该 div 是 display: contents）；
 *   3. 卡片之间的间距只允许有一个来源：`.card-stack > .card + .card { margin-top: var(--card-gap) }`，
 *      分区组件里不得再各写 margin / gap 去补间距（否则同一处出现两个数字，将来必然漂移）。
 *
 * 运行：node electron/verify/settings-card-gap.test.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness } from './_harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { ok, section, done } = createHarness();

const read = p => readFileSync(path.join(root, p), 'utf8');
const baseCss = read('src/styles/base.css');

/** 取出 .vue 的 <template> 段（不含 script / style，避免注释里的 class 干扰） */
function tpl(src) {
  const m = /<template>([\s\S]*)<\/template>/.exec(src);
  return m ? m[1] : '';
}
/** 剥掉 HTML 注释：注释里常写着「不要再套 .card」这类说明，会让正则误判 */
function stripComments(s) {
  return s.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * 找出「被另一个 .card 包住的 .card」。
 *
 * ★ 为什么不能简单数 <div 与 </div>：
 *   分区组件通常不闭合最外层容器（那是父模板的事），配平永远差 1，
 *   用配平均数就必然误报 —— 这个坑我在写第一版断言时就踩了。
 *   正确做法是显式维护标签栈：遇到开标签压栈、闭标签弹栈，
 *   压栈时若「祖先栈里已有 card」而自己也是 card，就记一笔嵌套。
 *
 * 返回 [{ line, cls }]，空数组表示无嵌套。
 */
function nestedCards(src) {
  const raw = tpl(src);
  const out = [];
  const stack = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(raw))) {
    if (m[0].startsWith('<!--')) continue; // 注释整体跳过（栈深度不变）
    const [, closing, tag, attrs, selfClose] = m;
    const line = raw.slice(0, m.index).split('\n').length;
    if (closing) {
      // 弹到最近的同名开标签（容忍未闭合的外层容器）
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    // class 里必须独立出现 "card"：card-stack / gate-card 都不算卡片本体
    const cls = (/class="([^"]*)"/.exec(attrs) || [null, ''])[1];
    const isCard = cls.split(/\s+/).includes('card');
    if (isCard && stack.some(n => n.isCard)) out.push({ line, cls, tag });
    if (selfClose) continue;
    stack.push({ tag, isCard });
  }
  return out;
}

const settingsPage = read('src/pages/SettingsPage.vue');
const displaySrc = read('src/components/settings/DisplaySection.vue');
const fontSrc = read('src/components/settings/FontSection.vue');
const themeSrc = read('src/components/settings/ThemeSection.vue');
const dataSrc = read('src/components/settings/DataSection.vue');
const cleanupSrc = read('src/components/settings/CleanupSection.vue');
const securitySrc = read('src/components/settings/SecuritySection.vue');

/**
 * 统计模板的**顶层节点**数量（多根模板会 ≥2）。
 * 做法：用标签栈扫，栈深度为 0 时遇到的每个开标签就是一个顶层节点。
 * 注释整体跳过 —— 节点前后的说明文字里常写着 <div class="card">，会让计数虚高。
 */
function topLevelCards(src) {
  const raw = tpl(src);
  let depth = 0;
  let count = 0;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(raw))) {
    if (m[0].startsWith('<!--')) continue;
    const [, closing, , , selfClose] = m;
    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) count += 1;
    if (!selfClose) depth += 1;
  }
  return count;
}

section('[1] 间距的唯一来源');

ok(/\.card-stack\s*\{[^}]*--card-gap:\s*16px/.test(baseCss), '★ .card-stack 定义了 --card-gap（卡片间距的单一数据源）');
ok(
  /\.card-stack\s*>\s*\.card\s*\+\s*\.card\s*\{[^}]*margin-top:\s*var\(--card-gap\)/.test(baseCss),
  '★ 卡片间距由 `.card-stack > .card + .card` 一处决定，值取 var(--card-gap)'
);
ok(
  !/\.card\s*\+\s*\.card\s*\{/.test(baseCss) || !/^\s*\.card\s*\+\s*\.card/m.test(baseCss),
  '★ 没有全局 `.card + .card`（会误伤 grid 网格内的卡片，如文档卡片墙）'
);

section('[2] 设置分区组件不得卡片套卡片');

// FontSection 是「自己就是一张卡」的典型：根元素必须直接带 card，且内部不得再出现 card
ok(/<div class="card sec font-sec">/.test(tpl(fontSrc)), '（依据）FontSection 根元素 = .card.sec');
const fontBody = stripComments(tpl(fontSrc));
const fontCardCount = (fontBody.match(/class="card\b/g) || []).length;
ok(
  fontCardCount === 1,
  `★ FontSection 模板里只出现 1 次 class="card"（实际 ${fontCardCount}）—— 卡内再套卡就是 Beta.322 那个坑`
);
ok(!/card-stack/.test(fontBody), '★ FontSection 不自带 .card-stack 包装（它就是 stack 的一个直接子元素）');

// ThemeSection 同理
const themeBody = stripComments(tpl(themeSrc));
ok((themeBody.match(/class="card\b/g) || []).length === 1, '★ ThemeSection 模板里只出现 1 次 class="card"');

section('[3] DisplaySection 的三张卡必须平铺给外层 .card-stack');

const dispBody = stripComments(tpl(displaySrc));
// 逐条：三块内容的入口都存在
ok(
  /settings\.pageSizeTip/.test(dispBody) && /<FontSection\s*\/>/.test(dispBody) && /settings\.langTip/.test(dispBody),
  '★ DisplaySection 三块内容齐全：每页条数 / 界面字体 / 界面语言'
);

/**
 * ★ 核心断言：FontSection 不得被任何 .card 包住。
 *   Beta.322 就是这里出的问题 —— 它被塞进「每页条数」那张 .card 内部，
 *   两层边框之间只隔了 pageSizeTip 的 8px，用户看到的就是「没做好间隔」。
 *   判定用标签栈（见 nestedCards），不数 div 个数：分区组件通常不闭合最外层容器，
 *   按个数配平必然误报。
 */
const dispNested = nestedCards(displaySrc);
ok(
  dispNested.length === 0,
  '★ DisplaySection 里没有任何「卡片套卡片」（实际 ' +
    dispNested.length +
    ' 处）' +
    (dispNested.length ? ' → 第 ' + dispNested.map(n => n.line).join(' / ') + ' 行' : '')
);

// FontSection 之前的 div 必须已配平（=0）：说明第一张卡在自己内部就闭合了，
// 字体卡不是它的孩子。多根模板下这里天然为 0。
const beforeFont = tpl(displaySrc).slice(0, tpl(displaySrc).indexOf('<FontSection'));
const wrapperDepth =
  (stripComments(beforeFont).match(/<div\b/g) || []).length -
  (stripComments(beforeFont).match(/<\/div>/g) || []).length;
ok(
  wrapperDepth === 0,
  `★ FontSection 之前 div 已全部闭合（实测余 ${wrapperDepth} 层，应为 0）` +
    ' —— 余 1 层说明字体卡被裹进了上一张卡（Beta.322 的原样）'
);

section('[4] DisplaySection 必须是多根模板（不得有外层 wrapper）');

/**
 * ★ 这一节是本条测试的核心，也是 Beta.322→323 连踩两次的坑。
 *
 * `.card-stack > .card + .card` 是**元素树**上的直接子元素选择器。
 * 只要 DisplaySection 有一个外层 div 包着三张卡，这三张卡就不是 .card-stack 的直接子元素，
 * 间距全部为 0。
 *
 * ★★ 第二轮我曾用 `display: contents` 想「让包装层在布局上消失」，并用注释解释了理由。
 *    这是**错的**：display:contents 只影响**盒树**（盒子被上提），不影响**元素树** ——
 *    选择器匹配看的是元素树，wrapper 还在，`>` 依然匹配不到。
 *    实测证据（Chromium 无头，.card-stack > .card + .card { margin-top:16px }）：
 *      wrapper + display:contents  → 三段 gap 全是 0
 *      删掉 wrapper（多根模板）    → 三段 gap 全是 16
 *    所以断言必须要求「没有 wrapper」，而不是「wrapper 上有 display:contents」。
 */
const dispTpl = stripComments(tpl(displaySrc));
ok(
  !/class="disp-cards"/.test(dispTpl),
  '★ DisplaySection 不得再有 .disp-cards 包装层（display:contents 救不了直接子元素选择器）'
);
const dispStyle = (/<style[^>]*>([\s\S]*?)<\/style>/.exec(displaySrc) || [null, ''])[1];
ok(
  !/display:\s*contents/.test(dispStyle),
  '★ 不再用 display: contents 兜底（它只影响盒树，元素树上的 `>` 选择器照样失配）'
);

// 多根模板的直接证据：模板里没有「包住全部内容」的那一层 div
// 判法：模板首个顶层标签不是 div，或者第一个顶层 </div> 之后仍有内容（说明是并列的根）
const roots = topLevelCards(displaySrc);
ok(roots >= 3, `★ 模板至少有 3 个顶层节点（实测 ${roots}）—— 三张卡必须是并列的根，不能共用一个父容器`);

section('[5] 提示文字与控件的间隔');

ok(/\.tip\s*\{[^}]*margin-top:\s*8px/.test(dispStyle), '★ .tip 与上方控件留 8px（不被卡片边框挤到一起）');
ok(
  !/style="margin-top:\s*8px"/.test(tpl(displaySrc)),
  '★ 不再用内联 style 写间距（同类问题会被 prettier 与主题样式绕过，统一走 .tip 类）'
);

section('[6] SettingsPage 的分区容器');

ok(
  /<div v-if="sec === 'display'" class="card-stack">/.test(tpl(settingsPage)),
  '（依据）显示分区由 SettingsPage 的 .card-stack 承载'
);
ok(
  /<ThemeSection[\s\S]*<DisplaySection\s*\/>/.test(tpl(settingsPage)),
  '★ ThemeSection 与 DisplaySection 平级（同处一个 .card-stack，才共用同一套卡间距）'
);

section('[7] 其余设置分区只是核查，不强制改造');

// 这几个组件自带 .card-stack（内层再定义一次 --card-gap 同名变量，值同为 16px，不冲突），
// 单独成栏目、由 v-if 独占渲染，不与其它 stack 并列 —— 记下即可，不作为失败条件。
for (const [name, src] of [
  ['DataSection', dataSrc],
  ['CleanupSection', cleanupSrc],
  ['SecuritySection', securitySrc]
]) {
  const body = stripComments(tpl(src));
  const ownStack = /class="card-stack"/.test(body);
  ok(
    ownStack || /class="card\b/.test(body),
    `（记录）${name} 自带 ${ownStack ? '.card-stack（独立栏目，可接受）' : '单张 .card'}`
  );
}

done();
