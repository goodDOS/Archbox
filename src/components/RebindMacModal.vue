<template>
  <Modal :title="t('settings.rebindTitle')" icon="refresh" max-width="440px" @close="$emit('close')">
    <template #default="{ requestClose }">
      <div class="modal-body">
        <p class="dim">{{ t('settings.rebindDesc') }}</p>
        <div class="mac-box">
          <div>
            <b>{{ t('settings.rebindMacOld') }}</b>
            <code>{{ targetMac }}</code>
          </div>
          <div>
            <b>{{ t('settings.rebindMacNew') }}</b>
            <code>{{ localMac }}</code>
          </div>
        </div>

        <!-- 验证方式切换：密码 / 安全问答 -->
        <div class="verify-tabs">
          <button class="tab" :class="{ on: method === 'password' }" @click="switchMethod('password')">
            {{ t('settings.rebindByPassword') }}
          </button>
          <button class="tab" :class="{ on: method === 'answers' }" @click="switchMethod('answers')">
            {{ t('settings.rebindByQA') }}
          </button>
        </div>

        <!-- 密码验证 -->
        <template v-if="method === 'password'">
          <label class="field-label">{{ t('settings.pwdLabel') }}</label>
          <input
            class="input"
            v-model="password"
            type="password"
            maxlength="64"
            :placeholder="t('settings.pwdPh2')"
            autocomplete="current-password"
            @keyup.enter="submit"
          />
        </template>

        <!-- 安全问答验证 -->
        <template v-else>
          <p class="dim" v-if="qaState === 'loading'">{{ t('settings.loadingQA') }}</p>
          <p class="dim" v-else-if="qaState === 'none'">{{ t('settings.errNoQA') }}</p>
          <template v-else>
            <div v-for="(q, i) in questions" :key="i">
              <label class="field-label">{{ q.q }}</label>
              <input class="input" v-model="answers[i]" :placeholder="t('settings.answerNPh', { n: i + 1 })" />
            </div>
          </template>
        </template>
      </div>

      <p class="err" v-if="err">{{ err }}</p>

      <div class="modal-foot">
        <button class="btn" @click="requestClose">{{ t('common.cancel') }}</button>
        <button
          class="btn btn-primary"
          :disabled="busy || (method === 'answers' && qaState !== 'list')"
          @click="submit"
        >
          {{ busy ? t('settings.verifying') : t('settings.rebindConfirm') }}
        </button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import Modal from './Modal.vue';
import { A } from '../api';
import { t } from '../i18n';
import { errText } from '../feedback';
import { useSecurityQuestions } from '../composables/useSecurityQuestions';

const props = defineProps({
  // 目标账号：{ id, name, mac }
  target: { type: Object, required: true },
  // 本机 MAC
  localMac: { type: String, default: '' }
});
const emit = defineEmits(['done', 'close']);

const method = ref('password');
const password = ref('');
const answers = ref(['', '', '']);
const busy = ref(false);
const err = ref('');

// 安全问答「问题列表」的加载收敛到 useSecurityQuestions（与 RecoverForm 共用单一实现）
const { questions, state: qaState, load: loadQA } = useSecurityQuestions();

const targetMac = props.target && props.target.mac ? props.target.mac : '—';

async function loadQAWithReset() {
  err.value = '';
  await loadQA(props.target.id);
  if (qaState.value === 'list') answers.value = questions.value.map(() => '');
}

function switchMethod(m) {
  method.value = m;
  err.value = '';
  if (m === 'answers' && qaState.value === 'loading') loadQAWithReset();
}

onMounted(() => {
  if (method.value === 'answers') loadQAWithReset();
});

async function submit() {
  if (busy.value) return;
  err.value = '';
  let verify;
  if (method.value === 'password') {
    verify = { type: 'password', password: password.value };
  } else {
    if (answers.value.some(a => !a.trim())) {
      err.value = t('settings.errAnswerAll');
      return;
    }
    verify = { type: 'answers', answers: answers.value.map(a => a.trim()) };
  }
  busy.value = true;
  try {
    const u = await A.rebindMac({ name: props.target.name, verify });
    emit('done', u);
  } catch (e) {
    err.value = errText(e);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.mac-box {
  text-align: left;
  font-size: 12px;
  background: var(--surface-2);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  padding: 10px 12px;
  margin: 10px 0 14px;
}
.mac-box div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 3px 0;
}
.mac-box b {
  color: var(--text-2);
  font-weight: 500;
}
.mac-box code {
  color: var(--text);
  font-family: var(--font-mono);
}
.verify-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.tab {
  flex: 1;
  padding: 7px 10px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-2);
  cursor: pointer;
}
.tab.on {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-weak);
}
.err {
  margin-top: 8px;
}
</style>
