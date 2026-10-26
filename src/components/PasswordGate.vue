<template>
  <Modal v-if="state.open" :title="state.title" icon="lock" :danger="true" max-width="400px" @close="cancel">
    <template #default="{ requestClose }">
      <p class="pw-msg">
        <Icon name="warn" :size="16" /><span>{{ state.message }}</span>
      </p>

      <!-- 账号本身无法校验密码（如老账号未设密码）：引导先去设置密码 -->
      <div class="pw-nopw" v-if="state.reason === 'no-password'">
        <Icon name="warn" :size="16" />
        <span>{{ t('settings.gateNoPw1') }}{{ state.action }}{{ t('settings.gateNoPw2') }}</span>
      </div>

      <template v-else>
        <label class="field-label">{{ t('settings.pwdLabel') }}<span class="req">*</span></label>
        <div class="pwd-row">
          <input
            class="input"
            v-model="pass"
            :type="show ? 'text' : 'password'"
            maxlength="64"
            ref="passEl"
            :disabled="state.busy"
            :placeholder="t('settings.pwdPh')"
            @keyup.enter="verify"
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
        <p class="pw-err" v-if="state.error">{{ state.error }}</p>
      </template>

      <div class="modal-foot">
        <!-- ★ 必须先 cancel() 再 requestClose()：cancel 负责 resolve(false)，
             只调 requestClose 的话 Promise 永不兑现，调用方（await verifyGuard）
             会一直挂起；先关后 resolve 又会撞上已卸载组件。故用逗号表达式固定顺序。 -->
        <button class="btn" @click="(cancel(), requestClose())" :disabled="state.busy">{{ t('common.cancel') }}</button>
        <button
          class="btn btn-danger"
          v-if="state.reason !== 'no-password'"
          @click="verify"
          :disabled="state.busy || !pass"
        >
          {{ t('settings.confirmAction', { action: state.action }) }}
        </button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue';
import { useGuardState, markVerified } from '../composables/useGuard';
import { A } from '../api';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import { t } from '../i18n';
import { errText } from '../feedback';

const state = useGuardState();
const pass = ref('');
const show = ref(false);
const passEl = ref(null);

// 弹窗打开时自动聚焦密码框
watch(
  () => state.open,
  v => {
    if (v) nextTick(() => passEl.value && passEl.value.focus());
  }
);

async function verify() {
  if (!pass.value || state.busy) return;
  state.busy = true;
  state.error = '';
  try {
    const r = await A.userVerify({ pass: pass.value });
    if (r && r.ok) {
      const resolve = state.resolve;
      pass.value = '';
      markVerified(); // 记录通过时间，供「5 分钟内免重复输入」
      resolve && resolve(true);
    } else if (r && r.reason === 'no-password') {
      state.reason = 'no-password';
      pass.value = '';
    } else {
      state.error = t('settings.errPwdWrong');
      pass.value = '';
    }
  } catch (e) {
    state.error = errText(e, t('settings.verifyFailed'));
  } finally {
    state.busy = false;
  }
}

function cancel() {
  const resolve = state.resolve;
  pass.value = '';
  resolve && resolve(false);
}
</script>

<style scoped>
/* 红 banner：左侧警示条 + 警示图标 + 文本（克制而醒目） */
.pw-msg {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--danger);
  background: var(--danger-weak);
  border-left: 3px solid var(--danger);
  border-radius: 0 8px 8px 0;
  padding: 10px 12px;
  margin: 0 0 14px;
}
.pw-msg svg {
  flex: none;
  margin-top: 2px;
}
.pw-msg span {
  flex: 1;
}

.pw-nopw {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-2);
  background: var(--surface-2);
  border-left: 3px solid var(--warn);
  border-radius: 0 8px 8px 0;
  padding: 10px 12px;
  margin: 0 0 14px;
}
.pw-nopw svg {
  color: var(--warn);
  flex: none;
  margin-top: 2px;
}
.pw-err {
  color: var(--danger);
  font-size: 12px;
  margin: 6px 0 0;
}
/* .pwd-row / .pwd-eye 公共样式见 styles/components.css，此处仅保留行间距差异 */
.pwd-row {
  margin-top: 6px;
}
</style>
