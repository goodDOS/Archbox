<template>
  <div>
    <div v-for="(line, i) in lines" :key="i" class="log-line" :class="levelOf(line)">{{ line }}</div>
    <div v-if="!lines.length" class="log-empty empty-row">{{ t('settings.noRunlog') }}</div>
  </div>
</template>

<script setup>
// 运行日志行的通用渲染视图：设置页「运行日志」面板与右下角「运行过程」悬浮窗共用，
// 保证配色、换行、可选中复制三处行为完全一致。
import { t } from '../i18n';
defineProps({
  lines: { type: Array, default: () => [] }
});

function levelOf(line) {
  if (/\[ERROR\]|\[ERR\]|错误|失败/.test(line)) return 'err';
  if (/\[WARN\]|警告/.test(line)) return 'warn';
  if (/\[DEBUG\]/.test(line)) return 'debug';
  return '';
}
</script>

<style scoped>
.log-line {
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text);
  /* 显式允许选中复制（Electron 沙盒下部分版本需 -webkit- 前缀） */
  user-select: text;
  -webkit-user-select: text;
}
.log-line.err {
  color: var(--danger);
}
.log-line.warn {
  color: var(--warn);
}
.log-line.debug {
  color: var(--text-3);
}
.log-empty {
  padding: 10px 0;
} /* 灰字来自 .empty-row */
</style>
