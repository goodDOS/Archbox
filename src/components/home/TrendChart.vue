<template>
  <div>
    <div class="section-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 21h18M7 21V9m5 12V3m5 18v-8" />
      </svg>
      {{ t('home.last7EntryTrend') }}
    </div>
    <div class="card chart">
      <div class="b7-bars">
        <div class="b7-col" v-for="d in last7" :key="d.label">
          <div class="b7-val">{{ d.count || '' }}</div>
          <div
            class="b7-bar"
            :class="{ zero: !d.count }"
            :style="{ height: barH(d.count) + 'px' }"
            :title="t('home.barTitle', { label: d.label, count: d.count })"
          ></div>
          <div class="b7-lab">{{ d.label }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { t } from '../../i18n';
const props = defineProps({ last7: { type: Array, default: () => [] } });

function barH(c) {
  const max = Math.max(1, ...props.last7.map(d => d.count || 0));
  // 0 值给 2px，与 .b7-bar.zero 的最小高度配合，保证位置可见
  if (!c) return 2;
  return 12 + Math.round((c / max) * 70);
}
</script>

<style scoped>
/* 柱状图视觉全部来自全局 bars.css（与 MiniBars 同源），此处仅保留卡片内边距与容器高度 */
.chart {
  padding: 18px 14px 10px;
}
.b7-bars {
  height: 130px;
}
</style>
