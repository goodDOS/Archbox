<template>
  <Modal :title="title" icon="lock" max-width="440px" @close="$emit('close')">
    <template #default="{ requestClose }">
      <div class="modal-body">
        <p class="dim">{{ desc }}</p>
        <label class="field-label">{{ t('settings.packPassLabel') }}</label>
        <input
          class="input"
          v-model="pass"
          type="password"
          maxlength="128"
          :placeholder="mode === 'set' ? t('settings.packPassPh') : ''"
          autocomplete="new-password"
        />
        <template v-if="mode === 'set'">
          <label class="field-label">{{ t('settings.packPassAgain') }}</label>
          <input
            class="input"
            v-model="pass2"
            type="password"
            maxlength="128"
            :placeholder="t('settings.packPassPh')"
            autocomplete="new-password"
            @keyup.enter="submit"
          />
        </template>
      </div>
      <p class="err" v-if="err">{{ err }}</p>
      <div class="modal-foot">
        <button class="btn" @click="requestClose">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" :disabled="busy" @click="submit">
          {{ busy ? t('settings.processing') : t('common.confirm') }}
        </button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { ref, computed } from 'vue';
import Modal from './Modal.vue';
import { t } from '../i18n';

const props = defineProps({
  // 'set'：导出时设置口令（可留空 = 不加密）；'unlock'：导入/恢复时输入口令解密
  mode: { type: String, default: 'set' },
  // 自定义标题/说明（覆盖默认文案），用于导入/恢复等场景
  titleOverride: { type: String, default: '' },
  descOverride: { type: String, default: '' }
});
const emit = defineEmits(['submit', 'close']);

const pass = ref('');
const pass2 = ref('');
const busy = ref(false);
const err = ref('');

const title = computed(() => {
  if (props.titleOverride) return props.titleOverride;
  return props.mode === 'set' ? t('settings.packPassTitle') : t('settings.packUnlockTitle');
});
const desc = computed(() => {
  if (props.descOverride) return props.descOverride;
  return props.mode === 'set' ? t('settings.packPassDesc') : t('settings.packUnlockDesc');
});

async function submit() {
  if (busy.value) return;
  err.value = '';
  if (props.mode === 'set') {
    if (pass.value !== pass2.value) {
      err.value = t('settings.packPassMismatch');
      return;
    }
  } else {
    if (!pass.value) {
      err.value = t('settings.packPassLabel');
      return;
    }
  }
  busy.value = true;
  try {
    // 交给父组件处理：父组件拿到口令后执行真正的导出/导入，成功则关闭
    await emit('submit', pass.value);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.modal-body {
  gap: 4px;
}
.modal-body .input {
  margin-bottom: 6px;
}
.err {
  margin-top: 8px;
}
</style>
