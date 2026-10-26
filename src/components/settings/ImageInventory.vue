<template>
  <!--
    图片文件（Beta.322 数据清洗栏下的新板块；Beta.324 起独立成卡、显示缩略图）。

    【为什么独立在数据清洗之下，而不是嵌在清洗卡片里】
      Beta.322 曾把它内嵌在「数据清洗」卡片内部。用户明确要求「图片文件应独立在
      数据清洗板块之下」：清单是「看」，清洗是「删」，两件事各一张卡，视线才不被
      一层套一层的边框切碎。拆分同时消掉了「卡片套卡片」——Beta.323「没做好间隔」
      事故的同一根因（见 settings-card-gap.test.mjs）。

    【缩略图：为什么敢显示了，以及边界在哪】
      Beta.322 不敢显示缩略图，怕的是「几百张原图一起渲染把页面拖死」。
      现在的组合让这个代价消失，三件事各管一段：
        1. 懒加载 —— IntersectionObserver 只取滚动区里可见（±120px）的行，
           翻页/筛选后重新观察；图库上千张也不会一次性全解码。
        2. 渲染层缩放 —— 原图经 createImageBitmap + canvas 缩到 ≤88px 才进 <img>。
           浏览器按原图像素解码，4K 图一张就是 33MB 位图；不缩的话七八行同屏
           就是两三百 MB（见 utils/thumbImage.js 的实测推演）。
        3. 串行解码 —— 加载排队执行，同时只有一张原图在内存里被完整解码。
      原图本身不缓存：点缩略图看大图时按 id 重取（cleanup:imageData），
      本地 SQLite + IPC 只要几十毫秒，换「内存有界」是值得的。

    【为什么缩略图本身就是「查看」入口】
      用户原话「点击缩略图展开大图，去掉现有查看原图按钮」——既已有点击目标，
      再在每行右侧挂一个放大镜按钮就是重复入口。整行右侧只保留引用跳转。

    【为什么必须自己带滚动条】
      图库动辄上百张。整页被撑长会把上面「数据清洗」的按钮顶出视野，
      用户滚到底才想起要清理 —— 所以要一个固定高度的滚动区 + 分页。
  -->
  <div class="card sec img-inv">
    <h3>
      {{ t('settings.imgInvTitle') }}
      <span class="badge">{{ t('settings.imgInvBadge') }}</span>
    </h3>
    <p class="dim">{{ t('settings.imgInvDesc') }}</p>

    <!-- 汇总条：全库口径（不受筛选影响），四个数字一眼看清 -->
    <div class="ii-sum">
      <span class="ii-sum-item">
        <b>{{ summary.total }}</b>
        <span class="dim">{{ t('settings.imgInvSumTotal') }}</span>
      </span>
      <span class="ii-sep"></span>
      <span class="ii-sum-item">
        <b>{{ formatBytes(summary.totalBytes) }}</b>
        <span class="dim">{{ t('settings.imgInvSumBytes') }}</span>
      </span>
      <span class="ii-sep"></span>
      <span class="ii-sum-item">
        <b :class="{ warn: summary.unused > 0 }">{{ summary.unused }}</b>
        <span class="dim">{{ t('settings.imgInvSumUnused') }}</span>
      </span>
      <span class="ii-sep"></span>
      <span class="ii-sum-item">
        <b class="dim">{{ formatBytes(summary.unusedBytes) }}</b>
        <span class="dim">{{ t('settings.imgInvSumUnusedBytes') }}</span>
      </span>
    </div>

    <!-- 工具条：搜索 + 只看无引用 + 刷新 -->
    <div class="ii-tools">
      <input class="input ii-q" v-model="q" :placeholder="t('settings.imgInvSearchPh')" @keyup.enter="reload(1)" />
      <label class="ii-only">
        <input type="checkbox" v-model="onlyUnused" @change="reload(1)" />
        <span>{{ t('settings.imgInvOnlyUnused') }}</span>
      </label>
      <span class="ii-grow"></span>
      <RefreshButton :busy="loading" @click="reload(page)" />
    </div>

    <!-- 滚动区：固定高度 + 内部滚动，保证上面的清洗按钮永远可见 -->
    <div class="ii-scroll" ref="scrollRef">
      <table class="tbl ii-tbl">
        <thead>
          <tr>
            <th class="ii-c-thumb">{{ t('settings.imgInvColThumb') }}</th>
            <th class="ii-c-no">{{ t('settings.imgInvColNo') }}</th>
            <th class="ii-c-type">{{ t('settings.imgInvColType') }}</th>
            <th class="ii-c-size">{{ t('settings.imgInvColSize') }}</th>
            <th class="ii-c-time">{{ t('settings.imgInvColTime') }}</th>
            <th class="ii-c-ref">{{ t('settings.imgInvColRefs') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && !rows.length">
            <td colspan="6" class="ii-empty">{{ t('settings.imgInvLoading') }}</td>
          </tr>
          <tr v-else-if="!rows.length">
            <td colspan="6" class="ii-empty">
              {{ q || onlyUnused ? t('settings.imgInvNoMatch') : t('settings.imgInvEmpty') }}
            </td>
          </tr>
          <tr v-for="r in rows" :key="r.id" :class="{ 'ii-unused': !r.postCount }">
            <td class="ii-c-thumb">
              <!-- 缩略图即查看入口：点了就展开大图。加载中/失败都退回扩展名占位，
                   不显示裂图；aria-label + title 是纯图标按钮的唯一可读线索。 -->
              <button
                class="ii-thumb"
                :class="{
                  'ii-thumb-loading': thumbState[r.id] === 'loading',
                  'ii-thumb-err': thumbState[r.id] === 'err',
                  'ii-thumb-busy': viewingId === r.id
                }"
                :data-id="r.id"
                :title="t('settings.imgInvView')"
                :aria-label="t('settings.imgInvView')"
                @click="viewImage(r)"
              >
                <img v-if="thumbs[r.id]" :src="thumbs[r.id]" alt="" draggable="false" />
                <span v-else class="ii-thumb-ph">{{ r.ext }}</span>
              </button>
            </td>
            <td class="ii-c-no">
              <code class="ii-no">{{ r.no }}</code>
            </td>
            <td class="ii-c-type">
              <span class="ii-ext">{{ r.ext }}</span>
              <span class="dim ii-mime">{{ r.mime }}</span>
            </td>
            <td class="ii-c-size">{{ formatBytes(r.bytes) }}</td>
            <td class="ii-c-time">{{ withTz(r.created_at) }}</td>
            <td class="ii-c-ref">
              <!-- 没有任何引用 = 可以被清理，用醒目标记，但不说「已删除」 -->
              <span v-if="!r.postCount" class="ii-tag ii-tag-unused">{{ t('settings.imgInvUnused') }}</span>
              <template v-else>
                <span class="ii-tag" :class="{ 'ii-tag-hist': !r.usedInBody }">
                  {{ r.usedInBody ? t('settings.imgInvUsedBody') : t('settings.imgInvUsedHist') }}
                </span>
                <span class="ii-refs">
                  <!-- 引用到具体文档：可点开查看，用户要判断「这张图我还要不要」就得看到是谁在用 -->
                  <button
                    v-for="ref in r.refs"
                    :key="ref.postId"
                    class="ii-ref"
                    :title="refTitle(ref)"
                    @click="openPost(ref.postId)"
                  >
                    {{ ref.title || t('settings.imgInvUntitled') }}
                    <!-- 仅历史版本引用时才标版本号：正文在用的那条不该拖一串 v1,v2，看不出来重点 -->
                    <i v-if="!ref.inBody && ref.versionNos.length" class="ii-vn">v{{ ref.versionNos.join(',v') }}</i>
                  </button>
                  <span v-if="r.postCount > r.refs.length" class="dim ii-more">
                    {{ t('settings.imgInvMore', { n: r.postCount - r.refs.length }) }}
                  </span>
                </span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 分页：与全站列表同一个 Pager 组件（ui-theme-rules 第 6 节） -->
    <Pager :page="page" :pages="pages" @navigate="reload" />
    <div class="ii-count dim" v-if="total">
      {{ t('settings.imgInvCount', { total, page, pages }) }}
    </div>

    <!-- 原图预览：复用看图器（与正文点图同一套交互：适应窗口 / 原尺寸 / 滚轮缩放） -->
    <ImageLightbox v-if="viewer" :src="viewer.src" :alt="viewer.alt" @close="viewer = null" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, nextTick } from 'vue';
import Pager from '../Pager.vue';
import RefreshButton from '../RefreshButton.vue';
import ImageLightbox from '../post/ImageLightbox.vue';
import { t } from '../../i18n';
import { A } from '../../api';
import { goto } from '../../store';
import { toastErr } from '../../feedback';
/* 字节格式化与时间格式化都走单一来源：utils/timefmt.js。
   （历史上 Home 的 StatCards、版本历史都从这里取，不各写一份 KB/MB 换算） */
import { formatBytes, withTz } from '../../utils/timefmt';
import { makeThumbSrc } from '../../utils/thumbImage';
const q = ref('');
const onlyUnused = ref(false);
const loading = ref(false);
const page = ref(1);
const pages = ref(1);
const total = ref(0);
const rows = ref([]);
const summary = reactive({ total: 0, totalBytes: 0, unused: 0, unusedBytes: 0 });
const viewer = ref(null);

/* ---- 缩略图：懒加载 + 串行解码 ---- */
const scrollRef = ref(null);
/** id → 小图 data URI。跨页保留：翻回来看过的页不重新取（每张仅几十 KB） */
const thumbs = reactive({});
/** id → 'loading' | 'ok' | 'err'。失败不重试：反复打 IPC 救不回一张坏图，占位就够 */
const thumbState = reactive({});
/** 正在「点缩略图看大图」的行：给按钮一个等待态，避免连点打出多个浮层 */
const viewingId = ref(null);
let io = null;
/** 缩略图加载队列：同时只有一张原图在内存里被完整解码（见文件头「三件事各管一段」） */
let thumbQueue = Promise.resolve();

/** 拉取一页清单。筛选条件变化时由调用方传 page=1 回到第一页 */
async function reload(p = 1) {
  loading.value = true;
  try {
    const r = await A.cleanupImageList({
      page: p,
      size: 20,
      q: q.value,
      only: onlyUnused.value ? 'unused' : 'all'
    });
    rows.value = r.rows || [];
    page.value = r.page || 1;
    pages.value = r.pages || 1;
    total.value = r.total || 0;
    Object.assign(summary, r.summary || {});
    // 新一行的 DOM 出来了才能观察：等下一个 tick
    nextTick(observeThumbs);
  } catch (e) {
    toastErr(e);
  } finally {
    loading.value = false;
  }
}

/**
 * 引用项悬停提示：正文引用与「仅某几版历史引用」要说清楚。
 * 判据是这条引用自己的 inBody（后端按文档记录的），不是整行的 usedInBody ——
 * 一张图可能被 A 篇正文用到、同时在 B 篇的历史版本里，两者不能混成一句话。
 */
function refTitle(ref) {
  if (ref.inBody) return t('settings.imgInvRefBodyTip');
  return t('settings.imgInvRefHistTip', { v: (ref.versionNos || []).join(', ') });
}

/**
 * 跳到引用它的文档。
 * ★ 直接调 goto，不自造事件 ★ goto（store/modules/nav.js）是所有导航的唯一出口，
 *   离开前守卫、历史栈、方向键快捷键都挂在它身上。用 CustomEvent 自建一条旁路，
 *   就等于绕开守卫：当前文档有未保存修改时会被无声丢掉。
 */
function openPost(postId) {
  goto('post', { id: postId });
}

/* ---- 缩略图懒加载 ---- */

/**
 * 观察当前可见行的缩略图按钮，进入视口才加载。
 * 翻页/筛选后重新调用：旧观察目标已随 DOM 卸载，disconnect 再建最稳。
 * 环境没有 IntersectionObserver（或没有滚动容器）时退化为整页加载 ——
 * 功能不残缺，只是没了「按需」。
 */
function observeThumbs() {
  if (io) {
    io.disconnect();
    io = null;
  }
  const root = scrollRef.value;
  if (!root) return;
  const targets = root.querySelectorAll('.ii-thumb');
  if (typeof IntersectionObserver !== 'function') {
    targets.forEach(el => {
      const r = rows.value.find(x => x.id === Number(el.dataset.id));
      if (r) ensureThumb(r);
    });
    return;
  }
  io = new IntersectionObserver(
    entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target); // 每行只触发一次：状态机（loading/ok/err）会挡住重复加载
        const r = rows.value.find(x => x.id === Number(e.target.dataset.id));
        if (r) ensureThumb(r);
      }
    },
    // root 必须是滚动容器本身：整页视口下「可见」会把 20 行全算上，懒加载就白做了
    { root, rootMargin: '120px 0px' }
  );
  targets.forEach(el => io.observe(el));
}

/** 排队加载一张缩略图（跳过已有状态的：加载中 / 已成功 / 已失败） */
function ensureThumb(r) {
  if (thumbState[r.id]) return;
  thumbState[r.id] = 'loading';
  thumbQueue = thumbQueue
    .then(() => loadThumb(r))
    .catch(() => {})
    .then(() => {});
}

async function loadThumb(r) {
  try {
    const d = await A.cleanupImageData({ id: r.id });
    if (!d || !d.src) {
      thumbState[r.id] = 'err';
      return;
    }
    const src = await makeThumbSrc(d.src);
    if (src) {
      thumbs[r.id] = src;
      thumbState[r.id] = 'ok';
    } else {
      thumbState[r.id] = 'err';
    }
  } catch (e) {
    thumbState[r.id] = 'err';
  }
}

/**
 * 点缩略图展开大图：按 id 重取原图（不缓存原图，理由见文件头），
 * 成功后进复用看图器。取图期间给按钮等待态，挡住连点。
 */
async function viewImage(r) {
  if (viewingId.value) return;
  viewingId.value = r.id;
  try {
    const d = await A.cleanupImageData({ id: r.id });
    if (!d || !d.src) {
      toastErr(t('settings.imgInvGone'));
      return;
    }
    viewer.value = { src: d.src, alt: r.no };
  } catch (e) {
    toastErr(e);
  } finally {
    viewingId.value = null;
  }
}

onMounted(() => reload(1));
onBeforeUnmount(() => {
  if (io) io.disconnect();
  io = null;
});

/* 供父组件在「清理无用图片」之后刷新清单：清完图库就变了，数字必须跟着变 */
defineExpose({ reload });
</script>

<style scoped>
.ii-sum {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 12px;
}
.ii-sum-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.ii-sum-item b {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.ii-sum-item b.warn {
  color: var(--warn);
}
.ii-sep {
  width: 1px;
  height: 16px;
  background: var(--border);
}
.ii-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0 8px;
}
.ii-q {
  width: 200px;
  box-sizing: border-box;
}
.ii-only {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-2);
  cursor: pointer;
  white-space: nowrap;
}
.ii-grow {
  flex: 1;
}
/* ★ 用户明确要求「加滚条」★ 固定高度 + 内部滚动：
   图库上百张时，整页拉长会把上面的清洗按钮顶出视野。 */
.ii-scroll {
  max-height: 360px;
  overflow-y: auto;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.ii-tbl {
  margin: 0;
}
.ii-tbl thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface-2);
  box-shadow: inset 0 -1px 0 var(--border);
}
.ii-tbl td {
  vertical-align: top;
  padding-top: 9px;
  padding-bottom: 9px;
}
/* 缩略图列：44px 见方与行内其它单元格纵向居中对齐 */
.ii-c-thumb {
  width: 60px;
}
.ii-c-no {
  width: 96px;
}
.ii-c-type {
  width: 132px;
}
.ii-c-size {
  width: 90px;
  font-variant-numeric: tabular-nums;
}
.ii-c-time {
  width: 168px;
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
  white-space: nowrap;
}
.ii-c-ref {
  min-width: 220px;
}
.ii-no {
  font-size: 12px;
  color: var(--text-2);
}
.ii-ext {
  display: inline-block;
  min-width: 34px;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 11.5px;
  text-align: center;
  text-transform: uppercase;
}
.ii-mime {
  display: none;
}
.ii-tag {
  display: inline-block;
  margin-right: 6px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11.5px;
  background: var(--accent-weak);
  color: var(--accent);
  vertical-align: middle;
}
.ii-tag-hist {
  background: var(--surface-2);
  color: var(--text-2);
  border: 1px solid var(--border);
}
.ii-tag-unused {
  background: transparent;
  color: var(--warn);
  border: 1px dashed var(--warn);
}
.ii-refs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
  vertical-align: middle;
}
/* 引用文档按钮：长得像链接，因为它就是「跳过去看」的入口 */
.ii-ref {
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ii-ref:hover {
  color: var(--accent-hover);
}
.ii-vn {
  font-style: normal;
  color: var(--text-3);
  margin-left: 2px;
}
.ii-more {
  font-size: 12px;
}
.ii-empty {
  text-align: center;
  padding: 28px 0;
  color: var(--text-3);
  font-size: 12.5px;
}
/* 无引用的行整行淡化，扫一眼就能找到可清理的 */
.ii-unused td {
  background: color-mix(in srgb, var(--warn) 4%, transparent);
}
.ii-count {
  margin-top: 6px;
  font-size: 12px;
  text-align: center;
}

/* ---- 缩略图按钮（Beta.324）---- */
.ii-thumb {
  display: block;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  overflow: hidden;
  cursor: zoom-in; /* 「点了会变大」的通行手势 */
  transition: border-color 0.15s ease;
}
.ii-thumb:hover {
  border-color: var(--accent);
}
.ii-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover; /* 方格里裁切展示，与资源管理器缩略图一致 */
  -webkit-user-drag: none;
}
/* 加载中 / 取图失败时的占位：显示扩展名，不让格子空着；
   加载中用呼吸动画给出「在动」的反馈（全站交互必带动效的约定）。 */
.ii-thumb-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 11px;
  color: var(--text-3);
  text-transform: uppercase;
  user-select: none;
}
.ii-thumb-loading .ii-thumb-ph {
  animation: ii-thumb-breathe 1.2s ease-in-out infinite;
}
@keyframes ii-thumb-breathe {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}
.ii-thumb-err .ii-thumb-ph {
  color: var(--warn);
}
/* 点缩略图取原图的等待态：整格淡化，表示「这一步在进行中」 */
.ii-thumb-busy {
  opacity: 0.55;
  pointer-events: none;
}
</style>
