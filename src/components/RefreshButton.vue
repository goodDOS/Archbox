<template>
  <button
    class="btn btn-sm icon-btn"
    :class="{ busy: busy }"
    :disabled="busy"
    :title="busy ? t('ui.refreshing') : t('ui.refresh')"
    @click="$emit('click')"
  >
    <Icon name="refresh" :size="14" />
    <span>{{ t('ui.refresh') }}</span>
  </button>
</template>

<script setup>
import Icon from './Icon.vue';
import { t } from '../i18n';
defineProps({ busy: { type: Boolean, default: false } });
defineEmits(['click']);
</script>

<style scoped>
.icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 72px; /* 防止 busy 状态时宽度抖动 */
  justify-content: center;
  transition: none; /* 关闭 .btn 自带的 background 过渡，杜绝点击闪烁 */
}
.icon-btn.busy {
  opacity: 0.55;
  cursor: wait;
}
</style>
