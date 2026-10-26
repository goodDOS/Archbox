<template>
  <transition name="fb">
    <div v-if="findState.open" class="find-bar no-drag" @keydown.stop>
      <Icon name="search" :size="15" class="fb-icon" />
      <input
        ref="inputRef"
        class="fb-input"
        v-model="kw"
        :placeholder="t('ui.findPlaceholder')"
        spellcheck="false"
        @input="onInput"
        @keydown.enter.prevent="findJump($event.shiftKey)"
        @keydown.esc.prevent="close"
      />
      <span class="fb-count" :class="{ none: !!findState.text && findState.matches === 0 }">{{ countText }}</span>
      <label class="fb-case" :title="t('ui.findCase')">
        <input type="checkbox" v-model="caseOn" @change="findToggleCase(caseOn)" />
        <span>Aa</span>
      </label>
      <button class="fb-btn" :title="t('ui.findPrev')" :disabled="!findState.matches" @click="findJump(true)">
        <Icon name="chevron-up" :size="15" />
      </button>
      <button class="fb-btn" :title="t('ui.findNext')" :disabled="!findState.matches" @click="findJump(false)">
        <Icon name="chevron-down" :size="15" />
      </button>
      <button class="fb-btn" :title="t('ui.findClose')" @click="close">
        <Icon name="x" :size="15" />
      </button>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { findState, findSet, findJump, findClose, findToggleCase } from '../store';
import { t } from '../i18n';
import Icon from './Icon.vue';

const inputRef = ref(null);
const kw = ref('');
const caseOn = ref(false);

const countText = computed(() => {
  if (!findState.text) return '';
  if (!findState.matches) return t('ui.findNoResult');
  return t('ui.findCount', { cur: findState.active, total: findState.matches });
});

// 打开时恢复上次搜索词/大小写设置，聚焦并全选。
// Ctrl+F 连按两次是「重新输入关键词」的常见习惯，全选后直接打字即替换；
// 若关闭时保留有搜索词，findOpen 已自动触发 search，此处只需同步到输入框。
watch(
  () => findState.open,
  async open => {
    if (!open) return;
    kw.value = findState.text;
    caseOn.value = findState.matchCase;
    await nextTick();
    const el = inputRef.value;
    if (!el) return;
    el.focus();
    el.select();
  }
);

// ★ Beta.315（#418）：编辑态跳转定位会把焦点focus 到目标输入框（原生选区要 focus 才可见），
//   之后必须把焦点还给查找框——否则用户接着打的字全落进文档表单里，而不是继续改查找词。
//   读态跳转不抢焦点（postFind 只滚滚动），此 watch 对它是无操作（焦点本来就在查找框）。
//   findClose 已先把 open 置 false 才清 active，故关闭路径不会误抢焦点。
watch(
  () => findState.active,
  () => {
    if (!findState.open) return;
    const el = inputRef.value;
    if (el && document.activeElement !== el) el.focus();
  }
);

function onInput() {
  findSet(kw.value);
}

function close() {
  findClose();
}
</script>

<style scoped>
/* 查找条：固定在主内容区右上角、标题栏下方。
   z-index 用 --z-find（高于 Modal 遮罩），使弹层（如历史版本预览）打开时
   查找条仍浮于其上、可被点击，配合 postFind.scopes() 对 .pv-body 的识别，
   即可「边预览历史版本边搜索」。 */
.find-bar {
  position: fixed;
  top: 52px;
  right: 22px;
  z-index: var(--z-find);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px 5px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}
.fb-icon {
  color: var(--text-3);
}
.fb-input {
  width: 190px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--text);
  padding: 3px 2px;
}
.fb-count {
  font-size: 11.5px;
  color: var(--text-2);
  min-width: 52px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.fb-count.none {
  color: var(--danger);
}
.fb-case {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-3);
  padding: 0 2px;
  border-left: 1px solid var(--border);
  margin-left: 2px;
  padding-left: 8px;
}
.fb-case input {
  accent-color: var(--accent);
}
.fb-btn {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  flex: none;
  display: grid;
  place-items: center;
  cursor: pointer;
  background: transparent;
  color: var(--text-2);
  border: none;
}
.fb-btn:hover:not(:disabled) {
  background: var(--btn-ghost-hover);
  color: var(--text);
}
.fb-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.fb-enter-active,
.fb-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}
.fb-enter-from,
.fb-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
