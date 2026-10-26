<template>
  <Modal
    :title="isEdit ? t('taxonomy.editField') : t('taxonomy.newField')"
    icon="database"
    max-width="460px"
    @close="$emit('close')"
  >
    <template #default="{ requestClose }">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">
        <div>
          <label class="field-label">{{ t('taxonomy.fieldName') }}<span class="req">*</span></label>
          <input
            class="input"
            v-model.trim="form.name"
            maxlength="30"
            :placeholder="t('taxonomy.fieldNamePlaceholder')"
          />
        </div>
        <div>
          <label class="field-label">{{ t('common.code') }}<span class="req">*</span></label>
          <input
            class="input"
            v-model.trim="form.code"
            maxlength="20"
            :placeholder="t('taxonomy.fieldCodePlaceholder')"
            style="font-family: var(--font-mono)"
          />
        </div>
      </div>
      <label class="field-label">{{ t('taxonomy.dataType') }}<span class="req">*</span></label>
      <Dropdown v-model="form.type" :options="typeOptions" />
      <label class="field-label" v-if="form.type === 'select'">{{ t('taxonomy.selectOptionsLabel') }}</label>
      <input
        class="input"
        v-if="form.type === 'select'"
        v-model.trim="form.options"
        :placeholder="t('taxonomy.selectOptionsPlaceholder')"
      />
      <div style="display: flex; gap: 24px; margin-top: 14px">
        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer">
          <input type="checkbox" v-model="form.required" /> {{ t('taxonomy.requiredField') }}
        </label>
        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer">
          <input type="checkbox" v-model="form.uniqueField" /> {{ t('taxonomy.uniqueFieldLabel') }}
        </label>
      </div>
      <div class="modal-foot">
        <button class="btn" @click="requestClose">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" @click="save">{{ t('common.save') }}</button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { reactive, computed } from 'vue';
import { A } from '../../api';
import { run, okMsg } from '../../feedback';
import Modal from '../Modal.vue';
import Dropdown from '../Dropdown.vue';
import { t } from '../../i18n';

const FIELD_TYPE_KEYS = {
  text: 'taxonomy.fieldTypeText',
  textarea: 'taxonomy.fieldTypeTextarea',
  number: 'taxonomy.fieldTypeNumber',
  date: 'taxonomy.fieldTypeDate',
  select: 'taxonomy.fieldTypeSelect',
  url: 'taxonomy.fieldTypeUrl'
};
const typeOptions = computed(() =>
  Object.keys(FIELD_TYPE_KEYS).map(type => ({ value: type, label: t(FIELD_TYPE_KEYS[type]) }))
);

const props = defineProps({ value: { type: Object, required: true } });
const emit = defineEmits(['close', 'saved']);
const isEdit = computed(() => !!props.value.id);
const form = reactive({ id: null, name: '', code: '', type: 'text', options: '', required: false, uniqueField: false });
Object.assign(form, props.value);

async function save() {
  await run(
    () =>
      A.fieldSave({
        id: form.id || null,
        name: form.name,
        code: form.code,
        type: form.type,
        options: form.options,
        required: form.required,
        uniqueField: form.uniqueField
      }),
    { ok: okMsg.fieldSaved, then: () => emit('saved') }
  );
}
</script>
