<template>
  <div class="window-controls">
    <button class="win-btn" :title="t('ui.winMin')" @click="A.winMin()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 12h14" />
      </svg>
    </button>
    <button class="win-btn" :title="maximized ? t('ui.winRestore') : t('ui.winMax')" @click="toggleMax">
      <svg
        v-if="!maximized"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
      <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M4 16V6a2 2 0 0 1 2-2h10" />
      </svg>
    </button>
    <button class="win-btn close" :title="t('ui.winClose')" @click="A.winClose()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { A } from '../api';
import { t } from '../i18n';

const maximized = ref(false);
function toggleMax() {
  A.winMax()
    .then(v => {
      maximized.value = !!v;
    })
    .catch(() => {});
}

onMounted(async () => {
  A.onWinState &&
    A.onWinState(s => {
      maximized.value = !!s.maximized;
    });
  try {
    maximized.value = await A.winIsMax();
  } catch (e) {}
});
</script>

<style scoped>
/* 与标题栏 .titlebar-skin 一致：flex + gap:8px，保证按钮间距统一；
   容器统一 no-drag，使其在任意 drag 父级（.titlebar-skin 挂载的两处顶栏）中均能点击 */
.window-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}
/* 按钮本体沿用 base.css 全局 .win-btn（44×44、无边框、hover/close:hover），
   不在此重复定义，避免与全局类 specificity 冲突导致渲染差异 */
</style>
