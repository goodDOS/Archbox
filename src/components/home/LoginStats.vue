<template>
  <div>
    <div class="section-title"><Icon name="user" :size="15" /> {{ t('home.loginStats') }}</div>
    <div class="card ls-card">
      <div class="ls-body">
        <!-- 第一列：竖排三指标 -->
        <div class="ls-pane">
          <div class="lmetrics">
            <div class="lmetric">
              <b>{{ d.todayUsers }}</b
              ><span>{{ t('home.loginUsers') }}</span>
            </div>
            <div class="lmetric">
              <b>{{ d.users7 }}</b
              ><span>{{ t('home.loginUsers7') }}</span>
            </div>
            <div class="lmetric">
              <b :class="d.failCls">{{ d.failToday }}</b
              ><span>{{ t('home.loginFailToday') }}</span>
            </div>
          </div>
        </div>

        <!-- 第二列：今日登录用户气泡 -->
        <div class="ls-pane">
          <div class="ls-pane-h">{{ t('home.loginUsersToday') }}</div>
          <div v-if="!d.todayList.length" class="lempty empty-row">{{ t('home.loginTodayEmpty') }}</div>
          <div class="ls-bubbles" v-else>
            <span
              class="bubble"
              v-for="r in d.todayList"
              :key="r.userId"
              :title="t('home.loginTodayTip', { name: r.name, times: r.times })"
            >
              {{ r.name }}<i class="bub-n">{{ r.times }}</i>
            </span>
          </div>
        </div>

        <!-- 第三列：近 7 日登录排行（前 7）——用户名改为气泡显示 -->
        <div class="ls-pane">
          <div class="ls-pane-h">{{ t('home.loginRank7') }}</div>
          <div v-if="!d.rankTop.length" class="lempty empty-row">{{ t('home.loginRankEmpty') }}</div>
          <div class="ls-bubbles" v-else>
            <span
              class="bubble rank"
              v-for="(r, i) in d.rankTop"
              :key="r.userId"
              :title="t('home.loginRankTip', { name: r.name, times: r.times })"
            >
              <i class="bub-no">{{ i + 1 }}</i
              >{{ r.name }}<i class="bub-n">{{ r.times }}</i>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Icon from '../Icon.vue';
import { t } from '../../i18n';

const props = defineProps({ stats: { type: Object, required: true } });

// 审计日志中 user_id / user_name 均已冗余落库，直接展示，无需 JOIN users
const mapRows = arr =>
  (Array.isArray(arr) ? arr : []).map(r => ({
    userId: r.user_id,
    name: r.user_name || t('home.unknownUser'),
    times: Number(r.times) || 0
  }));

const d = computed(() => {
  const s = props.stats || {};
  const todayList = mapRows(s.loginTodayList);
  const rank7 = mapRows(s.loginRank7);
  const failToday = s.loginFailToday || 0;
  return {
    todayUsers: s.loginTodayUsers || 0,
    users7: s.loginUsers7 || 0,
    failToday,
    failCls: failToday > 0 ? 'warn' : 'ok',
    todayList,
    rankTop: rank7.slice(0, 7)
  };
});
</script>

<style scoped>
.ls-card {
  padding: 13px 15px;
}

/* 三列：指标列 / 今日登录用户列 / 近 7 日排行榜列 */
.ls-body {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 0 16px;
}
.ls-pane {
  min-width: 0;
}
.ls-pane + .ls-pane {
  border-left: 1px dashed var(--border);
  padding-left: 16px;
}

/* 第一列：三指标竖排；数字固定宽保证标签左缘对齐 */
.lmetrics {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.lmetric {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.lmetric b {
  font-size: 19px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  min-width: 32px;
}
.lmetric b.warn {
  color: var(--warn);
}
.lmetric b.ok {
  color: var(--ok);
}
.lmetric span {
  font-size: 11.5px;
  color: var(--text-2);
  white-space: nowrap;
}

/* 列标题 */
.ls-pane-h {
  font-size: 11px;
  color: var(--text-3);
  margin-bottom: 7px;
}

/* 气泡（复用待整理/清理 chip 视觉，内联换行不独占行） */
.ls-bubbles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.bubble {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-2);
  background: var(--surface-2);
  padding: 3px 9px;
  border-radius: 999px;
  max-width: 100%;
}
.bubble:hover {
  background: var(--btn-ghost-hover);
}
.bubble .bub-n {
  font-style: normal;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
/* 排行气泡：序号在前，样式稍弱以突出姓名 */
.bubble.rank .bub-no {
  font-style: normal;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-3);
}
.lempty {
  padding: 8px 4px;
  font-size: 12.5px;
} /* 灰字来自 .empty-row（components.css） */
</style>
