<template>
  <div>
    <div class="page-head">
      <div>
        <h1>{{ t('trash.title') }}</h1>
        <div class="desc">{{ t('trash.desc') }}</div>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-sm" v-if="rows.length" :disabled="!store.writable" @click="purgeAll" data-edit-btn>
        {{ t('trash.purgeAll') }}
      </button>
    </div>

    <div class="list-meta" v-if="loaded">
      <span
        >{{ t('trash.inTrash') }} <b style="color: var(--text)">{{ total }}</b> {{ t('common.unit') }} ·
        {{ t('trash.pageOf', { page, totalPages }) }}</span
      >
    </div>

    <div class="grid grid-2" v-if="rows.length">
      <div class="card pc trash-card" v-for="p in rows" :key="p.id">
        <div class="pc-head">
          <b class="pc-title">{{ p.title }}</b>
          <span class="badge" v-if="p.status === 'draft'">{{ t('trash.draft') }}</span>
        </div>
        <div class="pc-meta">
          <span v-if="p.rname">{{ p.rname }} / {{ p.cname || t('common.unclassified') }}</span>
          <span v-else>{{ p.cname || t('common.unclassified') }}</span>
          <span v-if="p.no" class="pc-no"># {{ p.no }}</span>
        </div>
        <div class="pc-del">{{ t('trash.deletedAt', { time: p.deleted_at }) }}</div>
        <div class="pc-actions">
          <button class="btn btn-sm btn-primary" :disabled="!store.writable" @click="restore(p)" data-edit-btn>
            {{ t('common.restore') }}
          </button>
          <button class="btn btn-sm btn-danger" :disabled="!store.writable" @click="purge(p)" data-edit-btn>
            {{ t('trash.purge') }}
          </button>
        </div>
      </div>
    </div>
    <div class="empty" v-if="loaded && !rows.length">{{ t('trash.empty') }}</div>

    <Pager :page="page" :pages="totalPages" @navigate="go" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { store, bus } from '../store';
import { run, toastOk, toastErr } from '../feedback';
import { A } from '../api';
import { requirePassword } from '../composables/useGuard';
import { usePageSize } from '../composables/usePageSize';
import Pager from '../components/Pager.vue';
import { t } from '../i18n';

const { pageSize, applyPageSize } = usePageSize();
const rows = ref([]);
const total = ref(0);
const page = ref(1);
const loaded = ref(false);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

async function load() {
  const r = await run(async () => {
    const res = await A.postTrash({ limit: pageSize.value, offset: (page.value - 1) * pageSize.value });
    rows.value = res.rows;
    total.value = res.total;
    loaded.value = true;
    return true;
  });
  return r !== undefined;
}
function go(p) {
  page.value = p;
  load();
}

// 说明：本页自身数据由 load() 刷新；但大区 post_count 显示在**常驻侧栏**
// RegionNav 上（不随页面切换重建），故必须广播 refresh 让它重取大区列表。
async function restore(p) {
  await run(() => A.postRestoreTrash({ id: p.id }), {
    then: () => {
      toastOk(t('trash.restored', { title: p.title }));
      load();
      bus.emit('refresh');
    }
  });
}
async function purge(p) {
  const ok = await requirePassword(t('trash.purgePwdMsg', { title: p.title }), { title: t('trash.purgePwdTitle') });
  if (!ok) return;
  await run(() => A.postPurge({ id: p.id }), {
    then: () => {
      toastOk(t('trash.purged', { title: p.title }));
      load();
      bus.emit('refresh');
    },
    fail: e => toastErr(e, t('trash.purgeFailed'))
  });
}
async function purgeAll() {
  if (!total.value) return;
  const ok = await requirePassword(t('trash.purgeAllPwdMsg', { n: total.value }), {
    title: t('trash.purgeAllPwdTitle')
  });
  if (!ok) return;
  for (const p of rows.value.slice()) {
    try {
      await A.postPurge({ id: p.id });
    } catch (e) {
      toastErr(e, t('trash.deleteFailed', { title: p.title }));
    }
  }
  page.value = 1;
  await load();
  bus.emit('refresh');
  toastOk(t('trash.purgedAll'));
}

onMounted(load);
bus.on('refresh', load);
// 订阅设置页「每页显示条数」变更，与其他文档列表页保持一致
function onExtPageSize(v) {
  applyPageSize(v);
  page.value = 1;
  load();
}
bus.on('display:pageSize', onExtPageSize);
onBeforeUnmount(() => {
  bus.off('refresh', load);
  bus.off('display:pageSize', onExtPageSize);
});
</script>

<style scoped>
/* 列表统计行：与页头 / .grid 共用同一条左基线，故左右外边距归零。
 * 此前 `margin: 14px 2px` 的 2px 会让本行相对页头右偏 2px。 */
.list-meta {
  margin: 14px 0;
  font-size: 12.5px;
  color: var(--text-2);
}
.list-meta b {
  color: var(--text);
}
.trash-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
}
.pc-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pc-title {
  font-size: 15px;
  font-weight: 600;
}
.pc-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-2);
  font-size: 12.5px;
  flex-wrap: wrap;
}
/* 文档编号：字号继承 .pc-meta（12.5px），与 PostCard 的同一口径。
 * 此前单独写 11px，比同行小一号，基线偏低、看着没与同行对齐。 */
.pc-no {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: inherit;
}
.pc-del {
  color: var(--text-3);
  font-size: 12px;
}
.pc-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}
</style>
