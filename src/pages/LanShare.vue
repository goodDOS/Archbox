<template>
  <div>
    <!-- 头部 -->
    <div class="page-head">
      <div>
        <h1>{{ t('lanshare.title') }}</h1>
        <div class="desc">{{ t('lanshare.desc') }}</div>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-primary" @click="showPanel = true">
        <Icon name="lan-share" :size="15" /> {{ t('lanshare.myShare') }}
      </button>
    </div>

    <div class="ls-toolbar">
      <button class="btn ls-refresh" :disabled="discovering" @click="refresh">
        <Icon name="refresh" :size="15" :class="{ spin: discovering }" />
        {{ discovering ? t('lanshare.discovering') : t('lanshare.rediscover') }}
      </button>
      <span class="ls-hint" v-if="!status.enabled">{{ t('lanshare.notEnabledHint') }}</span>
      <span class="ls-hint" v-else>{{ t('lanshare.serviceOn', { port: status.port }) }}</span>
      <span class="ls-hint dim">{{ t('lanshare.readonlyHint') }}</span>
    </div>

    <!-- 主体：左栏共享源（主机 → 大区），右栏只读浏览 -->
    <div class="ls-body" v-if="!booting">
      <aside class="ls-rail">
        <div class="ls-rail-title">{{ t('lanshare.sourcesCount', { n: sources.length }) }}</div>

        <div v-for="s in sources" :key="s.key" class="src-group">
          <button class="src-head" :class="{ open: s.open }" @click="toggle(s)">
            <Icon name="chevron-right" :size="13" class="caret" />
            <span class="src-badge" :class="s.self ? 'self' : 'remote'">{{
              s.self ? t('lanshare.self') : t('lanshare.lan')
            }}</span>
            <span class="src-name">{{ s.name || t('lanshare.unnamedSource') }}</span>
            <span class="src-addr">{{ s.ip }}:{{ s.port }}</span>
          </button>

          <!-- 主机 → 大区 结构 -->
          <div v-if="s.open" class="src-regions">
            <div v-if="s.self && !status.enabled" class="b-empty empty-row">{{ t('lanshare.emptyLocalOff') }}</div>
            <div v-else-if="s.loading" class="b-empty empty-row">{{ t('lanshare.loadingRegions') }}</div>

            <!-- 需输入访问令牌（对方已开启认证，本机无缓存或令牌已失效） -->
            <div v-else-if="s.needAuth" class="src-auth">
              <p class="src-auth-tip">{{ t('lanshare.authTip') }}</p>
              <div class="src-auth-row">
                <input
                  class="input src-auth-input"
                  v-model="s.authInput"
                  type="password"
                  :placeholder="t('lanshare.token')"
                  :disabled="s.authBusy"
                  @keyup.enter="submitAuth(s)"
                />
                <button class="btn btn-sm" :disabled="s.authBusy || !s.authInput.trim()" @click="submitAuth(s)">
                  {{ s.authBusy ? t('lanshare.connecting') : t('lanshare.connect') }}
                </button>
              </div>
              <p v-if="s.authErr" class="src-auth-err">{{ s.authErr }}</p>
            </div>

            <div v-else-if="s.error" class="b-empty empty-row err">{{ s.error }}</div>
            <div v-else-if="!s.regions.length" class="b-empty empty-row">{{ t('lanshare.noRegions') }}</div>
            <button
              v-for="r in s.regions"
              :key="r.id"
              class="src-region"
              :class="{ active: sel.key === s.key && sel.regionId === r.id }"
              @click="selectRegion(s, r)"
            >
              <span class="region-dot" :style="{ background: r.color }"></span>
              <span class="sr-name">{{ r.name }}</span>
              <span class="sr-count">{{ r.postCount }}</span>
            </button>
          </div>
        </div>

        <div v-if="!sources.length" class="empty card" style="padding: 24px">
          {{ t('lanshare.noSources', { port: status.port || 47373 }) }}
          <template v-if="status.authEnabled"><br />{{ t('lanshare.noSourcesAuth') }}</template>
        </div>
      </aside>

      <section class="ls-main">
        <template v-if="!sel.regionId">
          <div class="empty card empty-row pad-lg">
            {{ t('lanshare.pickRegion') }}
          </div>
        </template>
        <template v-else>
          <div class="ls-toolbar sub">
            <span class="src-pill"
              ><Icon name="lan-share" :size="13" /> {{ activeSource.name || t('lanshare.unnamed') }}</span
            >
            <span class="src-pill">
              <span class="region-dot" :style="{ background: activeRegion.color }"></span> {{ activeRegion.name }}
            </span>
            <span class="src-pill ro"><Icon name="eye" :size="13" /> {{ t('lanshare.readonly') }}</span>
            <div class="spacer"></div>
          </div>

          <div v-if="!post">
            <div class="filter-bar">
              <input
                class="input"
                v-model="q"
                :placeholder="t('lanshare.searchInRegion')"
                style="max-width: 260px"
                @keyup.enter="searchPosts"
              />
              <button class="btn" @click="searchPosts">{{ t('common.search') }}</button>
              <span class="b-count">{{ t('lanshare.postCount', { n: posts.total }) }}</span>
            </div>
            <div class="list-meta" v-if="posts.total">
              <span
                >{{ t('lanshare.listMetaPre') }}<b style="color: var(--text)">{{ posts.total }}</b
                >{{ t('lanshare.listMetaPost', { page: page, pages: totalPages }) }}</span
              >
            </div>
            <div v-if="posts.list.length" class="grid grid-2">
              <PostCard
                v-for="p in posts.list"
                :key="p.id"
                :post="p"
                date-key="updated_at"
                :clickable="false"
                @open="openPost"
              />
            </div>
            <div v-else class="empty card" style="padding: 40px">{{ t('lanshare.noPosts') }}</div>
            <Pager :page="page" :pages="totalPages" @navigate="goPage" />
          </div>

          <!-- 文档详情（只读） -->
          <div v-else class="post-read">
            <div class="pr-bar">
              <!-- ★ Beta.248（用户要求）：这一排全部收成纯图标，与详情页页头同形制。
                   文字信息一律挪进 title / aria-label —— 鼠标悬停看得见、读屏读得到，
                   但不再占据横向空间。

                   ★ 排布顺序（用户二次指定，Beta.249 已改）：
                     返回列表 → 搜索 → 分享 → 拷贝
                   「返回列表」是这一页的"退路"，放在最左（阅读起点），
                   用户扫一眼就能找到离开的出口；随后才是对本篇文档的三个动作：
                   查文字 → 带出去（导出）→ 存一份到本机。
                   早先版本把返回列表放在最右并加了竖线分隔，
                   用户看过实机后要求统一到最前，故不再使用 .pr-sep。

                   ★ 图标区分（用户要求）：这里用 lan-share（本页的共享源语义），
                     而分享用 share（节点互联）—— 两者不再同形，
                     否则用户看到两个一样的心形节点图标，分不清哪个是导出哪个是共享源。

                   ★ 「拷贝到本机」曾靠"唯一的实心按钮 + 带文字"做视觉区分；
                     统一成图标后又改成 .btn-copy 的主题色描边（Beta.259 撤销）：
                     四个同形制按钮里三个浅描边、一个深描边，用户报「颜色不统一」。
                     现整排统一走标准 .btn 外观，"这是写操作"的提示改由
                     title/aria-label + 禁用灰化 + 成功失败回执承担，详见样式区注释。 -->
              <!-- 返回列表：图标化后靠 title/aria-label 说明去向。
                   位置由用户指定在最前 —— 它不属于"对文档的操作"，而是导航出口，
                   排在最左与右侧三个动作自然分开，无需再加竖线。 -->
              <button
                class="btn btn-icon"
                @click="backToList"
                :title="t('lanshare.backToListTitle')"
                :aria-label="t('lanshare.backToList')"
              >
                <Icon name="chevron-left" :size="16" />
              </button>
              <!-- 页内查找（Beta.219）：canFindHere() 已放行 .post-read，Ctrl+F 同样可用。
                   只读视图无编辑态，按钮直接渲染（无需条件）。 -->
              <button
                class="btn btn-icon"
                @click="findOpen"
                :title="t('lanshare.findTitle')"
                :aria-label="t('lanshare.findHere')"
              >
                <Icon name="search" :size="16" />
              </button>
              <!-- ★ 共享文档导出（Beta.243/246）：收进与本机详情页同一个「分享」下拉。
                   两处共用 ShareMenu 组件 —— 导出项、顺序、图标、弹层行为只定义一次，
                   不会出现「本机是 Markdown 在前、共享页是 PDF 在前」这种漂移。
                   数据取 post（页面已从共享源取回详情），不是本机库 ——
                   共享文档在本机没有记录，走 db.getPost 会直接「文档不存在」。
                   不传 size（默认 'icon'）→ 32×32 纯图标，与左右按钮同形制。 -->
              <ShareMenu :busy="exporting" @export-md="exportShared('md')" @export-pdf="exportShared('pdf')" />
              <!-- 拷贝到本机（写操作；外观与同排按钮统一，区分靠 title 与禁用态） -->
              <button
                class="btn btn-icon btn-copy"
                :disabled="copying || !activeSource.allowCopy"
                :title="activeSource.allowCopy ? t('lanshare.copyTitleOk') : t('lanshare.copyTitleNo')"
                :aria-label="t('common.copyToLocal')"
                @click="askCopy"
              >
                <Icon name="copy" :size="16" />
              </button>
            </div>
            <p v-if="copyErr" class="pr-err">{{ copyErr }}</p>
            <p v-if="copyOk" class="pr-ok">{{ copyOk }}</p>
            <h2 class="pr-title">{{ post.title }}</h2>
            <div class="pr-meta">
              <span class="region-dot" :style="{ background: activeRegion.color }"></span>
              <span>{{ activeRegion.name }}</span>
              <span class="sep">/</span>
              <span>{{ post.cname || t('common.unclassified') }}</span>
              <span v-if="post.no" class="pr-no"># {{ post.no }}</span>
              <span v-if="post.author_name" class="pr-author">{{
                t('lanshare.authorLine', { name: post.author_name })
              }}</span>
            </div>
            <div class="pr-tags" v-if="post.tags && post.tags.length">
              <span class="chip" v-for="tag in post.tags" :key="tag.id"># {{ tag.name }}</span>
            </div>
            <div class="card pr-fields" v-if="post.fields && post.fields.length">
              <div class="pr-ft">{{ t('lanshare.fieldsTitle') }}</div>
              <table class="tbl">
                <tbody>
                  <tr v-for="f in post.fields" :key="f.code">
                    <td class="pr-fc">
                      {{ f.name }} <code class="fcode">{{ f.code }}</code>
                    </td>
                    <td>
                      <a v-if="f.type === 'url' && f.value" :href="f.value" target="_blank" rel="noopener">{{
                        f.value
                      }}</a>
                      <b v-else>{{ f.value || '—' }}</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="card pr-body" v-html="safeHtml(post.content_html)"></div>
          </div>
        </template>
      </section>
    </div>

    <!-- 我的共享面板 -->
    <SharePanel v-if="showPanel" @close="onPanelClosed" @updated="onPanelUpdated" />

    <!-- 拷贝归属选择弹窗：确认后真正发起拷贝 -->
    <CopyTargetDialog
      v-if="copyTargetOpen"
      :post-title="post ? post.title : ''"
      :source-region-name="activeRegion.name || ''"
      :source-category-name="post ? post.cname || '' : ''"
      :busy="copying"
      @close="copyTargetOpen = false"
      @confirm="onCopyConfirm"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, toRaw } from 'vue';
import { A } from '../api';
import { toast, toastErr, friendlyErr, run, toastOk, okMsg } from '../feedback';
import { store, bus, findOpen, findClose } from '../store';
import Icon from '../components/Icon.vue';
import PostCard from '../components/PostCard.vue';
import ShareMenu from '../components/post/ShareMenu.vue';
import Pager from '../components/Pager.vue';
import SharePanel from '../components/SharePanel.vue';
import CopyTargetDialog from '../components/CopyTargetDialog.vue';
import { safeHtml } from '../utils/sanitize';
import { usePageSize } from '../composables/usePageSize';
import { usePolling } from '../composables/usePolling';
import { t } from '../i18n';

const showPanel = ref(false);
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
const booting = ref(true);
const discovering = ref(false);

/* 本机共享源：始终置顶，标注「本机」 */
const localSrc = reactive({
  key: 'self',
  name: t('lanshare.self'),
  ip: '127.0.0.1',
  port: 47373,
  token: '',
  self: true,
  open: true,
  loading: false,
  error: '',
  regions: [],
  // 认证相关态：needAuth = 需用户输入令牌（远端开启认证且本机无缓存）；
  // authInput 为用户正在输入的令牌；authErr 为错误提示；authFromCache 标记令牌来自本地缓存
  needAuth: false,
  authInput: '',
  authErr: '',
  authBusy: false,
  authFromCache: false,
  // 拷贝能力位：由 probeAllowCopy 探测。本机源同样探测（Beta.211 起本机也可拷贝），
  // 取自本机共享自己的 allowCopy 设置——开了拷贝按钮可用，没开则按钮置灰
  // （Beta.250 起不再在行尾另起一句文字提示；悬停 title 仍会说明原因）。
  allowCopy: false
});
const remotes = ref([]); // [{key,name,ip,port,token,self:false,open,loading,error,regions,allowCopy}]
const sources = computed(() => [localSrc, ...remotes.value]);

const sel = reactive({ key: '', regionId: null });
const posts = reactive({ list: [], total: 0 });
const post = ref(null);
const copying = ref(false); // 拷贝中（防重复提交）
const exporting = ref(false); // 导出中（防重复提交；两个导出按钮共用一个忙碌态）
const copyErr = ref(''); // 拷贝失败原因（就地展示，不完全依赖 toast）
const copyOk = ref(''); // 拷贝成功回执（含实际归属落点）
const copyTargetOpen = ref(false); // 归属选择弹窗是否打开
const q = ref('');
const page = ref(1);
const { pageSize, loadPageSize, applyPageSize } = usePageSize();
const totalPages = computed(() => Math.max(1, Math.ceil(posts.total / pageSize.value)));

const activeSource = computed(() => sources.value.find(s => s.key === sel.key) || localSrc);
const activeRegion = computed(() => (activeSource.value.regions || []).find(r => r.id === sel.regionId) || {});

async function loadStatus() {
  try {
    Object.assign(status, await A.lanStatus());
  } catch (e) {
    toastErr(friendlyErr(e, t('lanshare.loadStatusFailed')));
  }
}
/**
 * 加载本机源的大区。
 * 必须在 refresh() 之前 await —— refresh() 会遍历 sources（含本机源）调 loadRegions，
 * 若此时 status.token 还没回填，本机源会带着空令牌发请求、拿到 401，
 * 在界面上留下一个「请输入访问令牌」的输入框（本机源根本没有输入界面）。
 */
async function loadLocal() {
  // 本机共享源直接走 HTTP 回环（127.0.0.1），与远端源同一路径
  // 名称直接用主进程 getStatus 返回的 name（= 用户设置的或系统主机名 os.hostname() 兜底），
  // 不再用『本机』占位——保证未设置时显示的是系统本机名称，而非无意义的字面量
  localSrc.name = status.name;
  localSrc.port = status.port;
  localSrc.token = status.token;
  if (status.enabled) {
    await loadRegions(localSrc);
  } else {
    /* ★ Beta.168：关闭态必须把本机源清干净。
     * 原先只有一个 `if`、没有 else —— 从「开启 → 点过大区 → 关闭」的路径进来时，
     * localSrc.regions 会留着关闭前的大区列表，与模板里那句
     * 「尚未开启共享，点『我的共享』开启后此处显示共享大区」自相矛盾，
     * 而且这些残留的大区按钮仍可点击 → selectRegion → fetchPosts → 打已停服的端口。
     * 清理是【无条件】的：只回填 name/port/token 不够。 */
    localSrc.regions = [];
    localSrc.error = '';
    localSrc.loading = false;
    localSrc.needAuth = false;
  }
}
function apiUrl(s, path) {
  return `http://${s.ip}:${s.port}${path}`;
}

/* 访问令牌缓存：认证开启时远端不再随广播分发令牌，用户输一次后记住，避免每次重复输入。
   键按 ip:port 区分，持久化在主进程 userData/lan-tokens.json —— 打包版走 file://，
   localStorage 会被 Chromium 存储分区限制拒绝，之前的实现静默失败导致「记住令牌」从未生效。
   这里保留一份内存镜像 tokenCache，读多写少时不必每次往返 IPC。 */
const tokenCache = ref(null); // null = 尚未从主进程加载
let tokenCacheLoading = null; // 并发调用共享同一个加载 Promise
/** 旧版本 localStorage 键名，仅用于一次性迁移（见 ensureTokenCacheLoaded） */
const TOKEN_CACHE_KEY = 'lan.tokens';

async function ensureTokenCacheLoaded() {
  if (tokenCache.value) return tokenCache.value;
  if (!tokenCacheLoading) {
    tokenCacheLoading = (async () => {
      let m = {};
      try {
        m = (await A.lanGetTokenCache()) || {};
      } catch (e) {
        /* IPC 不可用时退化为「本次会话不记住」 */
      }
      // 一次性迁移：旧版本把令牌存在 localStorage，读出来并入主进程后清掉旧键。
      // file:// 下这次读取本身可能就抛异常，纯 try/catch 兜住即可（沿用既有兼容写法）。
      try {
        const legacy = JSON.parse(localStorage.getItem(TOKEN_CACHE_KEY) || '{}') || {};
        const keys = Object.keys(legacy);
        if (keys.length) {
          keys.forEach(k => {
            if (typeof legacy[k] === 'string' && legacy[k]) m[k] = legacy[k];
          });
          await A.lanSetTokenCache({ map: m }).catch(() => {});
        }
        localStorage.removeItem(TOKEN_CACHE_KEY);
      } catch (e) {
        /* 读不到或删不掉都无所谓，无非多留一个无害的旧键 */
      }
      tokenCache.value = m;
      return m;
    })();
    // 失败也要让下一次调用能重试，别把失败的 Promise 永久钉住
    tokenCacheLoading.catch(() => {
      tokenCacheLoading = null;
    });
  }
  return tokenCacheLoading;
}

async function loadCachedTokens() {
  return ensureTokenCacheLoaded();
}

/** 令牌校验通过后记住它（失败不抛，不阻断连接流程） */
async function cacheToken(s, tk) {
  if (!tk) return;
  const all = { ...(await ensureTokenCacheLoaded()) };
  all[`${s.ip}:${s.port}`] = tk;
  tokenCache.value = all;
  try {
    await A.lanSetTokenCache({ map: all });
  } catch (e) {
    /* 落盘失败不影响本次会话连接 */
  }
}

/** 令牌失效/对方重新生成后清掉该源的缓存，避免下次又拿着废令牌直接失败 */
async function clearCachedToken(s) {
  const all = { ...(await ensureTokenCacheLoaded()) };
  delete all[`${s.ip}:${s.port}`];
  tokenCache.value = all;
  try {
    await A.lanSetTokenCache({ map: all });
  } catch (e) {}
}

/**
 * 加载某共享源的大区列表。
 * @returns {Promise<boolean>} 是否成功（调用方据此决定要不要展开报错态）
 *
 * 认证开启时远端 token 为空 → 先查本地缓存；仍为空则置 needAuth 让用户输入，
 * 不发起请求（否则必然 401，日志里会留下一条无意义的失败访客记录）。
 */
async function loadRegions(s) {
  // 本机源始终用主进程下发的 token，不走缓存/输入流程
  if (!s.self) {
    if (!s.token) {
      const cached = (await loadCachedTokens())[`${s.ip}:${s.port}`];
      if (cached) {
        s.token = cached;
        s.authFromCache = true;
      }
    }
    if (!s.token) {
      s.needAuth = true;
      s.loading = false;
      s.error = '';
      s.regions = [];
      return false;
    }
  }
  s.loading = true;
  s.error = '';
  try {
    const [regs, stats] = await Promise.all([
      A.lanRequest({ url: apiUrl(s, '/api/regions'), token: s.token }),
      A.lanRequest({ url: apiUrl(s, '/api/stats'), token: s.token }).catch(() => [])
    ]);
    const m = {};
    (stats || []).forEach(x => {
      m[x.regionId] = x;
    });
    s.regions = (regs || []).map(r => ({ ...r, postCount: m[r.id] ? m[r.id].postCount : '' }));
    s.needAuth = false;
    s.authErr = '';
    // 连接成功才落盘缓存，避免把错误令牌记住导致下次直接失败
    if (!s.self) await cacheToken(s, s.token);
    return true;
  } catch (e) {
    // 本机源不该出现「请输入令牌」：它的令牌由主进程 getStatus 直接下发，没有输入界面。
    // 这条路径只在 loadLocal() 被 refresh() 抢跑（status.token 尚未回填）时才会走到，
    // 属于竞态，重试一次即可自愈；否则会留下一个用户永远填不对的输入框。
    if (s.self) {
      s.error = '';
      s.regions = [];
      return false;
    }
    // 区分 401 与网络不通：前者提示输入令牌，后者才是「无法连接」
    if (e && e.code === 'LAN_NEED_AUTH') {
      s.needAuth = true;
      s.authErr = s.authFromCache ? t('lanshare.tokenExpired') : t('lanshare.tokenWrong');
      await clearCachedToken(s);
      s.token = '';
      s.authFromCache = false;
    } else {
      s.error = t('lanshare.cannotConnect');
    }
    s.regions = [];
    return false;
  } finally {
    s.loading = false;
  }
}

/** 提交手工输入的访问令牌：先校验能否取到大区，成功才记住 */
async function submitAuth(s) {
  const tk = String(s.authInput || '').trim();
  if (!tk) {
    s.authErr = t('lanshare.tokenRequired');
    return;
  }
  s.authBusy = true;
  s.authErr = '';
  s.token = tk;
  s.authFromCache = false;
  const ok = await loadRegions(s);
  s.authBusy = false;
  if (ok) {
    s.authInput = '';
    s.open = true;
  } else if (!s.authErr) s.authErr = t('lanshare.tokenWrongOrOff');
}

async function refresh() {
  discovering.value = true;
  try {
    const r = await A.lanDiscover();
    // 排除本机自身信标：多网卡时本机会为每张网卡各发一次广播，只比 status.lanIp（第一张网卡）
    // 会漏掉其余网卡的自身信标，把它当成远端源重复显示。故比对整个 lanIps 列表。
    const myIps = new Set([...(status.lanIps || []), status.lanIp, '127.0.0.1'].filter(Boolean));
    const list = (r && r.sources ? r.sources : []).filter(s => !(s.port && s.port === status.port && myIps.has(s.ip)));
    const arr = list.map(s => ({
      key: `r-${s.ip}:${s.port}`,
      name: s.name || t('lanshare.unnamedSource'),
      ip: s.ip,
      port: s.port,
      token: s.token,
      self: false,
      open: true,
      loading: false,
      error: '',
      regions: [],
      needAuth: false,
      authInput: '',
      authErr: '',
      authBusy: false,
      authFromCache: false
    }));
    remotes.value = arr;
    await Promise.all(arr.map(s => loadRegions(s)));
  } catch (e) {
    toastErr(friendlyErr(e, t('lanshare.discoverFailed')));
    remotes.value = [];
  } finally {
    discovering.value = false;
  }
}

function toggle(s) {
  s.open = !s.open;
  // 展开时若还没拿到大区、也不是在等用户输令牌，则尝试加载（含读缓存令牌）
  if (s.open && !s.self && !s.regions.length && !s.loading && !s.needAuth) loadRegions(s);
}

let lastAuditKey = '';
/** 浏览他人：在远端源上选中大区/打开文档时，向本机写入运行日志 + 操作记录（本机自浏览不记录） */
async function auditBrowse(s, extra = {}) {
  if (s.self) return;
  const key = s.key + '|' + (extra.post != null ? 'post:' + extra.post : 'region:' + sel.regionId);
  if (key === lastAuditKey) return;
  lastAuditKey = key;
  try {
    await A.lanAudit({ host: s.name, ip: s.ip, region: activeRegion.value.name, post: extra.postTitle || '' });
  } catch (e) {}
}

async function selectRegion(s, r) {
  sel.key = s.key;
  sel.regionId = r.id;
  findClose(); // Beta.219：从详情切走时收尾页内查找（同 backToList 的理由）
  post.value = null;
  q.value = '';
  posts.list = [];
  posts.total = 0;
  page.value = 1;
  auditBrowse(s);
  await fetchPosts();
  startPostsPoll(); // 任务417：选中大区即开表（重启语义，不会叠加多个计时器）
}

/* ---- 文档列表拉取：#417 起兼作轮询执行体，故带两道防重叠保护 ---- */
let postsInflight = 0; // 在途拉取数：轮询据此让位手动操作
let postsFetchSeq = 0; // 请求序号：晚发起的请求结果优先，防止在途旧响应覆盖新结果

/**
 * 拉取当前大区的文档列表（分页 + 搜索条件取自页面当前态）。
 * @param {{silent?: boolean}} [opts] silent = 轮询静默模式：
 *   失败时不弹 toast、不清空列表（保留上次数据继续可浏览），
 *   且在已有拉取在途时直接让位返回——用户点击/翻页/搜索永远不被轮询挡住。
 */
async function fetchPosts(opts = {}) {
  const s = activeSource.value;
  if (!s || !sel.regionId) return;
  if (opts.silent && postsInflight > 0) return;
  const seq = ++postsFetchSeq;
  postsInflight++;
  try {
    const url = apiUrl(
      s,
      `/api/posts?regionId=${sel.regionId}&q=${encodeURIComponent(q.value)}&limit=${pageSize.value}&offset=${(page.value - 1) * pageSize.value}`
    );
    const r = await A.lanRequest({ url, token: s.token });
    if (seq !== postsFetchSeq) return; // 已有更新的请求发起，本次旧响应作废
    posts.list = r.list || [];
    posts.total = r.total || 0;
  } catch (e) {
    if (seq !== postsFetchSeq) return;
    if (opts.silent) return; // 轮询静默失败：保留上次数据，不弹 toast、不清空
    toastErr(friendlyErr(e, t('lanshare.fetchPostsFailed')));
    posts.list = [];
    posts.total = 0;
  } finally {
    postsInflight--;
  }
}

/**
 * 共享大区文档列表自动刷新（#417）。
 *
 * 为什么需要轮询：局域共享是「对方主机提供服务、本机定时来拉」的单向通道，
 * 对方新增/修改/删除文档后本机没有任何推送信号，只能定时拉取才能让列表跟上。
 *
 * 为什么静默：15s 一次的高频动作一旦失败就弹 toast，会把用户淹掉；
 * 失败时保留上次数据（列表仍可浏览），需要强校验时用户手点「搜索」或翻页即可
 * （手动路径不传 silent，照常弹错）。
 *
 * 启停边界（缺一不可）：
 *   - selectRegion 选中大区后开表；resetBrowse（对方关闭共享等）停表；
 *   - openPost 进文档详情停表（看的是单篇快照，列表已不在舞台上）；
 *   - backToList 回列表重新开表；组件卸载由 usePolling 统一收尾。
 */
async function pollPosts() {
  if (post.value) return; // 详情态不轮询（双保险：正常情况下计时器已停）
  await fetchPosts({ silent: true });
}
const { start: startPostsPoll, stop: stopPostsPoll } = usePolling(pollPosts, 15000);
function searchPosts() {
  page.value = 1;
  fetchPosts();
}
function goPage(p) {
  page.value = p;
  fetchPosts();
}
/**
 * 返回共享文档列表。Beta.219：退出详情视图时收尾页内查找——
 * 查找条若开着，findClose 会关条 + 撤掉正文中注入的 <mark> + 复位计数（幂等，没开也无副作用）。
 * 不收尾的后果：详情 DOM 被 v-if 卸载后 FindBar 仍悬空显示，且 findState.text 保留，
 * 下次 findOpen 会对着列表页重搜（0 命中）——体验缺陷，修在源头。
 * 注：跨页离开（goto 其它页面）由 nav.js 的 _clearFindOnNavigate 全局兜底，无需在此处理。
 */
function backToList() {
  findClose();
  post.value = null;
  startPostsPoll(); // 任务417：回列表重新开表（未选大区时 fetchPosts 自会空转返回）
}
async function openPost(id) {
  const s = activeSource.value;
  if (!s) return;
  copying.value = false;
  copyErr.value = '';
  copyOk.value = '';
  copyTargetOpen.value = false;
  try {
    const p = await A.lanRequest({ url: apiUrl(s, `/api/post/${id}`), token: s.token });
    if (!p) {
      toastErr(t('lanshare.postGone'));
      return;
    }
    post.value = p;
    stopPostsPoll(); // 任务417：进详情停表（看单篇快照，列表已不在舞台上）
    auditBrowse(s, { post: id, postTitle: p.title });
    probeAllowCopy(s);
  } catch (e) {
    toastErr(friendlyErr(e, t('lanshare.fetchPostFailed')));
  }
}

/**
 * 探测源主机是否开放「文档拷贝」能力。
 *
 * /api/version 是刻意免鉴权的能力探针（只回版本与能力位，不含任何文档数据），
 * 因此这里不需要令牌即可提前知道按钮该不该亮——避免用户点下去才被 403 拒绝。
 *
 * ★ 本机源不走 HTTP，直接用主进程下发的状态 ★
 *   本机共享的能力位就在 status.allowCopy 里（lan:getStatus 已下发），
 *   再打一次回环 HTTP 纯属多余，还会平白引入「服务未就绪 / 端口未回填」的竞态。
 *   本机源的真相来源是本机设置本身，直读即可。
 *
 * ★ 远端源探测失败一律按「不开放」处理（保守优先）★
 *   网络抖动、对方是旧版本无此字段、或对方返回结构不符，都归到保守分支：
 *   宁可少亮一个按钮，也不能让用户点下去才被 403 拒绝。
 */
async function probeAllowCopy(s) {
  if (s.self) {
    s.allowCopy = !!status.allowCopy;
    return;
  }
  s.allowCopy = false;
  try {
    const v = await A.lanRequest({ url: `http://${s.ip}:${s.port}/api/version`, token: '' });
    s.allowCopy = !!(v && v.allowCopy);
  } catch (e) {
    s.allowCopy = false;
  }
}

/** 点击「拷贝到本机」：先弹归属选择，确认后再真正发起拷贝 */
function askCopy() {
  if (copying.value) return;
  if (!post.value) return;
  copyErr.value = '';
  copyOk.value = '';
  copyTargetOpen.value = true;
}

/**
 * 导出共享文档（Beta.243）。
 *
 * 走独立通道 share:exportDoc 而非本机的 post:exportMd / post:exportPdf：
 * 共享文档只存在于**对方机器**的共享库里，本机 db.getPost(id) 查不到，
 * 把 id 塞进本机导出通道只会得到「文档不存在」。
 * 所以直接把页面已经取回的详情载荷交给主进程生成文档。
 */
async function exportShared(kind) {
  if (exporting.value) return;
  if (!post.value) return;
  exporting.value = true;
  try {
    // ★ 必须先把 post.value 转成「纯对象」再跨 IPC：
    //   post 是 ref()，post.value 是 Vue 的响应式 Proxy，其内部字段同样被代理。
    //   contextBridge/IPC 走 structuredClone，**无法克隆 Proxy**，直接传会抛
    //   「An object could not be cloned.」——用户截图里的那条报错就是这个。
    //   本机那两条通道只传 { id: number } 这种原始值，所以从未暴露此问题；
    //   只有共享导出要传整个详情对象，才踩到。
    //   转法：先 toRaw 脱掉外层代理，再 JSON 深拷贝，顺带把嵌套的代理与原型一起抹平，
    //   保证主进程收到的是一个能安全结构化克隆的普通对象。
    const plain = toRaw(post.value);
    const payload = JSON.parse(JSON.stringify(plain));
    await run(() => A.shareExportDoc({ post: payload, kind }), {
      then: p => {
        if (p) toastOk(okMsg.exported(p));
      }
    });
  } finally {
    exporting.value = false;
  }
}

/**
 * 真正执行拷贝（由归属弹窗 confirm 触发）。
 * @param {{mode:'new'|'existing'|'follow', regionName?, categoryName?, regionId?, categoryId?}} target
 *
 * ★ Beta.214：try 只包「真会失败的那一步」，成功后的一切都放在 try 之外 ★
 *   此前 try 覆盖了「调 IPC」到「弹 toast」到最后一行，结果：
 *   toast 这个**纯通知**动作一旦抛错（本项目实际发生过——`toast` 漏了 import，
 *   抛 `ReferenceError: toast is not defined`），就会被下面的 catch 当成「拷贝失败」，
 *   于是 copyOk 已写入成功回执、copyErr 又被写成「拷贝失败」，
 *   界面同时显示红绿两行，用户看到的正是「提示拷贝失败，实则成功」。
 *   把一个纯展示层的异常误判成业务失败，是 try 范围过宽导致的典型缺陷。
 *   现在：只有 A.lanCopyPost 一个 await 在 try 内，它的失败才是真失败；
 *   回执、toast、刷新通知都是「成功之后的副作用」，任何异常都不该改写业务结论。
 */
async function copyCurrent(target) {
  const s = activeSource.value;
  if (!s || !post.value) return;
  if (copying.value) return;
  copying.value = true;
  copyErr.value = '';
  copyOk.value = '';
  let r;
  try {
    r = await A.lanCopyPost({
      source: { name: s.name, ip: s.ip, port: s.port, token: s.token },
      remotePostId: post.value.id,
      target
    });
  } catch (e) {
    // 只有这里才是真正的拷贝失败
    const msg = friendlyErr(e, t('lanshare.copyFailed'));
    copyErr.value = msg;
    toastErr(msg);
    copying.value = false;
    // 失败时保留弹窗，让用户能改归属重试（而不是关掉重来一遍）
    return;
  }
  copying.value = false;

  /* ---- 以下均为「已成功」之后的收尾动作，各自兜错，绝不影响成功结论 ---- */
  // 归属回执：把实际落点念回给用户，确认选项真的生效（而不是静默落到别处）
  const where =
    r && r.regionName
      ? t('lanshare.whereRegion', { region: r.regionName, category: r.categoryName ? ' / ' + r.categoryName : '' })
      : t('lanshare.localLibrary');
  copyOk.value = t('lanshare.copiedTo', { where });
  copyTargetOpen.value = false;
  try {
    toast(
      t('lanshare.copyToast', {
        title: (r && r.title) || '',
        where: r && r.regionName ? ` → ${where}` : '',
        unreported: r && !r.reported ? t('lanshare.notReported') : ''
      })
    );
  } catch (e) {
    /* 轻提示失败不影响拷贝结果 */
  }
  // 拷贝结果落在本机主库，通知全局刷新（文档列表/统计会随之更新）。
  // ★ 事件名用 'refresh'：data:changed 全项目无人订阅，发出去是空操作（Beta.214 修正）。
  try {
    bus.emit('refresh');
  } catch (e) {
    /* 刷新通知失败不影响拷贝结果 */
  }
}

function onCopyConfirm(target) {
  copyCurrent(target);
}

/**
 * 复位右侧浏览态：清掉「当前选中哪个源/大区/文档」以及分页与搜索条件。
 *
 * ★ Beta.168：关闭共享后必须调用。
 * 原先关闭面板只做 loadStatus + loadLocal，`sel.regionId` 仍是关闭前的旧值。
 * 而 fetchPosts 的触发点里，searchPosts / goPage / onExtPageSize 都【不检查】
 * regionId 是否还有效 —— 只要列表区还在（v-if="sel.regionId"），用户点一下分页
 * 或改一下每页条数，就会继续向已经停掉的 127.0.0.1 端口发请求，
 * 于是弹出「拉取文档失败：fetch failed」。
 * 清干净之后，列表区自然收起，也就不会再发出这类无效请求。
 */
function resetBrowse() {
  sel.key = '';
  sel.regionId = null;
  posts.list = [];
  posts.total = 0;
  findClose(); // Beta.219：详情视图可能被此处卸载，收尾页内查找（幂等）
  stopPostsPoll(); // 任务417：浏览态复位（对方关闭共享等），停表
  post.value = null;
  q.value = '';
  page.value = 1;
}

onMounted(async () => {
  if (!store.settings) {
    try {
      store.settings = await A.settingsAll();
    } catch (e) {}
  }
  pageSize.value = loadPageSize();
  // 订阅设置页「每页显示条数」变更，与其他文档列表页保持一致
  bus.on('display:pageSize', onExtPageSize);
  await loadStatus();
  await loadLocal();
  await refresh();
  booting.value = false;
});
onBeforeUnmount(() => {
  bus.off('display:pageSize', onExtPageSize);
});

/**
 * 面板关闭/更新后的刷新。
 * 必须 await 完 loadStatus → loadLocal 再 refresh：三者有顺序依赖（见 loadLocal 注释），
 * 原先写成模板里用 `;` 串起来的裸调用，既不能被 await，顺序也无人保证。
 *
 * ★ Beta.168：关闭后要比对「共享是否真的从开变关」，从关变关时才复位浏览态。
 * 用户可能只是点开面板看一眼又关掉，共享一直开着 —— 那种情况不该把正在看的文档清掉。
 */
async function onPanelClosed() {
  showPanel.value = false;
  await loadStatus();
  await loadLocal();
  // 关闭态下本机不再是可用共享源，浏览态一律复位。
  // （共享一直开着的情况不走这里 —— 用户只是点开面板看一眼又关掉，
  //   不该把他正在看的文档清掉。）
  if (!status.enabled) resetBrowse();
}
async function onPanelUpdated() {
  await loadStatus();
  await loadLocal();
  await refresh();
}

function onExtPageSize(v) {
  applyPageSize(v);
  page.value = 1;
  fetchPosts();
}
</script>

<style scoped>
/* 不在此处使用独立滚动容器：交给 .main 滚动，复用全局「返回顶部」按钮，与其他文档列表页一致 */
/* 列表统计行：位于右列内，与 .grid 共用同一条左基线，故左右外边距归零。
 * 此前 `margin: 14px 2px` 的 2px 会让本行相对右列内容右偏 2px。 */
.list-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 14px 0;
  font-size: 12.5px;
  color: var(--text-2);
  flex-wrap: wrap;
  gap: 8px;
}
.list-meta b {
  color: var(--text);
}
/* 重新发现按钮：加载态文案改为「正在发现」(与「重新发现」同为 4 字)，宽度自然一致，无需固定宽度 */
.ls-refresh {
  justify-content: center;
}
.ls-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0;
  flex-wrap: wrap;
}
.ls-toolbar.sub {
  margin: 0 0 14px;
}
.ls-hint {
  font-size: 12.5px;
  color: var(--text-3);
}
.ls-hint.dim {
  margin-left: auto;
}
.spin {
  animation: ls-spin 1s linear infinite;
}
@keyframes ls-spin {
  to {
    transform: rotate(360deg);
  }
}

.ls-body {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.ls-rail {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px;
  background: var(--surface);
  position: sticky;
  top: 0;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
}
.ls-rail-title {
  font-size: 11px;
  color: var(--text-3);
  padding: 4px 6px 8px;
  letter-spacing: 0.04em;
}
.src-group {
  border-radius: var(--radius-sm);
  margin-bottom: 4px;
}
.src-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 8px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text);
  text-align: left;
}
.src-head:hover {
  background: var(--btn-ghost-hover);
}
.src-head.open {
  background: var(--surface-2);
}
.caret {
  color: var(--text-3);
  transition: transform 0.12s;
  flex: none;
}
.src-head.open .caret {
  transform: rotate(90deg);
}
.src-badge {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 20px;
  font-weight: 600;
  flex: none;
}
.src-badge.self {
  background: var(--c-green-weak);
  color: var(--c-green);
}
.src-badge.remote {
  background: var(--surface-3);
  color: var(--text-2);
}
.src-name {
  font-weight: 600;
  font-size: 13.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.src-addr {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  flex: none;
}

.src-regions {
  padding: 2px 0 6px 14px;
}
.src-region {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text);
  text-align: left;
}
.src-region:hover {
  background: var(--btn-ghost-hover);
}
.src-region.active {
  background: var(--accent-weak);
  color: var(--accent);
  font-weight: 600;
}
.sr-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sr-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  background: var(--surface-2);
  border-radius: 10px;
  padding: 0 8px;
}
.src-region.active .sr-count {
  color: var(--accent);
  background: var(--surface);
}
.b-empty {
  padding: 8px 10px;
  font-size: 12px;
} /* 灰字来自 .empty-row */
.b-empty.err {
  color: var(--danger);
}

/* 访问令牌输入区（远端开启认证且本机无缓存时展示） */
.src-auth {
  padding: 6px 8px 8px;
}
.src-auth-tip {
  font-size: 11.5px;
  color: var(--text-3);
  margin: 0 0 6px;
  line-height: 1.5;
}
.src-auth-row {
  display: flex;
  gap: 6px;
}
.src-auth-input {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  padding: 5px 8px;
}
.src-auth-err {
  font-size: 11.5px;
  color: var(--danger);
  margin: 6px 0 0;
}

.src-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 3px 12px;
}
.src-pill.ro {
  color: var(--c-green);
  border-color: var(--c-green-weak);
}
.ls-main {
  min-width: 0;
}
.b-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-3);
}

.post-read {
  max-width: 880px;
}
.pr-title {
  font-size: 19px;
  margin: 6px 0 10px;
}
/* 详情操作条：返回列表 → 搜索 → 分享 → 拷贝到本机（整排靠左）
 * Beta.249：顺序按用户要求调整为「返回列表在最左」，整排不再需要竖线分组，
 *   故 .pr-sep 的样式一并移除（结构里已无该节点，留着就是死代码）。
 * Beta.250：行尾那句「该共享源未开放拷贝」提示按用户要求去掉，
 *   连同 .pr-hint 的 margin-left:auto / font-size 两条规则一起删。
 *   「能否拷贝」改由拷贝按钮自身的禁用态表达（.btn-copy:disabled 已有灰化样式），
 *   悬停 title 也仍会说明原因 —— 不再需要一行常驻文字占位。 */
.pr-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* ★ Beta.259：拷贝按钮不再用主题色（--accent）描边。
 *
 * 【报障】「局域共享文档页按钮颜色不统一」—— 返回列表 / 页内查找 / 分享 /
 *   拷贝到本机 四个按钮并排，前三个是标准 .btn（--border 描边 + --text 图标），
 *   唯独拷贝按钮被 .btn-copy 覆盖成 --accent 描边 + --accent 图标。
 *   在 bamboo 等主题下 --border 是浅绿、--accent 是深森绿，四个同形制的方块按钮
 *   里三个浅描边、一个深描边，看上去就是"颜色不统一"。
 *
 * 【为什么撤掉而不是反过来把其他三个也改成 accent】
 *   --accent 是主题强调色，它的语义是"这一步有分量"（保存、提交、删除确认）。
 *   把一排只读/导航按钮全刷成强调色，等于稀释强调色本身；而且本机详情页
 *   （PostView）页头同样是 .btn-icon 排，局域共享页与其不一致会变成新的不统一。
 *   ⇒ 取"少数服从多数"：这一排统一走标准 .btn 外观。
 *
 * 【"这是唯一写操作"的提示没有丢】
 *   改由三处承担：① title/aria-label（悬停与读屏都说明"拷贝到本机"）；
 *   ② :disabled 灰化 —— 不可拷贝时按钮明显变淡（共享源未开放时走这条）；
 *   ③ .pr-ok / .pr-err 回执文案（拷贝成功绿、失败红）。
 *   真正需要警惕的是"误以为点了只是看看"，而这由确认弹窗（askCopy）承担。
 *   另：本页无删除/保存类破坏性操作，故不需要 .btn-danger 那样的红色警示。
 *
 * 保留 .btn-copy 这个类名（而非删掉）：它承载 :disabled 态的灰化规则，
 *   且后续若要恢复区分（例如改成 hover 才显色），有钩子可循。 */
.btn.btn-copy:disabled {
  color: var(--text-3);
  border-color: var(--border);
}
.pr-err {
  color: var(--danger);
  font-size: 12px;
  margin: 6px 0 0;
}
/* 拷贝成功回执：用主题绿，与 .pr-err 的红形成明确对错区分 */
.pr-ok {
  color: var(--ok);
  font-size: 12px;
  margin: 6px 0 0;
}
.pr-author {
  color: var(--text-3);
}
.pr-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--text-2);
  font-size: 13px;
}
.pr-meta .sep {
  color: var(--text-3);
}
/* 文档编号：字号继承 .pr-meta（13px），与列表卡片 PostCard 的 .pc-no 同一口径。
 * 此前单独写 11px，比同行小两号，基线明显偏低、没与同行对齐。 */
.pr-no {
  font-family: var(--font-mono);
  font-size: inherit;
  color: var(--accent);
}
.pr-tags {
  margin: 10px 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pr-fields {
  padding: 6px 18px 14px;
  margin-top: 6px;
}
.pr-ft {
  font-size: 13px;
  font-weight: 600;
  margin: 8px 0 10px;
  color: var(--text-2);
}
.pr-body {
  padding: 16px 18px;
  margin-top: 14px;
}
/* 浏览页色块比默认略大一档；基础形制见 components.css */
.region-dot {
  --dot: 11px;
}
</style>
