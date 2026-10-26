/**
 * 遮罩层「变暗 + 模糊 + 入退场动画」与「大区单行更新按钮移除」单测（Beta.286）。
 *
 * 【为什么值得单独一个测试】
 *   这三件事都属于「改了会静默生效、错了也不报错」的类别：
 *     · min-height 84→40：标签少时多一块空白，只有人眼看得出；
 *     · 删掉大区单行「更新」按钮：删得干净与否，靠 i18n 键残留也查不出来
 *       （syncRegion 函数若没删，只是死代码，不报错）；
 *     · 遮罩模糊/动画：CSS 写了没生效、或 backdrop-filter 被主题覆盖成 0，
 *       构建与控制台都全绿。
 *   断言是唯一低成本守卫。
 *
 * 运行：node electron/verify/mask-animation.test.mjs
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

/** 取某个选择器块的内容（从 selector 到配对的 }） */
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

/* ============ 1. 大区单行「更新」按钮已移除 ============ */
console.log('[1] 共享大区不再有逐行「更新」按钮');
{
  const sp = read('src/components/SharePanel.vue');
  // 模板里不应再渲染 sp-update 按钮（注释里保留删除说明不算渲染）
  ok(
    !/class="sp-update"/.test(sp) && !/\.sp-update\s*\{/.test(sp),
    'SharePanel 不再渲染 .sp-update（逐行更新按钮已删）'
  );
  ok(!/syncRegion\b/.test(sp), 'syncRegion 函数已删（无死代码）');
  ok(/syncAll\b/.test(sp), 'syncAll（更新全部）仍保留 —— 它是大区列表唯一的同步入口');
  ok(/syncAllBtn/.test(sp), '「更新全部」按钮仍在行首');

  // i18n 三语键残留检查：syncRegionTitle / syncBtn / regionUpdated 都应已删
  const cn = read('src/i18n/parts/lanshare.zh-CN.js');
  const tw = read('src/i18n/parts/lanshare.zh-TW.js');
  const en = read('src/i18n/parts/lanshare.en.js');
  ok(!/syncRegionTitle|syncBtn|regionUpdated/.test(cn), 'zh-CN 已删 syncRegionTitle/syncBtn/regionUpdated');
  ok(!/syncRegionTitle|syncBtn|regionUpdated/.test(tw), 'zh-TW 已删同组废弃键');
  ok(!/syncRegionTitle|syncBtn|regionUpdated/.test(en), 'en 已删同组废弃键');
}

/* ============ 2. 遮罩层：变暗 + 模糊 + 动画 ============ */
console.log('[2] 遮罩层具备模糊与入退场动画');
{
  const base = read('src/styles/base.css');
  const themes = read('src/styles/themes.css');

  // token 已在 themes.css 的 :root 统一定义（避免「使用但未定义」的死 token）
  // :root 可能有多段（z-index 段、等宽字体段、遮罩段），逐段找含 mask 的那段
  const hasMaskToken =
    /--mask-blur\s*:\s*[0-9.]+px/.test(themes) &&
    /--mask-in\s*:\s*0?\.18s/.test(themes) &&
    /--mask-out\s*:\s*0?\.14s/.test(themes);
  ok(hasMaskToken, 'themes.css 定义 --mask-blur/--mask-in/--mask-out（单一数据源）');
  // Beta.286→288：10px（太浓）→ 4px（仍偏浓）→ 1px（极轻）。断言锁住「轻模糊」方向。
  ok(/--mask-blur\s*:\s*1px/.test(themes), '--mask-blur 为 1px（极轻模糊）');

  // .modal-mask 必须用 backdrop-filter 做模糊，而非仅变暗。
  // Beta.322：遮罩外观（fixed/背景/模糊/入场动画）与布局（grid 居中/留白）拆成了两条规则：
  //   `.modal-mask, .iv-mask { …外观… }` + `.modal-mask { display:grid; … }`。
  //   原因是看图器借用 .modal-mask 时把 grid 居中一起继承了，导致关闭按钮位置错乱。
  //   故这里的断言改为「外观族里含 .modal-mask，且该族带模糊与入场动画」，
  //   同时补一条：布局规则里不得再重复写模糊/动画（拆开是为了不再耦合，不是抄两份）。
  const mm = block(base, '.modal-mask');
  ok(!!mm, '.modal-mask 规则存在（布局段）');
  const shared = block(base, '.modal-mask,\n.iv-mask');
  ok(!!shared, '遮罩外观为 .modal-mask / .iv-mask 共用规则（拆分后的单一来源）');
  ok(
    shared && /backdrop-filter\s*:\s*blur\(var\(--mask-blur\)\)/.test(shared),
    '.modal-mask 用 backdrop-filter: blur（不再只是简单变暗）'
  );
  ok(shared && /animation:\s*mask-in/.test(shared), '.modal-mask 有入场动画 mask-in');
  ok(mm && !/backdrop-filter|animation:/.test(mm), '布局段不重复写模糊/动画（外观只在共用规则里定义一次）');

  // 退场态：.is-leaving 触发 mask-out
  ok(
    /\.modal-mask\.is-leaving\s*,\s*\.sp-mask\.is-leaving/.test(base) || /mask-out/.test(base),
    '退场动画 mask-out 已定义'
  );
  ok(/@keyframes\s+mask-in/.test(base), '@keyframes mask-in 存在');
  ok(/@keyframes\s+mask-out/.test(base), '@keyframes mask-out 存在');

  // 弹窗本身有入退场
  ok(/@keyframes\s+modal-in/.test(base), '弹窗入场 modal-in 存在');
  ok(/@keyframes\s+modal-out/.test(base), '弹窗退场 modal-out 存在');

  // 抽屉滑入滑出
  const sp = read('src/components/SharePanel.vue');
  ok(/@keyframes\s+drawer-in/.test(sp), '抽屉入场 drawer-in 存在');
  ok(/@keyframes\s+drawer-out/.test(sp), '抽屉退场 drawer-out 存在');
  ok(/backdrop-filter\s*:\s*blur\(var\(--mask-blur\)\)/.test(sp), '抽屉遮罩同样有模糊');

  // wire 主题：遮罩是 80% 白，模糊关成 0
  ok(
    /\[data-theme='wire'\]\s*\.modal-mask[\s\S]*?--mask-blur\s*:\s*0px/.test(base),
    'wire 主题把 --mask-blur 关成 0（白底无需模糊）'
  );

  // reduced-motion：关动画、关模糊，但保留变暗
  ok(/prefers-reduced-motion/.test(base), '有 prefers-reduced-motion 降级');
  const rm = base.slice(base.indexOf('prefers-reduced-motion'));
  ok(/animation:\s*none\s*!important/.test(rm), '减弱动效时动画全关（!important）');
  ok(/--mask-blur\s*:\s*0px/.test(rm), '减弱动效时模糊也关掉');
}

/* ============ 3. Mask 组件：requestClose 透传 ============ */
console.log('[3] Mask 组件与 requestClose 透传');
{
  const mask = read('src/components/Mask.vue');
  const modal = read('src/components/Modal.vue');

  ok(/requestClose/.test(mask), 'Mask 暴露 requestClose');
  ok(/is-leaving/.test(mask), 'Mask 用 .is-leaving 标记退场态');
  ok(/animationend/.test(mask), 'Mask 监听 animationend 以在动画后收尾');
  ok(/emit\('close'\)/.test(mask), 'Mask 在动画结束后 emit close');

  ok(/<slot\s+:requestClose="requestClose"/.test(modal), 'Modal 把 requestClose 透传给内容 slot');
  ok(/@click="requestClose"/.test(modal), 'Modal 头部关闭按钮走 requestClose');

  // 各弹窗的「取消/关闭」按钮应改用 requestClose，而非直接 $emit('close')
  const files = [
    'src/components/RegionModal.vue',
    'src/components/CopyTargetDialog.vue',
    'src/components/ImportWizard.vue',
    'src/components/settings/SecurityModal.vue',
    'src/components/post/TagCloud.vue',
    'src/components/post/VersionDiffModal.vue',
    'src/components/MergeDialog.vue',
    'src/components/taxonomy/FieldModal.vue',
    'src/components/taxonomy/CategoryModal.vue',
    'src/components/taxonomy/TagModal.vue',
    'src/components/PasswordGate.vue',
    'src/components/ConfirmDialog.vue'
  ];
  let missing = [];
  for (const f of files) {
    const src = read(f);
    // 每个弹窗都应出现「用 requestClose 关闭」的痕迹（要么 slot 作用域，要么 @click=requestClose）
    const okHere = /requestClose/.test(src);
    if (!okHere) missing.push(f);
  }
  ok(missing.length === 0, '12 处弹窗均已接入 requestClose' + (missing.length ? ' → 缺：' + missing.join(' | ') : ''));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
