<template>
  <div class="gate">
    <GateTitleBar />
    <div class="gate-card-wrap">
      <div class="gate-card card">
        <div class="gate-logo"><Icon name="lock" :size="28" /></div>
        <h1>{{ t('settings.dbEncrypted') }}</h1>
        <p class="sub">{{ t('settings.unlockSub') }}</p>

        <div class="gate-form">
          <label class="field-label">{{ t('settings.dbPass') }}<span class="req">*</span></label>
          <div class="pwd-row">
            <input
              class="input"
              v-model="pass"
              :type="show ? 'text' : 'password'"
              maxlength="128"
              :placeholder="t('settings.passMin8')"
              @keyup.enter="doUnlock"
              ref="passEl"
            />
            <button
              class="pwd-eye"
              type="button"
              @click="show = !show"
              :title="show ? t('settings.hide') : t('settings.show')"
            >
              <Icon :name="show ? 'eye-off' : 'eye'" :size="18" />
            </button>
          </div>
          <p class="err" v-if="error">{{ error }}</p>

          <label
            class="field-label"
            v-if="safeStorage"
            style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 10px"
          >
            <input type="checkbox" v-model="remember" />
            <span>{{ t('settings.rememberPass') }}</span>
          </label>
          <p class="dim" v-if="safeStorage">{{ t('settings.rememberPassTip') }}</p>
          <p class="dim warn" v-else>{{ t('settings.noSafeStorage') }}</p>

          <button
            class="btn btn-primary"
            style="width: 100%; padding: 10px; margin-top: 12px"
            :disabled="busy || !pass"
            @click="doUnlock"
          >
            {{ busy ? t('settings.unlocking') : t('settings.unlockAndEnter') }}
          </button>

          <div class="warn-box">
            <b><Icon name="warn" :size="14" /> {{ t('settings.encPassLost') }}</b>
            <span>{{ t('settings.unlockPassLostBody') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { unlockDb } from '../store';
import { toast, errText } from '../feedback';
import { A } from '../api';
import Icon from './Icon.vue';
import GateTitleBar from './GateTitleBar.vue';
import { t } from '../i18n';

const pass = ref('');
const show = ref(false);
const remember = ref(false);
const busy = ref(false);
const error = ref('');
const safeStorage = ref(false);
const passEl = ref(null);

onMounted(async () => {
  try {
    const s = await A.securityStatus();
    safeStorage.value = !!s.safeStorage;
    if (s.keyFileExists) remember.value = true; // 已有记住的口令：默认勾选，便于刷新口令
  } catch (e) {}
  setTimeout(() => passEl.value && passEl.value.focus(), 50);
});

async function doUnlock() {
  if (!pass.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const r = await unlockDb(pass.value, remember.value);
    toast(r.remembered ? t('settings.unlockedRemembered') : t('settings.unlocked'));
  } catch (e) {
    error.value = errText(e);
  } finally {
    busy.value = false;
    pass.value = '';
  }
}
</script>

<style scoped>
/* .gate（含布局）、.gate-card-wrap、.gate-card、.gate-logo、.pwd-row、.pwd-eye、.err、
   .dim.warn 均见公共层；顶栏见 GateTitleBar.vue。
   此处只留 UnlockGate 特有差异 —— 公共层已收录的类名必须删净，
   否则 scoped 的 [data-v-*] 会以更高特异性静默压过全局。
   本页 .gate-card 用全局默认宽度（--gate-card-w: 440px），无需覆盖。 */
/* h1 是元素选择器，不属公共层收录范围，留在组件内。 */
h1 {
  font-size: 20px;
}
.warn-box {
  text-align: left;
  font-size: 11px;
  margin-top: 14px;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px dashed var(--warn);
  border-radius: var(--radius);
  color: var(--text-2);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.warn-box b {
  color: var(--warn);
}
</style>
