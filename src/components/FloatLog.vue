<template>
  <transition name="float-fade">
    <div v-if="visible" ref="el" class="float-log no-drag" :class="{ dragging, collapsed }" :style="posStyle">
      <div class="fl-head" @pointerdown.prevent="startDrag">
        <span class="fl-title">
          <i class="fl-dot" :class="{ live: subscribed }" /> {{ t('settings.floatTitle') }}
          <span v-if="subscribed" class="fl-tag">{{ t('settings.liveTag') }}</span>
        </span>
        <div class="fl-acts">
          <button
            class="fl-btn"
            :class="{ spin: refreshing, ok: justOk, err: justErr }"
            :title="t('settings.refreshNow')"
            @click="refresh"
          >
            <Icon name="refresh" :size="13" :stroke="2" />
          </button>
          <button class="fl-btn" :title="t('settings.openLogDir')" @click="openDir">
            <Icon name="folder-open" :size="14" />
          </button>
          <button
            class="fl-btn collapse-btn"
            :class="{ 'is-collapsed': collapsed }"
            :title="collapsed ? t('settings.expandFloat') : t('settings.collapseFloat')"
            @click="collapsed = !collapsed"
          >
            <Icon name="chevron-down" :size="14" />
          </button>
          <button class="fl-btn close" :title="t('settings.closeFloat')" @click="close">
            <Icon name="x" :size="14" />
          </button>
        </div>
      </div>
      <div class="fl-body" ref="body" v-show="!collapsed">
        <LogView :lines="lines" />
      </div>
      <div class="fl-foot" v-show="!collapsed">
        <span>{{ current || '—' }}</span>
        <span>{{
          t('settings.floatFoot', {
            n: lines.length,
            mode: subscribed ? t('settings.livePush') : t('settings.manualRefresh')
          })
        }}</span>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, reactive, computed, watch, onBeforeUnmount, nextTick } from 'vue';
import { store } from '../store';
import { A } from '../api';
import { toastInfo, toastErr } from '../feedback';
import Icon from './Icon.vue';
import LogView from './LogView.vue';
import { stamp } from '../utils/timefmt';
import { t } from '../i18n';

const visible = computed(() => !!(store.settings && store.settings['ui.floatLog']));

const lines = ref([]);
const current = ref('');
const el = ref(null);
const body = ref(null);

const refreshing = ref(false);
const justOk = ref(false);
const justErr = ref(false);
const subscribed = ref(false);
let unsubLog = null;

const pos = reactive({ x: null, y: null });
const dragging = ref(false);
const collapsed = ref(false);
const posStyle = computed(() => {
  if (pos.x != null) return { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto' };
  return { right: '20px', bottom: '20px' };
});

async function refresh() {
  refreshing.value = true;
  justOk.value = false;
  justErr.value = false;
  try {
    const r = await A.logRead();
    lines.value = r.lines || [];
    current.value = r.current || '';
    await nextTick();
    if (body.value) body.value.scrollTop = body.value.scrollHeight;
    justOk.value = true;
    setTimeout(() => {
      justOk.value = false;
    }, 600);
  } catch (e) {
    justErr.value = true;
    setTimeout(() => {
      justErr.value = false;
    }, 800);
    toastErr(e, t('settings.runlogRefreshFailed'));
  } finally {
    refreshing.value = false;
  }
}

// 实时推送：logger 每次写入都通过 IPC 推一行到前端。
// 堆栈等多行内容会含 \n，按行拆分后逐条追加，避免一条占满屏幕。
function pushLine(entry) {
  if (!entry || entry.msg == null) return;
  const ts = entry.ts || stamp();
  const lvl = entry.level || 'INFO';
  const parts = String(entry.msg).split('\n');
  for (const p of parts) {
    if (!p) continue;
    lines.value.push(`[${ts}] [${lvl}] ${p}`);
  }
  // 内存上限：超过 1000 行丢弃最旧（避免长时间运行内存膨胀）
  if (lines.value.length > 1000) lines.value.splice(0, lines.value.length - 1000);
  nextTick(() => {
    if (body.value) body.value.scrollTop = body.value.scrollHeight;
  });
}

async function initLive() {
  // 1) 先拉一次历史（订阅前已产生的日志）
  await refresh();
  // 2) 订阅实时推送（重复进入时先取消旧的）
  if (unsubLog) {
    try {
      unsubLog();
    } catch (e) {}
    unsubLog = null;
  }
  if (typeof A.onLogLine === 'function') {
    unsubLog = A.onLogLine(pushLine);
    subscribed.value = true;
  }
}

watch(
  visible,
  v => {
    if (v) initLive();
    else {
      if (unsubLog) {
        try {
          unsubLog();
        } catch (e) {}
        unsubLog = null;
      }
      subscribed.value = false;
    }
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  if (unsubLog) {
    try {
      unsubLog();
    } catch (e) {}
    unsubLog = null;
  }
});

async function openDir() {
  try {
    await A.logOpen();
    toastInfo(t('settings.logDirOpened'));
  } catch (e) {
    toastErr(e, t('settings.openFailed'));
  }
}
async function close() {
  try {
    await A.setSetting({ k: 'ui.floatLog', v: false });
  } catch (e) {}
  if (!store.settings) store.settings = {};
  store.settings['ui.floatLog'] = false;
}

/* ---------- 拖拽 ---------- */
let startX = 0,
  startY = 0,
  origX = 0,
  origY = 0;
function startDrag(e) {
  if (e.button !== 0) return;
  dragging.value = true;
  const rect = el.value.getBoundingClientRect();
  origX = rect.left;
  origY = rect.top;
  startX = e.clientX;
  startY = e.clientY;
  window.addEventListener('pointermove', onDrag);
  window.addEventListener('pointerup', endDrag);
}
function onDrag(e) {
  const w = el.value ? el.value.offsetWidth : 420;
  const h = el.value ? el.value.offsetHeight : 300;
  let x = origX + (e.clientX - startX);
  let y = origY + (e.clientY - startY);
  x = Math.max(4, Math.min(window.innerWidth - w - 4, x));
  y = Math.max(4, Math.min(window.innerHeight - h - 4, y));
  pos.x = x;
  pos.y = y;
}
function endDrag() {
  dragging.value = false;
  window.removeEventListener('pointermove', onDrag);
  window.removeEventListener('pointerup', endDrag);
}
</script>

<style scoped>
.float-log {
  position: fixed;
  z-index: var(--z-float);
  width: 440px;
  max-width: 92vw;
  height: 300px;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.22);
  overflow: hidden;
  font-size: 12px;
}
.float-log.dragging {
  opacity: 0.96;
}
.float-log.dragging .fl-head {
  user-select: none;
  -webkit-user-select: none;
}
/* 缩小态：仅保留标题栏小条，正文/底部隐藏，容器收缩到头部高度 */
.float-log.collapsed {
  height: auto;
}
.float-log.collapsed .fl-body,
.float-log.collapsed .fl-foot {
  display: none;
}
.fl-btn.collapse-btn :deep(svg) {
  transition: transform 0.18s ease;
}
.fl-btn.collapse-btn.is-collapsed :deep(svg) {
  transform: rotate(180deg);
}
.fl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  cursor: grab;
  background: var(--titlebar-bg);
  border-bottom: 1px solid var(--border);
}
.fl-head:active {
  cursor: grabbing;
}
.fl-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 600;
  color: var(--text);
}
.fl-tag {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--c-green-weak);
  color: var(--c-green);
  margin-left: 2px;
}
.fl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c-green);
  box-shadow: 0 0 0 3px var(--c-green-weak);
}
.fl-dot.live {
  animation: pulse-dot 1.6s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%,
  100% {
    box-shadow: 0 0 0 3px var(--c-green-weak);
  }
  50% {
    box-shadow: 0 0 0 7px var(--c-green-weak);
  }
}
.fl-acts {
  display: flex;
  gap: 2px;
}
.fl-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  display: grid;
  place-items: center;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.fl-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}
.fl-btn.close:hover {
  background: var(--danger-weak);
  color: var(--danger);
}
/* 刷新按钮：旋转动画 + 成功绿高亮 + 失败红闪烁 */
.fl-btn.spin :deep(svg) {
  animation: fl-spin 0.8s linear infinite;
}
.fl-btn.ok {
  background: var(--c-green-weak);
  color: var(--c-green);
}
.fl-btn.err {
  background: var(--danger-weak);
  color: var(--danger);
  animation: fl-err-shake 0.35s ease;
}
@keyframes fl-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes fl-err-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-2px);
  }
  75% {
    transform: translateX(2px);
  }
}
.fl-body {
  flex: 1;
  overflow: auto;
  padding: 8px 10px;
  font-family: var(--font-mono);
  line-height: 1.65;
  background: var(--surface-2);
  /* 显式允许正文文本选中复制（Electron 沙盒下部分版本需 -webkit- 前缀） */
  user-select: text;
  -webkit-user-select: text;
}
.fl-foot {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  border-top: 1px solid var(--border);
  color: var(--text-3);
  font-size: 11px;
  user-select: text;
  -webkit-user-select: text;
}
.float-fade-enter-active,
.float-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.float-fade-enter-from,
.float-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
