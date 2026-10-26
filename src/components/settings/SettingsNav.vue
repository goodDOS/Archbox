<template>
  <div class="card sec-nav">
    <button
      v-for="s in sections"
      :key="s.key"
      class="sec-nav-item"
      :class="{ active: active === s.key }"
      @click="$emit('nav', s.key)"
    >
      <Icon :name="s.icon" :size="16" />
      <span>{{ s.label }}</span>
    </button>
  </div>
</template>

<script setup>
import Icon from '../Icon.vue';
defineProps({ sections: { type: Array, required: true }, active: { type: String, required: true } });
defineEmits(['nav']);
</script>

<style scoped>
.sec-nav {
  padding: 8px;
  position: sticky;
  top: 0;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
}
.sec-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-2);
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
}
.sec-nav-item:hover {
  background: var(--btn-ghost-hover);
  color: var(--text);
}
.sec-nav-item.active {
  background: var(--accent-weak);
  color: var(--accent);
  font-weight: 600;
}
.sec-nav-item.active svg {
  color: var(--accent);
}
.sec-nav-item svg {
  flex: none;
}
.sec-nav-item span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 窄屏转为单列时取消吸顶，避免遮挡内容 */
@media (max-width: 1100px) {
  .sec-nav {
    position: static;
    max-height: none;
    overflow: visible;
  }
}
</style>
