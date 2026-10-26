<template>
  <Mask mask-class="sp-mask" @close="$emit('close')">
    <template #default="{ requestClose }">
      <div class="sp-drawer">
        <div class="sp-head">
          <h2><Icon name="lan-share" :size="16" /> {{ t('lanshare.myShare') }}</h2>
          <!-- requestClose 先播退场动画再真正关闭抽屉 -->
          <button class="sp-x" @click="requestClose" :title="t('common.close')"><Icon name="x" :size="16" /></button>
        </div>

        <div class="sp-body">
          <!-- 总开关 -->
          <div class="sp-row sp-switch">
            <div>
              <b>{{ t('lanshare.enableSwitch') }}</b>
              <p class="sp-sub">{{ t('lanshare.enableDesc') }}</p>
            </div>
            <label class="switch">
              <input
                type="checkbox"
                :checked="status.enabled"
                :disabled="busy"
                @change="toggleShare($event.target.checked)"
              />
              <span class="slider"></span>
            </label>
          </div>

          <div v-if="status.enabled" class="sp-section">
            <!-- 认证开关：开 = 需手工输入访问令牌；关 = 回到自动发现 -->
            <div class="sp-row sp-switch sp-auth">
              <div>
                <b>{{ t('lanshare.authSwitch') }}</b>
                <p class="sp-sub">
                  {{ t('lanshare.authDesc1') }}<b>{{ t('lanshare.authDescRotate') }}</b
                  >{{ t('lanshare.authDesc2') }}
                </p>
              </div>
              <label class="switch">
                <!--
                【为什么需要 ref + 手动回滚】
                这个 input 是受控的（:checked 绑 status.authEnabled），但用户在弹窗点「取消」时
                status.authEnabled 根本没变，Vue 对比新旧 vnode 发现值相同就不打补丁，
                于是浏览器里那个被手动点过的勾会留在 DOM 上 —— 开关显示「开」而实际认证仍是关。
                加 :key 也没用：key 变了要触发 patch 才生效，而父组件本就没进入 patch。
                因此取消时用 ref 把 DOM 的 checked 直接按回真实状态。
              -->
                <input
                  ref="authSwitchEl"
                  type="checkbox"
                  :checked="status.authEnabled"
                  :disabled="busy"
                  @change="toggleAuth($event.target.checked)"
                />
                <span class="slider"></span>
              </label>
            </div>

            <!-- 拷贝开关：是否允许他人把本机共享的文档整篇拷走 -->
            <div class="sp-row sp-switch sp-copy">
              <div>
                <b>{{ t('lanshare.copySwitch') }}</b>
                <p class="sp-sub">
                  {{ t('lanshare.copyDesc1') }}<b>{{ t('lanshare.copyDescTo') }}</b
                  >{{ t('lanshare.copyDesc2') }}
                </p>
              </div>
              <label class="switch">
                <!-- 同 authSwitchEl：受控开关取消时需手动把 DOM 勾回真实状态 -->
                <input
                  ref="copySwitchEl"
                  type="checkbox"
                  :checked="status.allowCopy"
                  :disabled="busy"
                  @change="toggleAllowCopy($event.target.checked)"
                />
                <span class="slider"></span>
              </label>
            </div>

            <!-- 连接信息 -->
            <div class="sp-info">
              <div class="sp-info-item">
                <span class="sp-k">{{ t('lanshare.hostNameLabel') }}</span>
                <input
                  class="input sp-hostname"
                  v-model="hostName"
                  :disabled="busy"
                  maxlength="64"
                  :placeholder="t('lanshare.hostNamePlaceholder')"
                  @keyup.enter="saveName"
                />
                <button
                  class="btn btn-sm sp-save"
                  :disabled="busy || !hostName.trim() || hostName.trim() === status.name"
                  @click="saveName"
                >
                  {{ t('common.save') }}
                </button>
              </div>
              <div class="sp-info-item">
                <span class="sp-k">{{ t('lanshare.localAddr') }}</span>
                <span class="sp-v mono">{{ status.lanIp || '—' }}:{{ status.port }}</span>
              </div>
              <div class="sp-info-item sp-token">
                <span class="sp-k">{{ t('lanshare.token') }}</span>
                <span class="sp-v mono">{{ status.token ? (reveal ? status.token : mask(status.token)) : '—' }}</span>
                <button
                  class="sp-ico"
                  @click="reveal = !reveal"
                  :title="reveal ? t('lanshare.hide') : t('lanshare.show')"
                >
                  <Icon :name="reveal ? 'eye-off' : 'eye'" :size="14" />
                </button>
                <button class="sp-ico" @click="copyToken" :title="t('lanshare.copyTokenTitle')">
                  <Icon name="download" :size="14" />
                </button>
                <button class="sp-ico" @click="regen" :disabled="busy" :title="t('lanshare.regenTokenTitle')">
                  <Icon name="refresh" :size="14" />
                </button>
              </div>
            </div>
            <p class="sp-note" v-if="status.authEnabled">
              {{ t('lanshare.noteAuthOn') }}
              <span class="sp-link" @click="clearCached">{{ t('lanshare.clearCached') }}</span>
            </p>
            <p class="sp-note" v-else>
              {{ t('lanshare.noteAuthOff1') }}<b>{{ t('lanshare.noteAuthOffWarn') }}</b
              >{{ t('lanshare.noteAuthOff2') }}
              <span class="sp-link" @click="clearCached">{{ t('lanshare.clearCached') }}</span>
            </p>

            <!-- 大区勾选 -->
            <div class="sp-rowhead">
              <span>{{ t('lanshare.pickRegionsTitle') }}</span>
              <button class="btn btn-sm" :disabled="busy || !sharedSet.size" @click="syncAll">
                <Icon name="refresh" :size="13" /> {{ t('lanshare.syncAllBtn') }}
              </button>
            </div>

            <div class="sp-regions">
              <label v-for="r in regions" :key="r.id" class="sp-region" :class="{ shared: isShared(r.id) }">
                <input type="checkbox" :checked="isShared(r.id)" :disabled="busy" @change="toggleRegion(r)" />
                <!-- 共享标识：与右侧大区色块对齐（同高、垂直居中） -->
                <span v-if="isShared(r.id)" class="share-flag"><Icon name="lan-share" :size="12" /></span>
                <span class="region-dot" :style="{ background: r.color }"></span>
                <span class="sp-rname">{{ r.name }}</span>
                <!-- ★ Beta.286：删掉这里原来的「更新」按钮。
                   每个大区各挂一个「更新」，用户以为它只更新「这一个大区」，
                   而后端 lanSyncNow 是一次全量同步 —— 点哪个大区效果都一样。
                   同屏还有一个「更新全部」，两个按钮做同一件事、却给出不同暗示，
                   是纯粹的误导。现在只保留行首的「更新全部」，语义诚实。 -->
                <span v-if="!isShared(r.id)" class="sp-unshared">{{ t('lanshare.unshared') }}</span>
              </label>
              <div v-if="!regions.length" class="sp-empty empty-row">{{ t('lanshare.noRegionsEmpty') }}</div>
            </div>

            <!-- 访客排行（近 7 天 · 7 名） -->
            <div class="sp-rowhead">
              <span>{{ t('lanshare.visitorRankTitle') }}</span>
              <button class="btn btn-sm" :disabled="busy" @click="loadRanks">
                <Icon name="refresh" :size="13" /> {{ t('common.refresh') }}
              </button>
            </div>
            <div class="sp-visitors sp-rank">
              <div v-if="!rank.length" class="sp-empty empty-row">{{ t('lanshare.noVisitors') }}</div>
              <div v-for="(r, i) in rank" :key="r.ip" class="sp-vis sp-vis-peer">
                <span class="sp-rank-no">{{ i + 1 }}</span>
                <div class="sp-peer-main">
                  <span class="sp-peer-line1">
                    <span class="sp-vis-act">{{ r.host || t('lanshare.unknownHost') }}</span>
                    <span class="sp-vis-ip mono">{{ r.ip }}</span>
                  </span>
                  <span class="sp-peer-line2">
                    <span class="sp-peer-label">MAC</span>
                    <span class="mono" :class="{ 'sp-peer-dim': !r.mac }">{{ r.mac || t('lanshare.macUnknown') }}</span>
                    <span
                      v-if="r.mac"
                      class="sp-mac-from"
                      :class="'mf-' + (r.macFrom || 'unk')"
                      :title="macTip(r.macFrom)"
                      >{{ macLabel(r.macFrom) }}</span
                    >
                  </span>
                </div>
                <span class="sp-vis-ip mono">{{ t('lanshare.countTimes', { n: r.count }) }}</span>
                <span class="sp-vis-time">{{ fmtTime(r.lastTs) }}</span>
              </div>
            </div>

            <!-- 文档查看排行（近 7 天 · 7 篇） -->
            <div class="sp-rowhead">
              <span>{{ t('lanshare.postRankTitle') }}</span>
              <button class="btn btn-sm" :disabled="busy" @click="loadPostRanks">
                <Icon name="refresh" :size="13" /> {{ t('common.refresh') }}
              </button>
            </div>
            <div class="sp-visitors sp-rank">
              <div v-if="!postRank.length" class="sp-empty empty-row">{{ t('lanshare.noPostRank') }}</div>
              <div v-for="(r, i) in postRank" :key="r.postId" class="sp-vis">
                <span class="sp-rank-no">{{ i + 1 }}</span>
                <span class="sp-vis-act">{{ r.postTitle || '#' + r.postId }}</span>
                <span class="sp-vis-ip mono">{{ t('lanshare.countTimes', { n: r.count }) }}</span>
                <span class="sp-vis-time">{{ fmtTime(r.lastTs) }}</span>
              </div>
            </div>

            <!-- 文档被拷排行：谁拷得最多、几次、什么时候 -->
            <div class="sp-rowhead">
              <span>{{ t('lanshare.copyRankTitle', { n: copyRank.length }) }}</span>
              <button class="btn btn-sm" :disabled="busy" @click="loadCopies">
                <Icon name="refresh" :size="13" /> {{ t('common.refresh') }}
              </button>
            </div>
            <div class="sp-visitors sp-rank sp-copyrank">
              <div v-if="!copyRank.length" class="sp-empty empty-row">{{ t('lanshare.noCopyRank') }}</div>
              <div v-for="(r, i) in copyRank" :key="r.postId" class="sp-cp">
                <span class="sp-rank-no">{{ i + 1 }}</span>
                <div class="sp-cp-main">
                  <span class="sp-vis-act">{{ r.postTitle || '#' + r.postId }}</span>
                  <span class="sp-cp-sub">
                    <template v-if="r.no">{{ r.no }} · </template>
                    {{ r.regionName || '—' }} · {{ t('lanshare.firstTime') }} {{ fmtTime(r.firstTs) }} ·
                    {{ t('lanshare.lastTime') }} {{ fmtTime(r.lastTs) }}
                  </span>
                  <span v-if="r.actors && r.actors.length" class="sp-cp-sub">{{
                    t('lanshare.copiers', { who: r.actors.join('、') })
                  }}</span>
                  <span v-if="r.macs && r.macs.length" class="sp-cp-sub">
                    <span class="sp-peer-label">MAC</span>
                    <span class="mono">{{ r.macs.join('、') }}</span>
                  </span>
                </div>
                <span class="sp-vis-ip mono">{{ t('lanshare.countTimes', { n: r.count }) }}</span>
              </div>
            </div>

            <!-- 拷贝记录（明细流水：谁、何时、拷走哪篇） -->
            <div class="sp-rowhead">
              <span>{{ t('lanshare.copyLogTitle', { n: copyLog.length }) }}</span>
              <button class="btn btn-sm" :disabled="busy" @click="loadCopies">
                <Icon name="refresh" :size="13" /> {{ t('common.refresh') }}
              </button>
            </div>
            <div class="sp-visitors" ref="copyEl">
              <div v-if="!copyLog.length" class="sp-empty empty-row">{{ t('lanshare.noCopyLog') }}</div>
              <div v-for="(c, i) in copyLog" :key="i" class="sp-vis sp-vis-peer">
                <span class="sp-vis-dot" :class="c.ok === false ? 'fail' : 'ok'"></span>
                <div class="sp-peer-main">
                  <span class="sp-peer-line1">
                    <span class="sp-vis-act">{{ c.host || t('lanshare.unknownHost') }}</span>
                    <span class="sp-vis-ip mono">{{ c.ip }}</span>
                  </span>
                  <span class="sp-peer-line2">
                    <span class="sp-peer-label">MAC</span>
                    <span class="mono" :class="{ 'sp-peer-dim': !c.mac }">{{ c.mac || t('lanshare.macUnknown') }}</span>
                    <span
                      v-if="c.mac"
                      class="sp-mac-from"
                      :class="'mf-' + (c.macFrom || 'unk')"
                      :title="macTip(c.macFrom)"
                      >{{ macLabel(c.macFrom) }}</span
                    >
                    <span class="sp-peer-sep">·</span>
                    <span class="sp-peer-quiet">{{
                      t('lanshare.tookAway', { title: c.postTitle || '#' + c.postId })
                    }}</span>
                  </span>
                </div>
                <span class="sp-vis-time">{{ fmtTime(c.ts) }}</span>
              </div>
            </div>

            <!-- 访客浏览记录 -->
            <div class="sp-rowhead">
              <span>{{ t('lanshare.visitorLogTitle', { n: visitors.length }) }}</span>
              <button class="btn btn-sm" :disabled="busy" @click="loadVisitors">
                <Icon name="refresh" :size="13" /> {{ t('common.refresh') }}
              </button>
            </div>
            <div class="sp-visitors" ref="visitorsEl">
              <div v-if="!visitors.length" class="sp-empty empty-row">{{ t('lanshare.noVisitorLog') }}</div>
              <div v-for="(v, i) in visitors" :key="i" class="sp-vis sp-vis-peer" :class="{ 'sp-vis-self': isSelf(v) }">
                <span class="sp-vis-dot" :class="v.ok ? 'ok' : 'fail'"></span>
                <div class="sp-peer-main">
                  <span class="sp-peer-line1">
                    <span class="sp-vis-act">{{ v.host || t('lanshare.unknownHost') }}</span>
                    <span class="sp-vis-ip mono">{{ v.ip }}</span>
                    <span v-if="isSelf(v)" class="sp-vis-tag">{{ t('lanshare.self') }}</span>
                  </span>
                  <span class="sp-peer-line2">
                    <span class="sp-peer-label">MAC</span>
                    <span class="mono" :class="{ 'sp-peer-dim': !v.mac }">{{ v.mac || t('lanshare.macUnknown') }}</span>
                    <span
                      v-if="v.mac"
                      class="sp-mac-from"
                      :class="'mf-' + (v.macFrom || 'unk')"
                      :title="macTip(v.macFrom)"
                      >{{ macLabel(v.macFrom) }}</span
                    >
                    <span class="sp-peer-sep">·</span>
                    <span class="sp-peer-quiet">{{ vLabel(v) }}</span>
                  </span>
                </div>
                <span class="sp-vis-time">{{ fmtTime(v.ts) }}</span>
              </div>
            </div>
          </div>

          <div v-else class="sp-off empty-row center pad-lg">
            <Icon name="lan-share" :size="28" />
            <p>{{ t('lanshare.offDesc') }}</p>
          </div>
        </div>
      </div>
    </template>
  </Mask>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue';
import { A } from '../api';
import { store } from '../store';
import Mask from './Mask.vue';
import { toastOk, toastErr, friendlyErr } from '../feedback';
import { confirm } from '../composables/useConfirm';
import Icon from './Icon.vue';
import { withTz } from '../utils/timefmt';
import { t } from '../i18n';

const emit = defineEmits(['close', 'updated']);

const busy = ref(false);
const reveal = ref(false);
// 认证开关的 DOM 引用：取消确认时需手动把勾按回真实状态（见 toggleAuth 注释）
const authSwitchEl = ref(null);
// 拷贝开关同理
const copySwitchEl = ref(null);
const hostName = ref('');
const status = reactive({
  enabled: false,
  name: '',
  port: 47373,
  token: '',
  authEnabled: true,
  allowCopy: false,
  sharedRegions: [],
  lanIp: '',
  lanIps: []
});
const regions = ref([]);
const visitors = ref([]);
const visitorsEl = ref(null);
const rank = ref([]);
const postRank = ref([]);
const copyLog = ref([]);
const copyRank = ref([]);
const copyEl = ref(null);
const sharedSet = computed(() => new Set(status.sharedRegions || []));

function isShared(id) {
  return sharedSet.value.has(Number(id));
}
function mask(t) {
  return t.length > 8 ? t.slice(0, 4) + '••••••••' + t.slice(-4) : '••••••••';
}

function vLabel(v) {
  if (v.kind === 'posts')
    return v.regionName ? t('lanshare.browseRegion', { name: v.regionName }) : t('lanshare.browseRegionPlain');
  if (v.kind === 'post')
    return v.postTitle ? t('lanshare.viewPost', { title: v.postTitle }) : t('lanshare.viewPostNo', { id: v.postId });
  if (v.kind === 'regions') return t('lanshare.browseSourcesOverview');
  if (v.kind === 'stats') return t('lanshare.viewStats');
  return v.path || t('lanshare.access');
}
// 浏览记录只展示「真正有浏览意义」的两类：浏览大区（posts）与查看文档（post）。
// regions / stats / other 仍由后端照常写入日志（保留排查能力），但不在流水里展示，
// 否则一条「查看统计」会被误读成有人看过文档。
const BROWSE_KINDS = ['posts', 'post'];
// 本机自浏览条目：后端经 HTTP 回环访问自己的共享，同样记入日志。
// 流水层保留展示（便于诊断令牌与路由问题）并加「本机」标识；仅聚合统计侧排除。
function isSelf(v) {
  return !!(v && v.self);
}

/* ---- MAC 可信度标注 ----
 * 后端 resolvePeer 会标注 mac 的来源：
 *   'arp'  本机内核邻居表实测 —— 同网段时可信
 *   'self' 对端请求头自报     —— 跨网段时的唯一来源，但**可被对端随意伪造**
 *   ''/其他 未知
 * 必须把两者在视觉上区分开，否则用户会把「自报」当成「实测」当成实锤证据。 */
function macLabel(from) {
  if (from === 'arp') return t('lanshare.macArp');
  if (from === 'self') return t('lanshare.macSelf');
  return t('common.unknown');
}
function macTip(from) {
  if (from === 'arp') return t('lanshare.macTipArp');
  if (from === 'self') return t('lanshare.macTipSelf');
  return t('lanshare.macTipUnknown');
}
// 访客时间展示：后端已统一写本地时间字符串（YYYY-MM-DD HH:MM:SS），补时区标注与全应用一致。
// 已放弃兼容历史 UTC 数据（早期 toISOString 的 'T'/'Z' 形态），只走一层直通。
function fmtTime(ts) {
  if (!ts) return '';
  return withTz(ts);
}

async function load() {
  try {
    status.enabled = false;
    Object.assign(status, await A.lanStatus());
    hostName.value = status.name || '';
    regions.value = await A.lanListRegions();
    if (status.enabled) {
      await loadVisitors();
      await loadRanks();
      await loadPostRanks();
      await loadCopies();
    }
  } catch (e) {
    toastErr(friendlyErr(e));
  }
}
async function loadVisitors() {
  try {
    const r = await A.lanVisitorLog();
    const all = (r && r.list) || [];
    // 只留浏览大区 / 查看文档两类；regions/stats/other 仍入库但不在此展示
    visitors.value = all.filter(v => BROWSE_KINDS.includes(v && v.kind));
  } catch (e) {
    visitors.value = [];
  }
  // 列表最新一条在底部：加载后自动滚到底，默认呈现最新访客记录
  await nextTick();
  const el = visitorsEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}
async function loadRanks() {
  try {
    const r = await A.lanVisitorRank();
    rank.value = (r && r.list) || [];
  } catch (e) {
    rank.value = [];
  }
}
async function loadPostRanks() {
  try {
    const r = await A.lanPostViewRank();
    postRank.value = (r && r.list) || [];
  } catch (e) {
    postRank.value = [];
  }
}
/** 拷贝记录 + 被拷排行（一次拉两路；明细默认滚到最新一条） */
async function loadCopies() {
  try {
    const r = await A.lanCopyLog();
    copyLog.value = (r && r.list) || [];
  } catch (e) {
    copyLog.value = [];
  }
  try {
    const r = await A.lanCopyRank();
    copyRank.value = (r && r.list) || [];
  } catch (e) {
    copyRank.value = [];
  }
  await nextTick();
  const el = copyEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}

async function toggleShare(v) {
  busy.value = true;
  try {
    const r = await A.lanSetEnabled({ enabled: v });
    Object.assign(status, r);
    // 同步到全局 store，供 RegionNav/RegionView 读取
    store.lanEnabled = !!status.enabled;
    if (Array.isArray(status.sharedRegions)) store.lanShared = status.sharedRegions.slice();
    toastOk(v ? t('lanshare.enabledOn') : t('lanshare.enabledOff'));
  } catch (e) {
    toastErr(friendlyErr(e));
  } finally {
    busy.value = false;
  }
}

async function toggleRegion(r) {
  busy.value = true;
  try {
    const r2 = isShared(r.id) ? await A.lanRemoveRegion({ regionId: r.id }) : await A.lanAddRegion({ regionId: r.id });
    status.sharedRegions = r2.sharedRegions || [];
    // 同步到全局 store，供 RegionNav/RegionView 读取
    store.lanShared = status.sharedRegions.slice();
    toastOk(
      r2.sharedRegions && r2.sharedRegions.includes(r.id)
        ? t('lanshare.regionShared', { name: r.name })
        : t('lanshare.regionUnshared', { name: r.name })
    );
  } catch (e) {
    toastErr(friendlyErr(e));
  } finally {
    busy.value = false;
  }
}

/* 更新全部：一次性把本机共享的最新数据广播出去（Beta.286 起是大区列表里唯一的同步入口） */
async function syncAll() {
  await doSync(t('lanshare.allUpdated'));
}
async function doSync(msg) {
  busy.value = true;
  try {
    await A.lanSyncNow({});
    toastOk(msg);
  } catch (e) {
    toastErr(friendlyErr(e));
  } finally {
    busy.value = false;
  }
}

async function toggleAuth(v) {
  // 开关是受控的，但取消分支下 status 不变 → Vue 不会回写 DOM，需手动把勾按回真实状态。
  const rollback = () => {
    const el = authSwitchEl.value;
    if (el) el.checked = !!status.authEnabled;
  };
  // 确认框是异步的，期间用户可能重复点开关，用 busy 挡掉重入
  if (busy.value) return rollback();
  busy.value = true;
  try {
    // 【必须用应用内 confirm，不能用 window.confirm】
    // 窗口是 frame:false 的无边框窗口，Chromium 在这种窗口上关闭原生同步模态后
    // 不把焦点归还给网页内容 —— 结果是窗口还在前台，但键盘输入再也进不去任何输入框，
    // 必须重开窗口才恢复（用户上报的「开关令牌后搜索页/新建文档页无法输入文字」）。
    // 项目其余确认弹窗早已迁到 useConfirm，这里原先漏改，Beta.161 补齐。

    // 关掉认证 = 令牌重新随广播明文分发，等于把安全等级降回加固前，必须显式确认
    if (!v) {
      const ok = await confirm(t('lanshare.confirmAuthOff'), { danger: true });
      if (!ok) return rollback();
    }
    // 关 → 开 会换发新令牌，已在连接的终端立即失效、需重新输入，故先确认。
    // 与「重新生成」按钮同一套语义：凡是让已连接终端失效的动作都要用户点头。
    const willRotate = v && !status.authEnabled;
    if (willRotate) {
      const ok = await confirm(t('lanshare.confirmAuthOn'), { danger: true });
      if (!ok) return rollback();
    }
    const r = await A.lanSetAuth({ enabled: v });
    status.authEnabled = !!r.authEnabled;
    // 关→开 时后端会换发令牌（关闭期间旧令牌可能已明文扩散），此处同步面板显示
    if (r.tokenRotated) {
      status.token = r.token || status.token;
      reveal.value = true; // 重置后直接明文展示，省得用户再点一次「显示」
      toastOk(t('lanshare.authOnRotated'));
    } else {
      toastOk(v ? t('lanshare.authOn') : t('lanshare.authOffNote'));
    }
  } catch (e) {
    toastErr(friendlyErr(e));
  } finally {
    busy.value = false;
  }
}

/**
 * 切换「允许他人拷贝文档」。
 * 开启是**授予一项新的危险能力**（对方可把共享文档整篇搬走），必须显式确认；
 * 关闭无风险，直接执行不打扰用户。
 */
async function toggleAllowCopy(v) {
  // 同 toggleAuth：受控开关在取消分支下 status 不变 → Vue 不回写 DOM，需手动按回
  const rollback = () => {
    const el = copySwitchEl.value;
    if (el) el.checked = !!status.allowCopy;
  };
  if (busy.value) return rollback();
  busy.value = true;
  try {
    // 必须用应用内 confirm：无边框窗口下原生 window.confirm 会丢失焦点（见 toggleAuth 注释）
    if (v) {
      const ok = await confirm(t('lanshare.confirmCopyOn'), { danger: true });
      if (!ok) return rollback();
    }
    const r = await A.lanSetAllowCopy({ enabled: v });
    status.allowCopy = !!r.allowCopy;
    toastOk(v ? t('lanshare.copyOn') : t('lanshare.copyOff'));
  } catch (e) {
    toastErr(friendlyErr(e));
  } finally {
    busy.value = false;
  }
}

async function regen() {
  if (busy.value) return;
  // 认证开启时换令牌会让已在使用的终端立刻失联，需确认；关闭时令牌本就公开，无需打扰。
  // 同 toggleAuth：这里也必须用应用内 confirm，原生 window.confirm 在无边框窗口上会丢焦点。
  if (status.authEnabled) {
    const ok = await confirm(t('lanshare.confirmRegen'), { danger: true });
    if (!ok) return;
  }
  busy.value = true;
  try {
    const r = await A.lanRegenToken();
    status.token = r.token;
    reveal.value = true;
    toastOk(t('lanshare.tokenRegenerated'));
  } catch (e) {
    toastErr(friendlyErr(e));
  } finally {
    busy.value = false;
  }
}

/**
 * 清除本机（作为客户端时）缓存的远端共享源访问令牌。
 * 缓存由 LanShare.vue 的「凭令牌连接远端源」流程写入，键为 `ip:port`，
 * 持久化在主进程 userData/lan-tokens.json（写侧同样在 LanShare.vue）。
 * 之前直接读 localStorage 清空，但打包版 file:// 下访问 localStorage 会被拒
 * （Access is denied for this document），于是这里成了唯一把错误弹出的地方。
 */
async function clearCached() {
  try {
    const all = (await A.lanGetTokenCache()) || {};
    const n = Object.keys(all).length;
    await A.lanSetTokenCache({ map: {} });
    toastOk(n ? t('lanshare.clearedTokens', { n }) : t('lanshare.noCachedTokens'));
  } catch (e) {
    toastErr(friendlyErr(e, t('lanshare.clearFailed')));
  }
}

async function copyToken() {
  try {
    await navigator.clipboard.writeText(status.token);
    toastOk(t('lanshare.tokenCopied'));
  } catch (e) {
    toastErr(friendlyErr(e, t('lanshare.copyTokenFailed')));
  }
}

async function saveName() {
  const name = hostName.value.trim();
  if (!name) {
    toastErr(t('lanshare.hostNameRequired'));
    return;
  }
  if (name === status.name) return;
  busy.value = true;
  try {
    const r = await A.lanSetName({ name });
    status.name = r.name;
    hostName.value = r.name;
    toastOk(t('lanshare.nameSet', { name: r.name }));
    emit('updated');
  } catch (e) {
    toastErr(friendlyErr(e));
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
/* ★ Beta.286：侧滑抽屉遮罩与弹窗遮罩同源 —— 变暗 + 背景模糊 + 入退场动画。
 * 暗度/模糊/动画的通用定义已上收到 base.css（.modal-mask 与 .sp-mask 共用一套
 * 入退场 keyframes），这里只保留抽屉特有的差异：层级、暗度、右对齐、抽屉滑入。 */
.sp-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-drawer);
  background-color: rgba(0, 0, 0, 0.32);
  display: flex;
  justify-content: flex-end;
  -webkit-backdrop-filter: blur(var(--mask-blur));
  backdrop-filter: blur(var(--mask-blur));
  animation: mask-in var(--mask-in) ease-out both;
}
.sp-mask.is-leaving {
  animation: none;
  pointer-events: none;
}
/* 抽屉内容从右侧滑入；退场时反向滑出。与弹窗的「位移+缩放」区分开 ——
 * 侧滑抽屉的方向感来自「滑」，而不是「弹」。 */
.sp-drawer {
  width: 420px;
  max-width: 92vw;
  height: 100%;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 28px rgba(0, 0, 0, 0.16);
  animation: drawer-in 0.2s cubic-bezier(0.2, 0.8, 0.3, 1) both;
}
.sp-mask.is-leaving .sp-drawer {
  animation: drawer-out var(--mask-out) ease-in forwards;
}
@keyframes drawer-in {
  from {
    transform: translateX(24px);
    opacity: 0.5;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
@keyframes drawer-out {
  from {
    transform: none;
    opacity: 1;
  }
  to {
    transform: translateX(24px);
    opacity: 0;
  }
}
.sp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}
.sp-head h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
}
.sp-x {
  border: none;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
}
.sp-x:hover {
  background: var(--btn-ghost-hover);
  color: var(--text);
}
.sp-body {
  padding: 16px 18px;
  overflow-y: auto;
  flex: 1;
}

.sp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.sp-switch {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}
/* 认证开关位于 sp-section 内，与上方总开关拉开距离，避免两个开关视觉粘连 */
.sp-auth {
  margin-bottom: 14px;
}
/* 拷贝开关与认证开关同为带边框卡片，与下方「连接信息」区块之间需留同等的间隔。
 * 漏了这条会让绿框与「主机名称」行紧贴，视觉上像粘在一起（Beta.208 修复）。 */
.sp-copy {
  margin-bottom: 14px;
}
.sp-sub {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 4px;
  line-height: 1.5;
  max-width: 280px;
}

/* 开关 */
.switch {
  position: relative;
  width: 42px;
  height: 24px;
  flex: none;
}
.slider {
  position: absolute;
  inset: 0;
  background: var(--surface-3);
  border-radius: 24px;
  transition: 0.15s;
  cursor: pointer;
}
.slider::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 3px;
  width: 18px;
  height: 18px;
  background: var(--surface);
  border-radius: 50%;
  transition: 0.15s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.switch input:checked + .slider {
  background: var(--c-green);
}
.switch input:checked + .slider::before {
  transform: translateX(18px);
}

.sp-section {
  margin-top: 16px;
}
.sp-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sp-info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.sp-k {
  font-size: 12px;
  color: var(--text-3);
  width: 64px;
  flex: none;
}
.sp-hostname {
  flex: 1;
  min-width: 110px;
  width: auto;
  padding: 5px 9px;
}
.sp-save {
  flex: none;
}
.sp-v {
  font-size: 13px;
  color: var(--text);
}
.mono {
  font-family: var(--font-mono);
}
.sp-token {
  align-items: center;
}
.sp-ico {
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-2);
  border-radius: var(--radius-sm);
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.sp-ico:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.sp-ico:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.sp-note {
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.5;
  margin: 10px 0 4px;
}
/* 行内文字按钮：清除缓存令牌等次要操作，避免喧宾夺主 */
.sp-link {
  color: var(--accent);
  cursor: pointer;
  margin-left: 6px;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.sp-link:hover {
  opacity: 0.8;
}

.sp-rowhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

.sp-regions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sp-region {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.sp-region:hover {
  background: var(--btn-ghost-hover);
}
.sp-region.shared {
  background: var(--c-green-weak);
}
/* 共享标识：固定尺寸、垂直居中，与大区色块（.region-dot）对齐。样式已抽到全局 components.css .share-flag */
/* .region-dot 基础形制见 components.css；本处用默认 10px，无需覆盖 */
.sp-rname {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* .sp-update 随「每行一个更新按钮」一并删除（Beta.286）。若要恢复，
 * 请先确认后端 lanSyncNow 能按大区定向同步 —— 它现在是无参数全量同步。 */
.sp-unshared {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-3);
}
.sp-empty {
  padding: 14px;
  font-size: 12.5px;
} /* 灰字来自 .empty-row */

.sp-visitors {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  padding: 6px;
  max-height: 220px;
  overflow-y: auto;
}
.sp-vis {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
}
.sp-rank-no {
  width: 18px;
  flex: none;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
}
.sp-vis:hover {
  background: var(--btn-ghost-hover);
}
.sp-vis-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}
.sp-vis-dot.ok {
  background: var(--c-green);
}
.sp-vis-dot.fail {
  background: var(--danger);
}
.sp-vis-ip {
  font-size: 12px;
  color: var(--text-2);
  flex: none;
}
/* 被拷排行条目：文档标题 + 两行次要信息（编号/大区/时间、拷贝者），故用纵向排版 */
.sp-cp {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
}
.sp-cp:hover {
  background: var(--btn-ghost-hover);
}
.sp-cp-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.sp-cp-sub {
  font-size: 11px;
  color: var(--text-3);
}
/* 本机自浏览标识：仅流水层展示用，聚合统计（首页卡片 / 排行）已排除本机 */
.sp-vis-self {
  opacity: 0.72;
}
.sp-vis-tag {
  flex: none;
  font-size: 10.5px;
  line-height: 1.5;
  padding: 0 6px;
  border-radius: 999px;
  color: var(--text-3);
  background: var(--surface-3);
}
.sp-vis-act {
  font-size: 12.5px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sp-vis-time {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
  flex: none;
}

/* ---- 对端身份（主机名 / IP / MAC）----
 * 三要素必须「同一条记录内成组出现」，故用两行结构：上行=主机名+IP，下行=MAC+可信度。
 * 若把 MAC 塞进同一行，窄窗口下会被挤到看不见——而它正是甄别同名不同机的关键。 */
.sp-vis-peer {
  align-items: flex-start;
}
.sp-peer-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.sp-peer-line1 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.sp-peer-line2 {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--text-3);
}
.sp-peer-label {
  flex: none;
  font-size: 10px;
  letter-spacing: 0.4px;
  color: var(--text-3);
  opacity: 0.8;
}
.sp-peer-dim {
  opacity: 0.45;
}
.sp-peer-quiet {
  color: var(--text-3);
}
.sp-peer-sep {
  opacity: 0.5;
}

/* MAC 可信度标签：实测（arp）= 中性绿；自报（self）= 警示橙。
 * ★ 刻意让「自报」看起来更弱、更可疑 ★ —— 该值可被对端伪造，
 * 视觉上若与实测同等醒目，用户会把它当成实锤证据。 */
.sp-mac-from {
  flex: none;
  font-size: 10px;
  line-height: 1.5;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px solid transparent;
  cursor: help;
}
.sp-mac-from.mf-arp {
  color: var(--c-green);
  border-color: var(--c-green);
  background: var(--c-green-weak);
}
.sp-mac-from.mf-self {
  color: var(--c-orange);
  border-color: var(--c-orange);
  background: var(--c-orange-weak);
}
.sp-mac-from.mf-unk {
  color: var(--text-3);
  border-color: var(--border);
}

/* 文档被拷排行：同一条目可能有多个 MAC（多人拷同一篇），逐个换行排 */
.sp-copyrank .sp-cp-sub {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.sp-off {
  /* 灰字/居中/内边距来自 .empty-row.center.pad-lg */
}
.sp-off p {
  font-size: 13px;
  line-height: 1.6;
  margin-top: 12px;
  max-width: 280px;
  margin-left: auto;
  margin-right: auto;
}
</style>
