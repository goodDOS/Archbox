<template>
  <div>
    <div class="page-head">
      <div>
        <h1>{{ t('shell.navSettings') }}</h1>
        <div class="desc">{{ t('settings.pageDesc') }}</div>
      </div>
    </div>

    <div class="set-layout">
      <SettingsNav :sections="SECTIONS" :active="sec" @nav="sec = $event" />

      <div>
        <div v-if="sec === 'display'" class="card-stack">
          <ThemeSection :themes="THEMES" @choose="chooseTheme" />
          <DisplaySection />
        </div>
        <DataSection
          v-if="sec === 'data'"
          :info="info"
          @choose-dir="chooseDir"
          @open-dir="openDir"
          @backup="backup"
          @restore="restore"
          @open-db="openDb"
          @import="showImport = true"
          @export-pack="exportPackWithPass"
          @export-md="exportMd"
          @export-pdf="exportPdf"
        />
        <!-- 安全分区与数据清洗是两个独立栏目（用户明确要求：数据清洗单独成项，
             位置在数据加密下方）。此前把 CleanupSection 塞进 security 的 card-stack 里，
             菜单上点不到、也搜不到，用户实际看到的是一张大卡片。 -->
        <SecuritySection v-if="sec === 'security'" :sec-state="secState" @open-modal="openSecModal" />
        <!-- 数据清洗栏目：两张平级卡片（Beta.324 用户要求「图片文件应独立在数据清洗板块之下」）。
             必须走 .card-stack —— 卡片间距的单一来源是 `.card-stack > .card + .card`，
             两张裸 .card 并列会零间距相贴（settings-card-gap.test.mjs 锁的正是这条）。
             此前图片文件内嵌在清洗卡内部（卡片套卡片），既是 Beta.323「没做好间隔」
             的同类根因，也让「看」与「删」挤在一张卡的边框里。 -->
        <div v-if="sec === 'cleanup'" class="card-stack">
          <CleanupSection @cleaned="reloadImages" />
          <ImageInventory ref="invRef" />
        </div>
        <AuditSection
          v-if="sec === 'audit'"
          :audit="audit"
          :chain-status="chainStatus"
          :chain-busy="chainBusy"
          :busy="auditBusy"
          @reverify="reverify"
          @page="loadAudit"
          @search="onSearch"
          @refresh="refreshAudit"
        />
        <RunlogSection
          v-if="sec === 'runlog'"
          :runlog="runlog"
          :runlog-busy="runlogBusy"
          @refresh="loadRunlog"
          @open-dir="openLogDir"
        />
        <AccountSection v-if="sec === 'account'" :users="users" />
      </div>
    </div>

    <ImportWizard v-if="showImport" @close="showImport = false" @done="onImportDone" />

    <PackPassModal
      v-if="passModal"
      :mode="passModal.mode"
      :title-override="passModal.title"
      :desc-override="passModal.desc"
      @submit="passModal.action"
      @close="passModal = null"
    />

    <SecurityModal
      v-if="secModal"
      :mode="secModal"
      :sec-state="secState"
      @done="loadSecStatus"
      @close="secModal = null"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, onBeforeUnmount } from 'vue';
import { store, refreshRegions, setTheme, bus } from '../store';
import { bootApp } from '../store/modules/boot';
import { toast, toastInfo, toastErr, toastOk, run } from '../feedback';
import { useRefresh } from '../composables/useRefresh';
import { useExports } from '../composables/useExports';
import { A } from '../api';
import SettingsNav from '../components/settings/SettingsNav.vue';
import ThemeSection from '../components/settings/ThemeSection.vue';
import DisplaySection from '../components/settings/DisplaySection.vue';
import DataSection from '../components/settings/DataSection.vue';
import SecuritySection from '../components/settings/SecuritySection.vue';
import SecurityModal from '../components/settings/SecurityModal.vue';
import CleanupSection from '../components/settings/CleanupSection.vue';
import ImageInventory from '../components/settings/ImageInventory.vue';
import AuditSection from '../components/settings/AuditSection.vue';
import RunlogSection from '../components/settings/RunlogSection.vue';
import AccountSection from '../components/settings/AccountSection.vue';
import ImportWizard from '../components/ImportWizard.vue';
import PackPassModal from '../components/PackPassModal.vue';
import { THEME_META } from '../store/modules/theme';
import { t } from '../i18n';

/* 左侧分区导航。
 *
 * ★ 必须用 computed，不能是普通常量数组（Beta.281 用户反馈「设置页导航栏文本不会及时更新」）。
 *   写成 `const SECTIONS = [{ label: t('settings.navDisplay') }, …]` 时，t() 在
 *   **模块求值的那一刻**就执行完了，label 被定格成当时的语言字符串：
 *     · 语言在设置页里切换（本页就提供切换入口），t() 的响应式依赖根本没被建立；
 *     · 模块只求值一次，之后无论 lang 怎么变，这个数组都不会重算。
 *   于是出现「右侧内容已是英文、左侧导航还是繁体」的割裂画面。
 *   改成 computed 后，模板渲染时读取它会登记 lang 依赖，语言一变整块跟着重算。
 *
 *   注意放的仍是 **key** 不是译文也行，但这里保留 t() 的调用 —— 由 computed 承载
 *   求值时机，比"模板里再 t 一次"更集中：分区增删只改这一处。
 */
const SECTIONS = computed(() => [
  { key: 'display', label: t('settings.navDisplay'), icon: 'display' },
  { key: 'data', label: t('settings.navData'), icon: 'database' },
  { key: 'security', label: t('settings.navSecurity'), icon: 'lock' },
  { key: 'cleanup', label: t('settings.navCleanup'), icon: 'broom' },
  { key: 'audit', label: t('settings.navAudit'), icon: 'clock' },
  { key: 'runlog', label: t('settings.navRunlog'), icon: 'terminal' },
  { key: 'account', label: t('settings.navAccount'), icon: 'user' }
]);
/* 主题元数据：name/desc 走 shell 域字典 key，由 theme.js 的 THEME_META 单一导出
 * （此前在此内联一份 THEMES，与导航栏 THEME_LABEL_KEYS 各写一遍易不同步）。
 * 由 ThemeSection 在模板里 t() 取值 —— 放 key 不放译文，切换语言时预览卡才跟着变。 */
const THEMES = THEME_META;

const sec = ref('display');
const info = ref({});
const users = ref([]);
/** 图片文件清单（数据清洗栏目第二张卡）：清理完成后由 @cleaned 触发刷新 */
const invRef = ref(null);
function reloadImages() {
  if (invRef.value) invRef.value.reload(1);
}
const audit = reactive({ rows: [], total: 0, page: 1, q: '' });
const auditBusy = ref(false);
const runlog = reactive({ lines: [], files: [], current: '' });
const runlogBusy = ref(false);
const showImport = ref(false);
const secState = reactive({
  encrypted: false,
  fileEncrypted: false,
  keyFileExists: false,
  safeStorage: false,
  algo: ''
});
const secModal = ref(null); // null | 'enable' | 'disable' | 'change'
const chainStatus = ref({ ok: true, total: 0, chained: 0, detail: t('settings.chainUnverified') });
const chainBusy = ref(false);

async function loadInfo() {
  try {
    info.value = await A.settingsAll();
    users.value = await A.users();
  } catch (e) {}
}
async function loadAudit(page, q) {
  if (q !== undefined) audit.q = q;
  if (page) audit.page = page;
  auditBusy.value = true;
  try {
    const r = await A.auditList({ page: audit.page, q: audit.q });
    Object.assign(audit, r);
    return true;
  } catch (e) {
    return false;
  } finally {
    auditBusy.value = false;
  }
}
// 操作日志刷新：统一封装，返回布尔 + 成功/失败气泡（此前完全无反馈）
// ★ success/fail 用函数惰性求值：否则 setup 阶段就把 t() 结果固化，切语言后残留旧文案
const auditRefresh = useRefresh(() => loadAudit(audit.page || 1, audit.q || ''), {
  busy: auditBusy,
  success: () => t('settings.auditRefreshed'),
  fail: () => t('settings.auditRefreshFailed')
});
const refreshAudit = auditRefresh.refresh;
// 运行日志刷新：统一封装（沿用「N 行」文案）
// ★ loader 只负责拉取并写回数据、返回 true；成功文案由 success 函数按当前语言 + 行数惰性生成
const runlogRefresh = useRefresh(
  async () => {
    const r = await A.logRead();
    Object.assign(runlog, r);
    return true;
  },
  {
    busy: runlogBusy,
    success: () => t('settings.runlogRefreshed', { n: runlog.lines.length }),
    fail: () => t('settings.runlogRefreshFailed')
  }
);
const loadRunlog = runlogRefresh.refresh;
async function openLogDir() {
  try {
    await A.logOpen();
    toastInfo(t('settings.logDirOpened'));
  } catch (e) {
    toastErr(e, t('settings.logDirOpenFailed'));
  }
}
function onSearch(q) {
  loadAudit(1, q);
}

async function reverify() {
  if (chainBusy.value) return;
  await run(() => A.auditVerify(), {
    busy: chainBusy,
    then: async r => {
      chainStatus.value = r;
      toast(
        r.ok ? t('settings.chainOkToast', { n: r.chained }) : t('settings.chainBadToast', { detail: r.detail }),
        r.ok ? 'ok' : 'err'
      );
      await loadAudit(audit.page || 1);
    }
  });
}

async function chooseTheme(key) {
  await setTheme(key);
  const meta = THEMES.find(x => x.key === key);
  toastInfo(t('shell.themeSwitched', { theme: meta ? t(meta.nameKey) : key }));
}

async function chooseDir() {
  await run(() => A.storageChoose(), {
    then: async r => {
      if (r) {
        toastOk(t('settings.storageMigrated', { path: r.dataDir }));
        await loadInfo();
      }
    }
  });
}
async function openDir() {
  await run(() => A.storageOpen());
}
// 口令弹窗状态：{ mode: 'set'|'unlock', title?, desc?, action }
const passModal = ref(null);
function backup() {
  passModal.value = {
    mode: 'set',
    title: t('settings.packPassTitle'),
    desc: t('settings.packPassDesc'),
    action: async pass => {
      await run(() => A.storageBackup({ pass: pass || '' }), {
        then: p => {
          if (p) toastOk(t('settings.backupDone', { path: p }));
        }
      });
      passModal.value = null;
    }
  };
}
async function restore() {
  passModal.value = {
    mode: 'unlock',
    title: t('settings.restoreTitle'),
    desc: t('settings.restoreDesc'),
    action: async pass => {
      await run(() => A.storageRestore({ pass: pass || '' }), {
        then: async r => {
          if (r) {
            toastOk(t('settings.restoreDone', { n: 1 }));
            // 恢复可能引入「加密库」或更换数据目录，必须重跑启动流程以刷新
            // locked / writable / dataDir 等状态（加密库未解锁则进入 UnlockGate）。
            await bootApp();
            await loadInfo();
          }
        }
      });
      passModal.value = null;
    }
  };
}
// 加载另一个数据库：切换到其它数据目录，复用主进程 reloadDataDir（已内建换库清 session）。
// 切换后必须 bootApp 重跑启动流程：新库可能是加密库（进 UnlockGate）或明文库，
// 且 session 已清空 → 回到登录门（UserGate），符合「换库强制重新登录」的约定。
async function openDb() {
  await run(() => A.storageOpenDb(), {
    then: async r => {
      if (r) {
        // 换库后主进程已清空 session，前端必须同步登出旧用户，
        // 否则 store.user 仍指向旧库账号，`!store.user` 恒为假、不会回到登录门。
        store.user = null;
        toastOk(t('settings.openDbDone', { path: r.dataDir }));
        await bootApp();
        await loadInfo();
      }
    }
  });
}
// 导出文档包：先弹可选口令框（set 模式），口令留空 = 不加密
function exportPackWithPass() {
  passModal.value = {
    mode: 'set',
    title: t('settings.packPassTitle'),
    desc: t('settings.packPassDesc'),
    action: async pass => {
      await exportPack(pass || '');
      passModal.value = null;
    }
  };
}
const { exportPack, exportMd, exportPdf } = useExports(() => ({}));

async function onImportDone(summary) {
  // 1) 侧栏大区/分类数会变（缺失自动新建）——refreshRegions 写回 store，常驻侧栏立即同步
  await refreshRegions();
  // 2) 导入会写审计记录，刷新操作日志
  await loadAudit(1);
  // 3) 重新校验审计链（新写入的记录需并入哈希链）
  try {
    const r = await A.auditVerify();
    store.auditChain = r;
    chainStatus.value = r;
  } catch (e) {}
  // 4) 提示用户
  if (summary) {
    const parts = [];
    if (summary.created) parts.push(t('settings.importCreated', { n: summary.created }));
    if (summary.merged) parts.push(t('settings.importMerged', { n: summary.merged }));
    if (summary.skipped) parts.push(t('settings.importSkipped', { n: summary.skipped }));
    toastInfo(
      t('settings.importDone', {
        detail: parts.join(' / ') || t('settings.importTotalOnly', { n: summary.total || 0 })
      })
    );
  }
}

async function loadSecStatus() {
  try {
    const s = await A.securityStatus();
    Object.assign(secState, s);
  } catch (e) {}
}
function openSecModal(m) {
  secModal.value = m;
}

onMounted(() => {
  if (store.params && store.params.sec && SECTIONS.value.some(s => s.key === store.params.sec))
    sec.value = store.params.sec;
  if (store.auditChain) chainStatus.value = store.auditChain;
  loadInfo();
  loadAudit(1);
  loadSecStatus();
});

// 监听路由参数变化：截图/导航时按 sec= 切换分区
watch(
  () => store.params,
  newParams => {
    if (newParams && newParams.sec && SECTIONS.value.some(s => s.key === newParams.sec)) sec.value = newParams.sec;
  },
  { deep: true }
);

// 切换到运行日志时自动加载
watch(sec, v => {
  if (v === 'runlog') loadRunlog();
});

// 订阅全局刷新（标题栏刷新按钮）：刷新当前所在的可刷新分区。
// 直接调底层 loader 返回布尔，由标题栏统一给「已刷新/刷新失败」气泡（避免与分区内刷新按钮重复 toast）
async function onGlobalRefresh() {
  if (sec.value === 'audit') return loadAudit(audit.page || 1, audit.q || '');
  if (sec.value === 'runlog') {
    try {
      const r = await A.logRead();
      Object.assign(runlog, r);
      return true;
    } catch (e) {
      return false;
    }
  }
  return true;
}
bus.on('refresh', onGlobalRefresh);
onBeforeUnmount(() => bus.off('refresh', onGlobalRefresh));
</script>

<style scoped>
.set-layout {
  display: grid;
  grid-template-columns: 210px 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 1100px) {
  .set-layout {
    grid-template-columns: 1fr;
  }
}
</style>
