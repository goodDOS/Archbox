<template>
  <div v-if="!store.booted" class="boot-screen">
    <div class="boot-logo">{{ t('shell.logoChar') }}</div>
    <div class="boot-name">{{ t('shell.appName') }}</div>
    <div class="boot-tip">{{ store.locked ? t('shell.bootUnlocking') : t('shell.bootLoading') }}</div>
  </div>

  <UnlockGate v-else-if="store.locked" />

  <div v-else-if="store.dbError" class="boot-screen db-error-screen">
    <div class="boot-logo err">!</div>
    <div class="boot-name">{{ t('shell.appName') }}</div>
    <div class="boot-tip err-title">{{ t('shell.dbUnavailable') }}</div>
    <div class="db-error-msg">{{ store.dbErrorMessage }}</div>
    <div class="db-error-actions">
      <button class="btn" @click="recoverDataDir">{{ t('shell.chooseOtherDir') }}</button>
      <button class="btn" @click="restoreFromBackup">{{ t('shell.restoreFromBackup') }}</button>
      <button class="btn ghost" @click="quitApp">{{ t('shell.quit') }}</button>
    </div>
    <div class="db-error-hint">{{ t('shell.dbUnavailableHint') }}</div>
  </div>

  <UserGate v-else-if="!store.user" />

  <!-- Beta.220：原先这里还挂过一个 seeking 状态类（由 findState.open 驱动，
       把侧栏/标题栏淡化到 opacity .45）。已移除 —— Beta.184 起查找由渲染端 postFind
       只扫「标题+字段数据+正文」，侧栏本就不在扫描范围，那套弱化已是纯装饰。
       查找条自身的可见性只看 findState.open（FindBar.vue 的 v-if），与此无关。 -->
  <div v-else class="app-shell" :class="{ readonly: !store.writable }">
    <TitleBar />
    <Sidebar />
    <main class="main" ref="mainRef" @scroll="onScroll">
      <Home v-if="store.page === 'home'" />
      <RegionView v-else-if="store.page === 'region'" />
      <PostView v-else-if="store.page === 'post'" />
      <Taxonomy v-else-if="store.page === 'taxonomy'" />
      <SearchPage v-else-if="store.page === 'search'" />
      <PostsPage v-else-if="store.page === 'posts'" />
      <TrashPage v-else-if="store.page === 'trash'" />
      <LanShare v-else-if="store.page === 'lanshare'" />
      <SettingsPage v-else-if="store.page === 'settings'" />
      <AboutPage v-else-if="store.page === 'about'" />
      <GuidePage v-else-if="store.page === 'guide'" />
    </main>

    <!-- 右下角回到顶部悬浮按钮 -->
    <transition name="fade">
      <button v-if="showTop" class="back-top no-drag" :title="t('shell.backTop')" @click="scrollTop">
        <Icon name="arrow-up" :size="20" :stroke="2.2" />
      </button>
    </transition>
    <RegionModal
      v-if="regionModal !== null"
      :value="regionModal.id ? regionModal : null"
      @close="onRegionModalClose"
      @saved="onRegionSaved"
    />
    <!-- 数据库不可写警告气泡（左上角悬浮）
         ★ 这个气泡属于「页内查找范围限定」的**范围外区域**，其文字必须退出查找树。
           现 Beta.184 已改用渲染端 postFind 引擎，气泡在文章标题/正文范围之外，
           本就不会被扫描。尝试过的旧写法与实测：
             · 对气泡自身 content-visibility → 377x55，浮层崩了
             · 对子元素 cv + cis 的 auto 宽度 → 宽度退化成最小宽，377 → 71
             · 对子元素 cv + cis 的百分比宽度 → 循环依赖，52x32 / 0x0
             · 包一层块级容器再对子元素 cv → 宽度问题仍在（本文件曾经加过 .rb-body，
               实测证明救不了 —— 气泡是 fixed + shrink-to-fit，宽度**唯一来源就是内容**，
               内容一退出布局，宽度就没有来源了）
           ★ 结论：改用 visibility:hidden 打在气泡自身 —— 盒尺寸 377x37 一个像素不变，
             文字退出查找树，且它本来就是纯提示浮层，查找期间不可见无功能损失。
           故这里**不需要**任何专用类名或额外结构，保持最简 DOM。 -->
    <!-- 完整性告警条（数据文件被改动）：常驻显示、需人工处置，不做一次性提示。
         与下面的 readonly-bubble 的区别：
           - 本条的触发原因是「文件被改过」，必须给出明确处置路径（重建基准 / 从备份恢复）；
           - readonly-bubble 只说明「现在是只读」，可能是目录不可写等无害原因。
         两条可同时出现（被改 → 只读），此时本条负责解释「为什么」。 -->
    <div class="integrity-alert" v-if="dbTampered || appTampered">
      <div class="ia-row" v-if="dbTampered">
        <Icon name="warn" :size="15" />
        <span class="ia-text">
          <strong>{{ t('shell.integrityDbTitle') }}</strong
          >：{{ store.integrity.db.reason }}。
          {{ t('shell.integrityDbBody') }}
        </span>
        <button class="ia-btn" :disabled="integrityBusy" @click="rebuildBaseline">
          {{ t('shell.rebuildBaseline') }}
        </button>
      </div>
      <!-- 程序文件层告警：只可能来自 app.asar 之外的 unpacked 文件。
           程序主体（app.asar）由可执行文件内部嵌的 Electron 校验守护，
           被改则该进程根本起不来（无窗口无日志直接退出）——所以能走到这里，
           说明主程序是原样的。文案必须说清层级，否则用户会误以为「主程序被换」。 -->
      <div class="ia-row" v-if="appTampered">
        <Icon name="warn" :size="15" />
        <span class="ia-text">
          <strong>{{ t('shell.integrityAppTitle') }}</strong
          >：{{ store.integrity.app.reason }}
          <template v-if="appTamperedDetail">（{{ appTamperedDetail }}）</template>。
          <template v-if="appAsarGuarded">
            {{ t('shell.integrityAppScope') }}
          </template>
          {{ t('shell.integrityAppAdvice') }}
        </span>
      </div>
      <button class="ia-close" @click="dismissIntegrity">{{ t('common.collapse') }}</button>
    </div>
    <div class="readonly-bubble" v-if="!store.writable">
      <Icon name="warn" :size="14" />
      <span>{{ store.writableReason }}</span>
    </div>
    <!-- 系统时钟异常告警条（时间回拨/异常时显示，提示审计与加密时间戳可能不可信） -->
    <div class="clock-alert" v-if="clockAlert">
      <Icon name="warn" :size="15" />
      <span class="ca-text">{{ t('shell.clockAlert', { reason: reasonText(clockAlert.reason) }) }}</span>
      <button class="ca-close" @click="clockAlert = null">{{ t('shell.clockAlertDismiss') }}</button>
    </div>
    <div class="toast-wrap" v-if="store.toast">
      <div class="toast" :class="store.toast.type">{{ store.toast.msg }}</div>
    </div>
    <ConfirmDialog />
    <PasswordGate />
    <!-- 页面内查找条（Ctrl+F 唤起，右上角按钮亦可） -->
    <FindBar />
    <!-- 自建右键面板（Beta.329 / #434 → Beta.330 全站覆盖）：
         菜单项由 useContextMenu.js 构建，剪贴板动作经 IPC 回主进程执行。
         除 <input>/<textarea> 原生输入框（撤销栈在浏览器内部，自绘会丢撤销）外，
         全站右键都由这里承接。 -->
    <ContextMenu
      :open="ctxMenuState.open"
      :x="ctxMenuState.x"
      :y="ctxMenuState.y"
      :items="ctxMenuState.items"
      @pick="ctxPick"
      @close="closeCtxMenu"
    />
    <!-- 运行过程悬浮窗：设置中开启后显示，实时展示运行日志 -->
    <FloatLog />
  </div>

  <!-- 数据库不可用屏的「从备份恢复」口令弹窗（独立于业务界面，dbError 态也能用） -->
  <PackPassModal
    v-if="restoreModal"
    mode="unlock"
    :title-override="restoreModal.title"
    :desc-override="restoreModal.desc"
    @submit="restoreModal.action"
    @close="restoreModal = null"
  />

  <!-- 自建悬停提示层（Beta.324 / #437）：全站单例，挂在所有分支之外，
       连登录门禁、数据库故障屏上的按钮也能用。事件在 document 上委托，
       模板里各处 title 无需改动。 -->
  <AppTooltip />
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { store, bootApp, goto, setTheme, findOpen, findClose, findState, bus } from './store';
import { toast, errText, errRaw } from './feedback';
import { t } from './i18n';
import { A } from './api';
import Icon from './components/Icon.vue';
import TitleBar from './components/TitleBar.vue';
import Sidebar from './components/Sidebar.vue';
import UserGate from './components/UserGate.vue';
import UnlockGate from './components/UnlockGate.vue';
import RegionModal from './components/RegionModal.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import PasswordGate from './components/PasswordGate.vue';
import FindBar from './components/FindBar.vue';
import ContextMenu from './components/ContextMenu.vue';
import FloatLog from './components/FloatLog.vue';
import PackPassModal from './components/PackPassModal.vue';
import AppTooltip from './components/AppTooltip.vue';
import { installErrorCapture } from './debug';
import { confirm } from './composables/useConfirm';
import { installContextMenu, ctxMenuState, ctxPick, closeCtxMenu } from './composables/useContextMenu';
import Home from './pages/Home.vue';
import RegionView from './pages/RegionView.vue';
import PostView from './pages/PostView.vue';
import Taxonomy from './pages/Taxonomy.vue';
import SearchPage from './pages/SearchPage.vue';
import PostsPage from './pages/PostsPage.vue';
import TrashPage from './pages/TrashPage.vue';
import LanShare from './pages/LanShare.vue';
import SettingsPage from './pages/SettingsPage.vue';
import AboutPage from './pages/AboutPage.vue';
import GuidePage from './pages/GuidePage.vue';

// 回到顶部悬浮按钮：监听主滚动容器
const mainRef = ref(null);
const showTop = ref(false);
// 大区弹窗（侧栏流程）本地状态：null=关闭，{}=新建，{id,...}=编辑。
// ★ 原 store.ui.regionModal/regionEdit 双路径已收敛为纯 props/emit：
//   打开由 RegionNav/RegionView 通过 bus 事件「region-modal:open」请求，
//   关闭/保存在本组件持有并广播「region-modal:closed」供 RegionView 刷新。
const regionModal = ref(null);
function onRegionModalClose() {
  regionModal.value = null;
  bus.emit('region-modal:closed');
}
function onRegionSaved() {
  regionModal.value = null;
  bus.emit('region-modal:closed');
  // 新建大区后不跳转页面：侧栏流程常发生在「文档编辑中」，一跳到 RegionView 就会丢掉
  // 用户正在写的草稿位置。列表刷新已由 RegionModal 内部 await refreshRegions() 完成，
  // 新大区会直接出现在侧栏，用户需要进入时自行点击即可。
}
// 打开大区弹窗的请求入口（RegionNav 新建 / RegionView 编辑走此事件）
function onRegionModalOpen(v) {
  regionModal.value = v || {};
}
// 编辑脏状态实时上报主进程，供「退出」菜单询问未保存修改
watch(
  () => store.dirty,
  v => {
    try {
      A.setUnsaved(!!v);
    } catch (e) {}
  },
  { immediate: true }
);
// 系统时钟异常告警（主进程检测到时间回拨/异常时填充）
const clockAlert = ref(null);
// 完整性告警条的「收起」状态：仅在本次会话内隐藏，下次启动仍会重新显示
// （这是刻意的 —— 若重启后就不再提示，等于给了攻击者一个「点掉就干净」的窗口）
const integrityDismissed = ref(false);
const integrityBusy = ref(false);
const dbTampered = computed(
  () => !integrityDismissed.value && !!(store.integrity && store.integrity.db && store.integrity.db.compromised)
);
const appTampered = computed(
  () => !integrityDismissed.value && !!(store.integrity && store.integrity.app && store.integrity.app.ok === false)
);
// 程序主体（app.asar）是否由可执行文件内部嵌的 Electron 校验守护。
// asar 部署下恒为 true：此时本模块的自检只覆盖 app.asar 之外的 unpacked 文件，
// 文案需据此声明「主体那一层不由这里负责」，避免用户误读成「主程序被换了」。
const appAsarGuarded = computed(() => {
  const a = store.integrity && store.integrity.app;
  if (!a) return false;
  return a.asarGuarded !== false && a.scope !== 'app-files';
});
// 程序文件差异的简要说明（被改/被删/被增，各取前几个文件名，避免告警条过高）
const appTamperedDetail = computed(() => {
  const a = store.integrity && store.integrity.app;
  if (!a) return '';
  const parts = [];
  if (a.modified && a.modified.length)
    parts.push(t('shell.integrityModified', { n: a.modified.length, list: a.modified.slice(0, 3).join('、') }));
  if (a.missing && a.missing.length)
    parts.push(t('shell.integrityMissing', { n: a.missing.length, list: a.missing.slice(0, 3).join('、') }));
  if (a.added && a.added.length)
    parts.push(t('shell.integrityAdded', { n: a.added.length, list: a.added.slice(0, 3).join('、') }));
  return parts.join('；');
});
function dismissIntegrity() {
  integrityDismissed.value = true;
}
/**
 * 人工确认「接受当前数据内容为签名基准」。
 * 这是唯一能清除数据完整性告警的路径，且动作本身会写进审计链 ——
 * 因此「谁把基准挪了」同样有迹可循。二次确认不可省：
 * 一旦重建，此前「库被改过」的哈希证据就再也对不上了。
 */
async function rebuildBaseline() {
  const yes = await confirm(t('shell.integrityRebuildConfirmBody'), {
    title: t('shell.integrityRebuildConfirmTitle'),
    danger: true
  });
  if (!yes) return;
  integrityBusy.value = true;
  try {
    const r = await A.acceptIntegrityBaseline(store.user ? store.user.id : null);
    // 后端已收敛为纯数据返回（成功 {writable}，失败走 throw 进 catch），故此处判 `if (r)`
    if (r) {
      toast(t('shell.integrityRebuilt'), 'ok');
      integrityDismissed.value = true;
      await bootApp(); // 重新拉取状态，让只读态与横幅同步刷新
    } else {
      toast(t('shell.integrityRebuildFailed'), 'err');
    }
  } catch (e) {
    toast(t('shell.integrityRebuildFailed') + '：' + errText(e), 'err');
  } finally {
    integrityBusy.value = false;
  }
}
function onScroll() {
  const el = mainRef.value;
  showTop.value = !!el && el.scrollTop > 320;
}
function scrollTop() {
  mainRef.value && mainRef.value.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Ctrl+F 页面内查找 ----------
 * 为什么必须自己装监听：Electron 的 BrowserWindow 默认【没有】 Chromium 自带的
 * 查找条（那是 Chrome 浏览器的 UI，不是渲染引擎的能力），不装的话 Ctrl+F 什么都不发生。
 *
 * 与 installNavShortcuts（Alt+←/→）的键位互不冲突：那边遇到 ctrlKey/metaKey 直接 return。
 * 但仍要在**捕获阶段之外的冒泡路径**上 preventDefault，否则在某些平台上会触发
 * 宿主窗口的默认行为（本应用 frame:false，虽无原生菜单栏，保险起见仍拦下）。
 *
 * Escape 的关闭不在这里做 —— 由 FindBar 输入框上的 @keydown.esc 负责（焦点在输入框内），
 * 这样用户在页面里按 Esc 不会误关查找框（正文点击后焦点在 body 上）。
 *
 * ============================ #FIND_WHITELIST ============================
 * ★★★ Beta.183：查找只在「文章页面」可用 —— 非文章页面按 Ctrl+F 静默无反应 ★★★
 * ★★★ Beta.219：白名单扩至「局域共享文档详情页」（.post-read 只读视图）★★★
 * ★★★ Beta.315（#418）：白名单再扩至「文档编辑态」（.edit-layout）★★★
 *
 * 【为什么补这一刀】
 *   查找条挂在 .app-shell 内、所有页面共用，可见性只看 findState.open，
 *   与当前是哪一页**完全无关**（FindBar.vue 的 v-if）。
 *   用户 Beta.179 反馈过「其它页面也能唤出搜索」，当时的处置是在 nav.js 里加
 *   _clearFindOnNavigate() —— 那只能治**切页后残留**，治不了「在新页面上直接按 Ctrl+F」，
 *   因为后者根本不经过导航栈、没有触发点。需求从未真正满足，本轮补齐。
 *
 * 【什么算「文章页面」】
 *   Beta.183 口径：文档详情页的**查看模式**。首页 / 全局搜索 / 所有文档 / 大区详情 /
 *   聚合管理 / 回收站 / 设置 / 关于 / 软件说明 一律禁止。
 *   Beta.219 扩围：**局域共享文档详情页**（.post-read 只读视图）也允许 ——
 *   它与本机查看模式同构（标题 + 字段数据 + 正文），在那里查找同样有意义。
 *   共享页的**列表视图**仍禁止（与所有文档页同口径：卡片列表无正文可查）——
 *   .post-read 只在详情分支（v-else）渲染，列表视图天然没有这个锚点。
 *   全局搜索页与所有文档页虽然**显示文档标题**，但只用 PostCard 卡片渲染，
 *   没有正文、没有 .post-main、也没有 [data-find-scope] —— 在那里"查找"没有意义。
 *   Beta.315（#418）再扩围：**编辑态**（.edit-layout）也允许 —— 用户在改稿时要
 *   在「标题 / 字段 / 正文」里定位文字，需求与查看态同样成立。编辑态的查找范围
 *   与引擎在 utils/postFind.js（转调 utils/editFind.js 混合引擎）实现，此处只放行。
 *
 * ★ 判据用 DOM 锚点（.post-main / .post-read / .edit-layout），**不是** store.page。
 *   三者在查看模式下都与 page==='post' 等价，但**编辑模式**下只有 .edit-layout 认得
 *   （编辑态仍是 store.page === 'post'，但 .post-main 不渲染）。三个锚点并置即
 *   「查看本机 / 查看共享 / 编辑」三态全放行，其余页面三者皆无 → 自动静默。
 *   editing 是 PostView.vue 的**局部** ref，App.vue 读不到也不必读——锚点自治。
 *
 * ★ DOM 锚点只用于判定「当前是不是文章页」：
 *     · 前端查找条（src/components/FindBar.vue）靠它决定要不要渲染；
 *     · 查找引擎（src/utils/postFind.js）查看态把范围限定为
 *       `.page-head .title-selectable`（标题）+ `.post-main .fields-card`（字段数据）+
 *       `.post-main .post-content`（正文）；共享详情页对应 `.post-read` 下的
 *       pr-title / pr-fields / pr-body（同口径）；编辑态对应 editFind 的
 *       「标题输入框 + 字段填写框 + 正文（PM 装饰）」三类目标；
 *     · 历史取证脚本 electron/verify/findscope.js 的 SNAP 也曾用同一锚点（已随方案废弃归档）。
 *   用同一组锚点判页面类型，三条路径共享一份口径，不会各判各的、日后漂移。
 *
 * ★ 反例留档：不要写成 `store.page === 'post' && !editing`。理由见上。
 *   共享详情页同理：不要写成 `store.page === 'lan' && !!post`——post 是 LanShare.vue 的
 *   局部 ref，App.vue 读不到；.post-read 锚点让「只在详情视图可用」自动成立。
 *
 * ★ 与本函数同级的还有两条路径，**三条缺一不可**（详见 nav.js:48 的注释）：
 *     · 导航路径（切页）→ nav.js 的 _clearFindOnNavigate 负责收尾
 *     · 按键路径（Ctrl+F）→ 就是下面这段
 *     · 点击路径（页头按钮）→ PostView.vue 的按钮只在 !editing 分支渲染；
 *       共享详情页的按钮在 LanShare.vue 的 .pr-bar 内（只读视图无编辑态，直接渲染）
 *       （Beta.315 起编辑态无此按钮，入口统一走 Ctrl+F）
 */
function canFindHere() {
  // Beta.219：.post-read = 局域共享文档详情页（LanShare.vue 只读视图，v-else 分支）。
  // 共享列表视图不渲染 .post-read → Ctrl+F 仍静默，与「所有文档页禁止」口径一致。
  // Beta.315（#418）：.edit-layout = 文档编辑态（标题/字段/正文混合查找）。
  return !!(
    document.querySelector('.post-main') ||
    document.querySelector('.post-read') ||
    document.querySelector('.edit-layout')
  );
}

/* 数据库不可用屏：让用户重新指向含有效 archive.db 的目录（如从备份恢复后）。
 *
 * ★ 主进程 app:repairDataDir 现在会在**当前进程内重新打开数据库**并重置
 *   state.dbError，因此这里拿到 ok 后直接用 bootApp() 重跑启动流程即可进入界面，
 *   无需重启进程。此前只 reload 页面 —— 重载的是同一个损坏进程，用户看到的
 *   还是同一张错误屏，必须手动杀进程重启（本次修复的核心问题）。
 *   不做复制，避免覆盖好库。 */
async function recoverDataDir() {
  try {
    const r = await A.repairDataDir();
    // 用户取消选择：静默保持错误屏
    if (!r) return;
    if (!r.ok) {
      // 选中目录的库仍打不开（同样损坏 / 被占用）：留在错误屏并说明原因
      store.dbErrorMessage = r.reason || t('shell.dbStillUnavailable');
      return;
    }
    // 重载成功：重跑启动流程，直接进入业务界面（若库已加密则进入解锁门）
    await bootApp();
  } catch (e) {
    store.dbErrorMessage = errText(e);
  }
}
function quitApp() {
  try {
    A.appQuit();
  } catch (e) {
    window.close();
  }
}

/* ---------- 数据库不可用屏：从备份恢复 ---------- */
const restoreModal = ref(null);
function restoreFromBackup() {
  restoreModal.value = {
    title: t('settings.restoreTitle'),
    desc: t('settings.restoreDesc'),
    action: async pass => {
      try {
        const r = await A.storageRestore({ pass: pass || '' });
        if (r) {
          toast(t('settings.restoreDone', { n: 1 }));
          restoreModal.value = null;
          await bootApp(); // 重跑启动流程：恢复成功则进入界面/解锁门/登录门
        }
      } catch (e) {
        store.dbErrorMessage = errText(e);
      }
    }
  };
}

function onFindKey(e) {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'f' || e.key === 'F')) {
    // ★ 非文章页面：静默无反应。
    //   连 preventDefault 也不做 —— 本应用 frame:false、无原生菜单栏，
    //   Electron 侧不存在「默认查找」可触发（见本函数上方注释的论证），
    //   不拦不会有副作用；而拦了反而"假装处理了"，掩盖行为差异。
    //   ★ 但**已打开的**查找条必须关掉：否则在文档页开着查找、再通过页面内链接
    //     （如卡片点击 / 作者链接）跳到列表页后，查找条会跟着过来 ——
    //     这类跳转同样走 goto()，会被 nav.js 兜住；这里是防御性的第二道。
    if (!canFindHere()) {
      if (findState.open) findClose();
      return;
    }
    e.preventDefault();
    // 已打开时再按一次 Ctrl+F：视为「重新输入关键词」。FindBar 的 watch 会重新
    // focus + select，用户直接打字即替换旧词，符合浏览器习惯。
    findOpen();
  }
}

/* 右键菜单的卸载句柄（onMounted 里赋值，onBeforeUnmount 里调用） */
let uninstallCtxMenu = null;

// 主进程的 reason 是 errKey 编码串（'sys.clockRollback|{"n":3}'），翻译逻辑收在 feedback.errRaw。
// 必须声明在 <script setup> 顶层，模板第 112 行以函数形式调用 reasonText(clockAlert.reason)。
const reasonText = errRaw;

bootApp()
  .then(() => {
    // 启动校验审计链：异常立即告警
    if (store.auditChain && !store.auditChain.ok) {
      toast(t('shell.auditChainBad', { detail: store.auditChain.detail }), 'err');
    }
  })
  .catch(e => {
    console.error(e);
    store.booted = true;
  });

onMounted(() => {
  // 调试模式开启时，捕获前端运行错误并上报完整堆栈到运行日志
  installErrorCapture();
  // 大区弹窗（侧栏流程）打开请求：RegionNav/RegionView 通过 bus 事件请求
  bus.on('region-modal:open', onRegionModalOpen);
  // Ctrl+F 页面内查找（详见 onFindKey 注释）
  window.addEventListener('keydown', onFindKey);
  /* 右键菜单（Beta.169 需求 3）：非按钮文字与图片可选择后右键复制。
   * 菜单位于主进程（原生 Menu.popup），这里只负责上报"右击了什么"。
   * 捕获阶段监听 —— 见 installContextMenu 注释。 */
  uninstallCtxMenu = installContextMenu();
  // 启动后异步拉一次局域网共享状态，写入全局 store，
  // 供 RegionNav/RegionView 等其他组件读取「已共享大区」徽标。失败静默降级。
  A.lanStatus()
    .then(s => {
      if (s) {
        store.lanEnabled = !!s.enabled;
        // ★ Beta.168：关闭态一律写空。后端 lan:getStatus 已按 enabled 收口，
        // 这里再兜一道 —— store.lanShared 是徽标的唯一数据源，一旦残留，
        // 侧栏大区上的「已共享」标记在关闭共享后不会消失。
        store.lanShared = s.enabled && Array.isArray(s.sharedRegions) ? s.sharedRegions.slice() : [];
      }
    })
    .catch(() => {});
  // 订阅主进程时钟异常告警（系统时间回拨/异常）
  if (A.onClockAlert)
    A.onClockAlert(d => {
      clockAlert.value = d;
    });
  // 主进程请求「未保存修改」确认（点关闭按钮 / 托盘「退出」）。
  // 原先主进程用 dialog.showMessageBoxSync —— 系统级同步阻塞模态，在 frame:false 的
  // 无边框窗口上关闭后不归还焦点，会导致键盘输入失效（必须重开窗口）。
  // 现改为渲染进程用应用内 ConfirmDialog 询问，再把结果回执给主进程。
  if (A.onConfirmClose)
    A.onConfirmClose(async d => {
      // 文案按 kind 在渲染层取本地化文本：主进程只发 kind（见 window.js askRendererThen），
      // 不在主进程拼中文 —— 那边拿不到 i18n 字典，拼了就是三语切换后的漏网文本。
      const kind = d && d.kind;
      const message =
        kind === 'quit'
          ? t('shell.confirmQuit')
          : kind === 'hide'
            ? t('shell.confirmHide')
            : (d && d.message) || t('shell.unsavedFallback');
      let ok;
      try {
        ok = await confirm(message, { title: t('shell.unsavedTitle'), danger: true });
      } catch (e) {
        ok = false;
      }
      try {
        A.confirmCloseResult(ok);
      } catch (e) {}
    });
  // 截图/自动化测试钩子：主进程 send('e2e:goto', 'home' | 'region:1' | 'post:1' | 'post:new:1' | 'search:kw' | 'taxonomy' | 'settings' | 'about' | 'theme:dark')
  //
  // ★ readonly:1 / readonly:0 —— 切换只读态，让 .readonly-bubble 真的渲染出来。
  //   存在的理由：`--verify` 验证脚本必须在**真实渲染的 DOM** 上测该气泡的
  //   范围排除行为。曾试图用「手工 createElement 合成一个同样 class 的 div」代替，
  //   结果连续两轮得出互相矛盾的结论 —— 合成元素复刻不出
  //   「Vue 组件 + scoped 样式 + 真实父级布局」的组合，子元素的计算 display
  //   会变（inline vs block），而 content-visibility 对 inline 是**静默失效**的。
  //   ★ 教训：验证生产行为时，被测对象必须是生产真正渲染出来的那个东西。
  A.onE2e &&
    A.onE2e(async cmd => {
      try {
        if (cmd.startsWith('theme:')) {
          await setTheme(cmd.slice(6));
          return;
        }
        if (cmd.startsWith('search:')) {
          goto('search', { q: cmd.slice(7), auto: true });
          return;
        }
        if (cmd.startsWith('post:new:')) {
          goto('post', { regionId: Number(cmd.slice(9)), editing: true });
          return;
        }
        if (cmd.startsWith('post:')) {
          goto('post', { id: Number(cmd.slice(5)) });
          return;
        }
        if (cmd.startsWith('region:')) {
          goto('region', { id: Number(cmd.slice(7)) });
          return;
        }
        if (cmd.startsWith('settings:')) {
          goto('settings', { sec: cmd.split(':')[1] });
          return;
        }
        if (cmd.startsWith('readonly:')) {
          store.writable = cmd.slice(9) !== '1';
          return;
        }
        if (cmd === 'lanshare') {
          goto('lanshare', {});
          return;
        }
        goto(cmd, {});
      } catch (e) {
        console.warn('e2e', e);
      }
    });
  // 托盘菜单导航意图：用户点击托盘弹窗的「最近浏览」项或「新建文档」时，
  // 由主进程转发（electron/ipc/tray.js → window.sendTrayNavigate）。
  // 锁定态下主进程根本不转发（主窗口停在解锁页，意图无人消费），故此处无需再判。
  if (A.onTrayNavigate)
    A.onTrayNavigate(d => {
      try {
        if (!d || d.page !== 'post') return;
        if (d.id) {
          goto('post', { id: d.id });
          return;
        }
        if (d.editing) goto('post', { regionId: d.regionId || null, editing: true });
      } catch (e) {
        console.warn('tray navigate', e);
      }
    });
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onFindKey);
  if (uninstallCtxMenu) uninstallCtxMenu();
  bus.off('region-modal:open', onRegionModalOpen);
});
</script>

<style scoped>
.boot-screen {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  /* Beta.289：boot 屏内容渐显（关键帧 app-fade-in 定义在 base.css 全局，此处仅引用） */
  animation: app-fade-in 0.36s ease-out both;
}
.boot-logo {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 28px;
  font-weight: 700;
}
.boot-name {
  font-weight: 600;
  font-size: 16px;
}
.boot-tip {
  color: var(--text-3);
  font-size: 12px;
}
.db-error-screen {
  gap: 14px;
  padding: 0 32px;
}
.boot-logo.err {
  background: var(--danger);
}
.boot-tip.err-title {
  color: var(--danger);
  font-size: 15px;
  font-weight: 600;
}
.db-error-msg {
  max-width: 520px;
  text-align: center;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.6;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px;
  word-break: break-all;
}
.db-error-actions {
  display: flex;
  gap: 12px;
}
.db-error-hint {
  max-width: 520px;
  text-align: center;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.6;
}

/* 完整性告警条（数据/程序文件被改动）。放在只读气泡上方，避免两者重叠。
   与 .clock-alert 同一视觉语言（danger 系），但支持多行与操作按钮 —— 
   因为这条不是「知道了」就能收场的提示，用户需要读原因并做出处置。 */
.integrity-alert {
  position: fixed;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: min(720px, 92vw);
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--danger-weak);
  color: var(--danger);
  border: 1px solid var(--danger);
  font-size: 13px;
  line-height: 1.6;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--danger) 30%, transparent);
}
.integrity-alert .ia-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.integrity-alert .ia-row :deep(svg) {
  flex: none;
  margin-top: 2px;
}
.integrity-alert .ia-text {
  flex: 1;
}
.integrity-alert .ia-btn {
  flex: none;
  align-self: center;
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--danger);
  background: transparent;
  color: var(--danger);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.integrity-alert .ia-btn:hover:not(:disabled) {
  background: var(--danger);
  color: var(--accent-text);
}
.integrity-alert .ia-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.integrity-alert .ia-close {
  align-self: flex-end;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--danger);
  background: transparent;
  color: var(--danger);
  font-size: 12px;
  cursor: pointer;
}
.integrity-alert .ia-close:hover {
  background: var(--danger);
  color: var(--accent-text);
}

/* 只读模式悬浮气泡 */
.readonly-bubble {
  position: fixed;
  top: 52px;
  left: 16px;
  z-index: var(--z-hint);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--radius);
  background: var(--danger-weak);
  color: var(--danger);
  border: 1px solid var(--danger);
  font-size: 12.5px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  animation: pulse-readonly 2s ease-in-out infinite;
}
@keyframes pulse-readonly {
  0%,
  100% {
    box-shadow: 0 4px 12px color-mix(in srgb, var(--danger) 20%, transparent);
  }
  50% {
    box-shadow: 0 4px 18px color-mix(in srgb, var(--danger) 40%, transparent);
  }
}
/* 系统时钟异常告警条 */
.clock-alert {
  position: fixed;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-hint);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 92vw;
  padding: 9px 14px;
  border-radius: var(--radius);
  background: var(--danger-weak);
  color: var(--danger);
  border: 1px solid var(--danger);
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 6px 20px color-mix(in srgb, var(--danger) 28%, transparent);
}
.clock-alert .ca-text {
  flex: 1;
}
.clock-alert .ca-close {
  flex: none;
  border: 1px solid var(--danger);
  background: transparent;
  color: var(--danger);
  border-radius: var(--radius-sm);
  padding: 4px 12px;
  cursor: pointer;
  font-size: 12.5px;
}
.clock-alert .ca-close:hover {
  background: var(--danger);
  color: var(--accent-text);
}
/* 只读模式下所有编辑按钮禁用样式 */
.app-shell.readonly .btn:not(:disabled)[data-edit-btn] {
  opacity: 0.4;
  pointer-events: none;
}

/* 右下角回到顶部悬浮按钮 */
.back-top {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: var(--z-hint);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
  background: var(--accent);
  color: var(--accent-text);
  border: none;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
}
.back-top:hover {
  filter: brightness(1.06);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 黑白线框主题：以下三处原本是实心色块（--accent 在本主题 = 墨色 #111），
 * 会渲染成死黑方块。改为 --fill-line 斜线填充 + 墨色描边，与全站线框语汇一致。
 * 因是 scoped 样式，无法并入 themes.css 的全局 [data-theme='wire'] 规则，故就近覆盖。
 * 文字用 var(--text)：斜线底为白，--accent-text（白）会不可见。 */
[data-theme='wire'] .boot-logo,
[data-theme='wire'] .back-top {
  background: var(--fill-line);
  color: var(--text);
  border: 1px solid var(--text);
}
[data-theme='wire'] .boot-logo.err {
  background: var(--fill-line);
  color: var(--text);
}
</style>
