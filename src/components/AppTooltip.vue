<template>
  <Transition name="app-tip">
    <div
      v-if="visible && text"
      id="app-tip"
      class="app-tip"
      :class="`at-${pos.placement}`"
      role="tooltip"
      :style="{ left: pos.left + 'px', top: pos.top + 'px' }"
    >
      {{ text }}
    </div>
  </Transition>
</template>

<script setup>
/**
 * 提示层的展示部分（Beta.324，#437）。
 *
 * 逻辑全在 src/composables/useTooltip.js：那里负责「谁该弹、弹什么、弹在哪」，
 * 这里只负责「长什么样」。分开是为了让定位/延时这类易错逻辑可以单测，
 * 不必渲染整棵组件树。
 *
 * 为什么挂在 App.vue 根上而不是每个按钮里：
 *   ① 142 处提示如果各建一个 div，DOM 节点数白涨，且 z-index 会互相打架；
 *   ② 提示层要盖在所有弹窗之上（含 Modal 的 mask），只有根级、且 z-index
 *      高于弹窗层才能做到 —— 写在各弹窗内部永远盖不住别的弹窗。
 */
import { onMounted, onBeforeUnmount } from 'vue';
import { useTooltip } from '../composables/useTooltip';

const { visible, text, pos, bind, unbind } = useTooltip();

onMounted(bind);
onBeforeUnmount(unbind);
</script>
