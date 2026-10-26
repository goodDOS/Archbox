<template>
  <p class="pwd-req">
    <Icon name="info" :size="14" />
    <span
      >{{ t('settings.pwdReqPrefix') }}<b>{{ t('settings.pwdReqMin') }}</b
      >{{ t('settings.pwdReqSuffix') }}</span
    >
  </p>
</template>

<script setup>
import Icon from './Icon.vue';
import { t } from '../i18n';
</script>

<style scoped>
.pwd-req {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  padding: 7px 10px;
  margin: 6px 0 2px;
}
.pwd-req :deep(svg) {
  flex: none;
  color: var(--accent);
  margin-top: 2px;
}
.pwd-req b {
  color: var(--text);
  font-weight: 600;
}
</style>
