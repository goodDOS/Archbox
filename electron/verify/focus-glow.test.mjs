/**
 * 焦点样式与弹窗几何（Beta.285 重写）。
 *
 * 【这一版之前发生过什么】
 *   用户连续三次反馈同一片区域：
 *     ① 「标签搜索框辉光被裁切」
 *     ② 「辉光依旧裁切」
 *     ③ 「搜索框这一行的宽度没对齐」
 *   我先后试过三种修法，全部失败：
 *     · 给组件自己加 padding（.tc-toolbar 6px）→ 该行与标签云/底部按钮左沿错位（问题③）
 *     · 给 .modal-body 加 padding + 负 margin → 负 margin 把缓冲抵消成 0，照样裁（问题②）
 *     · 只加 padding 不加负 margin → 内容真实内缩，但所有弹窗正文变窄
 *   根因是 box-shadow **画在边框盒之外**，而项目里 overflow:hidden 遍地都是，
 *   「给每层算够余量」是一场打地鼠：修好一个容器，下一个更窄的又不够。
 *
 * 【用户决定】去除所有辉光效果，并检查对结构的影响。
 *
 * 【本文件现在守什么】
 *   A. 辉光确实没了 —— 焦点态只换边框色，不再有任何向外扩的 box-shadow
 *   B. 为辉光预留的空间确实撤了 —— 否则会留下莫名的 4px/6px 缩进，反而破坏对齐
 *   C. 撤除后结构没有塌 —— 弹窗各块仍同宽同左沿、眼睛按钮仍落在输入框内、
 *      .modal 与 .modal-body 的成对关系仍然成立
 *
 * 为什么这些必须用断言守：
 *   它们都是「CSS 数值之间的关系」，构建不会报错、控制台干净、类型检查全绿，
 *   只有人眼在特定弹窗里才看得出 2px 错位或 3px 被裁。断言是唯一低成本的守卫。
 *
 * 运行：node electron/verify/focus-glow.test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

let pass = 0;
let fail = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log('  ✓ ' + m);
  } else {
    fail++;
    console.log('  ✗ ' + m);
  }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** 取出某个选择器块的内容（从 selector 到配对的 }） */
function block(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[},])\\s*${esc}\\s*\\{`, 'm');
  const m = re.exec(css);
  if (!m) return null;
  const start = css.indexOf('{', m.index + m[0].length - 1);
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (!depth) return css.slice(start + 1, i);
    }
  }
  return null;
}

/** 取声明块里某属性的最终值（层叠语义：取最后一条） */
function prop(decl, name) {
  if (!decl) return null;
  const re = new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+)`, 'g');
  let v = null;
  let m;
  while ((m = re.exec(decl))) v = m[1].trim();
  return v;
}

/** 解析四值简写的左右值 */
function lr(v) {
  if (!v) return null;
  const parts = String(v).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const pick =
    parts.length === 1
      ? [parts[0], parts[0]]
      : parts.length === 2
        ? [parts[1], parts[1]]
        : parts.length === 3
          ? [parts[1], parts[1]]
          : [parts[3], parts[1]];
  const num = s => {
    if (/^-?0(\.0+)?$/.test(s)) return 0;
    if (/^-?\d*\.?\d+px$/.test(s)) return parseFloat(s);
    return NaN;
  };
  return { left: num(pick[0]), right: num(pick[1]), raw: String(v).trim() };
}

function sideLR(decl, shorthand) {
  if (!decl) return null;
  const l = prop(decl, `${shorthand}-left`);
  const r = prop(decl, `${shorthand}-right`);
  if (l !== null || r !== null) {
    const lv = l !== null ? l : r;
    const rv = r !== null ? r : l;
    return lr(`${lv} ${rv}`);
  }
  return lr(prop(decl, shorthand));
}

/** 递归收集 src 下的 .vue / .css */
function collect(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) collect(p, out);
    else if (/\.(vue|css|js)$/.test(f)) out.push(p);
  }
  return out;
}

/* 取出一个 .vue 的 <style> 内容（含 scoped），用于与 .css 同等对待 */
function styleOf(src) {
  const m = src.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return m ? m[1] : '';
}

/* ============ A. 辉光已彻底去除 ============ */
console.log('[A] 焦点态不再有外扩辉光');
{
  const base = read('src/styles/base.css');

  /* box-shadow 的 "外扩环" 形态：0 0 0 <N>px <color>
   * 这类阴影专门用来做焦点环 / 光晕，且完全不参与布局 —— 正是被裁的元凶。
   * inset 开的环画在盒内，不会被裁，不算（RegionModal 的选中态就是这类）。 */
  const OUTER_RING = /box-shadow\s*:\s*(?!inset)[^;]*\b0\s+0\s+0\s+\d/;

  // 1) .input / .select 焦点（二者共享同一声明块，取分组末项 .select:focus 以对齐
  //    Prettier 格式化后的多行分组选择器写法 `.input:focus,\n.select:focus {`）
  const inputFocus =
    block(base, '.input:focus, .select:focus') || block(base, '.select:focus') || block(base, '.input:focus');
  ok(!!inputFocus, '.input:focus 规则存在');
  ok(
    inputFocus && !OUTER_RING.test(inputFocus),
    '.input:focus 不再画外扩辉光（实得 ' + (prop(inputFocus, 'box-shadow') || '无 box-shadow') + '）'
  );
  ok(
    inputFocus && /border-color\s*:\s*var\(--accent\)/.test(inputFocus),
    '.input:focus 仍保留边框变色作为可见的焦点指示（可访问性不能丢）'
  );

  // 2) 编辑器焦点
  const edFocus = block(base, '.editor-area:focus');
  ok(!!edFocus, '.editor-area:focus 规则存在');
  ok(edFocus && !OUTER_RING.test(edFocus), '.editor-area:focus 不再画外扩辉光');

  // 3) 下拉触发器
  const dd = read('src/components/Dropdown.vue');
  const ddFocus = block(dd, '.dd-trigger:focus-visible');
  ok(!!ddFocus, '.dd-trigger:focus-visible 规则存在');
  ok(ddFocus && !OUTER_RING.test(ddFocus), '.dd-trigger:focus-visible 不再画外扩辉光');

  // 4) 说明页按钮的 hover 光晕
  const about = read('src/pages/AboutPage.vue');
  const guide = block(about, '.btn-guide:hover');
  ok(!!guide, '.btn-guide:hover 规则存在');
  ok(guide && !OUTER_RING.test(guide), '.btn-guide:hover 不再画外扩辉光');

  // 5) 过渡属性里不应再出现 box-shadow（否则是残留的死代码）
  //    取分组末项 textarea.input（后跟 `{`）以对齐格式化后的多行分组选择器写法
  const inputDecl = block(base, 'textarea.input') || block(base, '.input, .select, textarea.input');
  ok(
    inputDecl && !/transition[^;]*box-shadow/.test(inputDecl),
    '输入框 transition 里已移除 box-shadow（辉光没了，再过渡它是死代码）'
  );
}

/* ============ B. 为辉光预留的空间已撤除 ============ */
console.log('[B] 为辉光预留的空间已撤除');
{
  const base = read('src/styles/base.css');

  /* .modal-body：曾经是 padding:4px + margin:-4px，或 padding:4px。
   * 现在既不该有 padding，也不该有 margin —— 没有东西需要容纳了。
   * 留着任何一个，都会让弹窗正文比 .modal 的 padding 再多缩进一截。 */
  const mb = block(base, '.modal-body');
  ok(!!mb, '.modal-body 规则存在');
  const mbPad = sideLR(mb, 'padding');
  const mbMar = sideLR(mb, 'margin');
  const padZero = !mbPad || ((isNaN(mbPad.left) || mbPad.left === 0) && (isNaN(mbPad.right) || mbPad.right === 0));
  const marZero = !mbMar || ((isNaN(mbMar.left) || mbMar.left === 0) && (isNaN(mbMar.right) || mbMar.right === 0));
  ok(padZero, '.modal-body 无左右 padding（实得 ' + (mbPad ? mbPad.raw : '无') + '）');
  ok(
    marZero,
    '.modal-body 无左右 margin（实得 ' + (mbMar ? mbMar.raw : '无') + '）—— 负 margin 是上一版被裁的直接原因'
  );

  /* .modal 的 padding 必须回到 22px。
   * 上一版为补偿 .modal-body 的 4px 内缩改成了 18px；现在没有内缩，补偿也要撤。
   * 这条是「成对修改」的守门员：只改一处会让所有弹窗正文宽度变化 8px。 */
  const modal = block(base, '.modal');
  const mPad = sideLR(modal, 'padding');
  ok(
    mPad && mPad.left === 22 && mPad.right === 22,
    `.modal 左右 padding 为 22px（实得 ${mPad ? mPad.raw : '无'}）—— 与 .modal-body 无内缩配套`
  );

  /* 组件级的三处预留 */
  const rows = [
    ['src/components/post/TagCloud.vue', '.tc-toolbar', '标签云搜索行'],
    ['src/styles/components.css', '.pwd-row', '密码输入行'],
    ['src/components/CopyTargetDialog.vue', '.row-2', '复制目标对话框两栏']
  ];
  for (const [file, sel, why] of rows) {
    const css = file.endsWith('.vue') ? styleOf(read(file)) : read(file);
    const d = block(css, sel);
    if (!d) {
      ok(false, `${sel} 规则不存在（${why}）`);
      continue;
    }
    const p = sideLR(d, 'padding');
    const m = sideLR(d, 'margin');
    const hasHPad = p && ((!isNaN(p.left) && p.left !== 0) || (!isNaN(p.right) && p.right !== 0));
    const hasHMar = m && ((!isNaN(m.left) && m.left !== 0) || (!isNaN(m.right) && m.right !== 0));
    ok(!hasHPad, `${sel} 无左右 padding（${why}；实得 ${p ? p.raw : '无'}）`);
    ok(!hasHMar, `${sel} 无左右 margin（${why}；实得 ${m ? m.raw : '无'}）`);
  }
}

/* ============ C. 撤除后结构没塌 ============ */
console.log('[C] 结构完好性');
{
  /* C1：弹窗内各块左沿必须一致。
   * 判据：凡直接放在 .modal-body 里的块，只要都没有左右 padding/margin 的偏移，
   * 它们的 border box 必然对齐。这里检查 TagCloud 的三个块。 */
  const tagCss = styleOf(read('src/components/post/TagCloud.vue'));
  for (const sel of ['.tc-toolbar', '.tc-body']) {
    const d = block(tagCss, sel);
    if (!d) {
      ok(false, `${sel} 不存在`);
      continue;
    }
    const m = sideLR(d, 'margin');
    const off = m && ((!isNaN(m.left) && m.left !== 0) || (!isNaN(m.right) && m.right !== 0));
    ok(!off, `${sel} 无左右 margin 偏移 → 与同级块左沿对齐`);
  }
  /* .tc-body 有 padding:10px，但那是**它自己**（带边框的卡片）的内部留白，
   * 决定其左沿的是 border box，padding 在内侧，不影响与 .tc-toolbar 的对齐。 */
  const tcBody = block(tagCss, '.tc-body');
  ok(tcBody && /padding\s*:/.test(tcBody), '.tc-body 保留自身内部留白（卡片内边距，非对齐偏移）');

  /* C2：搜索框仍占满剩余宽度 */
  const search = block(tagCss, '.tc-search');
  ok(search && /flex\s*:\s*1/.test(search), '.tc-search 仍 flex:1');
  ok(search && /min-width\s*:\s*0/.test(search), '.tc-search 有 min-width:0（否则 flex 子项撑破行）');
  ok(
    styleOf(read('src/components/post/TagCloud.vue')).includes('gap: 8px'),
    '.tc-toolbar 仍有 gap 分隔搜索框与新建按钮'
  );

  /* C3：密码框的眼睛按钮定位不依赖被删掉的 padding。
   * 原写法 padding:4px 会让容器比输入框高 8px；眼睛用 top:50% 相对容器定位，
   * 会偏 4px。去掉 padding 后容器高度 == 输入框高度，50% 正好落在输入框中线。
   * 判据：.pwd-row 必须是 flex + align-items:center，且 .pwd-eye 用 top:50% + translateY(-50%)。 */
  const comp = read('src/styles/components.css');
  const pwdRow = block(comp, '.pwd-row');
  ok(pwdRow && /display\s*:\s*flex/.test(pwdRow), '.pwd-row 仍是 flex 容器');
  ok(pwdRow && /align-items\s*:\s*center/.test(pwdRow), '.pwd-row 保持 align-items:center（输入框与眼睛同轴）');
  ok(pwdRow && /position\s*:\s*relative/.test(pwdRow), '.pwd-row 仍是 relative（作为眼睛的定位参考）');
  const eye = block(comp, '.pwd-eye');
  ok(
    eye && /top\s*:\s*50%/.test(eye) && /translateY\(\s*-50%\s*\)/.test(eye),
    '.pwd-eye 用 top:50% + translateY(-50%) 垂直居中 —— 不依赖容器是否有 padding'
  );
  // 输入框要给眼睛留出右侧空间，否则文字会压在眼睛下面
  const pwdInput = block(comp, '.pwd-row .input');
  ok(
    pwdInput && /padding-right\s*:\s*38px/.test(pwdInput),
    '.pwd-row .input 保留 padding-right:38px（给眼睛让位，与容器 padding 无关）'
  );

  /* C4：全仓不应再有「靠负 margin 抵消 padding 以容纳辉光」的写法
   *
   * ★ 判据必须收窄，否则会误伤正常的布局技巧。
   *   `padding + 等量负 margin` 这个形状本身是合法的，项目里至少有三处正当用法：
   *     · .sb-scroll        —— 负 margin 让滚动条落进可视区，不贴边被遮
   *     · .ver.is-current   —— 负 margin 让左侧强调线贴住容器边缘，同时正文不右移
   *     · .page-head.sticky-head —— 吸顶时抵消上内边距，避免内容跳动
   *   这些与"容纳外扩阴影"毫无关系。
   *
   *   真正的危险信号是「**为了辉光**」：注释里写着辉光/box-shadow 却仍在补偿。
   *   所以判据 = 同一规则里既有 padding+负margin，**并且**该规则的注释提到辉光。 */
  const offenders = [];
  for (const f of collect(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(f, 'utf8');
    const css = f.endsWith('.vue') ? styleOf(src) : f.endsWith('.css') ? src : '';
    if (!css) continue;
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
      const sel = m[1].trim().split('\n').pop().trim();
      const body = m[2];
      const p = /padding(?:-left|-right)?\s*:\s*([^;]+)/.exec(body);
      const mg = /margin(?:-left|-right)?\s*:\s*([^;]+)/.exec(body);
      if (!p || !mg) continue;
      if (!/-\d/.test(mg[1]) || !/\d/.test(p[1])) continue;
      if (!sel || /^\*|^body|^html/.test(sel)) continue;
      // 往回找紧邻上方的注释块（最多 600 字符）
      const head = css.slice(Math.max(0, m.index - 600), m.index);
      const nearComment = head.slice(head.lastIndexOf('/*'));
      if (/辉光|box-shadow|外扩|光晕/.test(nearComment)) {
        offenders.push(`${path.relative(ROOT, f)} ${sel}`);
      }
    }
  }
  ok(
    offenders.length === 0,
    '没有「为容纳辉光而做的 padding + 负 margin 补偿」残留' + (offenders.length ? ' → ' + offenders.join(' | ') : '')
  );

  /* 白名单反向确认：这三处是正当布局技巧，必须仍然存在（被误删才是问题） */
  const legit = [
    ['src/components/RegionNav.vue', '.sb-scroll', '滚动条落进可视区'],
    ['src/components/post/VersionHistory.vue', '.ver.is-current', '左侧强调线贴容器边'],
    ['src/styles/base.css', '.page-head.sticky-head', '吸顶时抵消上内边距']
  ];
  for (const [file, sel, why] of legit) {
    const css = file.endsWith('.vue') ? styleOf(read(file)) : read(file);
    ok(block(css, sel) !== null, `${sel} 仍在（${why}；这类负 margin 与辉光无关，不该被清理误删）`);
  }
}

/* ============ D. 辉光的"合法留存"不得误伤 ============ */
console.log('[D] 非焦点类阴影保留');
{
  /* 这些是视觉语言的一部分，与焦点辉光无关，不该被一并删除。
   * 列出来是为了防止有人为了"清干净"把项目的美感一起清掉。 */
  const base = read('src/styles/base.css');
  ok(/\.card\s*\{[^}]*box-shadow\s*:\s*var\(--shadow\)/.test(base), '卡片投影保留（--shadow）');
  ok(/\.modal\s*\{[^}]*box-shadow\s*:\s*var\(--shadow-lg\)/.test(base), '弹窗投影保留（--shadow-lg）');

  const regionModal = styleOf(read('src/components/RegionModal.vue'));
  ok(/box-shadow\s*:\s*inset/.test(regionModal), 'RegionModal 选中态用 inset 阴影保留（画在盒内，不受 overflow 影响）');

  const floatLog = read('src/components/FloatLog.vue');
  ok(/\.fl-dot[^}]*box-shadow/.test(floatLog), 'FloatLog 状态点脉冲环保留（呼吸动画，非焦点）');

  /* ★ Beta.324 变更记录（用户报「不透明大色块」）★
   *   原先这里断言 .pf-hit-active **必须保留** box-shadow:0 0 0 1px，
   *   理由写的是「1px 紧贴文字，是功能标识不是辉光」——那是当年清辉光时
   *   为防误删写的保护条。用户随后反馈：页内查找高亮是「不透明大色块」：
   *   实心底色 + 同色外扩 1px，相邻命中连成一片；覆盖层场景更是把输入框
   *   自己的字整个盖住。产品决策由此变更：外扩环拆除、底色改半透明。
   *   故本条断言从「必须保留」翻转为「必须没有」，并把 active 的可辨识
   *   线索锁到「不依赖色相的下划线 / inset 描边」——
   *   cs16 主题 accent 与 mark-bg 同为 #988632，只靠换色分不出当前项。 */
  const pf = block(base, '.pf-hit.pf-hit-active');
  ok(pf && !/box-shadow\s*:\s*0\s+0\s+0/.test(pf), '★ .pf-hit-active 无同色外扩环（外扩 1px 是「大色块连片」的来源）');
  ok(
    pf && /text-decoration:\s*underline/.test(pf),
    '★ active 用下划线标识当前项（cs16 的 accent==mark-bg，换色分不出）'
  );
  ok(
    pf && /color-mix\(in srgb,\s*var\(--accent\)/.test(pf),
    '★ active 底色半透明（实心底 + 覆盖层 = 遮字，见 base.css 注释）'
  );
  const fo = block(base, '.fo-hit.fo-hit-active');
  ok(fo && /box-shadow:\s*inset/.test(fo), '★ 覆盖层 active 用 inset 描边（画在盒内，不外扩、不连片）');
  const foPlain = block(base, '.fo-hit');
  ok(
    foPlain && /color-mix\(in srgb,\s*var\(--mark-bg\)/.test(foPlain) && !/box-shadow/.test(foPlain),
    '★ .fo-hit 半透明且无外扩环（输入框自己的文字要从底色透出来）'
  );
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
