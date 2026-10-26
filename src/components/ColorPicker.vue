<template>
  <button type="button" class="cp-trigger" ref="rootBtn" :title="t(titleKey)" :aria-label="t(titleKey)" @click="toggle">
    <!-- 图标按用途区分，取 WPS / Office 文字软件的通行样式（Beta.328 用户要求
         「文字颜色与背景高亮图标参考 wps 或 office 等文字软件的样式」）：
           · 文字颜色 = 粗体 A 下压一条厚色条（AntD FontColorsOutlined，
             即 Office「字体颜色」按钮的原形）。整枚图标随当前色着色，
             色条就是「当前是什么色」的指示，故不再另接 .cp-bar，避免双条重叠。
           · 背景高亮 = 荧光笔（Lucide highlighter，WPS「突出显示」的笔形），
             笔下方另接 .cp-bar 色条；未设置时画棋盘格表示「透明/无」。
         仅 compact（编辑器工具栏）场景按 purpose 换图标；大号场景（设置页取色）
         保持原来的 ✦ 形，它本身就是「调色」的装饰符号。 -->
    <Icon
      v-if="compact"
      :name="purpose === 'highlight' ? 'highlight' : 'text-color'"
      :size="15"
      class="cp-icon"
      :style="{ color: iconColor }"
    />
    <span v-else class="cp-ico" :style="{ color: displayColor }">✦</span>
    <!-- 紧凑皮肤：高亮用途在图标下沿接一条色条，表明「当前是什么颜色」。
         文字颜色用途不接 —— FontColorsOutlined 自带厚色条（见上）。 -->
    <span
      v-if="compact && purpose === 'highlight'"
      class="cp-bar"
      :class="{ 'cp-bar-unset': !isSet }"
      :style="{ background: isSet ? displayColor : '' }"
      :aria-hidden="true"
    ></span>
    <Teleport to="body">
      <Transition name="pop-mask">
        <div v-if="open" class="pop-mask" @mousedown.self="open = false"></div>
      </Transition>
      <Transition name="pop">
        <div v-if="open" class="cp-popup" ref="popupRef" :style="posStyle" @mousedown.stop>
          <!-- 饱和度-明度面板：白→色相 的横向渐变叠 黑色纵向渐变 -->
          <div class="cp-sv" ref="svRef" :style="{ background: svBackground }" @pointerdown="onSvDown">
            <span class="cp-thumb" :style="{ left: s * 100 + '%', top: (1 - v) * 100 + '%' }"></span>
          </div>

          <!-- 色相条 -->
          <div class="cp-hue" ref="hueRef" @pointerdown="onHueDown">
            <span class="cp-thumb cp-hue-thumb" :style="{ left: (h / 360) * 100 + '%' }"></span>
          </div>

          <div class="cp-row">
            <button
              v-if="hasEyedropper"
              type="button"
              class="cp-drop"
              :title="t('settings.regionEyedropper')"
              @click="pickScreen"
            >
              <Icon name="dropper" :size="14" />
            </button>
            <span class="cp-preview" :style="{ background: modelValue }"></span>
            <input
              class="cp-hex mono"
              v-model="hexInput"
              maxlength="7"
              spellcheck="false"
              @change="commitHex"
              @keyup.enter="commitHex"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </button>
</template>

<script setup>
/**
 * 自建取色器（Beta.303）：取代原生 <input type="color">。
 *
 * 为什么自建：原生取色弹窗是 Chromium 绘制的独立窗口，颜色固定系统蓝灰、
 * 完全不吃主题 CSS 变量——与原生日历弹层是同一类「无皮肤」问题（日历已自建）。
 *
 * 结构：饱和度-明度（SV）面板 + 色相（H）条 + HEX 输入 + 屏幕取色（EyeDropper API）。
 * 交互：面板/色相条按住拖动实时 emit；点击外部或 Esc 关闭；滚动时重新定位。
 * 弹层定位、遮罩、进出动画与 DatePicker 同一套做法（Teleport + fixed + JS 计算）。
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import { DEFAULT_ACCENT } from '../store/modules/theme';
import { computeFixedPosition } from '../utils/positionPopup';
import { t } from '../i18n';

const props = defineProps({
  modelValue: { type: String, default: DEFAULT_ACCENT }, // '#rrggbb'
  active: { type: Boolean, default: false }, // 选中态描边（宿主传入）
  titleKey: { type: String, default: 'settings.regionColorCustom' }, // 触发器悬停文案（i18n key，使用时求值）
  compact: { type: Boolean, default: false }, // 紧凑皮肤：供编辑器工具栏等小按钮场景复用
  /**
   * 用途：'text'（文字颜色）| 'highlight'（高亮）。
   * 只影响紧凑皮肤的图标与色条形态 —— 二者共用同一套取色器逻辑，
   * 但必须让用户一眼看出「这个改字色、那个刷底色」。
   */
  purpose: { type: String, default: 'text' }
});
const emit = defineEmits(['update:modelValue']);

const popupRef = ref(null);
const svRef = ref(null);
const hueRef = ref(null);
const open = ref(false);
const hexInput = ref(props.modelValue);

/* HSV 内部状态（h: 0-360，s/v: 0-1） */
const h = ref(210);
const s = ref(0.8);
const v = ref(0.9);

/* EyeDropper API（Chromium 95+ / Electron 可用），不支持则不显示按钮 */
const hasEyedropper = typeof window !== 'undefined' && 'EyeDropper' in window;

/* ---------- 颜色换算 ---------- */
function hsvToHex(hh, ss, vv) {
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;
  let r = 0,
    g = 0,
    b = 0;
  if (hh < 60) {
    r = c;
    g = x;
  } else if (hh < 120) {
    r = x;
    g = c;
  } else if (hh < 180) {
    g = c;
    b = x;
  } else if (hh < 240) {
    g = x;
    b = c;
  } else if (hh < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const to = n => {
    const s = Math.round((n + m) * 255).toString(16);
    return s.length < 2 ? '0' + s : s;
  };
  return `#${to(r)}${to(g)}${to(b)}`;
}

function hexToHsv(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  let hh = 0;
  if (d !== 0) {
    if (mx === r) hh = 60 * (((g - b) / d) % 6);
    else if (mx === g) hh = 60 * ((b - r) / d + 2);
    else hh = 60 * ((r - g) / d + 4);
  }
  if (hh < 0) hh += 360;
  return { h: hh, s: mx === 0 ? 0 : d / mx, v: mx };
}

const normHex = x =>
  String(x || '')
    .trim()
    .toLowerCase();

/**
 * 当前是否真的设了颜色（modelValue 为空串表示「跟随默认」，即未设置）。
 * 工具栏场景下，编辑器光标落在没有字色/高亮的文字里就会传空串进来。
 */
const isSet = computed(() => !!normHex(props.modelValue));

/**
 * 触发器上「实时显示」用的颜色。
 *
 * ★ 为什么未设置时也要给一个具体颜色，而不是留空/画灰条：
 *   用户指的是「按钮应当实时显示当前颜色」——光标在正文里移动时，
 *   这两个按钮要像 Word / 石墨那样一直显示「现在这段文字是什么色」。
 *   若未设置就画一条灰边，视觉上等于「颜色未知」，反而不如实反映状态。
 *   所以未设置时回落到该用途的默认渲染色：
 *     · 文字颜色 → 继承正文色 --text
 *     · 高亮     → 透明（没有底色），用棋盘格表示「无」而不是画一块假色
 *   这两个值只影响触发器观感，不写回 modelValue，也不会污染文档内容。
 */
const displayColor = computed(() => {
  if (isSet.value) return normHex(props.modelValue);
  return props.purpose === 'highlight' ? 'transparent' : 'var(--text)';
});

/**
 * 图标着色用的颜色。
 *
 * 与 displayColor 的区别只在「未设置的高亮」这一种情况：
 *   色条用棋盘格表达「透明」，但图标若涂成 transparent 就等于消失了 ——
 *   按钮会变成一个只有小方格的怪东西。所以图标此时回落到常规前景色。
 */
const iconColor = computed(() => {
  if (isSet.value) return normHex(props.modelValue);
  if (props.purpose === 'highlight') return 'currentColor';
  return 'var(--text)';
});

/* 内部状态 → hex */
const internalHex = computed(() => hsvToHex(h.value, s.value, v.value));

/* 外部值变化（如点预设色块）→ 回写内部状态。与内部结果相同则不回写（避免拖动回环） */
watch(
  () => props.modelValue,
  val => {
    if (normHex(val) === normHex(internalHex.value)) return;
    const hsv = hexToHsv(val);
    if (hsv) {
      h.value = hsv.h;
      s.value = hsv.s;
      v.value = hsv.v;
    }
    hexInput.value = val;
  },
  { immediate: true }
);

function emitColor() {
  hexInput.value = internalHex.value;
  emit('update:modelValue', internalHex.value);
}

/* ---------- SV / 色相条拖动（Pointer Events） ---------- */
function bindDrag(e, el, fn) {
  el.setPointerCapture(e.pointerId);
  fn(e);
  const move = ev => fn(ev);
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

function ratioFromEvent(e, el, vertical) {
  const r = el.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  return vertical ? y : x;
}

function onSvDown(e) {
  bindDrag(e, svRef.value, ev => {
    s.value = ratioFromEvent(ev, svRef.value, false);
    v.value = 1 - ratioFromEvent(ev, svRef.value, true);
    emitColor();
  });
}
function onHueDown(e) {
  bindDrag(e, hueRef.value, ev => {
    h.value = ratioFromEvent(ev, hueRef.value, false) * 360;
    emitColor();
  });
}

/* ---------- HEX 输入 ---------- */
function commitHex() {
  const hsv = hexToHsv(hexInput.value);
  if (!hsv) {
    hexInput.value = internalHex.value;
    return;
  }
  h.value = hsv.h;
  s.value = hsv.s;
  v.value = hsv.v;
  emit('update:modelValue', internalHex.value);
  hexInput.value = internalHex.value;
}

/* ---------- 屏幕取色（EyeDropper） ---------- */
async function pickScreen() {
  try {
    const res = await new window.EyeDropper().open();
    const hsv = hexToHsv(res.sRGBHex);
    if (hsv) {
      h.value = hsv.h;
      s.value = hsv.s;
      v.value = hsv.v;
      emit('update:modelValue', hsvToHex(hsv.h, hsv.s, hsv.v));
    }
  } catch (e) {
    /* 用户按 Esc 取消，静默 */
  }
}

/* ---------- 开/关 + 定位（与 DatePicker 同一套） ---------- */
const posStyle = ref({ top: '0px', left: '0px' });
function positionPopup() {
  if (!rootBtn.value || !popupRef.value) return;
  const r = rootBtn.value.getBoundingClientRect();
  const pos = computeFixedPosition(r, { width: 236, height: popupRef.value.offsetHeight || 230, margin: 6 });
  posStyle.value = { top: pos.top + 'px', left: pos.left + 'px' };
}
const rootBtn = ref(null);
function toggle() {
  if (open.value) {
    open.value = false;
    return;
  }
  const hsv = hexToHsv(props.modelValue);
  if (hsv) {
    h.value = hsv.h;
    s.value = hsv.s;
    v.value = hsv.v;
  }
  hexInput.value = props.modelValue;
  open.value = true;
  nextTick(positionPopup);
}
function onScrollOrResize(e) {
  if (!open.value) return;
  if (popupRef.value && e && e.target && popupRef.value.contains(e.target)) return;
  positionPopup();
}
function onDocKey(e) {
  if (open.value && e.key === 'Escape') open.value = false;
}
onMounted(() => {
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);
  document.addEventListener('keydown', onDocKey);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScrollOrResize, true);
  window.removeEventListener('resize', onScrollOrResize);
  document.removeEventListener('keydown', onDocKey);
});

/* SV 面板背景：底色随色相变 */
const svBackground = computed(
  () => `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, ${hsvToHex(h.value, 1, 1)})`
);
</script>

<style scoped>
.cp-trigger {
  position: relative;
  width: 100%;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}

/* ★ 实时显示当前颜色（Beta.320）
 *
 * 图标本身就用当前颜色着色：这是「一眼看出现在是什么色」最直接的方式，
 * 也是 Word / Google Docs / 石墨这一层的通行做法。
 * 颜色由父级 .cp-trigger 的 `color` 继承而来（见 PostView 的 .editor-toolbar .cp-trigger），
 * 因此这里只负责「跟随 currentColor」，不写死任何颜色。 */
.cp-icon {
  color: currentColor;
}
/* 紧凑皮肤的色条（仅高亮用途，Beta.328 起文字颜色改由 FontColorsOutlined 自带色条）：
 * 贴在图标下沿，宽度与图标齐。高亮用「实心块」形（比文字颜色的下划线形更高），
 * 两种用途光看色条形状也能区分，不必依赖颜色本身。 */
.cp-bar {
  position: absolute;
  left: 50%;
  bottom: 3px;
  width: 12px;
  height: 4px;
  transform: translateX(-50%);
  border-radius: 1px;
  border: 1px solid transparent;
}
/* 未设置（跟随默认）时：高亮画棋盘格表示「透明」，而不是一块假的实色。
 * 文字颜色不会走这个分支（未设置时回落到 --text，见 displayColor）。 */
.cp-bar-unset {
  background-color: transparent !important;
  background-image:
    linear-gradient(45deg, var(--border-strong) 25%, transparent 25%),
    linear-gradient(-45deg, var(--border-strong) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--border-strong) 75%),
    linear-gradient(-45deg, transparent 75%, var(--border-strong) 75%);
  background-size: 4px 4px;
  background-position:
    0 0,
    0 2px,
    2px -2px,
    -2px 0;
  border-color: var(--border);
}
/* 紧凑皮肤下图标上移，给色条留位置 */
.cp-trigger:has(.cp-bar) {
  padding-bottom: 5px;
  box-sizing: border-box;
}
.cp-ico {
  font-size: 20px;
  line-height: 1;
}
/* 紧凑皮肤（编辑器工具栏）：与 .tb-btn 同尺寸语境，不抢焦点 */
.cp-ico-compact {
  font-size: 13px;
}
.cp-trigger.on {
  border-color: var(--text);
}

/* 透明遮罩与弹出/收回动画已上收 components.css（.pop-mask / .pop-* + keyframes pop-in/pop-out），
 * 与 DatePicker 共用同一套，此处不再重复定义。 */

/* 弹层：主题变量驱动，与 DatePicker 同款定位/动画 */
.cp-popup {
  position: fixed;
  z-index: var(--z-dropdown);
  width: 236px;
  padding: 10px;
  box-sizing: border-box;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  user-select: none;
  transform-origin: top left;
}

.cp-sv {
  position: relative;
  height: 150px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  cursor: crosshair;
  touch-action: none;
}
.cp-thumb {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: transparent;
  border: 2px solid #fff;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.55),
    inset 0 0 0 1px rgba(0, 0, 0, 0.35);
  transform: translate(-50%, -50%);
  pointer-events: none;
  box-sizing: border-box;
}
.cp-hue {
  position: relative;
  height: 12px;
  margin-top: 10px;
  border-radius: 999px;
  background: linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);
  cursor: pointer;
  touch-action: none;
}
.cp-hue-thumb {
  top: 50%;
  width: 14px;
  height: 14px;
}

.cp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.cp-drop {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: none;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  cursor: pointer;
  transition:
    color 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
}
.cp-drop:hover {
  color: var(--text);
  border-color: var(--accent);
  background: var(--accent-weak);
}
.cp-preview {
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
}
.cp-hex {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  background: var(--input-bg);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 12.5px;
  text-transform: uppercase;
}
.cp-hex:focus {
  border-color: var(--accent);
  outline: none;
}
</style>
