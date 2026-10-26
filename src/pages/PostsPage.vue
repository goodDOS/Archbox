<template>
  <div>
    <div class="page-head">
      <div>
        <h1>{{ titleText }}</h1>
        <div class="desc">{{ t('posts.desc') }}</div>
      </div>
      <div class="spacer"></div>
    </div>

    <SearchFilters
      ref="sf"
      :filters="SEARCH_FILTER_KEYS"
      :allow-empty="true"
      :initial="postsInitial"
      @search="onSearch"
      @reset="onReset"
    />

    <div class="list-meta" v-if="searched">
      <span
        >{{ t('posts.published') }} <b style="color: var(--text)">{{ total }}</b> {{ t('common.items') }} ·
        {{ t('posts.pageOf', { page, totalPages }) }}</span
      >
    </div>

    <div class="grid grid-2" v-if="rows.length">
      <PostCard
        v-for="p in rows"
        :key="p.id"
        :post="p"
        :query="q"
        date-key="created_at"
        @open="id => goto('post', { id })"
      />
    </div>
    <div class="empty" v-if="searched && !rows.length">{{ t('posts.noMatch') }}</div>
    <div class="empty" v-if="!searched">{{ t('posts.startBrowseHint') }}</div>

    <Pager :page="page" :pages="totalPages" @navigate="go" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { store, goto, bus } from '../store';
import { run } from '../feedback';
import { A } from '../api';
import PostCard from '../components/PostCard.vue';
import Pager from '../components/Pager.vue';
import SearchFilters, { SEARCH_FILTER_KEYS } from '../components/SearchFilters.vue';
import { usePageSize } from '../composables/usePageSize';
import { t } from '../i18n';

// 筛选清单直接用 SearchFilters 导出的唯一常量 SEARCH_FILTER_KEYS —— 顺序只在组件里定义一次，本页不重写。
// （本页与全局搜索共用同一个筛选模块，能力完全一致）

const sf = ref(null);
const rows = ref([]);
const total = ref(0);
const page = ref(1);
const searched = ref(false);
const q = ref(''); // 当前关键词，用于结果高亮
const { pageSize, loadPageSize, applyPageSize } = usePageSize();

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

const titleText = computed(() => {
  if (store.params.regionId) {
    const r = store.regions.find(x => x.id === store.params.regionId);
    return r ? t('posts.regionDocs', { name: r.name }) : t('posts.allDocs');
  }
  if (store.params.authorId)
    return store.params.authorName
      ? t('posts.authorDocs', { name: store.params.authorName })
      : t('posts.authorDocsPlain');
  if (store.params.categoryId) return t('posts.catDocs');
  if (store.params.tagId) return t('posts.tagDocs');
  return t('posts.allDocs');
});

// 从聚合管理/作者跳转进来时，按参数预置筛选（作为模块初始值传入）
const postsInitial = computed(() => {
  const p = {};
  if (store.params.regionId) p.regionId = store.params.regionId;
  if (store.params.categoryId) p.categoryId = store.params.categoryId;
  if (store.params.tagId) p.tagId = store.params.tagId;
  if (store.params.authorId) p.authorId = store.params.authorId;
  return p;
});

function onSearch(params) {
  q.value = params.q;
  doSearch(params);
}

async function doSearch(params) {
  const r = await run(async () => {
    // 主网格只显示已发布文档（草稿不再常驻本页，统一收纳进「新建文档」页的草稿箱）
    const res = await A.posts({
      ...params,
      status: 'published',
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value
    });
    rows.value = res.rows;
    total.value = res.total;
    searched.value = true;
    return true;
  });
  return r !== undefined;
}

function onReset() {
  // 组件已清空筛选，allowEmpty=true 下直接重搜即显示所有文档
  sf.value && sf.value.search();
}

function go(p) {
  page.value = p;
  sf.value && sf.value.search();
}

function onExtPageSize(v) {
  applyPageSize(v);
  page.value = 1;
  sf.value && sf.value.search();
}

onMounted(async () => {
  if (!store.settings) {
    try {
      store.settings = await A.settingsAll();
    } catch (e) {}
  }
  pageSize.value = loadPageSize();
  // 所有文档页面：空字段即可显示所有文档（allowEmpty=true）
  sf.value && sf.value.search();
});

// 订阅全局刷新（标题栏刷新按钮 / 删除文档后广播）
// 注意：必须用具名引用注册与解绑，否则 bus.off 传入新匿名函数永远解绑不掉，造成监听器泄漏
const onRefresh = () => {
  if (sf.value) sf.value.search();
};
bus.on('refresh', onRefresh);
// 订阅设置页「文档显示数量」变更
bus.on('display:pageSize', onExtPageSize);
onBeforeUnmount(() => {
  bus.off('refresh', onRefresh);
  bus.off('display:pageSize', onExtPageSize);
});
</script>

<style scoped>
/* 列表统计行：与页头 / .grid 共用同一条左基线，故左右外边距归零。
 * 此前 `margin: 14px  2px` 的 2px 会让本行相对页头右偏 2px。 */
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
</style>
