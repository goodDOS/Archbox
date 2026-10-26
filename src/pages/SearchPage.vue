<template>
  <div>
    <div class="page-head">
      <div>
        <h1>{{ t('search.title') }}</h1>
        <div class="desc">{{ t('search.desc') }}</div>
      </div>
      <div class="spacer"></div>
      <button class="btn" :disabled="!rows.length" @click="exportPack">
        <Icon name="upload" :size="16" /> {{ t('search.exportPack', { n: total }) }}
      </button>
      <button class="btn" :disabled="!rows.length" @click="exportMd">
        <Icon name="file-text" :size="16" /> {{ t('search.exportMd', { n: total }) }}
      </button>
      <button class="btn" :disabled="!rows.length" @click="exportPdf">
        <Icon name="file" :size="16" /> {{ t('search.exportPdf', { n: total }) }}
      </button>
    </div>

    <SearchFilters
      ref="sf"
      :filters="SEARCH_FILTER_KEYS"
      :allow-empty="false"
      :initial="searchInitial"
      @search="onSearch"
      @reset="onReset"
    />

    <div class="search-history" v-if="store.searchHistory.length">
      <span class="sh-label">{{ t('search.historyLabel') }}</span>
      <button v-for="h in store.searchHistory" :key="h" class="sh-chip" @click="useHistory(h)" :title="h">
        {{ h }}
      </button>
      <button class="sh-clear" @click="clearHistory" :title="t('search.clearHistoryTitle')">
        {{ t('common.clear') }}
      </button>
    </div>

    <div class="dim list-meta" v-if="searched">
      {{ t('search.found') }} <b style="color: var(--text)">{{ total }}</b> {{ t('search.results')
      }}<span v-if="q">{{ t('search.highlighted', { q }) }}</span>
    </div>

    <div class="grid grid-2">
      <PostCard
        v-for="p in rows"
        :key="p.id"
        :post="p"
        :query="q"
        date-key="created_at"
        @open="id => goto('post', { id })"
      />
    </div>
    <div class="empty" v-if="searched && !rows.length">{{ t('search.noMatch') }}</div>
    <div class="empty" v-if="!searched">{{ t('search.startSearchHint') }}</div>

    <Pager :page="page" :pages="totalPages" @navigate="go" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { store, goto, bus, persistSearchHistory } from '../store';
import { run } from '../feedback';
import { useExports } from '../composables/useExports';
import { usePageSize } from '../composables/usePageSize';
import { A } from '../api';
import Icon from '../components/Icon.vue';
import PostCard from '../components/PostCard.vue';
import Pager from '../components/Pager.vue';
import SearchFilters, { SEARCH_FILTER_KEYS } from '../components/SearchFilters.vue';
import { t } from '../i18n';

const { pageSize, applyPageSize } = usePageSize();
// 筛选清单直接用 SearchFilters 导出的唯一常量 SEARCH_FILTER_KEYS —— 顺序只在组件里定义一次，本页不重写。
// ★ 本页此前自己抄了一份数组且漏掉 'origin'，导致「全局搜索」没有来源筛选而「所有文档」有。
//   两页调的是同一个 API、同一套后端查询，能力本就一致。

const sf = ref(null);
const rows = ref([]);
const total = ref(0);
const page = ref(1);
const searched = ref(false);
const q = ref(''); // 当前关键词，用于结果高亮
const currentFilters = ref({}); // 最新一次筛选参数，供翻页/导出复用
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

// 从全局跳转预置的初始筛选（如作者跳转带 authorId、聚合管理跳转带大区/分类/标签、搜索跳转带 q）
const searchInitial = computed(() => {
  const p = {};
  if (store.params.q) p.q = store.params.q;
  if (store.params.authorId) p.authorId = store.params.authorId;
  if (store.params.regionId) p.regionId = store.params.regionId;
  if (store.params.categoryId) p.categoryId = store.params.categoryId;
  if (store.params.tagId) p.tagId = store.params.tagId;
  return p;
});

function onSearch(params) {
  currentFilters.value = params;
  q.value = params.q;
  if (params.q) addHistory(params.q);
  doSearch(params);
}

// 历史搜索词：最新在前，限制数量，跨页面返回保持，可清除
const HISTORY_LIMIT = 10;
function addHistory(kw) {
  const k = (kw || '').trim();
  if (!k) return;
  const h = store.searchHistory;
  if (h[0] === k) return; // 已在最前：翻页等重复搜索时不再无意义重排
  store.searchHistory = [k, ...h.filter(x => x !== k)].slice(0, HISTORY_LIMIT);
  persistSearchHistory();
}
function clearHistory() {
  store.searchHistory = [];
  persistSearchHistory();
}
function useHistory(kw) {
  // 纯按该词搜索：先清空所有筛选（含当前关键词），再仅回填该词
  sf.value && sf.value.reset();
  sf.value && sf.value.apply({ q: kw });
  sf.value && sf.value.search();
}

async function doSearch(params) {
  const r = await run(async () => {
    const r = await A.posts({ ...params, limit: pageSize.value, offset: (page.value - 1) * pageSize.value });
    rows.value = r.rows;
    total.value = r.total;
    searched.value = true;
    return true;
  });
  return r !== undefined;
}

function onReset() {
  searched.value = false;
  rows.value = [];
  total.value = 0;
  currentFilters.value = {};
  store.searchCache = null; // 清空缓存，返回时不再恢复已被清空的搜索
}

function go(p) {
  page.value = p;
  sf.value && sf.value.search();
}

const { exportPack, exportMd, exportPdf } = useExports(() => ({
  ...currentFilters.value,
  limit: pageSize.value,
  offset: (page.value - 1) * pageSize.value
}));

onMounted(() => {
  const p = store.params;
  const hasInitial = p.q || p.authorId || p.regionId || p.categoryId || p.tagId;
  if (hasInitial) {
    // 外部跳转预置（聚合管理/作者跳转）：用参数自动搜，覆盖上次缓存
    sf.value && sf.value.search();
  } else if (store.searchCache && store.searchCache.searched) {
    restoreFromCache(); // 纯返回搜索页：恢复上次搜索状态，不自动复位
  } else {
    sf.value && sf.value.focus();
  }
});

// 恢复上次搜索画面：筛选 UI 回到上次选中值，并直接还原结果列表（不重新请求）
function restoreFromCache() {
  const c = store.searchCache;
  if (!c) return;
  sf.value && sf.value.apply(c.filters);
  rows.value = c.rows;
  total.value = c.total;
  page.value = c.page;
  searched.value = c.searched;
  q.value = c.q;
  currentFilters.value = c.filters;
}

// 同页切换兜底：在搜索结果卡片里点击另一作者时，goto 不改变页面组件，
// 仅 store.params.authorId 变化，需监听并自动刷新，否则搜索结果不会更新
watch(
  () => store.params.authorId,
  id => {
    if (!sf.value) return;
    sf.value.apply({ authorId: id || null });
    sf.value.search();
  }
);

// 订阅全局刷新（标题栏刷新按钮）：复用当前筛选重搜
function onRefresh() {
  sf.value && sf.value.search();
}
bus.on('refresh', onRefresh);
// 订阅设置页「每页显示条数」变更，与其他文档列表页保持一致
function onExtPageSize(v) {
  applyPageSize(v);
  page.value = 1;
  sf.value && sf.value.search();
}
bus.on('display:pageSize', onExtPageSize);
onBeforeUnmount(() => {
  bus.off('refresh', onRefresh);
  bus.off('display:pageSize', onExtPageSize);
  // 离开搜索页时缓存当前状态，下次返回保持（不自动复位）
  if (searched.value) {
    store.searchCache = {
      filters: currentFilters.value,
      rows: rows.value,
      total: total.value,
      page: page.value,
      searched: searched.value,
      q: q.value
    };
  }
});
</script>

<style scoped>
/* 结果计数行：与页头 / .grid 共用同一条左基线，故左右外边距归零。
 * 此前写 `margin: 14px 2px` —— 那 2px 让本行相对页头右偏，是错位来源。 */
.list-meta {
  margin: 14px 0;
  font-size: 12.5px;
  color: var(--text-2);
}
.list-meta b {
  color: var(--text);
}
/* 历史搜索词：chips 横向排列，点击回填并搜索，右侧可一键清除 */
.search-history {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0 0;
}
.sh-label {
  font-size: 12px;
  color: var(--text-3);
  flex: none;
}
.sh-chip {
  max-width: 200px;
  padding: 4px 12px;
  border-radius: var(--radius-lg);
  cursor: pointer;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sh-chip:hover {
  background: var(--accent-weak);
  color: var(--accent);
  border-color: var(--accent);
}
.sh-clear {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  font-size: 12.5px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}
.sh-clear:hover {
  background: var(--btn-ghost-hover);
  color: var(--text);
}
</style>
