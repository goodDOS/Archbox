/**
 * 图片查看器「适应窗口」契约（Beta.324 追加）。
 *
 * 【为什么要有这一场】
 *   用户发来截图：「这个按钮点击不了」—— 图片全屏查看器顶栏的「适应窗口」按钮
 *   看起来毫无效果。根因不是 JS（setFit 一直好着），而是 CSS 布局模型选错：
 *
 *     .iv-stage 原是 display:grid; place-items:center。grid 的隐式行是 auto 尺寸，
 *     图片的 max-height:100% 对 auto 轨道无解析参照 → 直接失效；
 *     而 max-width:100% 意外生效（宽度方向能被内容撑开后夹住）。
 *     于是 fit 态渲染出一张「宽被夹、高没夹」的图，照样超出窗口。
 *
 *   实测证据（Chromium 无头，舞台内容区 1248×629、图 2000×1200）：
 *     grid + place-items:center → 图片 1231×739，纵向溢出 110px（按钮像坏了）
 *     flex + margin:auto       → 图片 1048×629，完整装入（按钮正常）
 *
 *   ★ 这个坑的隐蔽处：JS 逻辑、class 绑定、按钮高亮全都正确，肉眼看 CSS 也觉得
 *     「max-width/max-height 都写了」—— 只有拿到真实浏览器里量像素才能发现。
 *     所以本场测试分两层：静态断言锁写法（本文件），
 *     运行时量测见 scripts/check-image-fit.mjs（拿真实产物 CSS 量，人工跑）。
 *
 * 【本条测试锁什么】
 *   1. .iv-stage 必须是 flex（百分比 max-* 的解析前提），不得回到 grid；
 *   2. fit 态 .iv-img 必须保留 max-width/height:100%，且用 margin:auto 居中
 *      （只靠 align-items:center 的话，原尺寸态溢出时起始边被裁且滚不到）；
 *   3. 1:1 态 .iv-img:not(.fitted) 必须显式清掉 max-*；
 *   4. 两个模式按钮独立存在且各自接线 setFit(true) / setFit(false)。
 *
 * 运行：node electron/verify/image-lightbox-fit.test.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness } from './_harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { ok, section, done } = createHarness();

const read = p => readFileSync(path.join(root, p), 'utf8');
const boxSrc = read('src/components/post/ImageLightbox.vue');
const baseCss = read('src/styles/base.css');

/** 剥掉 HTML 注释与 CSS 注释。
 *  ★ 为什么必须剥 CSS 注释：本文件的 .iv-stage 注释里就写着「display:grid」的反面教材，
 *    不剥的话 `!/display:\s*grid/` 会被自己的注释喂饱，测试假绿。
 *    这个坑上上轮在 settings-card-gap 里刚踩过一次（被 HTML 注释喂饱）。 */
function stripComments(s) {
  return s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const style = stripComments((/<style[^>]*>([\s\S]*?)<\/style>/.exec(boxSrc) || [null, ''])[1]);
const tpl = stripComments((/<template>([\s\S]*)<\/template>/.exec(boxSrc) || [null, ''])[1]);
const script = stripComments((/<script setup>([\s\S]*?)<\/script>/.exec(boxSrc) || [null, ''])[1]);

/**
 * 取出「选择器正好是 sel」的那条规则体（花括号内容）。
 * 不用全文正则：全文里 .iv-img 的注释、其它规则的属性都会误命中。
 * 返回 '' 表示没找到。
 */
function rule(sel) {
  const re = new RegExp('(?:^|[},]\\s*)' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm');
  const m = re.exec(style);
  return m ? m[1] : '';
}

section('[1] 舞台布局：必须是 flex（根因修复，勿改回 grid）');

const stage = rule('.iv-stage');
ok(stage !== '', '（依据）.iv-stage 规则存在');
ok(
  /display:\s*flex/.test(stage) && !/display:\s*grid/.test(stage),
  '★ .iv-stage 用 display:flex —— grid 的隐式行是 auto 尺寸，max-height:100% 无参照会失效（Beta.324 实测溢出 110px）'
);
ok(!/place-items/.test(stage), '★ .iv-stage 不得再用 place-items 居中（那是 grid 专属属性，留着只会误导后人）');
ok(
  /flex:\s*1/.test(stage) && /min-height:\s*0/.test(stage),
  '★ .iv-stage 保持 flex:1 + min-height:0 —— 舞台高度由此确定，子图百分比才有解析参照'
);
ok(/overflow:\s*auto/.test(stage), '★ .iv-stage 保持 overflow:auto —— 原尺寸态大于窗口时必须能滚动看到全图');

section('[2] fit 态约束：max-* + margin:auto');

const img = rule('.iv-img');
ok(
  /max-width:\s*100%/.test(img) && /max-height:\s*100%/.test(img),
  '★ .iv-img fit 态保留 max-width/max-height:100%（这是「适应窗口」的本体）'
);
ok(
  /margin:\s*auto/.test(img),
  '★ .iv-img 用 margin:auto 居中 —— 只靠 align-items:center 时，原尺寸态溢出会裁掉起始边且滚不到（flex 经典坑）'
);
ok(/object-fit:\s*contain/.test(img), '★ .iv-img 保留 object-fit:contain（窄屏按比例收，不裁切）');
ok(
  /width:\s*auto/.test(img) && /height:\s*auto/.test(img),
  '★ .iv-img 宽高 auto —— 由 intrinsic size 与 max-* 共同决定，不写死尺寸'
);

section('[3] 1:1 态：必须显式清掉 max-*');

const oneToOne = rule('.iv-img:not(.fitted)');
ok(oneToOne !== '', '（依据）.iv-img:not(.fitted) 规则存在');
ok(
  /max-width:\s*none/.test(oneToOne) && /max-height:\s*none/.test(oneToOne),
  '★ 1:1 态显式 max-width/height:none —— 否则放大后仍被容器夹住 =「点原始尺寸没反应」'
);

section('[4] 两个模式按钮独立且接线正确');

ok(/@click\.stop="setFit\(true\)"/.test(tpl), '★ 「适应窗口」按钮接 setFit(true)');
ok(/@click\.stop="setFit\(false\)"/.test(tpl), '★ 「原始尺寸」按钮接 setFit(false)');
ok(
  (tpl.match(/class="btn btn-sm iv-mode"/g) || []).length === 2,
  '★ 顶栏是两个独立按钮（不是二合一的翻翻按钮）—— 用户要能看出当前在哪一态'
);
ok(
  /:aria-pressed="fitted"/.test(tpl) && /:aria-pressed="!fitted"/.test(tpl),
  '★ 两个按钮各带 aria-pressed 反映当前态（无障碍）'
);
ok(
  /function setFit\(toFit\)[\s\S]*?fitted\.value = toFit/.test(script),
  '★ setFit 真的改写 fitted（幂等：重复点同一模式直接 return）'
);

section('[5] 铺满前提：.iv-mask 是 block');

ok(
  /\.iv-mask\s*\{[^}]*display:\s*block/.test(baseCss),
  '★ .iv-mask 在 base.css 里是 display:block —— 看图器铺满视口，不继承 .modal-mask 的 grid 居中'
);

done();
