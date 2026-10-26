<template>
  <div>
    <div class="page-head">
      <div>
        <h1>{{ t('about.title') }}</h1>
        <div class="desc">{{ t('about.subtitle') }}</div>
      </div>
    </div>

    <div class="about-grid">
      <div class="card about-card">
        <div class="ab-logo">{{ t('about.logoChar') }}</div>
        <h2>
          {{ t('about.appName') }} <span class="en">{{ t('about.appNameEn') }}</span>
        </h2>
        <div class="ver-line">
          <span class="badge warn">{{ t('about.testBadge') }}</span>
          <span class="ver">v{{ version }}</span>
        </div>
        <p class="ab-desc">{{ t('about.desc') }}</p>

        <button class="btn-guide no-drag" @click="goto('guide')">
          <span class="bg-ic"><Icon name="file-text" :size="18" /></span>
          <span class="bg-tx">
            <b>{{ t('about.guideTitle') }}</b>
            <span class="dim">{{ t('about.guideDesc') }}</span>
          </span>
          <Icon name="chevron-right" :size="16" class="bg-arrow" />
        </button>

        <h3 style="margin-top: 20px">{{ t('about.sponsorTitle') }}</h3>
        <div class="author">
          <span class="avatar">{{ t('about.sponsorAvatar') }}</span>
          <div>
            <b>{{ t('about.sponsorName') }}</b>
            <span class="dim">{{ t('about.sponsorNameEn') }}</span>
          </div>
        </div>
        <h3 style="margin-top: 18px">{{ t('about.leadTitle') }}</h3>
        <div class="author">
          <span class="avatar">{{ t('about.leadAvatar') }}</span>
          <div>
            <!-- 人名是专有名词，不随语言变化：与产品名 BRAND_NAME 同一把尺子（见 i18n/index.js 的 LEAD_NAME）。
                 旁边的职责描述仍走 t('about.leadDesc')，切语言照常切换。 -->
            <b>{{ LEAD_NAME }}</b>
            <span class="dim">{{ t('about.leadDesc') }}</span>
          </div>
        </div>
      </div>

      <div class="card about-card">
        <h3>{{ t('about.envTitle') }}</h3>
        <div class="kv kv--compact">
          <div class="kv-row">
            <span>{{ t('about.appVerLabel') }}</span
            ><code>v{{ v.app }}{{ t('about.testSuffix') }}</code>
          </div>
          <div class="kv-row">
            <span>Electron</span><code>{{ v.electron }}</code>
          </div>
          <div class="kv-row">
            <span>Chromium</span><code>{{ v.chrome }}</code>
          </div>
          <div class="kv-row">
            <span>Node.js</span><code>{{ v.node }}</code>
          </div>
          <div class="kv-row">
            <span>Vue</span><code>{{ vueVer }}</code>
          </div>
        </div>

        <h3 style="margin-top: 20px">{{ t('about.resTitle') }}</h3>
        <div class="x-scroll">
          <table class="tbl">
            <tbody>
              <tr v-for="r in RESOURCES" :key="r.name">
                <td>
                  <b>{{ r.name }}</b>
                </td>
                <td class="dim">{{ t(r.useKey) }}</td>
                <td style="width: 70px">
                  <span class="badge">{{ r.license }}</span>
                </td>
                <td style="width: 84px" class="dim">
                  <code v-if="r.verKey && v[r.verKey]">{{ v[r.verKey] }}</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 style="margin-top: 20px">{{ t('about.fontsTitle') }}</h3>
        <p class="dim" style="line-height: 2">
          {{ t('about.fontsL1') }}<br />
          <span class="dim-sub">{{ t('about.fontsL1Scope') }}</span
          ><br />
          {{ t('about.fontsL2') }}
        </p>
        <!-- 字族清单是数据，用途说明走 t()：切语言时说明跟着换，族名本身是专有名词不翻译 -->
        <div class="font-list">
          <div v-for="f in FONT_FAMILIES" :key="f.name" class="font-row">
            <code class="font-name">{{ f.name }}</code>
            <span class="dim">{{ t(f.useKey) }}</span>
          </div>
        </div>
        <p class="dim" style="line-height: 2; margin-top: 8px">
          {{ t('about.fontsL3') }}<br />
          <code class="font-path">public/fonts/LICENSES.md</code>
        </p>

        <h3 style="margin-top: 20px">{{ t('about.toolsTitle') }}</h3>
        <p class="dim" style="line-height: 2">
          {{ t('about.toolsAI') }}<br />
          <span class="dim-sub">{{ t('about.toolsAIScope') }}</span
          ><br />
          {{ t('about.toolsModels') }}<br />
          {{ t('about.toolsDev') }}<br />
          {{ t('about.toolsPack') }}<br />
          {{ t('about.toolsGit') }}
        </p>
      </div>

      <div class="card about-card">
        <h3>{{ t('about.legalTitle') }}</h3>
        <h4 style="margin-top: 14px">{{ t('about.privacyTitle') }}</h4>
        <p class="dim" style="line-height: 2">
          {{ t('about.privacyL1') }}<br />
          {{ t('about.privacyL2') }}
        </p>
        <h4 style="margin-top: 16px">{{ t('about.licenseTitle') }}</h4>
        <p class="dim" style="line-height: 2">
          {{ t('about.licenseL1') }}<br />
          {{ t('about.licenseL2') }}<br />
          {{ t('about.licenseL3') }}<br />
          {{ t('about.licenseL4') }}
        </p>
      </div>

      <div class="card about-card">
        <h3>{{ t('about.contactTitle') }}</h3>
        <p class="dim" style="line-height: 2">
          {{ t('about.contactBody') }}<br />
          <b>{{ t('about.contactMailLabel') }}</b
          ><a class="mail" href="mailto:kh.ye@foxmail.com">kh.ye@foxmail.com</a>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { version as vueVer } from 'vue';
import { store, goto } from '../store';
import Icon from '../components/Icon.vue';
import { t, LEAD_NAME } from '../i18n';

const v = store.versions || {};
const version = v.app || '0.1.0-test';
// useKey 指向 about 域字典：资源清单是数据，用途说明随语言切换走 t()，避免切语言后残留中文
/* 开源组件清单。verKey 指向 store.versions 里的字段，取不到的项不显示版本号 ——
 * 宁可空着，也不写一个会过期的硬编码数字。
 *
 * 顺序按「离用户最近」排：先编辑与外观（用户直接感知），再框架与数据层。 */
const RESOURCES = [
  {
    name: 'Tiptap (ProseMirror)',
    useKey: 'about.resTiptap',
    license: 'MIT',
    verKey: 'tiptap'
  },
  {
    name: '@ant-design/icons-svg',
    useKey: 'about.resAntdIcons',
    license: 'MIT',
    verKey: 'antdIcons'
  },
  { name: 'Lucide', useKey: 'about.resLucide', license: 'ISC', verKey: 'lucide' },
  { name: 'Electron', useKey: 'about.resElectron', license: 'MIT' },
  { name: 'Vue 3', useKey: 'about.resVue', license: 'MIT' },
  { name: 'Vite', useKey: 'about.resVite', license: 'MIT' },
  { name: 'sql.js / SQLite', useKey: 'about.resSql', license: 'MIT' },
  { name: 'sanitize-html', useKey: 'about.resSanitize', license: 'MIT' },
  { name: 'DOMPurify', useKey: 'about.resPurify', license: 'MPL-2.0 / Apache-2.0' }
];

/* 自带字体清单（Beta.322）。
 *
 * ★ 与 scripts/sync-fonts.mjs 的 FONTS 数组一一对应 —— 那份是产物的唯一来源，
 *   这里只是「关于页要展示的说明」。新增字族必须两边同时加：
 *   font-stack.test.mjs 会核对「FONTS 的 family 全部出现在关于页清单里」，
 *   漏写会直接报红，不靠人记。
 * ★ 族名不翻译（专有名词），用途说明走 about.fontsUse* 字典随语言切换。 */
const FONT_FAMILIES = [
  { name: 'Noto Sans', useKey: 'about.fontsUseLatin' },
  { name: 'Noto Sans SC', useKey: 'about.fontsUseSc' },
  { name: 'Noto Sans TC', useKey: 'about.fontsUseTc' },
  { name: 'Noto Sans JP', useKey: 'about.fontsUseJp' },
  { name: 'Noto Sans KR', useKey: 'about.fontsUseKr' },
  { name: 'Noto Sans Arabic', useKey: 'about.fontsUseAr' },
  { name: 'Noto Color Emoji', useKey: 'about.fontsUseEmoji' }
];
</script>

<style scoped>
.about-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 16px;
  align-items: start;
}
.about-card {
  padding: 22px;
}
.about-card h3 {
  font-size: 14px;
  margin-bottom: 10px;
}
.about-card h4 {
  font-size: 13px;
  margin-bottom: 8px;
  color: var(--text-2);
}
.ab-logo {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 12px;
}
h2 {
  font-size: 18px;
}
h2 .en {
  font-size: 12px;
  color: var(--text-3);
  font-weight: 400;
}
.ver-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 12px;
}
.ver {
  font-family: var(--font-mono);
  color: var(--accent);
}
.ab-desc {
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 2;
}
.author {
  display: flex;
  align-items: center;
  gap: 12px;
}
/* 关于页作者头像比默认大一档；形制见 base.css .avatar */
.avatar {
  --av: 40px;
}
.author b {
  display: block;
  font-size: 13.5px;
}
.dim-sub {
  color: var(--text-3);
  font-size: 11.5px;
  padding-left: 2.5em;
  display: inline-block;
}
/* 紧凑信息表：外观见 styles/components.css（.kv--compact 变体），此处仅覆盖标签列宽 */
.kv {
  --kv-label-w: 100px;
}
.btn-guide {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin-top: 18px;
  padding: 12px 14px;
  cursor: pointer;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: left;
  color: var(--text);
  transition:
    background 0.12s,
    border-color 0.12s;
}
.btn-guide:hover {
  border-color: var(--accent);
  background: var(--accent-weak);
}
.bg-ic {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  flex: none;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-text);
}
.bg-tx {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.bg-tx b {
  font-size: 13.5px;
}
.bg-tx .dim {
  font-size: 11.5px;
}
.bg-arrow {
  color: var(--text-3);
  flex: none;
}
.mail {
  color: var(--accent);
  text-decoration: none;
}
.mail:hover {
  text-decoration: underline;
}
/* 自带字体清单：族名用等宽字体（族名带空格，比例字体会看不出「这是技术名」） */
.font-list {
  display: grid;
  gap: 3px;
  margin-top: 6px;
}
.font-row {
  display: grid;
  grid-template-columns: 152px 1fr;
  gap: 10px;
  align-items: baseline;
  font-size: 12px;
}
.font-name {
  font-family: var(--font-mono);
  color: var(--accent);
}
.font-path {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-2);
}
@media (max-width: 620px) {
  .font-row {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
