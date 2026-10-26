<template>
  <div class="brand no-drag" style="cursor: default">
    <span class="logo"><Icon name="database" :size="13" :stroke="2.2" /></span>
    <span>{{ BRAND_NAME }}</span>
    <span class="ver">Archbox v{{ version }}</span>
  </div>
</template>

<script setup>
import { store } from '../store';
import Icon from './Icon.vue';
import { BRAND_NAME } from '../i18n';

const version = (store.versions && store.versions.app) || '0.1.0';
</script>

<style scoped>
/* 本组件不定义任何样式，这是刻意的：
 * 外观全部来自全局 styles/base.css 的 .brand / .brand .logo / .brand .ver，
 * 与主界面 TitleBar 共用同一份定义，因此天然不会漂移。
 * 若在此重复定义，反而会因 scoped 特异性更高而覆盖全局值 —— 正是要避免的事。
 *
 * 另注：class="no-drag" 由 .titlebar-skin .no-drag 提供豁免，两处标题栏（主界面 / 门禁页）
 * 都挂着 .titlebar-skin，故本类在两侧均生效。门禁页无交互元素，多这条豁免也无副作用；
 * 保留该 class 是为了与主界面标记保持完全相同，不引入无意义的差异。 */
</style>
