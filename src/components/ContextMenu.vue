<template>
  <!--
    ★ 为什么整个弹层用非 scoped 样式块 ★
      Teleport 到 body 后，组件的 scope 属性不会随内容过去（Vue 只给本模板编译出的
      节点加 data-v-*；Teleport 的内容在挂载时已脱离组件树，拿不到属性）。
      Dropdown.vue 的 .dd-popup 同理用了第二个非 scoped <style> 块。
      样式全部走主题变量，八套主题通吃；wire 主题（方角）在末段统一覆盖。
  -->
  <Teleport to="body">
    <Transition name="ctx">
      <div
        v-if="open"
        ref="menuRef"
        class="ctx-menu"
        :style="menuStyle"
        role="menu"
        @mousedown.prevent
        @contextmenu.prevent
      >
        <template v-for="(item, i) in items" :key="item.key + '_' + i">
          <div v-if="item.sep" class="ctx-sep" role="separator"></div>
          <button
            v-else
            type="button"
            class="ctx-item"
            :class="{ disabled: item.disabled, highlight: i === highlight }"
            role="menuitem"
            :aria-disabled="item.disabled"
            :disabled="item.disabled"
            @click="pick(item)"
            @mouseenter="highlight = i"
          >
            {{ item.label }}
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * 自建右键面板（Beta.329，需求 #434；Beta.330 起覆盖全站）。
 *
 * 【为什么要有它】主进程原生 Menu.popup 的 role 项（cut/copy/paste/selectAll）由**系统**
 *   绘制：label 恒为系统语言（简体中文系统上也常显示英文）、且跟随系统深色皮肤，
 *   与应用主题割裂。主进程 i18n 只够得着自定义 label 的项，够不着 role 项 ——
 *   这是「换成中文右键面板」必须在渲染层自绘的根本原因。
 *
 * 【范围】Beta.330 起覆盖**全站**：编辑区、查看态正文、图片、日志、表格……
 *   唯一例外是 <input> / <textarea> 原生输入框（撤销栈在浏览器内部，
 *   自绘粘贴会丢撤销，理由见 useContextMenu.js 文件头）。
 *   组件本身与区域无关 —— 分流与项集全在 composable 里，这里只管画。
 *
 * 【与 Dropdown 的分工】Dropdown 有触发器、管选中态；本组件无触发器、纯受控
 *   （open/x/y/items 全由调用方给），不复用 Dropdown 而新建 —— 两者生命周期与
 *   交互模型不同（Dropdown 常驻 DOM 等点击，右键菜单瞬开瞬消），硬合在一起
 *   会让 Dropdown 背上「无触发器的模态弹层」这份不属于它的职责。
 *
 * Props:
 *   open  面板是否可见（Transition 负责退场动画，父级无需延迟清理）
 *   x, y  右键事件的 client 坐标（定位基准）
 *   items 菜单项 { key, label, disabled?, sep? }；sep 项渲染为分隔线
 * Emits:
 *   pick  点击菜单项（携带 item；禁用项不会触发）
 *   close  关闭意图（Esc / Tab / 点面板外 / 滚轮 / resize）
 */
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { computeFixedPosition } from '../utils/positionPopup';

const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  items: { type: Array, default: () => [] }
});
const emit = defineEmits(['pick', 'close']);

const menuRef = ref(null);
const highlight = ref(-1);

/* 行高 / 分隔线高 / 内边距与 CSS 写死值一致 —— 定位时的高度估算必须同源，
   否则「下方放不下翻上方」的判定会偏差几像素。改 CSS 时这里同步改。 */
const ROW_H = 30;
const SEP_H = 9;
const PAD_V = 4;

function estimateHeight() {
  return props.items.reduce((h, it) => h + (it.sep ? SEP_H : ROW_H), 0) + PAD_V * 2;
}

const menuStyle = ref({});

function place() {
  // 以右键坐标为锚：anchor 只需 bottom/left/top/width 四字段。
  // top = y + margin（菜单出现在点击处下方）；下方越界翻到点击处上方；
  // 右侧越界向左收；始终留 8px 视口安全边距（computeFixedPosition 内部行为）。
  const pos = computeFixedPosition(
    { top: props.y, bottom: props.y, left: props.x, width: 0 },
    { width: 200, height: estimateHeight(), margin: 2 }
  );
  menuStyle.value = {
    position: 'fixed',
    top: `${pos.top}px`,
    left: `${pos.left}px`,
    zIndex: 'var(--z-dropdown)'
  };
}

/* 首次定位用估算高度，渲染后用实测高度再校正一次（面板内容行数不多，
   但「翻上方」的精确位置依赖真实高度；Dropdown 用 240 兜底是够了，
   右键面板贴近光标，几像素的偏差用户都能感知，故做二次校正）。 */
watch(
  () => props.open,
  async v => {
    if (!v) {
      highlight.value = -1;
      return;
    }
    highlight.value = Math.max(
      0,
      props.items.findIndex(it => !it.disabled && !it.sep)
    );
    await nextTick();
    place();
    if (menuRef.value) {
      const pos = computeFixedPosition(
        { top: props.y, bottom: props.y, left: props.x, width: 0 },
        { width: 200, height: menuRef.value.offsetHeight || estimateHeight(), margin: 2 }
      );
      menuStyle.value = { ...menuStyle.value, top: `${pos.top}px`, left: `${pos.left}px` };
    }
  }
);

function pick(item) {
  if (item.disabled || item.sep) return;
  emit('pick', item);
}

function moveHighlight(delta) {
  const n = props.items.length;
  if (!n) return;
  let i = highlight.value < 0 ? 0 : highlight.value + delta;
  for (let k = 0; k < n; k++) {
    if (i < 0) i = n - 1;
    if (i >= n) i = 0;
    if (!props.items[i].disabled && !props.items[i].sep) break;
    i += delta;
  }
  highlight.value = i;
}

function onDocKey(e) {
  if (!props.open) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveHighlight(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveHighlight(-1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (highlight.value >= 0) pick(props.items[highlight.value]);
  } else if (e.key === 'Escape' || e.key === 'Tab') {
    e.preventDefault();
    emit('close');
  }
}

/* 点面板外即关。capture 阶段拿事件，与面板自身的 @mousedown.prevent 配合：
   面板内点击被 prevent 默认行为但不冒泡到此（事件目标在面板内，contains 判定挡住）。 */
function onDocMouseDown(e) {
  if (!props.open) return;
  if (menuRef.value && menuRef.value.contains(e.target)) return;
  emit('close');
}

/* 滚轮 = 用户意图转向页面滚动，系统菜单同样关闭；resize 同理（不重定位，
   右键菜单是「一次性」交互，锚点坐标在 resize 后已无意义）。 */
function onWheel() {
  if (props.open) emit('close');
}
function onResize() {
  if (props.open) emit('close');
}

onMounted(() => {
  document.addEventListener('keydown', onDocKey);
  document.addEventListener('mousedown', onDocMouseDown, true);
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocKey);
  document.removeEventListener('mousedown', onDocMouseDown, true);
  window.removeEventListener('wheel', onWheel);
  window.removeEventListener('resize', onResize);
});

/* 面板不抢编辑器焦点（容器 @mousedown.prevent），故 Escape 后不主动还焦；
   用户点一下编辑器即回。composable 侧的执行器（PM 命令）自带 focus。 */
</script>

<style>
/* 非 scoped：Teleport 到 body（原因见模板顶部注释）。主题变量驱动，跟随八套主题。 */
.ctx-menu {
  min-width: 168px;
  max-width: min(320px, calc(100vw - 16px));
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  padding: 4px;
  font-size: 13.5px;
  box-sizing: border-box;
  transform-origin: top left;
  user-select: none;
}
/* 弹出/收回动画：与 Dropdown 的 dd-in/dd-out 同曲线（0.14s 弹入 / 0.1s 收回），
   观感与既有自建弹层一致，不另起一套。 */
.ctx-enter-active {
  animation: ctx-in 0.14s cubic-bezier(0.2, 0.8, 0.3, 1) both;
}
.ctx-leave-active {
  animation: ctx-out 0.1s ease-in both;
}
@keyframes ctx-in {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes ctx-out {
  from {
    opacity: 1;
    transform: none;
  }
  to {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
}
.ctx-item {
  display: block;
  width: 100%;
  height: 30px;
  line-height: 30px;
  padding: 0 10px;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 分隔线：与 script 的 SEP_H（9px）同源 —— 1px 线 + 上下各 4px 间距 */
.ctx-sep {
  height: 1px;
  margin: 4px 8px;
  background: var(--border);
}
.ctx-item.highlight:not(.disabled) {
  background: var(--accent-weak);
}
.ctx-item.disabled {
  color: var(--text-3);
  cursor: not-allowed;
}
/* wire 主题特别处理：方角 + 细边框（与 Dropdown 的 wire 特例同口径，举一反三） */
[data-theme='wire'] .ctx-menu {
  border-width: 1.2px;
  border-radius: 0;
}
[data-theme='wire'] .ctx-item {
  border-radius: 0;
}
</style>
