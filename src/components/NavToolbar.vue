<template>
  <div class="nav-toolbar no-drag">
    <button class="tb-btn" :disabled="!store.nav.canBack" :title="backLabel" :aria-label="backLabel" @click="goBack">
      <Icon name="chevron-left" :size="15" :stroke="2" />
    </button>
    <button
      class="tb-btn"
      :disabled="!store.nav.canForward"
      :title="forwardLabel"
      :aria-label="forwardLabel"
      @click="goForward"
    >
      <Icon name="chevron-right" :size="15" :stroke="2" />
    </button>
    <button
      class="tb-btn"
      :title="t('shell.navRefresh')"
      :aria-label="t('shell.navRefresh')"
      @click="onRefresh"
      :class="{ busy: refreshing }"
    >
      <Icon name="refresh" :size="15" :stroke="2" :class="{ spin: refreshing }" />
    </button>
    <button class="tb-btn" :title="themeSwitchLabel" :aria-label="themeSwitchLabel" @click="cycleTheme">
      <Icon :name="themeIconName" :size="15" :stroke="2" />
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { store, setTheme, bus, clearDirty, goBack, goForward, installNavShortcuts } from '../store';
import { confirm } from '../composables/useConfirm';
import { toastInfo, toastErr } from '../feedback';
import { t } from '../i18n';
import Icon from './Icon.vue';
import { THEME_KEYS, STANDARD, THEME_LABEL_KEYS } from '../store/modules/theme';

const refreshing = ref(false);

let uninstallShortcut = null;
onMounted(() => {
  uninstallShortcut = installNavShortcuts();
});
onBeforeUnmount(() => {
  if (uninstallShortcut) uninstallShortcut();
});

// STANDARD 由 store/modules/theme.js 单一导出（此前此处与 boot.js 各写了一遍）
const THEME_ICONS = { light: 'sun', dark: 'moon', wire: 'half-circle', custom: 'palette' };
// 主题显示名走 i18n（shell.theme*），key → 字典键名映射由 theme.js 单一导出
const themeIconName = computed(() => (STANDARD.includes(store.theme) ? THEME_ICONS[store.theme] || 'sun' : 'palette'));
// 主题显示名：内置与自定义一视同仁查 THEME_LABEL_KEYS。
// Beta.325 用户需求：「主题快捷切换到自定义主题时，无障碍文字应显示自定义主题名称」——
// 此前非 STANDARD 主题一律回落笼统的「自定义」，切到 CS1.6/竹青/檀褐/青空/半条命时，
// 悬停与读屏都看不出具体是哪个主题。THEME_LABEL_KEYS 已覆盖全部 8 个主题 key，
// 只有极端残留（设置里存了表外 key）才回落「自定义」。
const themeLabel = computed(() => t('shell.' + (THEME_LABEL_KEYS[store.theme] || 'themeCustom')));
// 主题按钮的无障碍文字（title 与 aria-label 同源，不各写一句）
const themeSwitchLabel = computed(() => t('shell.navSwitchTheme', { theme: themeLabel.value }));
// 后退/前进按钮：title 与 aria-label 同源（此前 aria-label 硬编码英文 "Back"/"Forward"，
// 不随语言切换，违反 i18n 规矩；抽成 computed 供两处绑定共用）
const backLabel = computed(() =>
  store.nav.canBack ? t('shell.navBackTo', { label: t(store.nav.backKey) }) : t('shell.navNoBack')
);
const forwardLabel = computed(() =>
  store.nav.canForward ? t('shell.navForwardTo', { label: t(store.nav.forwardKey) }) : t('shell.navNoForward')
);

// 循环态：商务明亮 → 商务暗黑 → 黑白线框 → 自定义（记住上次选的非标准主题）→ 商务明亮
const CYCLE = ['light', 'dark', 'wire', 'custom'];
async function cycleTheme() {
  const idx = CYCLE.indexOf(STANDARD.includes(store.theme) ? store.theme : 'custom');
  const next = CYCLE[(idx + 1) % CYCLE.length];
  // 注意：本函数内的局部变量曾名为 t（主题 key），与导入的翻译函数 t 撞名。
  // 已改名为 tk —— 撞名时局部会遮蔽导入，`t('shell.xxx')` 会抛 "t is not a function"。
  if (next === 'custom') {
    const tk = THEME_KEYS.includes(store.themeCustom) ? store.themeCustom : 'cs16';
    await setTheme(tk);
    toastInfo(t('shell.themeSwitched', { theme: themeLabel.value }));
  } else {
    await setTheme(next);
    toastInfo(t('shell.themeSwitched', { theme: themeLabel.value }));
  }
}

/** 全局刷新：若当前有未保存录入，先询问确认；随后检测各页面刷新成败并给出气泡反馈 */
async function onRefresh() {
  if (store.dirty) {
    const ok = await confirm(t('shell.refreshDirtyConfirm'), { danger: true });
    if (!ok) return;
  }
  clearDirty();
  refreshing.value = true;
  const results = bus.emit('refresh');
  const stop = () => {
    refreshing.value = false;
  };
  // 当前页面未订阅 refresh（如设置页/关于页）：仅提示已触发
  if (!results.length) {
    toastInfo(t('shell.refreshTriggered'));
    setTimeout(stop, 500);
    return;
  }
  try {
    const settled = await Promise.allSettled(results);
    const failed = settled.some(s => s.status === 'rejected' || (s.status === 'fulfilled' && s.value === false));
    if (failed) toastErr(t('shell.refreshFailed'));
    else toastInfo(t('shell.refreshed'));
  } catch (e) {
    toastErr(t('shell.refreshFailed'));
  } finally {
    stop();
  }
}
</script>

<style scoped>
.nav-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  /* ★ Beta.251：padding 由 6px 2px 8px 改为 7px 2px 7px（左右不变）。
   *   用户反馈「导航栏的图标也要上下居中」+ 截图佐证。
   *   原因：上下内边距 6/8 不等，内容被整体**上推** 1px
   *         （偏移量 = (下 − 上) / 2 = (8−6)/2 = 1px）。
   *   实测：工具栏盒 [54, 99]，盒中心 76.5；而 .tb-btn 中心在 75 —— 确实偏上 1.5px。
   *   ★ 关键的联动约束：这里上下之和必须**保持 14px**（原 6+8=14）。
   *     因为右侧悬浮栏的底部分割线 y=99 是按"本工具栏底边"对齐的
   *     （见 base.css 的 .page-head.sticky-head，那里 padding 之和锁 22px）；
   *     本工具栏底 = 54 + 上 + 行高30 + 下 + border1。若上下之和变了，
   *     整个工具栏高度就变，底边随之漂移，右侧那条辛苦对齐的分割线立刻失准。
   *     ⇒ 对称化只能"在总和内左右挪"，7 = 14/2 是唯一解。
   *   ★ 同步更新了 standardize.test.mjs 的断言：原先写死 `6px 2px 8px`，
   *     现改为断言"上下之和 = 14 且上下相等" —— 锁不变量而非实现细节。 */
  padding: 7px 2px 7px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
.tb-btn {
  flex: 1;
  height: 30px;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;
  cursor: pointer;
  background: transparent;
  color: var(--text-2);
  border: 1px solid transparent;
}
.tb-btn:hover:not(:disabled) {
  background: var(--btn-ghost-hover);
  color: var(--text);
}
.tb-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.tb-btn.busy {
  opacity: 0.6;
  cursor: wait;
}
.spin {
  animation: tb-spin 0.7s linear infinite;
}
@keyframes tb-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
