<template>
  <div class="card sec">
    <h3>{{ t('settings.themeTitle') }}</h3>
    <div class="themes">
      <div
        class="theme-card"
        v-for="th in themes"
        :key="th.key"
        :class="{ on: store.theme === th.key }"
        @click="$emit('choose', th.key)"
      >
        <div class="t-preview" :data-t="th.key">
          <span class="tp-bar"></span><span class="tp-side"></span> <span class="tp-block"></span
          ><span class="tp-block"></span><span class="tp-accent"></span>
        </div>
        <b>{{ t(th.nameKey) }}</b>
        <span class="dim">{{ t(th.descKey) }}</span>
        <span class="badge acc" v-if="store.theme === th.key">{{ t('settings.currentTag') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { store } from '../../store';
import { t } from '../../i18n';
defineProps({ themes: { type: Array, required: true } });
defineEmits(['choose']);
</script>

<style scoped>
/* .sec 见 styles/components.css，此处仅保留本区块特有样式 */
.themes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.theme-card {
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 5px;
  position: relative;
}
.theme-card.on {
  border-color: var(--accent);
  /* 用 outline 替代 box-shadow，避免直角外环在圆角卡边角处产生割裂感；
     outline 不被父容器 overflow 裁切，与元素 border-radius 协调更自然 */
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
.theme-card b {
  font-size: 13.5px;
}
.t-preview {
  height: 84px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  display: grid;
  grid-template: 14px 1fr / 44px 1fr;
  gap: 4px;
  padding: 6px;
  margin-bottom: 4px;
}
.tp-bar {
  grid-column: 1/3;
  border-radius: 3px;
}
.tp-side {
  border-radius: 3px;
}
.tp-block {
  border-radius: 3px;
}
.tp-accent {
  border-radius: 3px;
  height: 10px;
  align-self: end;
}
/* 各主题预览卡的示意色统一取自 themes.css 的 --tp-* 变量（单一数据源）。
 * 此处不再写 hex 字面量，避免与主题身份色两处维护不同步。 */
.t-preview[data-t='light'] {
  background: var(--tp-light-bg);
}
.t-preview[data-t='light'] .tp-bar,
.t-preview[data-t='light'] .tp-side {
  background: var(--tp-light-surface);
  border: 1px solid var(--tp-light-border);
}
.t-preview[data-t='light'] .tp-block {
  background: var(--tp-light-surface);
  border: 1px solid var(--tp-light-border);
}
.t-preview[data-t='light'] .tp-accent {
  background: var(--tp-light-accent);
}
.t-preview[data-t='dark'] {
  background: var(--tp-dark-bg);
}
.t-preview[data-t='dark'] .tp-bar,
.t-preview[data-t='dark'] .tp-side {
  background: var(--tp-dark-surface);
  border: 1px solid var(--tp-dark-border);
}
.t-preview[data-t='dark'] .tp-block {
  background: var(--tp-dark-block);
  border: 1px solid var(--tp-dark-border);
}
.t-preview[data-t='dark'] .tp-accent {
  background: var(--tp-dark-accent);
}
.t-preview[data-t='wire'] {
  background: var(--tp-wire-bg);
}
.t-preview[data-t='wire'] .tp-bar,
.t-preview[data-t='wire'] .tp-side,
.t-preview[data-t='wire'] .tp-block {
  background: var(--tp-wire-surface);
  border: 1.2px solid var(--tp-wire-line);
  border-radius: 0;
}
.t-preview[data-t='wire'] .tp-accent {
  background: repeating-linear-gradient(45deg, var(--tp-wire-line) 0 2px, transparent 2px 5px);
  border: 1px solid var(--tp-wire-line);
}
.t-preview[data-t='cs16'] {
  background: var(--tp-cs16-bg);
}
.t-preview[data-t='cs16'] .tp-bar,
.t-preview[data-t='cs16'] .tp-side {
  background: var(--tp-cs16-surface);
  border: 1px solid var(--tp-cs16-border);
}
.t-preview[data-t='cs16'] .tp-block {
  background: var(--tp-cs16-block);
  border: 1px solid var(--tp-cs16-border);
}
.t-preview[data-t='cs16'] .tp-accent {
  background: var(--tp-cs16-accent);
}
.t-preview[data-t='bamboo'] {
  background: var(--tp-bamboo-bg);
}
.t-preview[data-t='bamboo'] .tp-bar,
.t-preview[data-t='bamboo'] .tp-side {
  background: var(--tp-bamboo-surface);
  border: 1px solid var(--tp-bamboo-border);
}
.t-preview[data-t='bamboo'] .tp-block {
  background: var(--tp-bamboo-surface);
  border: 1px solid var(--tp-bamboo-border);
}
.t-preview[data-t='bamboo'] .tp-accent {
  background: var(--tp-bamboo-accent);
}
.t-preview[data-t='sandalwood'] {
  background: var(--tp-sandalwood-bg);
}
.t-preview[data-t='sandalwood'] .tp-bar,
.t-preview[data-t='sandalwood'] .tp-side {
  background: var(--tp-sandalwood-surface);
  border: 1px solid var(--tp-sandalwood-border);
}
.t-preview[data-t='sandalwood'] .tp-block {
  background: var(--tp-sandalwood-surface);
  border: 1px solid var(--tp-sandalwood-border);
}
.t-preview[data-t='sandalwood'] .tp-accent {
  background: var(--tp-sandalwood-accent);
}
.t-preview[data-t='sky'] {
  background: var(--tp-sky-bg);
}
.t-preview[data-t='sky'] .tp-bar,
.t-preview[data-t='sky'] .tp-side {
  background: var(--tp-sky-surface);
  border: 1px solid var(--tp-sky-border);
}
.t-preview[data-t='sky'] .tp-block {
  background: var(--tp-sky-surface);
  border: 1px solid var(--tp-sky-border);
}
.t-preview[data-t='sky'] .tp-accent {
  background: var(--tp-sky-accent);
}
.t-preview[data-t='halflife'] {
  background: var(--tp-halflife-bg);
}
.t-preview[data-t='halflife'] .tp-bar,
.t-preview[data-t='halflife'] .tp-side {
  background: var(--tp-halflife-surface);
  border: 1px solid var(--tp-halflife-border);
}
.t-preview[data-t='halflife'] .tp-block {
  background: var(--tp-halflife-block);
  border: 1px solid var(--tp-halflife-border);
}
.t-preview[data-t='halflife'] .tp-accent {
  background: var(--tp-halflife-accent);
}
</style>
