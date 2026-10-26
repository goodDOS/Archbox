<template>
  <div class="pager" v-if="pages > 1">
    <button class="btn btn-sm" :disabled="page <= 1" @click="nav(page - 1)">{{ t('ui.pagerPrev') }}</button>
    <span class="pg-info">{{ t('ui.pagerPage', { page }) }}</span>
    <input class="input pg-input" type="number" min="1" :max="pages" v-model.number="jump" @keyup.enter="nav(jump)" />
    <span class="pg-info">{{ t('ui.pagerPages', { pages }) }}</span>
    <button class="btn btn-sm" @click="nav(jump)">{{ t('ui.pagerJump') }}</button>
    <button class="btn btn-sm" :disabled="page >= pages" @click="nav(page + 1)">{{ t('ui.pagerNext') }}</button>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { t } from '../i18n';
const props = defineProps({
  page: { type: Number, required: true },
  pages: { type: Number, required: true }
});
const emit = defineEmits(['navigate']);
const jump = ref(props.page);
watch(
  () => props.page,
  v => {
    jump.value = v;
  }
);
function nav(p) {
  let n = Number(p) || 1;
  if (n < 1) n = 1;
  if (n > props.pages) n = props.pages;
  emit('navigate', n);
}
</script>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: center;
  margin: 18px 6px;
  flex-wrap: wrap;
}
.pg-info {
  font-size: 13px;
  color: var(--text-2);
}
.pg-input {
  width: 64px;
  text-align: center;
  padding: 5px 8px;
}
</style>
