<template>
  <div v-if="loaded" class="card-stack">
    <div class="page-head">
      <span v-if="isShared" class="share-flag" :title="t('region.sharedOn')"><Icon name="lan-share" :size="12" /></span>
      <span class="region-dot" :style="{ background: stats.region.color }"></span>
      <div>
        <h1>{{ stats.region.name }}</h1>
        <div class="desc">
          {{ t('region.totalDocs', { n: stats.total }) }} · {{ stats.region.code || t('region.noCode') }} ·
          {{ t('region.createdAt', { time: withTz(stats.region.created_at) }) }}
        </div>
      </div>
      <div class="spacer"></div>
      <button class="btn" @click="editRegion" :disabled="!store.writable">{{ t('region.editRegion') }}</button>
      <button class="btn btn-primary" @click="newPost" :disabled="!store.writable">{{ t('region.newPost') }}</button>
    </div>

    <!-- 分类分布 + 高频标签（常驻） -->
    <div class="card stats-wrap">
      <div class="stats-grid">
        <div>
          <div class="sb-h">{{ t('region.catDistribution') }}</div>
          <div class="hbar" v-for="c in stats.byCategory" :key="c.name">
            <span class="h-label">{{ c.name || t('common.unclassified') }}</span>
            <div class="h-track"><div class="h-fill" :style="{ width: pct(c.c, stats.total) + '%' }"></div></div>
            <span class="h-val">{{ c.c }}</span>
          </div>
          <div class="empty" v-if="!stats.byCategory.length">{{ t('common.empty') }}</div>
        </div>
        <div>
          <div class="sb-h">{{ t('region.topTags') }}</div>
          <div class="tag-cloud" v-if="stats.byTag.length">
            <span class="chip" v-for="tag in stats.byTag" :key="tag.name" :style="chipStyle(tag.c)"
              ># {{ tag.name }} × {{ tag.c }}</span
            >
          </div>
          <div class="empty" v-else>{{ t('region.noTags') }}</div>
        </div>
      </div>
    </div>

    <!-- 各字段数据统计（可折叠） -->
    <div class="card stats-wrap">
      <div
        class="stats-head"
        @click="showFieldStats = !showFieldStats"
        role="button"
        :title="showFieldStats ? t('region.collapseFieldStats') : t('region.expandFieldStats')"
      >
        <span class="stats-title">
          <Icon name="chevron-down" :size="15" :stroke="2.2" class="caret" :class="{ collapsed: !showFieldStats }" />
          {{ t('region.fieldStatsTitle') }}
        </span>
        <span class="stats-hint">{{ showFieldStats ? t('region.collapseHint') : t('region.expandHint') }}</span>
      </div>
      <div class="stats-body" :class="{ collapsed: !showFieldStats }">
        <div class="fstats" ref="fstatsEl">
          <div
            class="fstat"
            v-for="f in showFieldStats ? stats.fieldStats : stats.fieldStats.slice(0, collapsedLimit)"
            :key="f.code"
          >
            <div class="f-head">
              <b>{{ f.name }}</b>
              <span class="badge">{{ typeName(f.type) }} · {{ f.code }}</span>
            </div>
            <div class="f-nums">
              <span
                >{{ t('region.filled') }} <b>{{ f.filled }}</b></span
              >
              <span
                >{{ t('region.distinct') }} <b>{{ f.distinct }}</b></span
              >
              <span v-if="f.numeric"
                >{{ t('region.sum') }} <b>{{ f.numeric.sum }}</b></span
              >
              <span v-if="f.numeric"
                >{{ t('region.avg') }} <b>{{ f.numeric.avg }}</b></span
              >
              <span v-if="f.numeric && f.numeric.min !== null"
                >{{ t('region.range') }} <b>{{ f.numeric.min }} ~ {{ f.numeric.max }}</b></span
              >
            </div>
            <div class="f-top" v-if="f.top && f.top.length">
              <span class="top-item" v-for="item in f.top.slice(0, 4)" :key="item.v">
                {{ item.v }} <i>×{{ item.c }}</i>
              </span>
            </div>
            <div class="f-empty empty-row" v-else>{{ t('region.noFilledValues') }}</div>
          </div>
          <div class="empty" style="grid-column: 1/-1" v-if="!stats.fieldStats.length">
            {{ t('region.noFieldsHint') }}
          </div>
        </div>
      </div>
    </div>

    <!-- 筛选与文档列表 -->
    <div class="section-title" style="margin-top: 20px">{{ t('region.docList', { n: rows.length }) }}</div>
    <div class="filter-bar">
      <Dropdown v-model="filter.categoryId" :options="categoryOptions" style="width: 160px" />
      <Dropdown v-model="filter.tagId" :options="tagOptions" style="width: 160px" />
      <input
        class="input"
        v-model="filter.q"
        :placeholder="t('region.searchInRegion')"
        style="max-width: 240px"
        @keyup.enter="loadPosts"
      />
      <button class="btn" @click="loadPosts">{{ t('region.filter') }}</button>
    </div>

    <div class="grid grid-2">
      <PostCard v-for="p in rows" :key="p.id" :post="p" date-key="updated_at" @open="id => goto('post', { id })" />
    </div>
    <div class="empty card" style="padding: 34px" v-if="!rows.length">{{ t('region.noDocsHint') }}</div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { store, goto, bus } from '../store';
import { run } from '../feedback';
import { A } from '../api';
import PostCard from '../components/PostCard.vue';
import Icon from '../components/Icon.vue';
import Dropdown from '../components/Dropdown.vue';
import { withTz } from '../utils/timefmt';
import { t } from '../i18n';

const loaded = ref(false);
const showFieldStats = ref(false);
/* 当前大区是否已开启共享：来源 store.lanShared（SharePanel 切换时同步写入）。
 * ★ Beta.168：必须同时看 store.lanEnabled。
 * 原先只查 lanShared，而 lanShared 存的是「勾选记录」——关闭共享后后端仍会保留它
 * （重开时要靠它恢复），于是徽标即使共享已关也照样亮着。
 * 现在后端 getStatus / App.vue 两处已按 enabled 收口，这里再显式判一次 lanEnabled：
 * 语义上「共享已关」就不该有任何大区被标为共享中，不该依赖上游恰好传来空数组。 */
const isShared = computed(() => {
  if (!store.lanEnabled) return false;
  const id = Number(store.params.id);
  return !!id && (store.lanShared || []).map(Number).includes(id);
});
const stats = ref({ region: {}, byCategory: [], byTag: [], fieldStats: [], total: 0 });
const cats = ref([]);
const tags = ref([]);
const categoryOptions = computed(() => [
  { value: null, label: t('region.allCats') },
  ...cats.value.map(c => ({ value: c.id, label: `${c.name}（${c.post_count}）` }))
]);
const tagOptions = computed(() => [
  { value: null, label: t('region.allTags') },
  // 箭头参数名勿用 t：会遮蔽导入的翻译函数（同 NavToolbar 的 tk 改名缘由）
  ...tags.value.map(tag => ({ value: tag.id, label: `# ${tag.name}（${tag.post_count}）` }))
]);
const rows = ref([]);
const filter = reactive({ categoryId: null, tagId: null, q: '' });
const FIELD_TYPE_KEYS = {
  text: 'region.fieldTypeText',
  textarea: 'region.fieldTypeTextarea',
  number: 'region.fieldTypeNumber',
  date: 'region.fieldTypeDate',
  select: 'region.fieldTypeSelect',
  url: 'region.fieldTypeUrl'
};
function typeName(type) {
  const k = FIELD_TYPE_KEYS[type];
  return k ? t(k) : type;
}

// 折叠时只显示「前两排」字段卡（按网格实际列数计算：列数 × 2），而非死板的 2 张。
// 与 CSS .fstats 的 grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)) + gap:12px 保持一致。
const fstatsEl = ref(null);
const COLLAPSED_ROWS = 2;
const CARD_MIN = 240;
const GAP = 12;
const cardsPerRow = ref(1);
const collapsedLimit = computed(() => cardsPerRow.value * COLLAPSED_ROWS);
function measureCardsPerRow() {
  const el = fstatsEl.value;
  if (!el) return;
  const w = el.clientWidth;
  if (!w) return;
  cardsPerRow.value = Math.max(1, Math.floor((w + GAP) / (CARD_MIN + GAP)));
}

function pct(c, total) {
  return total ? Math.max(3, Math.round((c / total) * 100)) : 0;
}
function chipStyle(c) {
  const max = Math.max(1, ...stats.value.byTag.map(t => t.c));
  const w = 0.55 + 0.45 * (c / max);
  return { fontSize: 11 + Math.round(w * 3) + 'px', opacity: 0.6 + 0.4 * (c / max) };
}

async function loadAll() {
  const r = await run(async () => {
    const id = store.params.id;
    stats.value = await A.regionStats({ regionId: id });
    cats.value = await A.cats({ regionId: id });
    tags.value = await A.tags();
    loaded.value = true;
    await loadPosts();
    await nextTick();
    measureCardsPerRow();
    return true;
  });
  return r !== undefined;
}
async function loadPosts() {
  await run(async () => {
    const r = await A.posts({
      regionId: store.params.id,
      categoryId: filter.categoryId,
      tagId: filter.tagId,
      q: filter.q
    });
    rows.value = r.rows;
  });
}
function newPost() {
  goto('post', { regionId: store.params.id, editing: true });
}
function editRegion() {
  bus.emit('region-modal:open', stats.value.region);
}

watch(() => store.params.id, loadAll);
// 大区弹窗关闭后刷新（新建/编辑都可能改了当前大区的名称/颜色）
function onRegionModalClosed() {
  loadAll();
}
bus.on('region-modal:closed', onRegionModalClosed);
onMounted(() => {
  loadAll();
  window.addEventListener('resize', measureCardsPerRow);
});

// 订阅全局刷新（标题栏刷新按钮）
bus.on('refresh', loadAll);
onBeforeUnmount(() => {
  bus.off('refresh', loadAll);
  bus.off('region-modal:closed', onRegionModalClosed);
  window.removeEventListener('resize', measureCardsPerRow);
});
</script>

<style scoped>
/* 大区标题色块比常规大一号；基础形制见 components.css */
.region-dot {
  --dot: 16px;
}
.stats-wrap {
  padding: 18px;
}
.stats-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}
.stats-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
}
.caret {
  transition: transform 0.15s ease;
}
.caret.collapsed {
  transform: rotate(-90deg);
}
.stats-hint {
  font-size: 12px;
  color: var(--text-3);
}
.stats-body {
  margin-top: 14px;
  overflow: hidden;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}
.sb-h {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 10px;
}
.hbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.h-label {
  width: 76px;
  font-size: 12px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}
.h-track {
  flex: 1;
  height: 9px;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  overflow: hidden;
}
.h-fill {
  height: 100%;
  background: var(--accent);
  border-radius: var(--radius-sm);
}
.h-val {
  width: 30px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fstats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
/* 小卡片按内容自适应高度，无留白：短值字段（2 排 top）~140px，长值字段（4 排 top）~200px。
   折叠时由模板按网格列数 slice 到「前两排」：列数在 JS 中按容器宽度计算（minmax 240px + gap 12px），
   故折叠始终展示完整两行卡片，而非半张卡或死板的 2 张。 */
.fstat {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  background: var(--surface-2);
  box-sizing: border-box;
}
.f-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  min-width: 0;
}
.f-head b {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 数值行一般只 1-2 行，不限高，让「已填 去重值 合计 均值 范围」完整展示 */
.f-nums {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--text-2);
}
.f-nums b {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
/* TOP 列表：仅渲染 4 个 item（模板 slice(0,4)），不裁切，整排对齐 */
.f-top {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.top-item {
  font-size: 11.5px;
  background: var(--surface-3);
  padding: 0 8px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  height: 22px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.top-item i {
  font-style: normal;
  color: var(--text-3);
}
.f-empty {
  margin-top: 6px;
  font-size: 12px;
} /* 灰字来自 .empty-row */
</style>
