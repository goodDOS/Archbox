<template>
  <!-- ★★★ 本组件的根是「多根模板」（Vue 3 fragment），**不包任何 div** ★★★
       Beta.322 的「没做好间隔」根因就在这里，且修过两次都没修对，记下来：
       ① 第一次：FontSection 被塞进「每页条数」那张 .card 内部 → 卡片套卡片，边框相贴。
       ② 第二次：拆成三张平级卡，但外面又包了一层 <div class="disp-cards">，
          并指望 display: contents 让它「在布局上消失」。实测（Chromium 无头）
          三段间距仍然是 0 —— **display:contents 只影响盒树，不影响元素树**，
          而 `.card-stack > .card + .card` 是元素树上的直接子元素选择器，
          隔了这层 wrapper 就再也匹配不到，四张卡全部贴死。
       ③ 现在：根节点直接就是三张卡，没有 wrapper。Vue 3 支持多根模板，
          SettingsPage 的 .card-stack 会把它们当成自己的直接子元素 —— 这才真正生效。

       ⚠ 不要再给它加外层 div（哪怕是为了加 padding / data 属性）。
         真要加，必须同步改 base.css 的选择器去穿透，否则立刻退回间距为 0。 -->
  <!-- 卡片 1：每页条数 -->
  <div class="card sec">
    <h3>{{ t('settings.displayTitle') }}</h3>
    <p class="dim">{{ t('settings.displayDesc') }}</p>

    <div class="kv kv--form">
      <div class="kv-row">
        <span>{{ t('settings.pageSizeLabel') }}</span>
        <div class="ctrl">
          <input class="input ps-input" type="number" min="1" max="500" v-model.number="ps" @change="onInput" />
          <span class="unit">{{ t('common.unit') }}</span>
          <div class="seg">
            <button
              class="seg-btn"
              v-for="n in PAGE_SIZE_PRESETS"
              :key="n"
              :class="{ on: ps === n }"
              @click="setPageSize(n)"
            >
              {{ n }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- 提示紧跟 pageSize 控件：控件结构变了，提示必须跟着控件走，否则用户不知道这句在说哪一项 -->
    <p class="dim tip">{{ t('settings.pageSizeTip') }}</p>
  </div>

  <!-- 卡片 2：界面字体。
         FontSection 自己就是 <div class="card sec">，在此作为模板的又一个根节点渲染，
         与相邻两张卡在元素树里平级 —— 间距由 .card-stack > .card + .card 统一给。 -->
  <FontSection />

  <!-- 卡片 3：界面语言。
         语言与字体同属「界面呈现」，但仍各自成卡 —— 三张卡等宽等高节奏一致，
         比「一张大卡里塞两块、另一块单独成卡」更容易扫。 -->
  <div class="card sec">
    <h3>{{ t('settings.langTitle') }}</h3>
    <p class="dim">{{ t('settings.langDesc') }}</p>

    <div class="kv kv--form">
      <div class="kv-row">
        <span>{{ t('settings.langLabel') }}</span>
        <div class="ctrl">
          <!--
              下拉而非按钮组：语言项会随语言版本增加（用户已提出要加更多语种），
              按钮组横向铺开会把整行撑开；且「当前选的是哪个」在下拉里天然只有一处，
              按钮组则要靠高亮色去分辨，切主题时对比度不稳。
              用自建 Dropdown 而非原生 <select>：Windows 下原生 listbox 由系统绘制，
              主题 CSS 管不到（见 components/Dropdown.vue 顶部说明）。
              选项文案一律取该语言自己的名字，英文界面里也能认出「简体中文」。
            -->
          <Dropdown class="lang-dd" :model-value="lang" :options="langOptions" @change="changeLang" />
        </div>
      </div>
    </div>

    <p class="dim tip">{{ t('settings.langTip') }}</p>
  </div>

  <!-- 运行过程悬浮窗 / 调试模式 已迁移到「运行日志」分区，避免与日志设置割裂 -->
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { store } from '../../store';
import { A } from '../../api';
import { toastInfo, toastErr } from '../../feedback';
import { t, lang, LANGS, setLang } from '../../i18n';
import Dropdown from '../Dropdown.vue';
import FontSection from './FontSection.vue';
import { PAGE_SIZE_KEY, PAGE_SIZE_PRESETS, normalizePageSize, persistPageSize } from '../../composables/usePageSize';

// 语言选项显示「该语言自名 + (当前界面语言对它的称呼)」：
// 前半是自名（LANGS.name，不随界面语言翻译），后半括号里的称呼经 t() 取当前界面语言
// 对它的叫法（common.langNames.<key>）。这样中文界面看到「English (英语)」、
// 英文界面看到「简体中文 (Simplified Chinese)」，既认出语言自名、又知道它在本语言里叫什么。
const langOptions = computed(() =>
  LANGS.map(l => ({ key: l.key, label: `${l.name} (${t('common.langNames.' + l.key)})` }))
);

const init = (k, d) => (store.settings && store.settings[k] != null ? store.settings[k] : d);
const ps = ref(normalizePageSize(init(PAGE_SIZE_KEY, 20)));

function syncStore(k, v) {
  if (!store.settings) store.settings = {};
  store.settings[k] = v;
}
function setPageSize(v) {
  const n = normalizePageSize(v);
  ps.value = n;
  persist(n);
}
function onInput() {
  setPageSize(ps.value);
}
async function persist(n) {
  try {
    await persistPageSize(n);
    syncStore(PAGE_SIZE_KEY, n);
    toastInfo(t('settings.pageSizeSet', { n }));
  } catch (e) {
    toastErr(e, t('common.saveFailed'));
  }
}

onMounted(async () => {
  if (!store.settings) {
    try {
      store.settings = await A.settingsAll();
    } catch (e) {}
  }
  ps.value = normalizePageSize(init(PAGE_SIZE_KEY, 20));
});

async function changeLang(l) {
  if (lang.value === l) return;
  await setLang(l);
  // 提示语在切换后取：此时 t() 已是新语言，用的是「新语言」报「已切换为 X」。
  // 语言名用 LANGS 原生 name（各语言自己的写法，与下拉选项一致），不经 t()。
  const name = (LANGS.find(x => x.key === l) || {}).name || l;
  toastInfo(t('settings.langSaved', { lng: name }));
}
</script>

<style scoped>
/* .sec / .kv / .seg 等复合模式见 styles/components.css，此处仅保留本区块特有样式 */

/* ★ 卡片间隔一律归外层 .card-stack 管（SettingsPage 里 ThemeSection 与本组件同处一个 .card-stack），
   本组件**不写任何** margin / gap 去补间距 —— 间距只允许 --card-gap 一个来源。
   代价是本组件必须是「多根模板」：一旦有人给它加个外层 div，
   `.card-stack > .card + .card` 就再也匹配不到，四张卡立刻贴死（Beta.322/323 连踩两次）。
   这条约束由 electron/verify/settings-card-gap.test.mjs 第 [3][4] 节焊住。 */

.kv {
  --kv-label-w: 150px;
}
.ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.ps-input {
  width: 86px;
  text-align: center;
}
.unit {
  color: var(--text-2);
  font-size: 12px;
}
/* 控件下方的说明文字：与控件留 8px，与卡片底部留白由 .sec 的 18px 兜住 */
.tip {
  margin-top: 8px;
}
/* 下拉不必铺满整行：语言名最长也就「简体中文」四个字，给个够用的定宽更像该行的控件 */
.lang-dd {
  width: 180px;
}
/* 宽度要落到子组件自己的 .dropdown（display:inline-block; width:100%）上：
   scoped 的 .lang-dd 只给根元素加了 data 属性，子组件内部元素的宽度不会继承 180px */
.lang-dd :deep(.dropdown) {
  width: 180px;
}
</style>
