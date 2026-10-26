<template>
  <div class="card sec">
    <h3>
      {{ t('settings.runlogTitle') }} <span class="badge">{{ runlog.lines.length }} {{ t('settings.rows') }}</span>
    </h3>
    <p class="dim">{{ t('settings.runlogDesc') }}</p>

    <div class="filter-bar">
      <RefreshButton :busy="runlogBusy" @click="$emit('refresh')" />
      <button class="btn btn-sm" @click="$emit('open-dir')">
        <Icon name="folder-open" :size="16" /> {{ t('settings.openLogDir') }}
      </button>
      <span class="dim" v-if="runlog.current">{{ t('settings.runlogCurrent', { name: runlog.current }) }}</span>
    </div>
    <div class="runlog-box" ref="box">
      <LogView :lines="runlog.lines" />
    </div>

    <h3 class="sub">{{ t('settings.liveOutputTitle') }}</h3>
    <p class="dim">{{ t('settings.liveOutputDesc') }}</p>

    <div class="kv kv--split">
      <div class="kv-row">
        <span>{{ t('settings.floatLogLabel') }}</span>
        <label
          class="switch"
          :class="{ on: floatLog }"
          :title="floatLog ? t('settings.switchedOn') : t('settings.switchedOff')"
        >
          <input type="checkbox" v-model="floatLog" @change="setFloatLog" />
          <span class="ball"></span>
        </label>
      </div>
    </div>
    <p class="dim" style="margin-top: 10px">
      {{ t('settings.floatLogTip1') }}<b>{{ t('settings.floatLogLive') }}</b
      >{{ t('settings.floatLogTip2') }}
    </p>

    <div class="kv kv--split" style="margin-top: 16px">
      <div class="kv-row">
        <span>{{ t('settings.debugStackLabel') }}</span>
        <label
          class="switch"
          :class="{ on: debugStack }"
          :title="debugStack ? t('settings.switchedOn') : t('settings.switchedOff')"
        >
          <input type="checkbox" v-model="debugStack" @change="setDebugStack" />
          <span class="ball"></span>
        </label>
      </div>
    </div>
    <p class="dim" style="margin-top: 10px">
      {{ t('settings.debugStackTip1') }}<b>{{ t('settings.debugStackTip2') }}</b
      >{{ t('settings.debugStackTip3') }}
    </p>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue';
import { store } from '../../store';
import { A } from '../../api';
import { toastErr } from '../../feedback';
import Icon from '../Icon.vue';
import RefreshButton from '../RefreshButton.vue';
import LogView from '../LogView.vue';
import { t } from '../../i18n';

const props = defineProps({
  runlog: { type: Object, required: true },
  runlogBusy: { type: Boolean, default: false }
});
defineEmits(['refresh', 'open-dir']);

const init = (k, d) => (store.settings && store.settings[k] != null ? store.settings[k] : d);
const floatLog = ref(!!init('ui.floatLog', false));
const debugStack = ref(!!init('debug.captureStack', false));

// 运行日志默认停在底部（最新一行）：进入分区 / 刷新后自动滚底
const box = ref(null);
watch(
  () => props.runlog.lines,
  async () => {
    await nextTick();
    if (box.value) box.value.scrollTop = box.value.scrollHeight;
  },
  { immediate: true }
);

async function setFloatLog() {
  try {
    await A.setSetting({ k: 'ui.floatLog', v: !!floatLog.value });
    syncStore('ui.floatLog', !!floatLog.value);
  } catch (e) {
    toastErr(e, t('common.saveFailed'));
  }
}
async function setDebugStack() {
  try {
    await A.setSetting({ k: 'debug.captureStack', v: !!debugStack.value });
    syncStore('debug.captureStack', !!debugStack.value);
  } catch (e) {
    toastErr(e, t('common.saveFailed'));
  }
}
function syncStore(k, v) {
  if (!store.settings) store.settings = {};
  store.settings[k] = v;
}

onMounted(() => {
  floatLog.value = !!init('ui.floatLog', false);
  debugStack.value = !!init('debug.captureStack', false);
});
</script>

<style scoped>
/* .sec / .kv（.kv--split 变体）见 styles/components.css，此处仅保留特有样式 */
.sec h3.sub {
  margin-top: 24px;
}
/* 开头标题与说明文字行距修正：.dim 无 line-height 且继承浏览器默认 p margin，
   与 .sec h3 的 margin-bottom 叠加导致标题-说明间距过大、多行说明行距不均 */
.sec > h3 {
  margin-bottom: 6px;
}
.sec > p.dim {
  line-height: 1.7;
}
.sec > p.dim:first-of-type {
  margin-top: 2px;
}

.runlog-box {
  max-height: 480px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
}
.kv {
  --kv-label-w: 180px;
}

/* 行内开关（紧凑 32×18 + 圆球紧贴右内缘；用 v-bind class 显式切 on，不依赖 input:checked 兄弟选择器以避免特异性踩坑） */
.switch {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  width: 32px;
  height: 18px;
  padding: 2px;
  flex: 0 0 32px !important;
  min-width: 32px !important;
  max-width: 32px !important;
  border-radius: 999px;
  background: var(--border-strong);
  cursor: pointer;
  transition: background 0.15s ease;
  vertical-align: middle;
}
.switch .ball {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s ease;
  transform: translateX(0);
}
.switch.on {
  background: var(--accent);
}
.switch.on .ball {
  transform: translateX(14px);
}
</style>
