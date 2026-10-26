<template>
  <div class="card sec">
    <h3>{{ t('settings.acctTitle') }}</h3>
    <div class="kv">
      <div class="kv-row">
        <span>{{ t('settings.acctCurrentUser') }}</span
        ><code>{{ store.user.name }}</code>
      </div>
      <div class="kv-row">
        <span>{{ t('settings.acctUserId') }}</span
        ><code>{{ store.user.id }}</code>
      </div>
      <div class="kv-row">
        <span>{{ t('settings.acctMacBound') }}</span
        ><code>{{ store.user.mac }}</code>
      </div>
      <div class="kv-row">
        <span>{{ t('settings.acctMacLocal') }}</span
        ><code>{{ store.mac }}</code>
      </div>
      <div class="kv-row" v-if="macHistory && macHistory.history.length">
        <span>{{ t('settings.macHistoryTitle') }}</span>
        <code class="dim">{{ macHistory.history.map(x => x.mac).join('、') }}</code>
      </div>
      <p class="dim" v-if="macHistory && macHistory.history.length" style="margin-top: 4px">
        {{ t('settings.macHistoryHint') }}
      </p>
    </div>
    <label class="field-label">{{ t('settings.acctLocalUsers', { n: users.length }) }}</label>
    <div class="x-scroll">
      <table class="tbl">
        <thead>
          <tr>
            <th>{{ t('settings.acctColUser') }}</th>
            <th>{{ t('settings.acctColId') }}</th>
            <th>{{ t('settings.acctColRegAt') }}</th>
            <th>{{ t('settings.acctColLastLogin') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id" :class="{ cur: u.id === store.user.id }">
            <td>
              <b>{{ u.name }}</b>
              <span class="badge acc" v-if="u.id === store.user.id">{{ t('settings.currentTag') }}</span>
            </td>
            <td>
              <code class="code">{{ u.id }}</code>
            </td>
            <td class="dim">{{ withTz(u.created_at) }}</td>
            <td class="dim">{{ withTz(u.last_login) || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="dim" style="margin-top: 10px">{{ t('settings.acctSwitchTip') }}</p>

    <h3 style="margin-top: 18px">{{ t('settings.transferTitle') }}</h3>
    <p class="dim" style="margin-bottom: 10px">{{ t('settings.transferDesc') }}</p>
    <label class="field-label">{{ t('settings.transferTarget') }}</label>
    <select class="select" v-model="transferTo" style="max-width: 360px" :disabled="transferBusy || !otherUsers.length">
      <option value="">{{ t('settings.transferPick') }}</option>
      <option v-for="u in otherUsers" :key="u.id" :value="u.id">{{ u.name }}</option>
    </select>
    <div class="sec-status" style="margin-top: 12px; flex-wrap: wrap">
      <span class="badge" :class="mineCount ? 'info' : ''">{{ t('settings.mineCount', { n: mineCount }) }}</span>
      <button class="btn btn-primary" :disabled="!transferTo || !mineCount || transferBusy" @click="doTransfer">
        {{ transferBusy ? t('settings.transferring') : t('settings.transferAll') }}
      </button>
      <span class="dim" v-if="!otherUsers.length">{{ t('settings.transferNoTarget') }}</span>
    </div>

    <h3 style="margin-top: 18px">{{ t('settings.changePwdTitle') }}</h3>
    <p class="dim" style="margin-bottom: 10px">{{ t('settings.changePwdDesc') }}</p>
    <div class="gate-form" style="text-align: left">
      <label class="field-label">{{ t('settings.oldPass') }}</label>
      <input
        class="input"
        v-model="pwdForm.oldPass"
        :type="pwdShow ? 'text' : 'password'"
        maxlength="64"
        :placeholder="t('settings.oldPassPh')"
        style="max-width: 360px"
      />
      <label class="field-label" style="margin-top: 10px">{{ t('settings.newPass') }}</label>
      <input
        class="input"
        v-model="pwdForm.newPass"
        :type="pwdShow ? 'text' : 'password'"
        maxlength="64"
        :placeholder="t('settings.passMin6')"
        style="max-width: 360px"
      />
      <label class="field-label" style="margin-top: 10px">{{ t('settings.confirmNewPass') }}</label>
      <input
        class="input"
        v-model="pwdForm.newPass2"
        :type="pwdShow ? 'text' : 'password'"
        maxlength="64"
        :placeholder="t('settings.newPassAgainPh')"
        style="max-width: 360px"
        @keyup.enter="changePwd"
      />
      <PasswordReqHint />
      <label
        class="field-label"
        style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 10px"
      >
        <input type="checkbox" v-model="pwdShow" /><span>{{ t('settings.showPass') }}</span>
      </label>
      <div style="margin-top: 12px">
        <button class="btn btn-primary" :disabled="pwdBusy" @click="changePwd">
          {{ pwdBusy ? t('settings.submitting') : t('settings.saveNewPass') }}
        </button>
      </div>
      <p class="dim" v-if="pwdMsg" :style="{ color: pwdOk ? 'var(--ok)' : 'var(--danger)', marginTop: '8px' }">
        {{ pwdMsg }}
      </p>
      <p class="dim" style="margin-top: 10px">
        {{ t('settings.forgotPwd') }}<a @click="startRecover">{{ t('settings.recoverByQA') }}</a>
      </p>
    </div>

    <div
      v-if="showRecover"
      style="margin-top: 16px; border-top: 1px dashed var(--border); padding-top: 16px; max-width: 360px"
    >
      <RecoverForm
        :user-id="store.user.id"
        :user-name="store.user.name"
        :none-text="t('settings.noQANoneText')"
        @cancel="showRecover = false"
      />
    </div>

    <h3 style="margin-top: 18px">{{ t('settings.qaTitle') }}</h3>
    <p class="dim" style="margin-bottom: 10px">{{ t('settings.qaDesc') }}</p>
    <div class="sec-status">
      <span class="badge" :class="hasSec ? 'ok' : 'warn'">{{
        hasSec ? t('settings.qaSet') : t('settings.qaUnset')
      }}</span>
      <button class="btn" v-if="hasSec" @click="loadSecQA">{{ t('settings.qaReload') }}</button>
    </div>
    <div v-if="secQA.length" class="sec-form">
      <div class="sec-row" v-for="(x, i) in secQA" :key="i">
        <input class="input" v-model="x.q" :placeholder="t('settings.qaQuestionN', { n: i + 1 })" :disabled="secBusy" />
        <input
          class="input"
          v-model="x.a"
          :type="secShow ? 'text' : 'password'"
          :placeholder="t('settings.qaAnswerN', { n: i + 1 })"
          :disabled="secBusy"
        />
      </div>
      <label class="field-label" style="margin-top: 8px">{{ t('settings.qaOldPass') }}</label>
      <input
        class="input"
        v-model="secOldPass"
        :type="secShow ? 'text' : 'password'"
        maxlength="64"
        :placeholder="t('settings.currentPassPh')"
        style="max-width: 360px"
      />
      <label class="field-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px">
        <input type="checkbox" v-model="secShow" /><span>{{ t('settings.showAnswers') }}</span>
      </label>
      <div style="margin-top: 12px">
        <button class="btn btn-primary" :disabled="secBusy" @click="saveSecQA">
          {{ secBusy ? t('settings.saving') : t('settings.saveQA') }}
        </button>
      </div>
      <p class="dim" v-if="secMsg" :style="{ color: secOk ? 'var(--ok)' : 'var(--danger)', marginTop: '8px' }">
        {{ secMsg }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { store, bus } from '../../store';
import { A } from '../../api';
import { toastOk, okMsg, run, errText } from '../../feedback';
import RecoverForm from '../RecoverForm.vue';
import PasswordReqHint from '../PasswordReqHint.vue';
import { requirePassword } from '../../composables/useGuard';
import { withTz } from '../../utils/timefmt';
import { t } from '../../i18n';

const props = defineProps({ users: { type: Array, required: true } });

const pwdForm = reactive({ oldPass: '', newPass: '', newPass2: '' });
const pwdShow = ref(false);
const pwdBusy = ref(false);
const pwdMsg = ref('');
const pwdOk = ref(false);

async function changePwd() {
  pwdMsg.value = '';
  pwdOk.value = false;
  if (pwdForm.newPass.length < 6) {
    pwdMsg.value = t('settings.errNewPassMin6');
    return;
  }
  if (pwdForm.newPass !== pwdForm.newPass2) {
    pwdMsg.value = t('settings.errNewPassMismatch');
    return;
  }
  pwdBusy.value = true;
  try {
    await A.changePassword({ oldPass: pwdForm.oldPass, newPass: pwdForm.newPass });
    pwdOk.value = true;
    pwdMsg.value = t('settings.pwdUpdated');
    pwdForm.oldPass = '';
    pwdForm.newPass = '';
    pwdForm.newPass2 = '';
    toastOk(okMsg.passwordChanged);
  } catch (e) {
    pwdMsg.value = errText(e);
  } finally {
    pwdBusy.value = false;
  }
}

/* ---------- 忘记密码：安全问答找回（当前账号） ---------- */
const showRecover = ref(false);
function startRecover() {
  showRecover.value = true;
}

/* ---------- 移交我的文档 ---------- */
const mineCount = ref(0);
const transferTo = ref('');
const transferBusy = ref(false);
const otherUsers = computed(() => props.users.filter(u => u.id !== (store.user && store.user.id)));

async function refreshMine() {
  try {
    mineCount.value = await A.postCountMine();
  } catch (e) {
    mineCount.value = 0;
  }
}
async function doTransfer() {
  const target = otherUsers.value.find(u => u.id === transferTo.value);
  if (!target) return;
  const ok = await requirePassword(
    t('settings.transferConfirm', { from: store.user.name, n: mineCount.value, to: target.name }),
    { title: t('settings.transferVerifyTitle') }
  );
  if (!ok) return;
  transferBusy.value = true;
  await run(() => A.postTransferMine({ toUserId: transferTo.value }), {
    ok: r => t('settings.transferDone', { n: r.moved, to: r.to }),
    then: async () => {
      transferTo.value = '';
      await refreshMine();
      bus.emit('refresh');
    },
    finally: () => {
      transferBusy.value = false;
    }
  });
}

/* ---------- 安全问答（找回密码） ---------- */
const secQA = reactive([
  { q: '', a: '' },
  { q: '', a: '' },
  { q: '', a: '' }
]);
const secOldPass = ref('');
const secShow = ref(false);
const secBusy = ref(false);
const secMsg = ref('');
const secOk = ref(false);
const hasSec = ref(false);

/* ---------- 历史设备（mac 变更留底） ---------- */
const macHistory = ref(null);

async function loadMacHistory() {
  if (!store.user) return;
  try {
    macHistory.value = await A.getMacHistory({ userId: store.user.id });
  } catch (e) {
    macHistory.value = null;
  }
}

onMounted(async () => {
  await loadHasSec();
  await loadSecQA();
  await refreshMine();
  await loadMacHistory();
});

async function loadHasSec() {
  try {
    hasSec.value = !!(store.user && (await A.hasSecurity({ userId: store.user.id })));
  } catch (e) {
    hasSec.value = false;
  }
}
async function loadSecQA() {
  if (!store.user) return;
  try {
    const qs = await A.getSecurity({ userId: store.user.id });
    if (Array.isArray(qs) && qs.length) {
      secQA.forEach((x, i) => {
        x.q = qs[i] ? qs[i].q : '';
        x.a = '';
      });
      hasSec.value = true;
    }
  } catch (e) {}
}
async function saveSecQA() {
  secMsg.value = '';
  secOk.value = false;
  if (!secQA.every(x => x.q.trim() && x.a.trim())) {
    secMsg.value = t('settings.errQAFillAll');
    return;
  }
  secBusy.value = true;
  try {
    await A.setSecurity({ oldPass: secOldPass.value, qa: secQA.map(x => ({ q: x.q, a: x.a })) });
    secOk.value = true;
    secMsg.value = t('settings.qaSaved');
    secOldPass.value = '';
    secQA.forEach(x => {
      x.a = '';
    });
    hasSec.value = true;
    toastOk(t('settings.qaSaved'));
  } catch (e) {
    secMsg.value = errText(e);
  } finally {
    secBusy.value = false;
  }
}
</script>

<style scoped>
/* .sec / .kv 等复合模式见 styles/components.css，此处仅保留本区块特有样式 */
/* 注：原先此处重定义过 .badge/.badge.ok/.badge.warn，用的是 themes.css 中
   并不存在的 --ok-weak / --warn-weak，实际回退到硬编码浅色，导致 dark/wire
   主题下配色不跟随。已移除，统一回归 base.css 的 .badge 语义色实现。 */
.dim a {
  color: var(--accent);
  cursor: pointer;
}
tr.cur td {
  background: var(--accent-weak);
}
.sec-status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
select.select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.sec-form {
  text-align: left;
}
.sec-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.sec-row .input {
  flex: 1;
}
.sec-row .input:first-child {
  flex: 1.2;
}
</style>
