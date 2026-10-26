<template>
  <Modal
    :title="isEdit ? t('taxonomy.editTag') : t('taxonomy.newTag')"
    icon="tag"
    max-width="380px"
    @close="$emit('close')"
  >
    <template #default="{ requestClose }">
      <label class="field-label">{{ t('taxonomy.tagName') }}<span class="req">*</span></label>
      <input class="input" v-model.trim="form.name" maxlength="20" />
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
import { t } from '../../i18n';

const props = defineProps({ value: { type: Object, required: true } });
const emit = defineEmits(['close', 'saved']);
const isEdit = computed(() => !!props.value.id);
const form = reactive({ id: null, name: '' });
Object.assign(form, props.value);

async function save() {
  await run(() => A.tagSave({ id: form.id || null, name: form.name }), { ok: okMsg.saved, then: () => emit('saved') });
}
</script>
