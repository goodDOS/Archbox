<template>
  <div class="mbars" :style="{ height: height + 'px' }">
    <div class="b7-bars mbars-fill">
      <div class="b7-col mbar" v-for="(it, i) in items" :key="i">
        <div class="b7-val mbar-val" v-if="Number(it.value)">{{ compact(it.value) }}</div>
        <div class="b7-bar mbar-col" :class="{ zero: !Number(it.value) }" :style="styleOf(it.value)"></div>
        <div class="b7-lab mbar-lab">{{ short(it.label) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  items: { type: Array, default: () => [] }, // 序列 [{ label, value }]
  height: { type: Number, default: 48 },
  unit: { type: String, default: 'count' } // 'count' | 'seconds'
});

const max = computed(() => {
  let m = 0;
  for (const x of props.items) m = Math.max(m, Number(x.value) || 0);
  return m;
});

function styleOf(v) {
  const n = Number(v) || 0;
  // 全 0 或单点为 0：给 2px 高度配合 .b7-bar.zero 的淡色，保证「这天无数据」可见
  if (max.value <= 0 || n <= 0) return { height: '2px' };
  // 有效值：下限 8% 保证可见，上限 92% 顶部留白，差异更易辨识
  const pct = Math.max(8, Math.round((n / max.value) * 92));
  return { height: pct + '%' };
}

// 日期标签：单行完整显示 09-01（最多取末 5 字符），不折行
function short(label) {
  if (!label) return '';
  return String(label).length > 5 ? String(label).slice(-5) : String(label);
}

// 数值压缩：按显式 unit 判定（修正原先「首元素是数字则恒真」的误判 bug）
function compact(v) {
  const n = Number(v) || 0;
  if (props.unit === 'seconds') {
    const m = Math.floor(n / 60);
    if (m >= 60) return (m / 60).toFixed(1).replace(/\.0$/, '') + 'h';
    return m + 'm';
  }
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}
</script>

<style scoped>
/* 柱状图视觉全部来自全局 bars.css（与 TrendChart 同源），此处仅保留高度约束 */
.mbars {
  display: flex;
  align-items: flex-end;
}
.mbars-fill {
  width: 100%;
  height: 100%;
}
.mbar {
  height: 100%;
}
</style>
