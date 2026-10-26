<template>
  <div class="share-menu" ref="rootRef">
    <button
      ref="triggerRef"
      type="button"
      :class="triggerClass"
      :disabled="busy"
      :aria-expanded="open"
      aria-haspopup="menu"
      :title="t('post.shareTitle', { n: ACTIONS.length })"
      :aria-label="t('post.share')"
      @click="onTriggerClick"
      @keydown="onKey"
    >
      <Icon name="share" :size="size === 'sm' ? 14 : 16" />
      <!-- sm 形态带文字：本机详情页页头是纯图标排（视觉要克制），
           而局域共享详情条整排都是「图标+文字」的小按钮，
           这里若只留图标会与邻居形态不一致。两个形态都留 title/aria-label。 -->
      <span v-if="size === 'sm'">{{ t('post.share') }}</span>
    </button>

    <!-- 复用 Dropdown.vue 的既有做法：Teleport 到 body + JS 算 fixed 坐标。
         不用 CSS 定位是因为页头是 sticky 容器，且 .main 是滚动容器，
         绝对定位会跟着滚动错位；fixed + 动态坐标才稳定。 -->
    <Teleport to="body">
      <div v-if="open" ref="popupRef" class="share-popup" :style="popupStyle" role="menu" @mousedown.prevent>
        <div
          v-for="a in ACTIONS"
          :key="a.key"
          class="share-option"
          role="menuitem"
          tabindex="-1"
          @click="pick(a)"
          @mouseenter="highlight = a.key"
        >
          <Icon :name="a.icon" :size="15" />
          <span>{{ a.label }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
/**
 * 文档「分享」下拉菜单（Beta.242）。
 *
 * 为什么收进下拉而不是并排两个按钮：
 * 需求明确要「与设置页按钮顺序一致」，而设置页那组是
 * 导入文档包 → 导出文档包 → 导出 Markdown → 导出 PDF（DataSection.vue:64-67），
 * 单篇场景只取后两项。直接并排两个按钮会让页头多出两个视觉权重相同的按钮，
 * 而页头还有 删除/编辑 两个高权重动作 —— 收进下拉才能让页头保持克制。
 *
 * 顺序：**导出 Markdown 在前、导出 PDF 在后**（与设置页逐字一致）。
 * 设置页的说明文案也正是这个次序的理由：Markdown「便于二次编辑」、PDF「适合打印分发」。
 *
 * 只读文档同样可用：导出是读操作，故这里不接 canEdit，
 * 与同页的「页内查找」「历史版本」保持同一口径。
 */
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import Icon from '../Icon.vue';
import { t } from '../../i18n';

const props = defineProps({
  busy: { type: Boolean, default: false },
  // 触发器形态：'icon' = 32×32 纯图标（页头排布克制时用）；
  // 'sm' = 「图标+文字」小按钮（整排都是文字按钮的详情条用）。
  size: { type: String, default: 'icon' }
});
const emit = defineEmits(['export-md', 'export-pdf']);

const triggerClass = computed(() => (props.size === 'sm' ? 'btn btn-sm' : 'btn btn-icon'));

/** 单一数据源：顺序即展示顺序，改这里就等于改顺序（computed：随语言切换重新求值） */
const ACTIONS = computed(() => [
  { key: 'md', label: t('post.exportMd'), icon: 'file-text' },
  { key: 'pdf', label: t('post.exportPdf'), icon: 'file' }
]);

const open = ref(false);
const highlight = ref('');
const rootRef = ref(null);
const triggerRef = ref(null);
const popupRef = ref(null);
const popupStyle = ref({});

function updatePopupPosition() {
  if (!triggerRef.value || !popupRef.value) return;
  const r = triggerRef.value.getBoundingClientRect();
  const ph = popupRef.value.offsetHeight || 96;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 4;
  // 下方空间不够就翻到上方：页头是 sticky 的，靠近视口底部时下方常常没有空间
  let top = r.bottom + margin;
  if (top + ph > vh - 8) top = Math.max(8, r.top - ph - margin);
  // 右对齐到触发器右缘：菜单内容比图标按钮宽，右对齐才不会左飘
  let left = r.right - 200;
  if (left + 200 > vw - 8) left = vw - 208;
  if (left < 8) left = 8;
  popupStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: '200px',
    // 走全局 z-index 刻度（见 styles/themes.css），不写死数字
    zIndex: 'var(--z-dropdown)'
  };
}

function openPopup() {
  if (props.busy) return;
  open.value = true;
  highlight.value = ACTIONS.value[0].key;
  nextTick(updatePopupPosition);
}

function closePopup() {
  open.value = false;
  highlight.value = '';
}

function onTriggerClick() {
  if (open.value) closePopup();
  else openPopup();
}

function pick(a) {
  closePopup();
  triggerRef.value && triggerRef.value.focus();
  emit(a.key === 'md' ? 'export-md' : 'export-pdf');
}

function moveHighlight(delta) {
  const i = ACTIONS.value.findIndex(x => x.key === highlight.value);
  const n = ACTIONS.value.length;
  highlight.value = ACTIONS.value[(((i + delta + n) % n) + n) % n].key;
}

function onKey(e) {
  if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (!open.value) openPopup();
    else moveHighlight(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (open.value) moveHighlight(-1);
  } else if (e.key === 'Escape') {
    closePopup();
  } else if (e.key === 'Tab') {
    closePopup();
  }
}

function onDocMouseDown(e) {
  if (!open.value) return;
  if (rootRef.value && rootRef.value.contains(e.target)) return;
  if (popupRef.value && popupRef.value.contains(e.target)) return;
  closePopup();
}

function onScrollOrResize() {
  if (open.value) updatePopupPosition();
}

onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown);
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown);
  window.removeEventListener('scroll', onScrollOrResize, true);
  window.removeEventListener('resize', onScrollOrResize);
});
</script>

<style scoped>
.share-menu {
  position: relative;
  display: inline-block;
}
</style>

<style>
/* popup 由 Teleport 渲染到 body，作用域样式触达不到，故用非 scoped。颜色全走主题变量。 */
.share-popup {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  padding: 4px;
  font-size: 13.5px;
  max-width: calc(100vw - 16px);
  box-sizing: border-box;
}
.share-option {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
/* hover 高亮用 --accent-weak（浅底）而不是 --accent（实心）：
   实心块会把文字压成反色，菜单项一多就过于抢眼。 */
.share-option:hover {
  background: var(--accent-weak);
  color: var(--text);
}
[data-theme='wire'] .share-popup {
  border-width: 1.2px;
  border-radius: 0;
}
[data-theme='wire'] .share-option {
  border-radius: 0;
}
</style>
