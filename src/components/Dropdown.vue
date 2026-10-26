<template>
  <div
    class="dropdown"
    :class="{
      open,
      disabled,
      'dropdown-toolbar': props.variant === 'toolbar',
      'dropdown-icon-btn': props.variant === 'icon-btn'
    }"
    ref="rootRef"
  >
    <button
      ref="triggerRef"
      type="button"
      class="dd-trigger"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-label="ariaLabel"
      :title="ariaLabel"
      @click="onTriggerClick"
      @keydown="onTriggerKey"
    >
      <!-- ★ Beta.316：icon 模式（工具栏纯图标化）。
           传 icon 时触发器只剩图标 + 折叠箭头，文字仍以 title/aria-label 保留可读性，
           不新增平行组件（见 no-duplicate-code：同类控件先扩既有实现）。 -->
      <Icon v-if="resolvedIcon" :name="resolvedIcon" :size="iconSize" class="dd-icon" />
      <!-- ★ Beta.325：triggerLabel 覆盖层。选中值不在 options 里时（编辑器字号的
           自定义像素值），selectedLabel 匹配不上只会显示占位符，调用方可传当前真实值。 -->
      <span v-else-if="triggerLabel" class="dd-label">{{ triggerLabel }}</span>
      <span v-else class="dd-label" :class="{ 'dd-placeholder': !selectedLabel }">
        {{ selectedLabel || placeholder || t('ui.dropdownPlaceholder') }}
      </span>
      <Icon name="chevron-down" :size="caretSize" :stroke="2" class="dd-caret" :class="{ flip: open }" />
    </button>
    <Teleport to="body">
      <Transition name="dd">
        <div v-if="open" ref="popupRef" class="dd-popup" :style="popupStyle" role="listbox" @mousedown.prevent>
          <div
            v-for="(opt, i) in normalOptions"
            :key="String(opt.value) + '_' + i"
            class="dd-option"
            :class="{
              on: opt.value === modelValue,
              disabled: opt.disabled,
              highlight: i === highlight
            }"
            role="option"
            :aria-selected="opt.value === modelValue"
            :aria-disabled="opt.disabled"
            @click="selectOption(opt)"
            @mouseenter="highlight = i"
          >
            <Icon v-if="opt.icon" :name="opt.icon" :size="14" class="dd-opt-icon" />
            <span class="dd-opt-label">{{ opt.label }}</span>
          </div>
          <div v-if="!normalOptions.length" class="dd-empty">{{ t('ui.dropdownEmpty') }}</div>
          <!-- ★ Beta.325：extra 插槽 —— 选项尾部的自定义行（编辑器字号的「自定义像素」）。
               宿主自行处理 @mousedown.stop：.dd-popup 上有 @mousedown.prevent
               （防点选项抢走编辑器焦点），不截停会让插槽里的输入框无法获得焦点。 -->
          <slot name="extra" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
/**
 * 自建下拉组件（取代原生 <select>）。
 *
 * 原因：Electron 30 / Chromium 124 在 Windows 下展开 <select> 后，popup 高亮/活动行
 * 由 OS listbox 原生绘制，CSS 完全无法控制。`appearance: base-select`（Chromium 130+）
 * 在本环境不可用。该组件 popup 完全由 CSS 变量驱动，自动跟随 7 套主题。
 *
 * Props:
 *   modelValue   v-model 绑定值
 *   options      Array<string | { value, label, disabled? }>
 *   disabled     是否禁用
 *   placeholder  未选中时占位文本
 *   variant      'form'（默认，表单下拉皮肤）| 'toolbar'（工具栏紧凑皮肤，供编辑器工具栏复用）
 *                 | 'icon-btn'（按钮尺寸图标皮肤，与全局 .btn.btn-icon 同尺寸，供页头动作组复用）
 *   icon         传图标名则进入「纯图标」模式：触发器只显示该图标（Beta.316，工具栏用）
 *   labelKey     icon 模式下给触发器提供 title / aria-label 的 i18n key
 *                （纯图标不能没有可读线索，口径同 ui-theme-rules 第 8 节）
 *   triggerLabel 触发器显示文字覆盖（Beta.325）：非空且未传 icon 时优先于 selectedLabel。
 *                场景：编辑器字号框的当前值可能是自定义像素值，不在 options 里，
 *                selectedLabel 只会在 options 中匹配，匹配不上就退化成占位符。
 *   #extra 插槽  弹层选项尾部的自定义行（编辑器字号的「自定义像素」输入）。
 *                注意 .dd-popup 上有 @mousedown.prevent，插槽内的输入控件
 *                需自行 @mousedown.stop 截停，否则无法获得焦点。
 */
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import Icon from './Icon.vue';
import { computeFixedPosition } from '../utils/positionPopup';
import { t } from '../i18n';

const props = defineProps({
  modelValue: { default: undefined },
  options: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  variant: { type: String, default: 'form' },
  /* icon 既可以是图标名，也可以是 (value) => 图标名 —— 后者让触发器随当前值换形
     （对齐下拉用：显示「当前是左对齐/居中/右对齐」而不是一个固定图形，
     固定图形和下拉里的四个选项图太像，用户分不清哪个是状态哪个是按钮）。 */
  icon: { type: [String, Function], default: '' },
  labelKey: { type: String, default: '' },
  triggerLabel: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue', 'change']);

const open = ref(false);
const highlight = ref(-1);
const rootRef = ref(null);
const triggerRef = ref(null);
const popupRef = ref(null);

/**
 * 图标与折叠箭头的尺寸，随皮肤分工（三种皮肤两套尺寸，见 <style> 末段注释）：
 *   toolbar   —— 图标 15（与编辑器 .tb-btn 图标一致），箭头 14
 *   icon-btn  —— 图标 16（与 .btn.btn-icon 图标一致），箭头 12
 * 箭头在 icon-btn 下必须缩到 12：触发器固定 32px、padding 0、边框 1px×2，
 * 内容区仅 30px；16 + 12 + 1px 间隙 = 29px 才装得下（14px 箭头会溢出被裁）。
 */
const iconSize = computed(() => (props.variant === 'icon-btn' ? 16 : 15));
const caretSize = computed(() => (props.variant === 'icon-btn' ? 12 : 14));

/**
 * 触发器要显示的图标名。icon 传函数时按当前值求值 —— 用于「图标即状态」的下拉
 * （对齐：当前是左对齐就显示左对齐形）。传字符串时恒为它本身。
 */
const resolvedIcon = computed(() => {
  if (typeof props.icon === 'function') {
    try {
      return props.icon(props.modelValue) || '';
    } catch (e) {
      return '';
    }
  }
  return props.icon;
});

/**
 * 纯图标触发器的可读线索。
 * ★ 图标模式下拉没有可见文字，读屏与悬停都只能靠这里；
 *   把当前选中项一并拼进去，用户不必展开就知道「现在是对齐哪个 / 多大字号」。
 */
const ariaLabel = computed(() => {
  if (!props.icon) return undefined;
  const base = props.labelKey ? t(props.labelKey) : '';
  const cur = selectedLabel.value;
  if (!base) return cur || undefined;
  return cur ? `${base}：${cur}` : base;
});

/** 把任意形态（string / object）规范成 { value, label, disabled } */
const normalOptions = computed(() => {
  return (props.options || []).map(o => {
    if (o == null) return { value: '', label: '' };
    if (typeof o === 'object') {
      return {
        value: o.value,
        label: o.label != null ? o.label : String(o.value),
        disabled: !!o.disabled,
        icon: o.icon || ''
      };
    }
    return { value: o, label: String(o), disabled: false };
  });
});

const selectedLabel = computed(() => {
  const opt = normalOptions.value.find(o => o.value === props.modelValue);
  return opt ? opt.label : '';
});

/* ============== 定位 ============== */
const popupStyle = ref({});
function updatePopupPosition() {
  if (!triggerRef.value || !popupRef.value) return;
  const r = triggerRef.value.getBoundingClientRect();
  const ph = popupRef.value.offsetHeight || 240;
  // 不读 popup.offsetWidth：首次 layout 时可能因无 max-width 撑到全屏，导致 popup 自身越界。
  // 改为以 trigger 宽度为基准 + 下限 160 / 上限 420，确保 popup 形态稳定。
  const pw = Math.min(420, Math.max(160, r.width));
  const margin = 4;
  const pos = computeFixedPosition(r, { width: pw, height: ph, margin });
  popupStyle.value = {
    position: 'fixed',
    top: `${pos.top}px`,
    left: `${pos.left}px`,
    width: `${pw}px`,
    // 走全局 z-index 刻度（见 styles/themes.css）。这里是 JS 内联样式，必须传字符串：
    // 浏览器会在内联样式的属性值里解析 var()。内联优先级高于任何选择器（不含 !important）。
    zIndex: 'var(--z-dropdown)'
  };
}

/* ============== 开/关 ============== */
function openPopup() {
  if (props.disabled) return;
  open.value = true;
  // 高亮默认在当前选中项上
  const idx = normalOptions.value.findIndex(o => o.value === props.modelValue);
  highlight.value = idx >= 0 ? idx : normalOptions.value.findIndex(o => !o.disabled) || 0;
  nextTick(() => {
    updatePopupPosition();
    scrollHighlightIntoView();
  });
}

function closePopup() {
  open.value = false;
  highlight.value = -1;
}

function onTriggerClick() {
  if (props.disabled) return;
  if (open.value) closePopup();
  else openPopup();
}

function onTriggerKey(e) {
  if (props.disabled) return;
  if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (!open.value) openPopup();
    else {
      moveHighlight(1);
      scrollHighlightIntoView();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!open.value) openPopup();
    else {
      moveHighlight(-1);
      scrollHighlightIntoView();
    }
  }
}

/* ============== 弹层内键盘 ============== */
function onPopupKey(e) {
  if (!open.value) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveHighlight(1);
    scrollHighlightIntoView();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveHighlight(-1);
    scrollHighlightIntoView();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (highlight.value >= 0) selectOption(normalOptions.value[highlight.value]);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closePopup();
    triggerRef.value && triggerRef.value.focus();
  } else if (e.key === 'Tab') {
    closePopup();
  }
}

function moveHighlight(delta) {
  if (!normalOptions.value.length) return;
  let i = highlight.value < 0 ? 0 : highlight.value + delta;
  const n = normalOptions.value.length;
  // 跳过 disabled
  for (let k = 0; k < n; k++) {
    if (i < 0) i = n - 1;
    if (i >= n) i = 0;
    if (!normalOptions.value[i].disabled) break;
    i += delta;
  }
  highlight.value = i;
}

function scrollHighlightIntoView() {
  nextTick(() => {
    if (!popupRef.value) return;
    const el = popupRef.value.querySelector('.dd-option.highlight');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  });
}

/* ============== 选择 ============== */
function selectOption(opt) {
  if (opt.disabled) return;
  if (opt.value === props.modelValue) {
    closePopup();
    return;
  }
  emit('update:modelValue', opt.value);
  emit('change', opt.value);
  closePopup();
  triggerRef.value && triggerRef.value.focus();
}

/* ============== 全局监听：click-outside / ESC / scroll ============== */
function onDocMouseDown(e) {
  if (!open.value) return;
  if (rootRef.value && rootRef.value.contains(e.target)) return;
  if (popupRef.value && popupRef.value.contains(e.target)) return;
  closePopup();
}

function onDocKey(e) {
  if (!open.value) return;
  if (e.key === 'Escape') {
    closePopup();
    triggerRef.value && triggerRef.value.focus();
  } else if (open.value) {
    onPopupKey(e);
  }
}

function onScrollOrResize() {
  if (open.value) updatePopupPosition();
}

onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown);
  document.addEventListener('keydown', onDocKey);
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown);
  document.removeEventListener('keydown', onDocKey);
  window.removeEventListener('scroll', onScrollOrResize, true);
  window.removeEventListener('resize', onScrollOrResize);
});

watch(
  () => props.modelValue,
  () => {
    /* ★ Beta.325：值被外部改掉时收起弹层。
       宿主点选项走的 selectOption 本就会关闭；这条兜住「不经过选项的改值」路径 ——
       典型场景是编辑器字号框的「自定义像素」行：提交后当前字号变化、
       modelValue 随之变化，弹层必须收起，否则盖在正文上方挡住光标。
       原实现只更新 highlight（为外部改值后仍停在旧高亮位），但那种场景
       弹层马上就要关，高亮位已无意义，故整体替换为关闭。 */
    if (open.value) closePopup();
  }
);
</script>

<style scoped>
.dropdown {
  position: relative;
  display: inline-block;
  width: 100%;
}
.dd-trigger {
  width: 100%;
  height: 34px;
  padding: 0 28px 0 12px;
  background: var(--input-bg);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  font: inherit;
  font-size: 13.5px;
  text-align: left;
  outline: none;
}
.dd-trigger:hover:not(:disabled) {
  border-color: var(--accent);
}
.dd-trigger:focus-visible {
  border-color: var(--accent);
}
.dd-trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.dd-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.dd-placeholder {
  color: var(--text-3);
}
.dd-caret {
  color: var(--text-2);
  transition: transform 0.15s ease;
  flex: none;
}
.dd-caret.flip {
  transform: rotate(180deg);
}
.disabled .dd-caret {
  opacity: 0.55;
}
/* 工具栏紧凑皮肤（编辑器书写工具：对齐/字号）：与 .tb-btn 同尺寸同 hover 反馈。
 * 只换尺寸与底色，不动结构；现有 form 皮肤调用点完全不受影响（variant 默认 form）。 */
.dropdown-toolbar {
  width: auto;
}
.dropdown-toolbar .dd-trigger {
  width: auto;
  height: 28px;
  min-width: 30px;
  padding: 0 22px 0 8px;
  background: transparent;
  color: var(--text-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-size: 13px;
}
/* 纯图标模式（Beta.316）：折叠箭头贴到图标右侧一点，与 .tb-btn 的图标居中对齐 */
.dropdown-toolbar .dd-icon {
  flex: none;
}
.dropdown-toolbar:has(.dd-icon) .dd-trigger {
  gap: 2px;
  padding: 0 4px;
  justify-content: center;
}
.dropdown-toolbar .dd-trigger:hover:not(:disabled) {
  background: var(--btn-ghost-hover);
  color: var(--text);
  border-color: var(--border);
}
.dropdown-toolbar .dd-trigger:focus-visible {
  border-color: var(--accent);
}
/* ---- 按钮尺寸图标皮肤（Beta.324，用户反馈「另存为图标大小不一」）----
 * 场景：贴在 .btn 系列按钮旁的「动作收纳下拉」（PostView 页头「另存为」贴在
 * 「保存」主按钮左侧）。此前它错用了 toolbar 皮肤：28px 高、约 39px 宽、图标 15px，
 * 与旁边 .btn.btn-icon 的 32×32、图标 16px 明显大小不一。
 * 本皮肤与全局 .btn.btn-icon（base.css:1260）逐像素对齐：32×32、padding 0、图标 16px、
 * --radius-sm 圆角、--border 边框、--surface 底色、hover 走 --btn-ghost-hover、
 * disabled 透明度 0.5（与 .btn:disabled 一致）。主/次层级由调用方决定：
 * 旁边是 .btn-primary（保存）时本皮肤即视觉上的「次按钮」，无需在这里配色。
 * 与 toolbar 皮肤的分工：toolbar = 28px 无底幽灵钮（对齐编辑器 .tb-btn）；
 * icon-btn = 32px 带底实钮（对齐页面动作区 .btn）。两者不互换使用。 */
.dropdown-icon-btn {
  width: auto;
}
.dropdown-icon-btn .dd-trigger {
  width: 32px;
  height: 32px;
  min-width: 32px;
  padding: 0;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  justify-content: center;
  gap: 1px;
}
.dropdown-icon-btn .dd-icon,
.dropdown-icon-btn .dd-caret {
  flex: none;
}
.dropdown-icon-btn .dd-trigger:hover:not(:disabled) {
  background: var(--btn-ghost-hover);
  border-color: var(--border);
}
.dropdown-icon-btn .dd-trigger:focus-visible {
  border-color: var(--accent);
}
.dropdown-icon-btn .dd-trigger:disabled {
  opacity: 0.5;
}
</style>

<style>
/* popup 由 Teleport 渲染到 body，作用域样式无法触达，使用非 scoped。仍走主题变量 */
/* 注意：z-index 不在这里，而是由 JS 内联 popupStyle.zIndex = 'var(--z-dropdown)' 设置
 * （见 <script setup> 里的 popupStyle 赋值）。内联优先级高于本选择器。
 * 在 CSS 里搜不到 z-index 是正常的，不代表它靠 DOM 顺序定位。 */
.dd-popup {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  padding: 4px;
  max-height: 280px;
  overflow-y: auto;
  font-size: 13.5px;
  /* Beta.101：硬限 max-width，避免首次 layout 时因无内容边界撑满全屏 */
  max-width: min(420px, calc(100vw - 16px));
  box-sizing: border-box;
  transform-origin: top left;
}
/* ★ Beta.288：下拉弹出/收回动画（配合 <Transition name="dd">）。
   弹出：从「上方 4px + 半透明」弹入；收回：反向淡出收起，取代瞬间消失。 */
.dd-enter-active {
  animation: dd-in 0.14s cubic-bezier(0.2, 0.8, 0.3, 1) both;
}
.dd-leave-active {
  animation: dd-out 0.1s ease-in both;
}
@keyframes dd-in {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes dd-out {
  from {
    opacity: 1;
    transform: none;
  }
  to {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
}
.dd-option {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dd-option.highlight:not(.on):not(.disabled) {
  background: var(--accent-weak);
  color: var(--text);
}
.dd-option.on {
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}
.dd-option.disabled {
  color: var(--text-3);
  cursor: not-allowed;
}
/* 选项前置图标（Beta.319）：不收缩、与文字同色（图标用 currentColor），
   选中项文字变 --accent-text 时图标自动跟随，不需要单独覆盖。 */
.dd-opt-icon {
  flex: none;
}
.dd-opt-label {
  min-width: 0;
}
.dd-empty {
  padding: 8px 10px;
  color: var(--text-3);
  text-align: center;
  font-size: 12.5px;
}
/* wire 主题特别处理：方角 + 细边框。激活项 .dd-option.on 的斜线填充由 themes.css
 * 统一收敛（--fill-line），此处不再重复定义（重复会被 themes.css 覆盖，属无效死规则）。 */
[data-theme='wire'] .dd-trigger,
[data-theme='wire'] .dd-popup {
  border-width: 1.2px;
  border-radius: 0;
}
[data-theme='wire'] .dd-option {
  border-radius: 0;
}
</style>
