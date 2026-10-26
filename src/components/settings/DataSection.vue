<template>
  <div class="card-stack">
    <div class="card sec">
      <h3>{{ t('settings.dataTitle') }}</h3>
      <p class="dim">{{ t('settings.dataDesc') }}</p>
      <div class="kv">
        <div class="kv-row">
          <span>{{ t('settings.dataDirLabel') }}</span
          ><code>{{ info.dataDir || '…' }}</code>
        </div>
        <div class="kv-row">
          <span>{{ t('settings.dbFile') }}</span
          ><code>{{ (info.dataDir || '…') + '/archive.db' }}</code>
        </div>
        <div class="kv-row">
          <span>{{ t('settings.integritySig') }}</span
          ><code>{{ (info.dataDir || '…') + '/archive.db.sig' }}</code>
        </div>
        <div class="kv-row">
          <span>{{ t('settings.flushMode') }}</span
          ><code>{{ t('settings.flushModeVal') }}</code>
        </div>
      </div>
      <div v-if="sysWarn" class="warn-box">
        <b>{{ t('settings.sysDriveWarn', { drive: info.systemDrive || 'C:' }) }}</b>
        <span>{{ t('settings.sysDriveWarnBody') }}</span>
      </div>
      <div class="btns">
        <button class="btn" @click="$emit('choose-dir')">
          <Icon name="folder" :size="16" /> {{ t('settings.chooseStoragePath') }}
        </button>
        <button class="btn" @click="$emit('open-dir')">
          <Icon name="folder-open" :size="16" /> {{ t('settings.openDataDir') }}
        </button>
        <button class="btn" @click="$emit('backup')">
          <Icon name="save" :size="16" /> {{ t('settings.fullBackup') }}
        </button>
        <button class="btn" @click="$emit('restore')">
          <Icon name="refresh" :size="16" /> {{ t('settings.restoreFromBackup') }}
        </button>
        <button class="btn" @click="$emit('open-db')">
          <Icon name="database" :size="16" /> {{ t('settings.openDb') }}
        </button>
      </div>
      <p class="dim" style="margin-top: 10px">{{ t('settings.openDbDesc') }}</p>
    </div>

    <div class="card sec">
      <h3>{{ t('settings.autoBackupTitle') }}</h3>
      <p class="dim">{{ t('settings.autoBackupDesc') }}</p>
      <div class="kv">
        <div class="kv-row">
          <span>{{ t('settings.backupDir') }}</span
          ><code>{{ bk.targetDir || t('settings.backupDirUnset') }}</code>
        </div>
        <div class="kv-row">
          <span>{{ t('settings.lastBackup') }}</span
          ><code>{{ fmtTime(lastAt) }}</code>
        </div>
      </div>
      <div class="btns">
        <button class="btn" @click="saveTarget">
          <Icon name="folder" :size="16" /> {{ t('settings.chooseBackupDir') }}
        </button>
        <button class="btn" :disabled="!bk.targetDir || bkBusy" @click="runNow">
          <Icon name="save" :size="16" /> {{ t('settings.backupNow') }}
        </button>
      </div>

      <label class="field-label" style="margin-top: 14px">{{ t('settings.backupSchedule') }}</label>
      <div class="seg">
        <button class="seg-btn" :class="{ on: bk.schedule === 'off' }" @click="setSchedule('off')">
          {{ t('common.close') }}
        </button>
        <button class="seg-btn" :class="{ on: bk.schedule === 'daily' }" @click="setSchedule('daily')">
          {{ t('settings.backupDaily') }}
        </button>
        <button class="seg-btn" :class="{ on: bk.schedule === 'weekly' }" @click="setSchedule('weekly')">
          {{ t('settings.backupWeekly') }}
        </button>
      </div>

      <label
        class="field-label"
        style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 12px"
      >
        <input type="checkbox" v-model="bk.onExit" @change="setOnExit(bk.onExit)" /><span>{{
          t('settings.backupOnExit')
        }}</span>
      </label>

      <label class="field-label" style="margin-top: 12px">{{ t('settings.backupRetain') }}</label>
      <input
        class="input"
        type="number"
        min="1"
        max="50"
        v-model.number="bk.retain"
        @change="setRetain(bk.retain)"
        style="max-width: 120px"
      />

      <p class="dim" style="margin-top: 10px">{{ t('settings.backupTip') }}</p>
    </div>

    <div class="card sec">
      <h3>{{ t('settings.delVerifyTitle') }}</h3>
      <p class="dim">{{ t('settings.delVerifyDesc') }}</p>
      <label class="field-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer">
        <input type="checkbox" v-model="delSkipAuth" @change="saveDelSkip" /><span>{{
          t('settings.delSkipAuth')
        }}</span>
      </label>
    </div>

    <div class="card sec">
      <h3>{{ t('settings.packTitle') }}</h3>
      <p class="dim">{{ t('settings.packDesc1') }}<code>.archboxpack</code>{{ t('settings.packDesc2') }}</p>
      <div class="btns">
        <button class="btn btn-primary" @click="$emit('import')">
          <Icon name="download" :size="16" /> {{ t('settings.packImport') }}
        </button>
        <button class="btn" @click="$emit('export-pack')">
          <Icon name="upload" :size="16" /> {{ t('settings.packExport') }}
        </button>
        <button class="btn" @click="$emit('export-md')">
          <Icon name="file-text" :size="16" /> {{ t('settings.packExportMd') }}
        </button>
        <button class="btn" @click="$emit('export-pdf')">
          <Icon name="file" :size="16" /> {{ t('settings.packExportPdf') }}
        </button>
      </div>
      <div class="tip-box">
        <b>{{ t('settings.packNoteTitle') }}</b>
        <span class="dim">{{ t('settings.packNote1a') }}<code>.archboxpack</code>{{ t('settings.packNote1b') }}</span>
        <span class="dim">{{ t('settings.packNote2') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed } from 'vue';
import { store } from '../../store';
import { A } from '../../api';
import { toastInfo, toastErr, toastOk } from '../../feedback';
import Icon from '../Icon.vue';
import { localMinuteTz } from '../../utils/timefmt';
import { t } from '../../i18n';

const props = defineProps({
  info: { type: Object, required: true }
});
defineEmits([
  'choose-dir',
  'open-dir',
  'backup',
  'restore',
  'open-db',
  'import',
  'export-pack',
  'export-md',
  'export-pdf'
]);

const sysWarn = computed(() => !!(props.info && props.info.dataDirOnSystemDrive));

const init = (k, d) => (store.settings && store.settings[k] != null ? store.settings[k] : d);
const delSkipAuth = ref(!!init('security.deleteSkipAuth', false));
async function saveDelSkip() {
  try {
    await A.setSetting({ k: 'security.deleteSkipAuth', v: !!delSkipAuth.value });
    if (!store.settings) store.settings = {};
    store.settings['security.deleteSkipAuth'] = !!delSkipAuth.value;
    toastInfo(delSkipAuth.value ? t('settings.delSkipOn') : t('settings.delSkipOff'));
  } catch (e) {
    toastErr(e, t('common.saveFailed'));
  }
}
const bk = reactive({
  targetDir: init('backup.targetDir', ''),
  schedule: init('backup.schedule', 'off'),
  onExit: !!init('backup.onExit', false),
  retain: init('backup.retain', 5)
});
const lastAt = ref(init('backup.lastAt', 0));
const bkBusy = ref(false);

function syncStore(k, v) {
  if (!store.settings) store.settings = {};
  store.settings[k] = v;
}
async function saveTarget() {
  try {
    const dir = await A.backupChooseTarget();
    if (dir) {
      bk.targetDir = dir;
      syncStore('backup.targetDir', dir);
      toastInfo(t('settings.backupDirSet', { path: dir }));
    }
  } catch (e) {
    toastErr(e, t('settings.chooseFailed'));
  }
}
async function setSchedule(v) {
  bk.schedule = v;
  try {
    await A.setSetting({ k: 'backup.schedule', v });
    syncStore('backup.schedule', v);
  } catch (e) {
    toastErr(e, t('common.saveFailed'));
  }
}
async function setOnExit(v) {
  bk.onExit = !!v;
  try {
    await A.setSetting({ k: 'backup.onExit', v: bk.onExit });
    syncStore('backup.onExit', bk.onExit);
  } catch (e) {
    toastErr(e, t('common.saveFailed'));
  }
}
async function setRetain(v) {
  bk.retain = Math.max(1, parseInt(v, 10) || 5);
  try {
    await A.setSetting({ k: 'backup.retain', v: bk.retain });
    syncStore('backup.retain', bk.retain);
  } catch (e) {
    toastErr(e, t('common.saveFailed'));
  }
}
async function runNow() {
  if (!bk.targetDir) {
    toastInfo(t('settings.backupDirRequired'));
    return;
  }
  bkBusy.value = true;
  try {
    const r = await A.backupRun();
    lastAt.value = Date.now();
    syncStore('backup.lastAt', lastAt.value);
    toastOk(t('settings.offsiteBackupDone', { name: r.name, n: r.pruned }));
  } catch (e) {
    toastErr(e, t('settings.backupFailed'));
  } finally {
    bkBusy.value = false;
  }
}
function fmtTime(ts) {
  return localMinuteTz(ts, t('settings.neverBackedUp'));
}
</script>

<style scoped>
/* .sec / .kv / .btns / .seg 见 styles/components.css，此处仅保留特有样式与差异覆盖 */
.seg-btn {
  padding: 7px 18px;
}
.tip-box {
  margin-top: 14px;
  background: var(--surface-2);
  border-radius: var(--radius);
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.7;
}
.tip-box b {
  display: block;
  margin-bottom: 4px;
}
.tip-box code {
  font-family: var(--font-mono);
  color: var(--accent);
}
.warn-box {
  margin: 12px 0;
  padding: 10px 12px;
  border: 1px solid var(--danger);
  background: var(--danger-weak);
  border-radius: var(--radius);
  font-size: 12.5px;
  line-height: 1.6;
}
.warn-box b {
  display: block;
  color: var(--danger);
  margin-bottom: 4px;
}
.warn-box span {
  color: var(--text-2);
}
</style>
