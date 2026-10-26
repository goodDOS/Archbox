<template>
  <svg
    :width="size"
    :height="size"
    :viewBox="def.vb"
    :fill="def.s === 'fill' ? 'currentColor' : 'none'"
    :stroke="def.s === 'stroke' ? 'currentColor' : 'none'"
    :stroke-width="def.s === 'stroke' ? strokeWidth : undefined"
    :stroke-linecap="def.s === 'stroke' ? 'round' : undefined"
    :stroke-linejoin="def.s === 'stroke' ? 'round' : undefined"
    aria-hidden="true"
    :style="{ flex: 'none' }"
    v-html="inner"
  ></svg>
</template>

<script setup>
/**
 * 全站唯一图标组件。
 *
 * ★ 图标不手搓 ★ 用户要求「不要手搓图标」，随后补充
 * 「其实图标不是必须局限阿里的，最重要是匹配」。
 * 现按**语义匹配**从两个开源库取形，各取所长：
 *   - 填充形（s: 'fill'）  → @ant-design/icons-svg（阿里，MIT）
 *   - 线条形（s: 'stroke'）→ lucide-static（Lucide，ISC）
 * 数据由 scripts/gen-icons.mjs 生成到 icon-antd.js，运行时零依赖、file:// 离线可用。
 * 加/换图标：改脚本顶部的 ICONS 清单并重跑脚本。
 *
 * 两库默认视觉重量不同（AntD 实心、Lucide 1.5px 描边），这里把 Lucide 统一收到
 * 2px（与本项目工具栏既有手感一致），避免同一排图标粗细不匀。
 */
import { computed } from 'vue';
import { ICONS } from './icon-antd';

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 18 },
  stroke: { type: [Number, String], default: undefined }
});

/** 线条形图标的描边粗细：调用方显式传 stroke 时优先，否则 2（视觉重量对齐 AntD） */
const strokeWidth = computed(() => props.stroke ?? 2);

const def = computed(() => ICONS[props.name] || { s: 'fill', vb: '64 64 896 896', ch: [] });

// 序列化图元。数据来自本地生成的静态文件，不含任何用户输入，v-html 安全。
const inner = computed(() =>
  def.value.ch
    .map(c => {
      const attrs = Object.entries(c.a)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${c.t} ${attrs}/>`;
    })
    .join('')
);
</script>
