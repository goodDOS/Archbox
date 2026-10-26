<template>
  <div class="gate">
    <GateTitleBar />
    <div class="gate-card-wrap">
      <div class="gate-card card">
        <div class="gate-logo">{{ t('shell.logoChar') }}</div>
        <h1>{{ t('settings.gateTitle') }}<span class="en">Archbox</span></h1>
        <p class="sub" v-if="!recovering">{{ t('settings.gateSub') }}</p>
        <p class="sub" v-else>{{ t('settings.gateRecoverSub') }}</p>

        <!-- 找回密码流程 -->
        <template v-if="recovering">
          <!-- 步骤 1：选择账号 -->
          <template v-if="!recUser">
            <p class="dim" style="margin-bottom: 10px">{{ t('settings.pickRecUser') }}</p>
            <div class="user-list">
              <div v-for="u in users" :key="u.id" class="user-row acct-row" @click="pickRecUser(u)">
                <span class="avatar">{{ (u.name || '?').slice(0, 1) }}</span>
                <div class="uinfo">
                  <b>{{ u.name }}</b
                  ><i>{{ u.id }}</i>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
            </div>
          </template>
          <!-- 步骤 2：安全问答验证 + 重置密码（共享组件） -->
          <RecoverForm
            v-else
            :user-id="recUser.id"
            :user-name="recUser.name"
            :show-header="true"
            :cancel-text="t('settings.backToLogin')"
            :show-success="false"
            :stacked="true"
            @done="onRecoverDone"
            @cancel="cancelRecover"
          />
        </template>

        <!-- 首次使用：注册 -->
        <template v-else-if="mode === 'register'">
          <div class="gate-form">
            <label class="field-label">{{ t('settings.userName') }}<span class="req">*</span></label>
            <input
              class="input"
              v-model.trim="name"
              maxlength="30"
              :placeholder="t('settings.userNamePh')"
              @keyup.enter="doRegister"
            />
            <label class="field-label" style="margin-top: 10px"
              >{{ t('settings.pwdLabel') }}<span class="req">*</span></label
            >
            <div class="pwd-row">
              <input
                class="input"
                v-model="password"
                :type="show ? 'text' : 'password'"
                maxlength="64"
                :placeholder="t('settings.passMin6')"
                @keyup.enter="doRegister"
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
            <label class="field-label" style="margin-top: 10px"
              >{{ t('settings.confirmPass') }}<span class="req">*</span></label
            >
            <input
              class="input"
              v-model="password2"
              :type="show ? 'text' : 'password'"
              maxlength="64"
              :placeholder="t('settings.passAgainPwd')"
              @keyup.enter="doRegister"
            />
            <PasswordReqHint />
            <div class="sec-qa-box">
              <div class="sec-qa-title">{{ t('settings.qaRegTitle') }}<span class="req">*</span></div>
              <p class="dim" style="margin: 4px 0 8px">{{ t('settings.qaRegDesc') }}</p>
              <div v-for="(qa, i) in secQa" :key="i" class="sec-qa-item">
                <input
                  class="input"
                  v-model.trim="qa.q"
                  maxlength="60"
                  :placeholder="t('settings.questionN', { n: i + 1 })"
                />
                <input
                  class="input"
                  v-model.trim="qa.a"
                  maxlength="60"
                  :placeholder="t('settings.answerN', { n: i + 1 })"
                />
              </div>
            </div>
            <div class="mac-box">
              <div>
                <b>{{ t('settings.macLocalLabel') }}</b
                ><span>{{ store.mac }}</span>
              </div>
              <div>
                <b>{{ t('settings.userIdLabel') }}</b
                ><span>{{ t('settings.userIdRandom') }}</span>
              </div>
              <div>
                <b>{{ t('settings.opLogLabel') }}</b
                ><span>{{ t('settings.opLogDesc') }}</span>
              </div>
            </div>
            <button
              class="btn btn-primary"
              style="width: 100%; padding: 10px; margin-top: 14px"
              :disabled="!canRegister || busy"
              @click="doRegister"
            >
              {{ busy ? t('settings.creating') : t('settings.registerAndEnter') }}
            </button>
            <p class="tip" v-if="users.length">
              {{ t('settings.hasAccount') }}<a @click="backToLogin">{{ t('settings.backToPickUser') }}</a>
            </p>
          </div>
        </template>

        <!-- 登录：选择用户 -->
        <template v-else-if="!selected">
          <div class="user-list">
            <div v-for="u in users" :key="u.id" class="user-row acct-row" @click="selected = u">
              <span class="avatar">{{ (u.name || '?').slice(0, 1) }}</span>
              <div class="uinfo">
                <b>{{ u.name }}</b>
                <i>{{ u.id }} · {{ t('settings.lastLoginAt') }} {{ withTz(u.last_login) || '—' }}</i>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </div>
          </div>
          <button class="btn" style="width: 100%; margin-top: 14px" @click="mode = 'register'">
            + {{ t('settings.registerNewUser') }}
          </button>
        </template>

        <!-- 登录：输入密码 -->
        <template v-else>
          <div class="gate-form">
            <div class="login-as acct-row">
              <span class="avatar">{{ (selected.name || '?').slice(0, 1) }}</span>
              <div class="uinfo">
                <b>{{ selected.name }}</b>
                <i>{{ selected.id }}</i>
              </div>
            </div>
            <label class="field-label" style="margin-top: 14px"
              >{{ t('settings.pwdLabel') }}<span class="req">*</span></label
            >
            <div class="pwd-row">
              <input
                class="input"
                v-model="password"
                :type="show ? 'text' : 'password'"
                maxlength="64"
                :placeholder="t('settings.pwdPh2')"
                ref="passEl"
                @keyup.enter="doLogin"
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
            <p class="err" v-if="error && selected && !recovering">{{ error }}</p>
            <p class="dim" style="margin-top: 8px">
              {{ t('settings.forgotPwdQ') }}<a @click="startRecover">{{ t('settings.recoverByQA') }}</a>
            </p>
            <button
              class="btn btn-primary"
              style="width: 100%; padding: 10px; margin-top: 12px"
              :disabled="busy"
              @click="doLogin"
            >
              {{ busy ? t('settings.loggingIn') : t('settings.login') }}
            </button>
            <button class="btn" style="width: 100%; margin-top: 8px" @click="cancelLogin">
              {{ t('settings.backToPickUser') }}
            </button>
          </div>
        </template>

        <p class="err" v-if="error && (!selected || recovering)">{{ error }}</p>
      </div>
    </div>

    <!-- 跨机重新绑定设备：验证密码或安全问答后绑定本机 -->
    <RebindMacModal
      v-if="rebindTarget"
      :target="rebindTarget"
      :local-mac="store.mac"
      @done="onRebindDone"
      @close="onRebindClose"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { store, doLogin as storeLogin, enterAs } from '../store';
import { toast, errText } from '../feedback';
import { A } from '../api';
import Icon from './Icon.vue';
import GateTitleBar from './GateTitleBar.vue';
import RecoverForm from './RecoverForm.vue';
import RebindMacModal from './RebindMacModal.vue';
import PasswordReqHint from './PasswordReqHint.vue';
import { withTz } from '../utils/timefmt';
import { t } from '../i18n';

const users = ref([]);
const mode = ref('login');
const name = ref('');
const password = ref('');
const password2 = ref('');
const secQa = ref([
  { q: '', a: '' },
  { q: '', a: '' },
  { q: '', a: '' }
]);
const selected = ref(null);
const show = ref(false);
const busy = ref(false);
const error = ref('');
const passEl = ref(null);

/* ---------- 找回密码 ---------- */
const recovering = ref(false);
const recUser = ref(null);

/* ---------- 跨机重新绑定设备 ---------- */
const rebindTarget = ref(null); // 触发改绑的目标账号 { id, name, mac }

const canRegister = computed(() => {
  if (!name.value || password.value.length < 6 || password.value !== password2.value) return false;
  // 3 组问答必须都填（问题+答案非空）
  return secQa.value.length === 3 && secQa.value.every(x => x.q.trim() && x.a.trim());
});

onMounted(async () => {
  try {
    users.value = await A.users();
  } catch (e) {
    users.value = store.users;
  }
  if (!users.value.length) mode.value = 'register';
  /* ★ Beta.288：多用户启动时进入「用户选择页」，不再凭 lastUser 自动预选。
   *   此前只要记着上次登录用户就直接跳到「输密码」那一步，跳过了用户选择；
   *   用户明确要求多用户应停在选择列表。仅当只有一个账号时才自动选中它
   *   （单用户下再让用户点一下纯属多余），多用户一律回到选择页。 */
  else if (users.value.length === 1) selected.value = users.value[0];
});

async function doRegister() {
  error.value = '';
  if (!name.value) {
    error.value = t('settings.errNameRequired');
    return;
  }
  if (password.value.length < 6) {
    error.value = t('settings.errPassMin6');
    return;
  }
  if (password.value !== password2.value) {
    error.value = t('settings.errPassMismatch');
    return;
  }
  const qa = secQa.value.map(x => ({ q: x.q.trim(), a: x.a.trim() }));
  if (qa.length !== 3 || qa.some(x => !x.q || !x.a)) {
    error.value = t('settings.errQARegFill');
    return;
  }
  busy.value = true;
  try {
    const u = await A.register({ name: name.value, password: password.value, secQa: qa });
    toast(t('settings.registerDone', { id: u.id }));
    storeLogin(u.name, password.value);
  } catch (e) {
    error.value = errText(e);
  } finally {
    busy.value = false;
  }
}

async function doLogin() {
  if (!selected.value || busy.value) return;
  error.value = '';
  busy.value = true;
  try {
    await storeLogin(selected.value.name, password.value);
  } catch (e) {
    // 跨机：账号绑定的是另一台设备的 MAC，引导重新绑定（验证密码或问答）
    if (e && e.code === 'MAC_BOUND') {
      rebindTarget.value = selected.value;
      busy.value = false;
      password.value = '';
      return;
    }
    error.value = errText(e);
  } finally {
    busy.value = false;
    password.value = '';
  }
}

/* ---------- 跨机重新绑定设备 ---------- */
function onRebindDone(u) {
  rebindTarget.value = null;
  password.value = '';
  toast(t('settings.rebindDone'));
  // rebindMac 已在主进程验证身份并写好 session，这里直接进入界面（无需再走 login）
  enterAs(u);
}
function onRebindClose() {
  rebindTarget.value = null;
  password.value = '';
}

function cancelLogin() {
  selected.value = null;
  password.value = '';
  error.value = '';
}
function backToLogin() {
  mode.value = 'login';
}

/* ---------- 找回密码流程 ---------- */
function startRecover() {
  recovering.value = true;
  error.value = '';
  recUser.value = null;
  if (selected.value) recUser.value = selected.value; // 已选定用户则直接进入问答
}
function cancelRecover() {
  recovering.value = false;
  recUser.value = null;
  selected.value = null;
  password.value = '';
}
function pickRecUser(u) {
  recUser.value = u;
}
function onRecoverDone() {
  selected.value = recUser.value;
  recovering.value = false;
  password.value = '';
  toast(t('settings.pwdResetDone'));
}
</script>

<style scoped>
/* .gate（含布局）、.gate-card-wrap、.gate-card 的公共部分、.gate-logo 基线、
   顶栏结构均见公共层 / GateTitleBar.vue。
   此处只留 UserGate 独有差异 —— 删净公共层已收录的类名是硬性要求，
   否则 scoped 的 [data-v-*] 会以更高特异性静默压过全局，埋下「改了不生效」的坑。 */
.gate-card {
  --gate-card-w: 420px;
} /* 用户列表比口令卡窄 20px，收窄避免文字行过长 */
/* 字形光学修正：58px 方块内放汉字「档」，比图标形态需略小字号 + 加粗才不显臃肿。
   与公共层的 26px 不统一是刻意的，不是漂移。 */
.gate-logo {
  font-size: 25px;
  font-weight: 700;
}
/* h1 是元素选择器（不属公共层收录范围，该层只收类名）；且 .en 为本页独有修饰，
   提全局会波及主界面所有 h1，得不偿失。 */
h1 {
  font-size: 20px;
}
h1 .en {
  font-size: 13px;
  color: var(--text-3);
  font-weight: 400;
}
.mac-box {
  text-align: left;
  font-size: 12px;
  background: var(--surface-2);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  padding: 10px 12px;
  margin: 14px 0;
}
.mac-box div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 3px 0;
}
.mac-box b {
  color: var(--text-2);
  font-weight: 500;
}
.mac-box span {
  color: var(--text);
  font-family: var(--font-mono);
}
.tip {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-3);
}
.tip a {
  color: var(--accent);
  cursor: pointer;
}
.user-list {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
/* 可点账户行：布局/配色来自 .acct-row（components.css），此处仅补「可点」交互 */
.user-row {
  cursor: pointer;
}
.user-row:hover {
  border-color: var(--accent);
  background: var(--accent-weak);
}
[data-theme='wire'] .user-row:hover {
  background: var(--surface);
}
/* 登录页头像比侧栏默认大一档；形制/描边/对齐见 base.css .avatar */
.avatar {
  --av: 34px;
}
.dim a {
  color: var(--accent);
  cursor: pointer;
}
.sec-qa-box {
  text-align: left;
  font-size: 12px;
  background: var(--surface-2);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  padding: 12px 14px;
  margin: 14px 0;
}
.sec-qa-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.sec-qa-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}
.sec-qa-item .input {
  width: 100%;
}
</style>
