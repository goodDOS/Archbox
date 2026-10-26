<template>
  <div class="emoji-picker">
    <button
      ref="triggerRef"
      type="button"
      class="tb-btn"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :title="t('post.tbEmoji')"
      :aria-label="t('post.tbEmoji')"
      :disabled="disabled"
      @mousedown.prevent
      @click="toggle"
      @keydown="onTriggerKey"
    >
      <Icon name="face-smile" :size="15" />
    </button>

    <!-- 弹层：与 ColorPicker / Dropdown 同一套做法（Teleport + JS 算 fixed 坐标），
         不新增定位实现（见 no-duplicate-code 的单一来源表）。 -->
    <Teleport to="body">
      <Transition name="pop-mask">
        <div v-if="open" class="pop-mask" @mousedown.self="close"></div>
      </Transition>
      <Transition name="pop">
        <div
          v-if="open"
          ref="popupRef"
          class="emoji-popup"
          :style="posStyle"
          role="dialog"
          :aria-label="t('post.tbEmoji')"
          @mousedown.stop
        >
          <!-- 分类标签：一侧一个按钮，标签本身走 i18n；当前分类高亮 -->
          <div class="emoji-tabs" role="tablist" :aria-label="t('post.emojiCategories')">
            <button
              v-for="g in EMOJI_GROUPS"
              :key="g.key"
              type="button"
              role="tab"
              class="emoji-tab"
              :class="{ on: g.key === activeKey }"
              :aria-selected="g.key === activeKey"
              :title="t('post.emojiCat' + cap(g.key))"
              @click="activeKey = g.key"
            >
              {{ t('post.emojiCat' + cap(g.key)) }}
            </button>
          </div>

          <div class="emoji-scroll">
            <div class="emoji-grid">
              <button
                v-for="(e, i) in activeItems"
                :key="activeKey + '_' + i"
                type="button"
                class="emoji-cell"
                :title="t('post.emojiInsertHint', { e })"
                :aria-label="t('post.emojiInsertHint', { e })"
                @click="pick(e)"
              >
                {{ e }}
              </button>
            </div>
          </div>

          <!-- 底栏：把「插入模式」摆明。默认插入到光标处；勾上后改为复制到剪贴板，
               以便在标题、标签、搜索框这些非富文本控件里也能用。 -->
          <div class="emoji-foot">
            <label class="emoji-copy">
              <input type="checkbox" v-model="copyMode" />
              <span>{{ t('post.emojiCopyMode') }}</span>
            </label>
            <span class="emoji-count">{{ activeItems.length }}</span>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
/**
 * 编辑器工具栏的 emoji 面板（Beta.322，用户需求「把 emoji 添加进文档编辑栏」）。
 *
 * 【为什么自建而不是引第三方 emoji-picker】
 *   1. 运行时依赖白名单（AGENTS.md 硬约束）：现成组件动辄带 canvas 渲染、关键词索引、
 *      肤色合成，体积与依赖都是净增；本项目只需要「点一下插入一个字符」。
 *   2. 原生 `<input type="emoji">` 并不存在；Chromium 的 emoji 面板由 OS 输入法提供，
 *      在 Electron 里不可控、也不吃主题。
 *   3. 弹层皮肤必须跟随 8 套主题 —— 第三方组件的样式隔离在同一张 inlined HTML 里反而更难办。
 *
 * 【插入方式】emit('pick', emoji)，由宿主 PostView 用 ProseMirror 的 insertContent 落字。
 *   本组件不碰编辑器实例：工具栏按钮统一走宿主命令（与 .tb-btn 其余按钮同一条路径），
 *   否则组件要拿 editor 引用，测试与复用都变复杂。
 *
 * 【为什么不存「最近使用」】系统 emoji 键盘已有该能力；本项目存它要新增持久化键 +
 *   白名单登记 + 清理逻辑，收益不成比例。改为固定一组高频「常用」放在第一格。
 */
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import Icon from '../Icon.vue';
import { computeFixedPosition } from '../../utils/positionPopup';
import { EMOJI_GROUPS } from '../../utils/emoji';
import { t } from '../../i18n';

defineProps({
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['pick']);

const POPUP_W = 344;
const POPUP_H = 300;

const triggerRef = ref(null);
const popupRef = ref(null);
const open = ref(false);
const activeKey = ref(EMOJI_GROUPS[0].key);
const copyMode = ref(false);
const posStyle = ref({});
/** 关闭前把焦点还给编辑器，否则插完一个表情光标位置就丢了 */
let restoreFocus = null;

const activeItems = computed(() => (EMOJI_GROUPS.find(g => g.key === activeKey.value) || EMOJI_GROUPS[0]).items);

/** 分类 key 首字母大写 → 拼 i18n key（post.emojiCatFaces 等） */
const cap = k => k.charAt(0).toUpperCase() + k.slice(1);

function toggle() {
  if (open.value) {
    close();
    return;
  }
  open.value = true;
  nextTick(positionPopup);
}

function close() {
  if (!open.value) return;
  open.value = false;
  if (restoreFocus) {
    const fn = restoreFocus;
    restoreFocus = null;
    nextTick(fn);
  }
}

function positionPopup() {
  if (!triggerRef.value) return;
  const r = triggerRef.value.getBoundingClientRect();
  const h = (popupRef.value && popupRef.value.offsetHeight) || POPUP_H;
  const pos = computeFixedPosition(r, { width: POPUP_W, height: h, margin: 6 });
  posStyle.value = { top: pos.top + 'px', left: pos.left + 'px' };
}

/** 点表情：插入 或 复制。任何一种都把焦点还给编辑器（插入后要继续打字） */
function pick(e) {
  emit('pick', { emoji: e, copy: copyMode.value });
  close();
}

function onTriggerKey(ev) {
  if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'ArrowDown') {
    ev.preventDefault();
    if (!open.value) toggle();
  }
}

function onScrollOrResize(ev) {
  if (!open.value) return;
  // 面板内部滚动不重定位（否则一滑列表面板就跳）
  if (popupRef.value && ev && ev.target && popupRef.value.contains(ev.target)) return;
  positionPopup();
}

function onDocKey(ev) {
  if (open.value && ev.key === 'Escape') {
    ev.stopPropagation();
    close();
  }
}

onMounted(() => {
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);
  document.addEventListener('keydown', onDocKey, true);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScrollOrResize, true);
  window.removeEventListener('resize', onScrollOrResize);
  document.removeEventListener('keydown', onDocKey, true);
});

/** 宿主可在插入前登记「焦点回哪里」（例如 editor.view.focus） */
defineExpose({
  setRestoreFocus: fn => (restoreFocus = fn),
  close
});
</script>

<style scoped>
.emoji-popup {
  position: fixed;
  z-index: var(--z-dropdown);
  width: 344px;
  padding: 8px;
  box-sizing: border-box;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  user-select: none;
  transform-origin: top left;
}
.emoji-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-bottom: 8px;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.emoji-tab {
  padding: 2px 8px;
  font-size: 11.5px;
  line-height: 18px;
  cursor: pointer;
  color: var(--text-2);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 999px;
  transition:
    background 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease;
}
.emoji-tab:hover {
  background: var(--btn-ghost-hover);
  color: var(--text);
}
.emoji-tab.on {
  background: var(--accent-weak);
  color: var(--accent);
  border-color: var(--accent);
}
.emoji-scroll {
  max-height: 196px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.emoji-grid {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 2px;
}
.emoji-cell {
  height: 32px;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  transition:
    background 0.1s ease,
    border-color 0.1s ease;
}
.emoji-cell:hover {
  background: var(--btn-ghost-hover);
  border-color: var(--border);
}
.emoji-cell:active {
  background: var(--accent-weak);
}
.emoji-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 6px;
  margin-top: 6px;
  border-top: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--text-3);
}
.emoji-copy {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}
.emoji-count {
  font-family: var(--font-mono);
}
</style>
