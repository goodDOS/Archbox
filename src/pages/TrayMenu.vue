<template>
  <div class="tray-menu" ref="rootRef">
    <div class="tm-head">
      <span class="tm-head-name">{{ BRAND_FULL }}</span>
      <span class="tm-head-ver">v{{ ver }}</span>
    </div>

    <div class="tm-item" @click="act('open')">
      <Icon name="home" :size="15" class="tm-ic" />
      <span class="tm-label">{{ t('tray.open') }}</span>
    </div>

    <template v-if="!locked">
      <div class="tm-sep" />
      <div class="tm-group-label">{{ t('tray.recent') }}</div>
      <div v-for="r in recent" :key="r.id" class="tm-item tm-recent" @click="act('openPost', r.id)">
        <span class="tm-label tm-r-title">{{ r.title }}</span>
        <span class="tm-r-time">{{ relTime(r.at) }}</span>
      </div>
      <div v-if="!recent.length" class="tm-empty">{{ t('tray.recentEmpty') }}</div>
    </template>
    <div v-else class="tm-locked">{{ t('tray.lockedHint') }}</div>

    <div class="tm-sep" />
    <div class="tm-item" @click="act('newPost')">
      <Icon name="plus" :size="15" class="tm-ic" />
      <span class="tm-label">{{ t('tray.newDoc') }}</span>
    </div>

    <div class="tm-sep" />
    <div class="tm-item tm-quit" @click="act('quit')">
      <Icon name="x" :size="15" class="tm-ic" />
      <span class="tm-label">{{ t('tray.quit') }}</span>
    </div>
  </div>
</template>

<script setup>
/**
 * 托盘自绘菜单（渲染层）。
 *
 * 运行模式：主进程以 dist/index.html#tray 加载本入口（见 src/main.js），
 * 本组件是整个弹窗的根 —— 不走 App.vue 的启动/门禁流程，挂载后直接
 * 向主进程要一份托盘数据（主题/语言/最近浏览），菜单即可交互。
 *
 * 皮肤：与主界面同一份 CSS、同一套 data-theme，主题切换后重新打开托盘
 * 弹窗即变（弹窗每次打开都是新窗口，见 electron/window.js showTrayPopup）。
 */
import { ref, onMounted, nextTick } from 'vue';
import Icon from '../components/Icon.vue';
import { t, applyLang, BRAND_FULL } from '../i18n';
import { A } from '../api';
import { store } from '../store/modules/state';
import { applyTheme, THEME_KEYS } from '../store/modules/theme';
import { compactDateTime } from '../utils/timefmt';

const rootRef = ref(null);
const locked = ref(false);
const recent = ref([]);
const ver = ref('');

/* 相对时间：托盘空间局促，只给「多久以前」量级，不给绝对时间戳 */
function relTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 60 * 1000) return t('tray.justNow');
  if (diff < 3600 * 1000) return t('tray.minAgo', { n: Math.floor(diff / 60000) });
  if (diff < 86400 * 1000) return t('tray.hourAgo', { n: Math.floor(diff / 3600000) });
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, yesterday)) return t('tray.yesterday');
  // 更早的走紧凑日期时间（M-DD HH:mm）——格式化统一收口在 utils/timefmt
  return compactDateTime(d);
}

function act(type, id) {
  const p = { type };
  if (id != null) p.id = id;
  try {
    A.trayAction(p);
  } catch (e) {
    /* 弹窗随后由主进程收起 */
  }
}

onMounted(async () => {
  let d = {};
  try {
    d = (await A.trayData()) || {};
  } catch (e) {
    /* 取数失败也渲染基础菜单 */
  }
  locked.value = !!d.locked;
  recent.value = Array.isArray(d.recent) ? d.recent : [];
  // 主题/语言：无效值回退默认（THEME_KEYS 校验与 theme.js setTheme 同源）
  store.theme = THEME_KEYS.includes(d.theme) ? d.theme : 'light';
  applyTheme();
  applyLang(d.lang || 'zh-CN');
  await nextTick();
  // 回报真实内容高度，主进程据此校正弹窗尺寸与位置（electron/window.js resizeTrayPopup）
  try {
    const h = rootRef.value ? rootRef.value.scrollHeight : 0;
    if (h) A.trayResize({ height: h });
  } catch (e) {
    /* 尺寸校正失败不影响使用：主进程按预估高度定位 */
  }
  ver.value = d.ver || '';
});
</script>

<style scoped>
/* 托盘弹窗根：不走 .app-shell，样式全部本地声明。
 * 外观对齐 Dropdown 的 popup（同套主题变量），方角无圆角 ——
 * 弹窗是系统级浮层，圆角会在窗口四角露出 backgroundColor，与 surface 底色
 * 在部分主题下不一致，索性全方角（原生托盘菜单亦然）。 */
.tray-menu {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-strong);
  box-sizing: border-box;
  font-size: 13.5px;
  padding: 6px;
  user-select: none;
  overflow: hidden;
}
.tm-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px 8px;
}
.tm-head-name {
  font-weight: 600;
  font-size: 13px;
}
.tm-head-ver {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}
.tm-sep {
  height: 1px;
  margin: 5px 8px;
  background: var(--border);
}
.tm-group-label {
  padding: 4px 10px 2px;
  font-size: 11.5px;
  color: var(--text-3);
}
.tm-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  min-width: 0;
}
.tm-item:hover {
  background: var(--accent-weak);
}
.tm-ic {
  color: var(--text-2);
  flex: none;
}
.tm-item:hover .tm-ic {
  color: var(--accent);
}
.tm-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tm-recent .tm-r-title {
  font-size: 13px;
}
.tm-r-time {
  flex: none;
  font-size: 11px;
  color: var(--text-3);
  font-family: var(--font-mono);
}
.tm-empty {
  padding: 6px 10px 8px;
  font-size: 12px;
  color: var(--text-3);
}
.tm-locked {
  padding: 6px 10px 8px;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.6;
}
.tm-quit:hover {
  background: var(--danger-weak, var(--accent-weak));
}
.tm-quit:hover .tm-ic {
  color: var(--danger, var(--accent));
}
</style>
