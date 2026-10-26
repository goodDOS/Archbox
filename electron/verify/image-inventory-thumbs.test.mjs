/**
 * 图片文件板块：缩略图 + 独立成卡契约（Beta.324 追加）。
 *
 * 【为什么要有这一场】
 *   用户对设置页「数据清洗」里的图片文件提了三条：
 *     ①「图片文件应独立在数据清洗板块之下」——此前内嵌在清洗卡内部（卡片套卡片，
 *        正是 Beta.323「没做好间隔」的同类根因，见 settings-card-gap.test.mjs）；
 *     ②「显示缩略图，点击缩略图展开大图」——Beta.322 刻意不做缩略图，怕原图把页面拖死；
 *     ③「去掉现有查看原图按钮」——既已有点击目标，右侧放大镜就是重复入口。
 *
 *   ②的代价必须被结构挡死，否则「敢显示图」会退化成「页面卡死」：
 *     · 懒加载：IntersectionObserver 只取可见行，root 必须是滚动容器本身
 *       （用整页视口会把 20 行全算上，懒加载白做）；
 *     · 渲染层缩放：原图缩到 ≤88px 才进 <img>（浏览器按原图像素解码，
 *       4K 图一张 33MB 位图，七八行同屏就是两三百 MB）；
 *     · 串行解码：同时只有一张原图在内存里被完整解码；
 *     · 原图不缓存：点缩略图按 id 重取，本地 IPC 几十毫秒换内存有界。
 *
 * 【本条测试锁什么】
 *   1. 缩略图列在表格首位，动作列（查看原图按钮）彻底消失，且缩略图按钮
 *      带齐 title + aria-label（纯图标按钮的唯一可读线索）；
 *   2. 懒加载三件套的接线（observer / root / 串行队列 / 状态机）；
 *   3. 板块独立：SettingsPage 用 .card-stack 平铺两张卡，CleanupSection
 *      改为 emit('cleaned') 通知父层刷新，不再持别人的 ref；
 *   4. thumbImage.js 的尺寸数学（纯函数，Node 下直接跑）。
 *
 * 运行：node electron/verify/image-inventory-thumbs.test.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHarness } from './_harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { ok, section, done } = createHarness();

const read = p => readFileSync(path.join(root, p), 'utf8');

/** 取出 .vue 的 <template> 段 */
function tpl(src) {
  const m = /<template>([\s\S]*)<\/template>/.exec(src);
  return m ? m[1] : '';
}
/** 取出 .vue 的 <script setup> 段 */
function script(src) {
  const m = /<script setup>([\s\S]*)<\/script>/.exec(src);
  return m ? m[1] : '';
}
/** 取出选择器对应的声明块（selector 到配对的 }），注释已剥 */
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
/** 声明块里某属性的最终值（取最后一条，模拟层叠） */
function prop(decl, name) {
  if (!decl) return null;
  const re = new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+)`, 'g');
  let v = null;
  let m;
  while ((m = re.exec(decl))) v = m[1].trim();
  return v;
}
/** 剥 CSS 注释：注释里写着「44px」这类说明，不剥则删光规则也能过 */
const stripCssComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
/** 剥模板注释：说明文字里常写着旧结构（「点右侧按钮看原图」），会喂饱断言 */
const stripTplComments = s => s.replace(/<!--[\s\S]*?-->/g, '');

const invSrc = read('src/components/settings/ImageInventory.vue');
const invTpl = stripTplComments(tpl(invSrc));
const invScript = script(invSrc);
const invCss = stripCssComments((/<style[^>]*>([\s\S]*?)<\/style>/.exec(invSrc) || [null, ''])[1]);
const spSrc = read('src/pages/SettingsPage.vue');
const spTpl = stripTplComments(tpl(spSrc));
const clSrc = read('src/components/settings/CleanupSection.vue');
const clTpl = stripTplComments(tpl(clSrc));
const clScript = script(clSrc);

/* ============ 1. 缩略图列：表格结构 ============ */
section('1. 缩略图列与表格结构');

// 列顺序：缩略图必须是第一列（视觉起点），编号列紧随其后
const thOrder = [...invTpl.matchAll(/<th class="(ii-c-[\w-]+)">([^<]*)<\/th>/g)].map(m => m[1]);
ok(
  thOrder[0] === 'ii-c-thumb' && thOrder[1] === 'ii-c-no',
  `★ 缩略图列在表格首位，编号列次之（实得 ${thOrder.join(' → ')}）`
);
ok(thOrder.length === 6, `★ 共 6 列（实得 ${thOrder.length}）`);
ok(/t\('settings\.imgInvColThumb'\)/.test(invTpl), '★ 缩略图列头走 i18n key（不硬编码中文）');
// 空态 colspan 必须与列数一致，否则空态行会撑出第七格
const colspans = [...invTpl.matchAll(/colspan="(\d+)"/g)].map(m => Number(m[1]));
ok(colspans.length > 0 && colspans.every(n => n === 6), `★ 空态 colspan 与列数一致（实得 ${colspans.join(',')}）`);

// 动作列必须彻底消失：用户原话「去掉现有查看原图按钮」
ok(!/ii-c-act/.test(invTpl), '★ 模板里不再有 ii-c-act 动作列');
ok(!/ii-c-act/.test(invCss), '★ 样式里不再有 ii-c-act 规则（死 CSS 一并清掉）');
ok(!/name="maximize"/.test(invTpl), '★ 放大镜图标按钮已移除（原「查看原图」入口）');

/* ============ 2. 缩略图按钮：可访问性与点击语义 ============ */
section('2. 缩略图按钮的可读线索与点击语义');

// 按钮上同时有 title 与 aria-label（ui-theme-rules 第 8 节：纯图标按钮缺一即不可访问）
const thumbBtn = (/<button[\s\S]*?class="ii-thumb"[\s\S]*?>/.exec(invTpl) || [''])[0];
ok(!!thumbBtn, '★ 存在 class="ii-thumb" 的缩略图按钮');
ok(/:title="t\('settings\.imgInvView'\)"/.test(thumbBtn), '★ 缩略图按钮带 title（悬停提示，走 i18n）');
ok(/:aria-label="t\('settings\.imgInvView'\)"/.test(thumbBtn), '★ 缩略图按钮带 aria-label（读屏唯一线索，走 i18n）');
ok(/@click="viewImage\(r\)"/.test(thumbBtn), '★ 点缩略图即展开大图（viewImage 接管原「查看原图」按钮的职责）');
// 缩略图 img 的 alt 必须为空：可读线索由按钮的 aria-label 提供，
// 两边都念会让读屏用户听到两遍（img 在此是装饰性的）
ok(
  /<img v-if="thumbs\[r\.id\]" :src="thumbs\[r\.id\]" alt="" draggable="false"/.test(invTpl),
  '★ 缩略图 img alt=""（线索只由按钮 aria-label 出，不重复）'
);

/* ============ 3. 懒加载与内存边界 ============ */
section('3. 懒加载三件套（observer / 缩放 / 串行）');

ok(
  /import \{ makeThumbSrc \} from '\.\.\/\.\.\/utils\/thumbImage'/.test(invScript),
  '★ 缩略图缩放走 utils/thumbImage 单一来源（不内联一份 canvas 代码）'
);
ok(/new IntersectionObserver\(/.test(invScript), '★ 用 IntersectionObserver 按需加载（不是整页一次性全取）');
ok(
  /\{ root, rootMargin: '120px 0px' \}/.test(invScript),
  '★ observer 的 root 是滚动容器本身（用整页视口会把 20 行全算上，懒加载白做）'
);
ok(/root\.querySelectorAll\('\.ii-thumb'\)/.test(invScript), '★ 观察目标是缩略图按钮（按 data-id 反查行）');
ok(
  /typeof IntersectionObserver !== 'function'/.test(invScript),
  '★ 无 observer 的环境退化为整页加载（功能不残缺，只是没了按需）'
);
ok(
  /let thumbQueue = Promise\.resolve\(\)/.test(invScript),
  '★ 缩略图加载排队执行（同时只有一张原图被完整解码，内存有界）'
);
ok(
  /thumbQueue = thumbQueue[\s\S]*?\.then\(\(\) => loadThumb\(r\)\)/.test(invScript),
  '★ 新加载接到队列尾巴（不并发起跳）'
);
ok(
  /if \(thumbState\[r\.id\]\) return;/.test(invScript),
  '★ 已有状态（loading/ok/err）不重复加载——失败也不重试，反复打 IPC 救不回坏图'
);
ok(/thumbState\[r\.id\] = 'err'/.test(invScript), '★ 取图/缩放失败落入 err 态（回落扩展名占位，不出裂图）');
ok(/nextTick\(observeThumbs\)/.test(invScript), '★ 每次 reload 后重新观察新一行（翻页/筛选后懒加载不断链）');
ok(/io\.disconnect\(\)/.test(invScript), '★ 卸载/重观察前 disconnect（不泄漏观察器）');
ok(/const thumbs = reactive\(\{\}\)/.test(invScript), '★ 缩略图小图跨页保留（翻回来看过的页不重新取，每张仅几十 KB）');

// 原图不缓存：viewImage 必须现取，而不是把刚缩略用的原图攒在内存里
ok(!/fullSrc|srcCache|fullCache/.test(invScript), '★ 不缓存原图 data URI（缓存 N 张原图 = 把内存问题原样搬回来）');
ok(/if \(viewingId\.value\) return;/.test(invScript), '★ 看大图期间挡连点（否则连点会叠出多个浮层）');
ok(
  /A\.cleanupImageData\(\{ id: r\.id \}\)/.test(invScript),
  '★ 点缩略图按 id 单取原图（复用既有 cleanup:imageData 通道，不新开 IPC）'
);
ok(
  /viewer\.value = \{ src: d\.src, alt: r\.no \}/.test(invScript),
  '★ 取到原图后进 ImageLightbox（复用 #426 修好的看图器）'
);
ok(/<ImageLightbox v-if="viewer"/.test(invTpl), '★ 模板挂载 ImageLightbox（与正文点图同一套交互）');

/* ============ 4. 缩略图样式 ============ */
section('4. 缩略图样式（44px 方格 + 动效）');

const thumbCss = block(invCss, '.ii-thumb');
ok(!!thumbCss, '.ii-thumb 规则存在');
ok(
  thumbCss && prop(thumbCss, 'width') === '44px',
  '按钮宽 44px（实得 ' + (thumbCss ? prop(thumbCss, 'width') : '无') + '）'
);
ok(thumbCss && prop(thumbCss, 'height') === '44px', '按钮高 44px（与宽一致，方格）');
ok(thumbCss && prop(thumbCss, 'overflow') === 'hidden', 'overflow:hidden（圆角裁切图片，不溢出）');
ok(thumbCss && prop(thumbCss, 'cursor') === 'zoom-in', 'cursor:zoom-in（「点了会变大」的通行手势）');
ok(thumbCss && prop(thumbCss, 'padding') === '0', 'padding:0（图片自己填满方格）');
const imgCss = block(invCss, '.ii-thumb img');
ok(imgCss && prop(imgCss, 'object-fit') === 'cover', '图片 object-fit:cover（方格里裁切展示，同资源管理器）');
ok(imgCss && prop(imgCss, 'width') === '100%' && prop(imgCss, 'height') === '100%', '图片 100% 填满按钮');
const loadCss = block(invCss, '.ii-thumb-loading .ii-thumb-ph');
ok(!!loadCss && /animation:\s*ii-thumb-breathe/.test(loadCss), '★ 加载中有呼吸动画（全站交互必带动效的约定）');
ok(/@keyframes ii-thumb-breathe/.test(invCss), '★ 呼吸动画 keyframes 已定义（只引不定义 = 动画不存在）');
const busyCss = block(invCss, '.ii-thumb-busy');
ok(!!busyCss && prop(busyCss, 'pointer-events') === 'none', '取原图等待态挡交互（pointer-events:none）');
const colCss = block(invCss, '.ii-c-thumb');
ok(colCss && prop(colCss, 'width') === '60px', '缩略图列宽 60px（44px 按钮 + 单元格 padding）');

/* ============ 5. 板块独立：SettingsPage 平铺两张卡 ============ */
section('5. 图片文件独立在数据清洗之下');

const cleanupBlock = (/<div v-if="sec === 'cleanup'" class="card-stack">[\s\S]*?<\/div>/.exec(spTpl) || [''])[0];
ok(!!cleanupBlock, '★ cleanup 分区由 .card-stack 承载（卡片间距的单一来源，见 settings-card-gap 测试）');
ok(/<CleanupSection @cleaned="reloadImages" \/>/.test(cleanupBlock), '★ 清洗卡在前，@cleaned 接线到清单刷新');
ok(
  /<ImageInventory ref="invRef" \/>/.test(cleanupBlock),
  '★ 图片文件卡在后，与清洗卡平级（用户原话「独立在数据清洗板块之下」）'
);
// 顺序即视觉顺序：清洗在上、清单在下
ok(
  cleanupBlock.indexOf('<CleanupSection') < cleanupBlock.indexOf('<ImageInventory'),
  '★ 清洗卡排在清单卡之前（先看删什么，再看库里有什么）'
);
ok(
  /function reloadImages\(\)[\s\S]*?invRef\.value\.reload\(1\)/.test(spSrc),
  '★ 清理完成后父层刷新清单（清完数字不跟着变，用户会以为没成功）'
);

// CleanupSection 不再内嵌清单、不持别人的 ref，改走事件
ok(!/ImageInventory/.test(clSrc), '★ CleanupSection 不再 import/引用 ImageInventory（卡片套卡片解体）');
ok(!/invRef/.test(clSrc), '★ CleanupSection 不再持有清单组件的 ref');
ok(/const emit = defineEmits\(\['cleaned'\]\)/.test(clScript), '★ CleanupSection 声明 cleaned 事件');
ok(/emit\('cleaned'\)/.test(clScript), '★ 清理成功后发出 cleaned（父层才刷得了清单）');

/* ============ 6. thumbImage.js 尺寸数学（纯函数直跑） ============ */
section('6. thumbImage.js 尺寸数学');

const mod = await import(pathToFileURL(path.join(root, 'src/utils/thumbImage.js')).href);
ok(mod.THUMB_MAX === 88, `THUMB_MAX = 88（实得 ${mod.THUMB_MAX}）——列表行高约 56px，再大就失去「缩略」的意义`);
ok(typeof mod.makeThumbSrc === 'function', 'makeThumbSrc 已导出（渲染层 canvas 缩放入口）');

{
  // 横图：长边封顶，短边等比
  const r = mod.thumbBox(400, 300, 88);
  ok(r.w === 88 && r.h === 66, `横图 400×300 → 88×66（实得 ${r.w}×${r.h}）`);
  // 竖图：高封顶
  const r2 = mod.thumbBox(300, 400, 88);
  ok(r2.w === 66 && r2.h === 88, `竖图 300×400 → 66×88（实得 ${r2.w}×${r2.h}）`);
  // 小图不放大（1:1 比模糊的放大图信息量更大）
  const r3 = mod.thumbBox(40, 30, 88);
  ok(r3.w === 40 && r3.h === 30, `小图 40×30 不放大（实得 ${r3.w}×${r3.h}）`);
  // 极端比例不塌成 0（1px 是底线，0 宽的 img 会破坏表格行高）
  const r4 = mod.thumbBox(4000, 3, 88);
  ok(r4.w === 88 && r4.h === 1, `超宽图 4000×3 → 88×1（实得 ${r4.w}×${r4.h}，不允许塌成 0）`);
  // 非法尺寸：接口层拿到的可能是 undefined/null/NaN
  ok(mod.thumbBox(0, 100).w === 0 && mod.thumbBox(0, 100).h === 0, '宽为 0 → {0,0}（调用方据此走占位）');
  ok(mod.thumbBox(100, 0).w === 0, '高为 0 → {0,0}');
  ok(mod.thumbBox(NaN, 50).w === 0, 'NaN → {0,0}');
  ok(mod.thumbBox(undefined, undefined).w === 0, 'undefined → {0,0}');
  // 自定义上限被尊重（别处复用时可要更小的格子）
  ok(mod.thumbBox(200, 200, 32).w === 32, '自定义 max=32 生效（200×200 → 32×32）');
}

done();
