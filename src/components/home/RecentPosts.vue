<template>
  <div>
    <div class="section-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
      </svg>
      {{ t('home.recentPosts') }}
    </div>
    <div class="r-list">
      <div class="r-item lift" v-for="p in recent" :key="p.id" @click="$emit('open', p.id)">
        <div class="r-main">
          <b>{{ p.title }}</b>
          <span class="r-meta"
            >{{ p.rname }} · {{ p.cname || t('common.unclassified') }} · {{ withTz(p.updated_at) }}</span
          >
        </div>
        <span class="badge" v-if="p.status === 'draft'">{{ t('home.draft') }}</span>
      </div>
      <div class="r-empty empty-row" v-if="!recent.length">{{ t('home.recentEmpty') }}</div>
    </div>
  </div>
</template>

<script setup>
import { withTz } from '../../utils/timefmt';
import { t } from '../../i18n';
defineProps({ recent: { type: Array, default: () => [] } });
defineEmits(['open']);
</script>

<style scoped>
/* 卡片式列表：复用局域共享页 PostCard 的设计语言（独立圆角卡片 + 悬停高亮），
   避免原先「单列在一张大卡内、末项悬停高亮溢出圆角」的裁切问题 */
.r-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 1100px) {
  .r-list {
    grid-template-columns: 1fr;
  }
}
.r-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    border-color 0.12s,
    transform 0.12s,
    box-shadow 0.12s;
  min-width: 0;
}
/* 悬停抬升来自 .lift；本组件额外叠加投影（比 PostCard 多一层立体感） */
.r-item:hover {
  box-shadow: var(--shadow);
}
.r-main {
  flex: 1;
  min-width: 0;
}
.r-main b {
  display: block;
  font-size: 13.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.r-meta {
  display: block;
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 空态：本组件是 2 列网格（.r-list），空态需跨满整行并自带虚线卡片底，
   故用局部类 .r-empty 扩展；文字色/字号仍复用全局 .empty-row，不重复声明。 */
.r-empty {
  grid-column: 1 / -1;
  padding: 24px;
  text-align: center;
  font-size: 13px;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
}
</style>
