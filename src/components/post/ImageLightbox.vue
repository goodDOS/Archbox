<template>
  <!--
    图片全屏查看器（Beta.316 起，Beta.322 修三处硬伤）。

    【为什么不复用 Modal.vue】
      Modal 是「有标题栏 + 固定 maxWidth 的小卡片」，而这里要的是**铺满视口的看图器**：
      没有标题栏、没有 maxWidth、图片可能远大于屏幕需要缩放/平移。

    【Beta.322 修的三处】
      1. 关闭按钮位置错误 —— 根因在布局，不在按钮。
         `.modal-mask` 是 `display:grid; place-items:center`，遮罩会把自己唯一的子元素
         **按内容宽度居中**。本组件内层写 `position:absolute; inset:0`，本该铺满，
         但父级是 grid、且 Mask 的 slot 内容被当成一个 grid item，absolute 相对的是
         已带 padding 的遮罩盒子，实际量出来的宽度只有内容宽 —— 于是顶栏连同关闭按钮
         被挤到画面中间偏右。现在给内容区加 `width:100%; height:100%` 并让遮罩
         在「看图器」场景下改用 `display:block`（maskClass 传 iv-mask），
         铺满这件事不再依赖各子元素的定位技巧。
      2. 「适应窗口 / 原始尺寸」无效 —— 根因是 CSS 覆盖 + 舞台用错布局模型。
         原先靠 :class="{fitted}" 控制 max-width/max-height，但舞台是
         grid「place-items:center」：隐式行是 auto 尺寸，图片的
         max-height:100% 无解析参照直接失效（max-width 意外生效），
         fit 态图片仍超出窗口；「原始尺寸」又只改内联宽高、被 max-* 夹住，
         看起来毫无变化。现在：舞台改 flex（高度经 flex:1+min-height:0 确定，
         百分比有参照，实测 2000×1200 的图在 1248×629 舞台里收成 1048×629），
         1:1 态显式清掉 max-*，两者互不覆盖，切换立刻可见。
      3. 顶栏按钮语义 —— 原先是单个「二选一」按钮（点一下在两种模式间翻），
         用户看不出当前在哪一态。现在拆成两个独立按钮，当前态高亮。

    【关闭路径】Esc / 点空白 / 右上 × ，三条都走 Mask 的 requestClose，
      保证退场动画完整播完再卸载。
  -->
  <Mask mask-class="iv-mask" @close="$emit('close')">
    <template #default="{ requestClose }">
      <div class="iv-wrap" @click.self="requestClose">
        <div class="iv-bar">
          <span class="iv-info">{{ infoText }}</span>
          <div class="spacer"></div>
          <!-- 两个独立按钮，当前模式高亮（用户原话：「适应窗口与原尺寸按钮功能实则无效」，
               除了 CSS 真失效，二合一按钮也让人看不出当前处于哪一态） -->
          <button
            class="btn btn-sm iv-mode"
            :class="{ on: fitted }"
            :aria-pressed="fitted"
            @click.stop="setFit(true)"
            :title="t('post.imgZoomFitHint')"
          >
            {{ t('post.imgZoomFit') }}
          </button>
          <button
            class="btn btn-sm iv-mode"
            :class="{ on: !fitted }"
            :aria-pressed="!fitted"
            @click.stop="setFit(false)"
            :title="t('post.imgZoomActualHint')"
          >
            {{ t('post.imgZoomActual') }}
          </button>
          <button
            class="btn btn-sm btn-icon"
            @click.stop="requestClose"
            :title="t('common.close')"
            :aria-label="t('common.close')"
          >
            <Icon name="x" :size="15" />
          </button>
        </div>
        <div class="iv-stage" ref="stageRef" @click.self="requestClose" @wheel.prevent="onWheel">
          <img
            ref="imgRef"
            class="iv-img"
            :class="{ fitted, dragging }"
            :style="imgStyle"
            :src="src"
            :alt="alt"
            draggable="false"
            @load="onLoad"
            @mousedown.prevent="onDown"
          />
        </div>
      </div>
    </template>
  </Mask>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import Mask from '../Mask.vue';
import Icon from '../Icon.vue';
import { t } from '../../i18n';

defineProps({
  /** 图片地址（data: URI 或远程地址） */
  src: { type: String, required: true },
  alt: { type: String, default: '' }
});
const emit = defineEmits(['close']);

const stageRef = ref(null);
const imgRef = ref(null);
// 图片固有像素尺寸：load 后才有值，之前按 0 处理（不显示比例文案）
const natural = ref({ w: 0, h: 0 });
// 适应窗口 / 原始尺寸
const fitted = ref(true);
// 缩放倍率：仅在「原始尺寸」模式下有意义（1 = 100%）
const zoom = ref(1);
const dragging = ref(false);
// 原始尺寸模式下拖拽平移的偏移
const pan = ref({ x: 0, y: 0 });
let dragStart = null;

const infoText = computed(() => {
  const { w, h } = natural.value;
  if (!w || !h) return '';
  const fit = fitted.value ? t('post.imgZoomFitted') : `${Math.round(zoom.value * 100)}%`;
  return `${w} × ${h} · ${fit}`;
});

/**
 * 两种模式的样式。
 *
 * ★ 为什么 fit 态返回空对象就够了 ★
 *   fit 态的所有约束都写在 CSS 的 .iv-img 默认态（max-width/height:100%），
 *   舞台用 flex 给出确定尺寸（见 .iv-stage 注释里的实测记录），百分比才有参照。
 *   1:1 态必须显式 max-width:none / max-height:none —— 否则放大后仍被容器夹住，
 *   这就是「点原始尺寸没反应」的直接原因。
 */
const imgStyle = computed(() => {
  if (fitted.value) return {};
  return {
    width: `${natural.value.w * zoom.value}px`,
    height: `${natural.value.h * zoom.value}px`,
    transform: `translate(${pan.value.x}px, ${pan.value.y}px)`
  };
});

function onLoad() {
  const el = imgRef.value;
  if (!el) return;
  natural.value = { w: el.naturalWidth || 0, h: el.naturalHeight || 0 };
}

/** 切到指定模式（true=适应窗口，false=原始尺寸）。重复点同一模式是幂等的 */
function setFit(toFit) {
  if (fitted.value === toFit) return;
  fitted.value = toFit;
  zoom.value = 1;
  pan.value = { x: 0, y: 0 };
}

/** 滚轮缩放（10% ~ 800%）：在适应窗口下滚轮直接进入 1:1 再缩，符合看图器的直觉 */
function onWheel(e) {
  if (fitted.value) {
    fitted.value = false;
    zoom.value = 1;
    pan.value = { x: 0, y: 0 };
    return;
  }
  const step = e.deltaY < 0 ? 0.15 : -0.15;
  zoom.value = Math.min(8, Math.max(0.1, Number((zoom.value + step).toFixed(2))));
}

function onDown(e) {
  if (fitted.value) return;
  dragging.value = true;
  dragStart = { x: e.clientX - pan.value.x, y: e.clientY - pan.value.y };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
function onMove(e) {
  if (!dragStart) return;
  pan.value = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
}
function onUp() {
  dragging.value = false;
  dragStart = null;
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('mouseup', onUp);
}

/** Esc 关闭：与点遮罩/点 × 同一路径（都经 Mask 的 requestClose，退场动画一致）。
 *  ★ Mask.vue 本身不监听键盘（各弹窗自行决定 Esc 语义），故这里就是唯一的 Esc 入口；
 *    capture 阶段监听，先于页面级快捷键拿到事件。 */
function onKey(e) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => {
  // capture：图片浮层常开在查找条/其它弹层之上，先于页面快捷键拿到 Esc
  window.addEventListener('keydown', onKey, true);
  // 首帧强制一次 layout，避免 mask 的 backdrop-filter 首帧跳变（同 Mask.vue 的做法）
  if (stageRef.value) void stageRef.value.offsetHeight;
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true);
  onUp();
});
</script>

<style scoped>
/* 浮层铺满：一级一级把「满」传下去。
 *
 * 原先只有 .iv-wrap 写了 position:absolute; inset:0，但它的父级（Mask 的 grid 容器）
 * 按内容宽度居中，absolute 的包含块是那个已带 padding 的盒子，量出来的宽度并不是视口宽。
 * 现在 .iv-wrap 直接 width/height 100%（相对父级 content box），配合
 * .iv-mask 的 display:block（见 base.css），铺满这件事就不依赖任何定位技巧。
 */
.iv-wrap {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
  gap: 10px;
}
.iv-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}
.spacer {
  flex: 1;
}
.iv-info {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* 模式按钮的「当前态」：靠配色而不是位移，符合全站按钮不做按下缩放的约定。
   配色沿用 .tb-btn.on 的同一组 token（--accent-weak 底 + --accent 字与边），
   不另造 --accent-soft / --accent-text-on-soft —— 那两个 token 全站从未定义，
   引用它们等于浏览器按无效值丢弃，按钮的当前态根本不显色。 */
.iv-mode.on {
  background: var(--accent-weak);
  border-color: var(--accent);
  color: var(--accent);
}
/* ★ 为什么舞台必须是 flex 而不是 grid（Beta.324 实测，勿改回 grid）★
 *   原先这里是 display:grid; place-items:center，实测（Chromium 无头，
 *   舞台 1248×629、图 2000×1200）：图片被渲染成 1231×739，纵向溢出 110px，
 *   「适应窗口」看起来毫无效果 —— 根因是 grid 的隐式行是 auto 尺寸，
 *   图片 max-height:100% 对 auto 轨道无解析参照，直接失效；max-width 却
 *   意外生效（隐式列也 auto，但宽度方向能被内容撑开后夹住），于是一张
 *   「宽被夹、高没夹」的图还是会超出窗口。
 *   改用 flex 后容器高度经 flex:1 + min-height:0 确定，百分比有参照：
 *   同一实测下图片 1048×629 完整装入。 */
.iv-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}
/* 默认（适应窗口）：百分比 max-* 要有参照，故舞台已给出确定尺寸；
 * object-fit: contain 保证窄屏下按比例收，不裁切。
 * margin:auto 而不是只靠 align-items:center：原尺寸态图片大于舞台时，
 * 居中 + 溢出会让起始边被裁且滚不到（flex 经典坑），auto margin 下
 * 负空闲空间归零、图片只从末端溢出，两个方向都能滚完整。 */
.iv-img {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  margin: auto;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}
/* 原始尺寸：必须显式清掉 max-*，否则放大后仍被容器夹住 =「按钮没反应」 */
.iv-img:not(.fitted) {
  max-width: none;
  max-height: none;
  cursor: grab;
}
.iv-img.dragging {
  cursor: grabbing;
}
</style>
