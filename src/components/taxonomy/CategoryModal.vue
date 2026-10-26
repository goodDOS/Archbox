<template>
  <Modal
    :title="isEdit ? t('taxonomy.editCat') : t('taxonomy.newCat')"
    icon="list"
    max-width="420px"
    @close="$emit('close')"
  >
    <template #default="{ requestClose }">
      <label class="field-label">{{ t('taxonomy.belongRegion') }}<span class="req">*</span></label>
      <Dropdown v-model="form.regionId" :options="regionOptions" :placeholder="t('taxonomy.selectRegion')" />
      <label class="field-label">{{ t('common.name') }}<span class="req">*</span></label>
      <input class="input" v-model.trim="form.name" maxlength="40" />
      <label class="field-label">{{ t('common.code') }}<span class="req">*</span></label>
      <input class="input" v-model.trim="form.code" maxlength="20" />
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
import { run, okMsg, toast } from '../../feedback';
import Modal from '../Modal.vue';
import Dropdown from '../Dropdown.vue';
import { t } from '../../i18n';

const props = defineProps({
  value: { type: Object, required: true },
  regions: { type: Array, default: () => [] }
});
const emit = defineEmits(['close', 'saved']);
const isEdit = computed(() => !!props.value.id);
const form = reactive({ id: null, regionId: null, name: '', code: '' });
Object.assign(form, props.value);

const regionOptions = computed(() => props.regions.map(r => ({ value: r.id, label: r.name })));

async function save() {
  if (!form.code) {
    toast(t('taxonomy.catCodeRequired'), 'err');
    return;
  }
  await run(() => A.catSave({ id: form.id || null, regionId: form.regionId, name: form.name, code: form.code }), {
    ok: okMsg.saved,
    then: () => emit('saved')
  });
}
</script>
