<template>
  <div>
    <div class="page-head">
      <div>
        <h1>{{ greet }}，{{ store.user.name }}</h1>
        <div class="desc">{{ today }} · {{ t('home.dataLocalAudited') }}</div>
      </div>
      <div class="spacer"></div>
      <!-- ★ 需求：首页右上角「新建文档」按钮，复用大区页样式（btn btn-primary） -->
      <button class="btn btn-primary" @click="newPost" :disabled="!store.writable">{{ t('region.newPost') }}</button>
    </div>

    <StatCards :stats="stats" :lan="lan" />

    <div class="home-cols">
      <div>
        <LoginStats :stats="stats" />
        <RecentPosts :recent="stats.recent" @open="id => goto('post', { id })" />
      </div>
      <div>
        <NotesBoard />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { store, goto, bus } from '../store';
import { run } from '../feedback';
import { A } from '../api';
import StatCards from '../components/home/StatCards.vue';
import LoginStats from '../components/home/LoginStats.vue';
import RecentPosts from '../components/home/RecentPosts.vue';
import NotesBoard from '../components/home/NotesBoard.vue';
import { tzLabel } from '../utils/timefmt';
import { usePolling } from '../composables/usePolling';
import { t } from '../i18n';

const stats = ref({
  posts: 0,
  regions: 0,
  cats: 0,
  tags: 0,
  fields: 0,
  users: 0,
  notes: 0,
  last7: [],
  recent: [],
  new7: 0,
  newPrev7: 0,
  uncat: 0,
  drafts: 0,
  trash: 0,
  abnormal7: 0,
  lastBackupAt: null,
  encrypted: false,
  storageBytes: 0,
  storagePath: '',
  storageDrive: '',
  onSystemDrive: false,
  usageToday: 0,
  usage7: [],
  usagePrev7: [],
  loginTodayUsers: 0,
  loginTodayTimes: 0,
  loginTodayList: [],
  loginRank7: [],
  loginUsers7: 0,
  loginFailToday: 0
});

// 局域共享概览（首页卡片），由 lan:myStats 提供
// visitor7 / visitorToday 为按 IP 去重后的访客数（排除本机自浏览）；postView7 为近 7 日文档浏览量
const lan = ref({
  enabled: false,
  sharedRegionCount: 0,
  postCount: 0,
  visitor7: 0,
  visitorToday: 0,
  postView7: 0,
  postViewToday: 0
});

const greet = computed(() => {
  const h = new Date().getHours();
  return h < 6
    ? t('home.greetDawn')
    : h < 12
      ? t('home.greetMorning')
      : h < 14
        ? t('home.greetNoon')
        : h < 18
          ? t('home.greetAfternoon')
          : t('home.greetEvening');
});
const today =
  new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) +
  ` (${tzLabel()})`;

// ★ 需求：首页右上角「新建文档」——不指定大区，进入新建页后由「无大区引导」处理
function newPost() {
  goto('post', { editing: true });
}

async function load() {
  const r = await run(() => Promise.all([A.homeStats(), A.lanMyStats()]), {
    then: ([s, l]) => {
      stats.value = s;
      lan.value = l || lan.value;
    }
  });
  return r !== undefined;
}
onMounted(load);

// 首页统计定时自动刷新：聚焦时长等须实时更新（后端每 15s 落库一次）
// 后台轮询静默拉取，遇错保留上次数据，避免频繁弹 toast
const POLL_MS = 15000;
async function poll() {
  try {
    const [s, l] = await Promise.all([A.homeStats(), A.lanMyStats()]);
    if (s) stats.value = s;
    if (l) lan.value = l;
  } catch (e) {}
}
// 轮询计时器收口到 usePolling（与 LanShare 共享大区列表轮询同一来源）：
// 卸载时自动停表，不会留下「页面切走还在打 IPC」的幽灵请求
const { start: startPoll } = usePolling(poll, POLL_MS);
onMounted(startPoll);

// 订阅全局刷新（标题栏刷新按钮）
bus.on('refresh', load);
onBeforeUnmount(() => {
  bus.off('refresh', load);
});
</script>

<style scoped>
.home-cols {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(300px, 1fr);
  gap: 18px;
  margin-top: 6px;
}
@media (max-width: 1280px) {
  .home-cols {
    grid-template-columns: 1fr;
  }
}
</style>
