<template>
  <div class="recover-form">
    <div class="login-as acct-row" v-if="showHeader && userName">
      <span class="avatar">{{ (userName || '?').slice(0, 1) }}</span>
      <div class="uinfo">
        <b>{{ userName }}</b
        ><i>{{ userId }}</i>
      </div>
    </div>

    <p class="dim" v-if="state === 'loading'">{{ t('settings.loadingQA') }}</p>
    <p class="dim" v-else-if="state === 'none'">{{ noneText }}</p>
    <template v-else>
      <div v-for="(q, i) in questions" :key="i">
        <label class="field-label" :style="{ marginTop: i === 0 ? '0' : '14px' }">{{ q.q }}</label>
        <input class="input" v-model="answers[i]" :placeholder="t('settings.answerNPh', { n: i + 1 })" />
      </div>
      <label class="field-label" :style="{ marginTop: '14px' }">{{ t('settings.setNewPass') }}</label>
      <input
        class="input"
        v-model="newPass"
        :type="show ? 'text' : 'password'"
        maxlength="64"
        :placeholder="t('settings.passMin6')"
      />
      <label class="field-label" :style="{ marginTop: '10px' }">{{ t('settings.confirmNewPass') }}</label>
      <input
        class="input"
        v-model="newPass2"
        :type="show ? 'text' : 'password'"
        maxlength="64"
        :placeholder="t('settings.newPassAgainPh')"
        @keyup.enter="submit"
      />
      <PasswordReqHint />
      <label
        class="field-label"
        style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 10px"
      >
        <input type="checkbox" v-model="show" /><span>{{ t('settings.showPass') }}</span>
      </label>
      <div class="rec-btns" :class="{ stacked }" style="margin-top: 12px">
        <button class="btn btn-primary" :disabled="busy" @click="submit">
          {{ busy ? t('settings.verifying') : t('settings.resetPass') }}
        </button>
        <button class="btn" @click="$emit('cancel')">{{ cancelText }}</button>
      </div>
      <p class="rec-msg" v-if="message" :class="{ ok }">{{ message }}</p>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { A } from '../api';
import PasswordReqHint from './PasswordReqHint.vue';
import { t } from '../i18n';
import { errText } from '../feedback';
import { useSecurityQuestions } from '../composables/useSecurityQuestions';

const props = defineProps({
  userId: { type: String, required: true },
  userName: { type: String, default: '' },
  showHeader: { type: Boolean, default: false },
  cancelText: { type: String, default: () => t('common.cancel') },
  noneText: { type: String, default: () => t('settings.noQAText') },
  successText: { type: String, default: () => t('settings.pwdResetDone') },
  showSuccess: { type: Boolean, default: true },
  stacked: { type: Boolean, default: false }
});
const emit = defineEmits(['done', 'cancel']);

// 安全问答「问题列表」的加载收敛到 useSecurityQuestions（与 RebindMacModal 共用单一实现）
const { questions, state, load } = useSecurityQuestions();
const answers = ref(['', '', '']);
const newPass = ref('');
const newPass2 = ref('');
const show = ref(false);
const busy = ref(false);
const message = ref('');
const ok = ref(false);

async function loadWithReset() {
  message.value = '';
  ok.value = false;
  await load(props.userId);
  if (state.value === 'list') answers.value = questions.value.map(() => '');
}

onMounted(() => loadWithReset());
watch(
  () => props.userId,
  () => {
    if (props.userId) loadWithReset();
  }
);

async function submit() {
  message.value = '';
  ok.value = false;
  if (answers.value.some(a => !a.trim())) {
    message.value = t('settings.errAnswerAll');
    return;
  }
  if (newPass.value.length < 6) {
    message.value = t('settings.errNewPassMin6');
    return;
  }
  if (newPass.value !== newPass2.value) {
    message.value = t('settings.errNewPassMismatch');
    return;
  }
  busy.value = true;
  try {
    await A.recover({ userId: props.userId, answers: answers.value, newPass: newPass.value });
    newPass.value = '';
    newPass2.value = '';
    answers.value = answers.value.map(() => '');
    if (props.showSuccess) {
      ok.value = true;
      message.value = props.successText;
    }
    emit('done');
  } catch (e) {
    message.value = errText(e);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.recover-form {
  text-align: left;
}
.login-as {
  margin-bottom: 4px;
} /* 布局/配色/对齐来自 .acct-row（components.css） */
.rec-btns {
  display: flex;
  gap: 8px;
}
.rec-btns.stacked {
  flex-direction: column;
}
.rec-btns.stacked .btn {
  width: 100%;
}
.rec-msg {
  margin-top: 10px;
  font-size: 12px;
  color: var(--danger);
}
.rec-msg.ok {
  color: var(--ok);
}
</style>
