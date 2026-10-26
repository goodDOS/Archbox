<template>
  <div class="region-nav">
    <div class="sb-region-head">
      <div class="sb-title">{{ t('region.navTitle', { n: filteredRegions.length }) }}</div>
      <div class="sb-region-bar">
        <div class="sb-filter">
          <Icon name="search" :size="14" :stroke="2" />
          <input
            v-model="regionFilter"
            class="sb-filter-input"
            type="text"
            :placeholder="t('region.filterRegions')"
            @click.stop
          />
          <button
            v-if="regionFilter"
            class="sb-filter-clear"
            @click.stop="regionFilter = ''"
            :title="t('region.clearFilter')"
          >
            ×
          </button>
        </div>
        <button
          class="sb-filter-add"
          @click.stop="openNewRegion"
          :disabled="!store.writable"
          :title="t('region.newRegion')"
        >
          <Icon name="plus" :size="14" :stroke="2.4" />
        </button>
      </div>
    </div>

    <div class="sb-scroll">
      <button
        v-for="r in filteredRegions"
        :key="r.id"
        class="nav-item"
        :class="{ active: store.page === 'region' && store.params.id === r.id }"
        @click="goto('region', { id: r.id })"
        :title="r.name"
      >
        <span v-if="isShared(r.id)" class="share-flag" :title="t('region.sharedOn')"
          ><Icon name="lan-share" :size="12"
        /></span>
        <span class="region-dot" :style="{ background: r.color }"></span>
        <span class="rname">{{ r.name }}</span>
        <span class="cnt">{{ r.post_count }}</span>
      </button>
      <div v-if="filteredRegions.length === 0" class="sb-empty empty-row">{{ t('region.noMatchRegions') }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { store, goto, bus, refreshRegions } from '../store';
import Icon from './Icon.vue';
import { t } from '../i18n';

const regionFilter = ref('');
const filteredRegions = computed(() => {
  const q = regionFilter.value.trim().toLowerCase();
  if (!q) return store.regions;
  return store.regions.filter(r => (r.name || '').toLowerCase().includes(q));
});
/* 已共享大区徽标：数据来自 store.lanShared（SharePanel 切换时同步写入）。
 * 复用 SharePanel 的 .share-flag 全局样式（components.css），保持视觉一致。 */
const sharedSet = computed(() => new Set((store.lanShared || []).map(Number)));
function isShared(id) {
  return sharedSet.value.has(Number(id));
}

function openNewRegion() {
  bus.emit('region-modal:open', null);
}

/* 本组件常驻挂载（不随页面 v-if 销毁重建），store.regions 里每个大区的
 * post_count 是由后端聚合出的「未删除文档数」。文档的增/删/改所属大区/
 * 进删回收站等操作发生在各页面内，若不主动重取，侧栏计数会一直停在旧值。
 * 故订阅全局 refresh：任何一个页面执行完文档写操作后广播，这里即重取大区列表。
 * （这也是「常驻组件」唯一可靠的同步方式——页面自身的重挂载救不了侧栏。） */
function onRefresh() {
  return refreshRegions();
}
bus.on('refresh', onRefresh);
onMounted(() => {
  if (!store.regions.length) refreshRegions();
});
onBeforeUnmount(() => bus.off('refresh', onRefresh));
</script>

<style scoped>
/* 模块根：在侧边栏 flex 列布局中占满中间剩余空间，内部再纵向分头/列表 */
.region-nav {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 大区区头部（标题 + 筛选框 + 新建）：固定不滚，始终可见。
   水平内边距为 0，使「大区」字样与下方控件左右边沿与 .nav-item 同轨对齐。 */
.sb-region-head {
  flex: none;
  padding: 8px 0 6px;
}
/* 搜索框与「+」并排：搜索框占满剩余，+ 为固定宽按钮 */
.sb-region-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.sb-filter {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 32px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-3);
}
.sb-filter:focus-within {
  border-color: var(--accent);
  color: var(--accent);
}
.sb-filter-input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--text);
}
.sb-filter-input::placeholder {
  color: var(--text-3);
}
.sb-filter-clear {
  flex: none;
  width: 20px;
  height: 20px;
  line-height: 18px;
  text-align: center;
  border: none;
  background: transparent;
  color: var(--text-3);
  font-size: 16px;
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.sb-filter-clear:hover {
  background: var(--btn-ghost-hover);
  color: var(--text);
}
/* 搜索框「外右侧」的「+」：常驻独立按钮，代替原列表底部的「新建大区」按钮 */
.sb-filter-add {
  flex: none;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--text-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.sb-filter-add:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-weak);
}
.sb-filter-add:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
/* 大区列表独立滚动区：占满中间剩余空间，大区过多时只滚这一块，
   顶部导航与底部设置/关于/用户保持钉住。min-height:0 是 flex 子项能收缩并出现滚动条的关键。 */
.sb-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  margin: 2px -2px 0;
  padding: 0 2px;
}
.sb-empty {
  padding: 10px 12px;
  font-size: 12px;
} /* 灰字来自 .empty-row */
/* .region-dot 基础形制见 components.css；本处用默认 10px，无需覆盖 */
.rname {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
