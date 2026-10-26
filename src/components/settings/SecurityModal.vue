<template>
  <Modal :title="title" icon="lock" max-width="420px" @close="close">
    <template #default="{ requestClose }">
      <div class="modal-body">
        <template v-if="mode === 'enable'">
          <label class="field-label">{{ t('settings.secSetPass') }}<span class="req">*</span></label>
          <input
            class="input"
            v-model="secForm.pass"
            type="password"
            maxlength="128"
            :placeholder="t('settings.passMin8')"
          />
          <label class="field-label">{{ t('settings.secConfirmPass') }}<span class="req">*</span></label>
          <input
            class="input"
            v-model="secForm.pass2"
            type="password"
            maxlength="128"
            :placeholder="t('settings.passAgain')"
            @keyup.enter="submit"
          />
          <p class="dim warn">{{ t('settings.secEnableWarn') }}</p>
        </template>
        <template v-else-if="mode === 'disable'">
          <label class="field-label">{{ t('settings.secCurrentPass') }}<span class="req">*</span></label>
          <input
            class="input"
            v-model="secForm.pass"
            type="password"
            maxlength="128"
            :placeholder="t('settings.secVerifyCurrent')"
            @keyup.enter="submit"
          />
          <p class="dim warn">{{ t('settings.secDisableWarn') }}</p>
        </template>
        <template v-else>
          <label class="field-label">{{ t('settings.secOldPass') }}<span class="req">*</span></label>
          <input
            class="input"
            v-model="secForm.oldPass"
            type="password"
            maxlength="128"
            :placeholder="t('settings.secVerifyOld')"
          />
          <label class="field-label">{{ t('settings.secNewPass') }}<span class="req">*</span></label>
          <input
            class="input"
            v-model="secForm.newPass"
            type="password"
            maxlength="128"
            :placeholder="t('settings.passMin8')"
          />
          <label class="field-label">{{ t('settings.secConfirmNew') }}<span class="req">*</span></label>
          <input
            class="input"
            v-model="secForm.newPass2"
            type="password"
            maxlength="128"
            :placeholder="t('settings.passAgain')"
            @keyup.enter="submit"
          />
        </template>
        <label
          class="field-label"
          v-if="secState.safeStorage && mode !== 'disable'"
          style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 6px"
        >
          <input type="checkbox" v-model="secForm.remember" />
          <span>{{ t('settings.secRememberLabel') }}</span>
        </label>
      </div>
      <p class="err" v-if="secError">{{ secError }}</p>
      <div class="modal-foot">
        <button class="btn" @click="requestClose">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" :disabled="secBusy" @click="submit">
          {{ secBusy ? t('settings.processing') : t('common.confirm') }}
        </button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue';
import { A } from '../../api';
import { toastOk, errText } from '../../feedback';
import Modal from '../Modal.vue';
import { t } from '../../i18n';

const props = defineProps({
  mode: { type: String, default: null }, // null | 'enable' | 'disable' | 'change'
  secState: { type: Object, required: true }
});
const emit = defineEmits(['done', 'close']);

const title = computed(() =>
  props.mode === 'enable'
    ? t('settings.secModalEnable')
    : props.mode === 'disable'
      ? t('settings.secModalDisable')
      : t('settings.secModalChange')
);

const secForm = reactive({ pass: '', pass2: '', oldPass: '', newPass: '', newPass2: '', remember: false });
const secBusy = ref(false);
const secError = ref('');

function reset() {
  secForm.pass = '';
  secForm.pass2 = '';
  secForm.oldPass = '';
  secForm.newPass = '';
  secForm.newPass2 = '';
  secForm.remember = props.secState.keyFileExists;
  secError.value = '';
}
watch(
  () => props.mode,
  () => {
    if (props.mode) reset();
  }
);

function close() {
  emit('close');
}

async function submit() {
  if (secBusy.value) return;
  secError.value = '';
  if (props.mode === 'enable') {
    if (secForm.pass.length < 8) {
      secError.value = t('settings.errPassMin8');
      return;
    }
    if (secForm.pass !== secForm.pass2) {
      secError.value = t('settings.errPassMismatch');
      return;
    }
    secBusy.value = true;
    try {
      const r = await A.securityEnable({ pass: secForm.pass, pass2: secForm.pass2, remember: secForm.remember });
      toastOk(t('settings.secEnabledToast', { extra: r.remembered ? t('settings.secRememberedSuffix') : '' }));
      emit('done', r);
      close();
    } catch (e) {
      secError.value = errText(e);
    } finally {
      secBusy.value = false;
    }
  } else if (props.mode === 'disable') {
    secBusy.value = true;
    try {
      const r = await A.securityDisable({ pass: secForm.pass });
      toastOk(t('settings.secDisabledToast'));
      emit('done', r);
      close();
    } catch (e) {
      secError.value = errText(e);
    } finally {
      secBusy.value = false;
    }
  } else {
    if (secForm.newPass.length < 8) {
      secError.value = t('settings.errNewPassMin8');
      return;
    }
    if (secForm.newPass !== secForm.newPass2) {
      secError.value = t('settings.errNewPassMismatch');
      return;
    }
    secBusy.value = true;
    try {
      const r = await A.securityChange({
        oldPass: secForm.oldPass,
        newPass: secForm.newPass,
        newPass2: secForm.newPass2
      });
      toastOk(t('settings.secChangedToast', { extra: r.remembered ? t('settings.secRememberUpdatedSuffix') : '' }));
      emit('done', r);
      close();
    } catch (e) {
      secError.value = errText(e);
    } finally {
      secBusy.value = false;
    }
  }
}
</script>

<style scoped>
/* .modal-body 的 display/flex-direction 由 base.css 全局定义，此处只补 gap（避免重复声明） */
.modal-body {
  gap: 4px;
}
.modal-body .input {
  margin-bottom: 6px;
}
/* .err / .dim.warn 见 styles/components.css，此处仅覆盖间距差异 */
.err {
  margin-top: 8px;
}
</style>
