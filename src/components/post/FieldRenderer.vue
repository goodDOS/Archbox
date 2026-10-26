<template>
  <div class="card" style="padding: 16px">
    <div class="fc-title fc-title-bar">
      <span
        >{{ t('post.fieldData') }}
        <span style="color: var(--text-3); font-weight: 400">{{
          t('post.customFieldCount', { n: defs.length, sel: selectedCount })
        }}</span></span
      >
      <div style="display: flex; gap: 8px">
        <button class="btn btn-sm" :class="{ on: showPicker }" @click="showPicker = !showPicker" :disabled="!writable">
          + {{ t('post.addField') }}
        </button>
        <button class="btn btn-sm" v-if="writable" @click="$emit('add')">+ {{ t('post.newField') }}</button>
      </div>
    </div>

    <!-- 字段选择面板：勾选要填写的字段，勾选后才在下方出现填写框（避免默认展示过多影响填写） -->
    <div class="field-picker" v-if="showPicker && writable">
      <label class="fp-item" v-for="d in defs" :key="d.code">
        <input type="checkbox" :checked="!!selected[d.code]" @change="toggle(d.code, $event.target.checked)" />
        <span>{{ d.name }}（{{ d.code }}）<span class="req" v-if="d.required">*</span></span>
      </label>
      <div class="fp-hint" v-if="!defs.length">{{ t('post.noFieldsHint') }}</div>
    </div>

    <template v-for="d in selectedDefs" :key="d.code">
      <div class="field-row">
        <label class="field-label">
          {{ d.name }}（{{ d.code }}）<span class="req" v-if="d.required">*</span>
          <span class="badge" style="margin-left: 6px" v-if="d.unique_field" :title="t('post.dupOnSaveTip')">{{
            t('post.dupCheck')
          }}</span>
        </label>
        <label
          class="skip-toggle"
          v-if="d.required && writable"
          :class="{ on: !!skipped[d.code] }"
          :title="t('post.skipTip')"
        >
          <input type="checkbox" v-model="skipped[d.code]" /> {{ t('post.skipForNow') }}
        </label>
      </div>
      <Dropdown
        v-if="d.type === 'select'"
        v-model="fields[d.code]"
        :options="selectOptions(d)"
        :disabled="!writable || !!skipped[d.code]"
      />
      <textarea
        v-else-if="d.type === 'textarea'"
        class="input"
        rows="3"
        v-model="fields[d.code]"
        maxlength="5000"
        :disabled="!writable || !!skipped[d.code]"
        data-find-input
      ></textarea>
      <input
        v-else
        :type="d.type === 'number' ? 'number' : d.type === 'date' ? 'date' : d.type === 'url' ? 'url' : 'text'"
        class="input"
        v-model="fields[d.code]"
        maxlength="5000"
        :disabled="!writable || !!skipped[d.code]"
        data-find-input
      />
    </template>

    <div class="empty" v-if="!defs.length">{{ t('post.noFieldsHintTop') }}</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import Dropdown from '../Dropdown.vue';
import { t } from '../../i18n';

const props = defineProps({
  defs: { type: Array, default: () => [] },
  fields: { type: Object, required: true },
  writable: { type: Boolean, default: true },
  /* 必填字段「暂不填」勾选状态：{ 字段code: true }，由父组件持有（保存校验时读取） */
  skipped: { type: Object, default: () => ({}) },
  /* 已勾选要填写的字段：{ 字段code: true }，由父组件持有（FieldRenderer 仅渲染其中字段） */
  selected: { type: Object, default: () => ({}) }
});
defineEmits(['add']);

const showPicker = ref(false);
const selectedCount = computed(() => props.defs.filter(d => props.selected[d.code]).length);
const selectedDefs = computed(() => props.defs.filter(d => props.selected[d.code]));

function toggle(code, on) {
  if (on) props.selected[code] = true;
  else delete props.selected[code];
}

// 自建下拉（Dropdown）的 options 形态：首项「— 未填 —」，其余取 d.options（string 数组）
function selectOptions(d) {
  const list = (d.options || []).map(o => ({ value: o, label: o }));
  return [{ value: '', label: t('post.unfilled') }, ...list];
}
</script>

<style scoped>
.fc-title {
  font-weight: 600;
  font-size: 13.5px;
  padding: 12px 0 8px;
}
.fc-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 2px;
}
.btn-sm.on {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent);
}
.field-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.fp-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-2);
  cursor: pointer;
  user-select: none;
}
.fp-item input {
  margin: 0;
}
.fp-hint {
  color: var(--text-3);
  font-size: 12px;
}
.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.field-row .field-label {
  flex: 1;
  min-width: 0;
}
.skip-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  font-size: 11.5px;
  font-weight: 400;
  color: var(--text-3);
  cursor: pointer;
  user-select: none;
}
.skip-toggle.on {
  color: var(--warn);
}
</style>
