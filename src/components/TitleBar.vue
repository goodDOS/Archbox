<template>
  <header class="titlebar titlebar-skin">
    <BrandMark />
    <div class="tb-spacer"></div>
    <span class="no-drag" style="width: 6px"></span>
    <WindowControls />
  </header>
</template>

<script setup>
import BrandMark from './BrandMark.vue';
import WindowControls from './WindowControls.vue';
</script>
