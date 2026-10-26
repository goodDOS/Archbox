<template>
  <!-- ★ 本组件已是 .card-stack 的直接子元素，自己就是一张卡（class="card sec"）。
       不要再往里套一个 .card —— Beta.322 时它被嵌在 DisplaySection 的卡片内部，
       两层边框相贴，用户看到的正是「说明文字直接压在卡片框上」（报「没做好间隔」）。 -->
  <div class="card sec font-sec">
    <h3>{{ t('settings.fontTitle') }}</h3>
    <p class="dim">{{ t('settings.fontDesc') }}</p>

    <!-- 两张并排的可点卡片：整张卡片都是按钮，不必瞄准单选圆圈。
         用 role=radiogroup + aria-checked，键盘 Tab 进入后用方向键/空格选择。 -->
    <div class="font-cards" role="radiogroup" :aria-label="t('settings.fontTitle')">
      <button
        v-for="opt in OPTIONS"
        :key="opt.key"
        type="button"
        class="font-card"
        :class="{ on: model === opt.key }"
        role="radio"
        :aria-checked="model === opt.key"
        @click="choose(opt.key)"
      >
        <span class="fc-radio" aria-hidden="true"><span class="fc-dot"></span></span>
        <span class="fc-body">
          <span class="fc-name">{{ t('settings.font' + opt.i18n) }}</span>
          <span class="fc-note">{{ t('settings.font' + opt.i18n + 'Note') }}</span>
        </span>
        <!-- 预览用对应字族实际渲染，正好验证「这个模式真的换了字」 -->
        <span class="fc-preview" :style="{ fontFamily: previewFamily(opt.key) }">{{ t('settings.fontSample') }}</span>
      </button>
    </div>

    <p class="dim font-tip">{{ t('settings.fontTip') }}</p>
    <p v-if="model === 'bundled'" class="dim font-tip">{{ t('settings.fontBundledTip') }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { store } from '../../store';
import { A } from '../../api';
import { toastInfo, toastErr } from '../../feedback';
import { t } from '../../i18n';
import { useFontMode } from '../../composables/useFontMode';
import { BUNDLED_STACK, SYSTEM_STACK, stackToCss, normalizeFontMode, DEFAULT_FONT_MODE } from '../../utils/fontStack';

const FONT_MODE_KEY = 'display.fontMode';

/* 卡片顺序固定：自带在左（默认），系统在右。i18n 后缀用于拼键名：
 * settings.fontBundled / settings.fontBundledNote / settings.fontSystem / settings.fontSystemNote */
const OPTIONS = [
  { key: 'bundled', i18n: 'Bundled' },
  { key: 'system', i18n: 'System' }
];

const { mode, setFontMode } = useFontMode();
const model = ref(mode.value);

/* 预览文字的字体：直接用两套栈，而不是 var(--font-ui)——
 * 若用变量，两张卡片会显示同一个字体，用户看不出差别。 */
function previewFamily(key) {
  return stackToCss(key === 'bundled' ? BUNDLED_STACK : SYSTEM_STACK);
}

onMounted(async () => {
  if (!store.settings) {
    try {
      store.settings = await A.settingsAll();
    } catch (e) {}
  }
  model.value = normalizeFontMode(
    store.settings && store.settings[FONT_MODE_KEY] != null ? store.settings[FONT_MODE_KEY] : DEFAULT_FONT_MODE
  );
});

async function choose(key) {
  if (model.value === key) return;
  try {
    /* ★ 先落库再切换：反过来的话，落库失败时界面已换字体但设置没存，
     * 重启会回弹，用户会认为「设置不生效」。先存后切，失败就原地不动。 */
    await A.setSetting({ k: FONT_MODE_KEY, v: key });
    if (!store.settings) store.settings = {};
    store.settings[FONT_MODE_KEY] = key;
    await setFontMode(key);
    model.value = key;
    toastInfo(t('settings.fontSaved', { name: t('settings.font' + (key === 'bundled' ? 'Bundled' : 'System')) }));
  } catch (e) {
    toastErr(e, t('common.saveFailed'));
  }
}
</script>

<style scoped>
.font-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}

.font-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}
.font-card:hover {
  border-color: var(--border-strong);
}
.font-card.on {
  border-color: var(--accent);
  background: var(--accent-weak);
  box-shadow: 0 0 0 1px var(--accent) inset;
}
.font-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* 单选圆点：与全站控件尺寸对齐（14px），选中时内点填 accent */
.fc-radio {
  flex: none;
  width: 14px;
  height: 14px;
  margin-top: 3px;
  border: 1.5px solid var(--border-strong);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.font-card.on .fc-radio {
  border-color: var(--accent);
}
.fc-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: transparent;
  transform: scale(0.4);
  opacity: 0;
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
}
.font-card.on .fc-dot {
  background: var(--accent);
  transform: scale(1);
  opacity: 1;
}

.fc-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.fc-name {
  font-size: 13px;
  font-weight: 600;
}
.fc-note {
  font-size: 11.5px;
  color: var(--text-2);
  line-height: 1.45;
}

/* 预览文字用真实字族渲染，正好让用户当场看到差别。
 * 去掉 letter-spacing 的亚像素位移：0.5px 会让字形落在像素网格之间，
 * 抵消 body 已有的 -webkit-font-smoothing: antialiased，导致自带(Noto)字体边缘发糊。
 * 补 text-rendering: optimizeLegibility 让字距微调生效、边缘更利落。 */
.fc-preview {
  margin-left: auto;
  flex: none;
  font-size: 20px;
  line-height: 1;
  color: var(--text-2);
  text-rendering: optimizeLegibility;
  user-select: none;
}

.font-tip {
  margin-top: 8px;
}

@media (max-width: 720px) {
  .font-cards {
    grid-template-columns: 1fr;
  }
  .fc-preview {
    margin-left: 0;
  }
}
</style>
