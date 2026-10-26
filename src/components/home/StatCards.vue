<template>
  <div class="dash">
    <!-- 核心概览：文档总数 + 近7日新增 + 环比（原 3 张合并） -->
    <section class="panel hero">
      <div class="p-head"><Icon name="stack" :size="15" /> {{ t('home.docOverview') }}</div>
      <div class="hero-body">
        <div class="hero-num">{{ d.posts }}</div>
        <div class="hero-side">
          <div class="hstat">
            <b>{{ d.todayNew }}</b
            ><span>{{ t('home.todayNew') }}</span>
          </div>
          <div class="hstat">
            <b>{{ d.new7 }}</b
            ><span>{{ t('home.last7New') }}</span>
            <em class="delta" :class="d.deltaCls">{{ d.newSub }}</em>
          </div>
        </div>
      </div>
      <div class="panel-chart"><MiniBars :items="d.last7Bars" :height="58" unit="count" /></div>
    </section>

    <!-- 使用时长：去掉左侧大数字，改用两行小指标 + 柱状图 -->
    <section class="panel focus">
      <div class="p-head"><Icon name="clock" :size="15" /> {{ t('home.usageTime') }}</div>
      <div class="focus-body">
        <div class="hstat">
          <b>{{ formatDuration(d.focusToday) }}</b
          ><span>{{ t('home.todayFocus') }}</span>
        </div>
        <div class="hstat">
          <b>{{ formatDuration(d.focus7) }}</b
          ><span>{{ t('common.days7') }}</span
          ><em class="delta" :class="d.focusCls">{{ d.focusDelta }}</em>
        </div>
      </div>
      <div class="panel-chart"><MiniBars :items="d.focusBars" :height="58" unit="seconds" /></div>
    </section>

    <!-- 待整理 / 清理：分类完整度进度条（图形）+ 待清理计数 -->
    <section class="panel clean">
      <div class="p-head"><Icon name="folder-open" :size="15" /> {{ t('home.pendingClean') }}</div>
      <div class="cat-bar"><div class="cat-fill" :style="{ width: d.catPct + '%' }"></div></div>
      <div class="cat-legend">
        <b>{{ d.catPct }}%</b> {{ t('home.categorized') }} · {{ t('home.uncategorized') }} <b>{{ d.uncat }}</b>
      </div>
      <div class="clean-chips">
        <span class="cchip"><i class="dot d-draft"></i>{{ t('home.draft') }} {{ d.drafts }}</span>
        <span class="cchip"><i class="dot d-trash"></i>{{ t('home.trash') }} {{ d.trash }}</span>
      </div>
    </section>

    <!-- 内容构成：大区/分类/标签/字段/便签/用户（原 6 张合并） -->
    <section class="panel compose">
      <div class="p-head"><Icon name="layers" :size="15" /> {{ t('home.composeTitle') }}</div>
      <div class="mini-grid">
        <div class="mini" v-for="m in d.compose" :key="m.l">
          <b>{{ m.v }}</b
          ><span>{{ m.l }}</span>
        </div>
      </div>
    </section>

    <!-- 安全与存储：备份/加密/存储/异常（原 4 张合并，带状态色） -->
    <section class="panel secu">
      <div class="p-head"><Icon name="lock" :size="15" /> {{ t('home.securityStorage') }}</div>
      <div class="mini-grid">
        <div class="mini">
          <b>{{ d.backupVal }}</b
          ><span>{{ t('home.lastBackup') }}</span>
          <i class="msub">{{ d.backupSub }}</i>
        </div>
        <div class="mini">
          <b :class="d.abStatusCls">{{ d.abStatus }}</b
          ><span>{{ t('home.autoBackup') }}</span>
          <i class="msub">{{ d.abSub }}</i>
        </div>
        <div class="mini">
          <b :class="d.encCls">{{ d.encVal }}</b
          ><span>{{ t('home.dataEncryption') }}</span>
          <i class="msub">{{ d.encSub }}</i>
        </div>
        <div class="mini">
          <b>{{ d.storageStr }}</b
          ><span>{{ t('home.localStorage') }}</span>
        </div>
        <div class="mini">
          <b :class="d.sysDiskCls">{{ d.sysDiskVal }}</b
          ><span>{{ t('home.dbLocation') }}</span>
          <!-- 仅系统盘告警时出小字；非系统盘不再挂完整路径（过长不好看，盘符已在上面点明） -->
          <i v-if="d.sysDiskSub" class="msub">{{ d.sysDiskSub }}</i>
        </div>
        <div class="mini">
          <b :class="d.abnCls">{{ d.abnormal7 }}</b
          ><span>{{ t('home.last7Abnormal') }}</span>
        </div>
      </div>
    </section>

    <!-- 局域共享：共享状态 / 大区 / 文档 / 访客 / 浏览量（首页入口概览，6 格正好 2×3） -->
    <section class="panel lan">
      <div class="p-head"><Icon name="lan-share" :size="15" /> {{ t('home.lanPanel') }}</div>
      <div class="mini-grid">
        <div class="mini">
          <b :class="d.lanOnCls">{{ d.lanOn }}</b
          ><span>{{ t('home.lanStatus') }}</span>
        </div>
        <div class="mini">
          <b>{{ d.lanRegions }}</b
          ><span>{{ t('home.sharedRegions') }}</span>
        </div>
        <div class="mini">
          <b>{{ d.lanPosts }}</b
          ><span>{{ t('home.sharedPosts') }}</span>
        </div>
        <div class="mini">
          <b>{{ d.lanV7 }}</b
          ><span>{{ t('home.last7Visitors') }}</span>
        </div>
        <div class="mini">
          <b>{{ d.lanVToday }}</b
          ><span>{{ t('home.todayVisitors') }}</span>
        </div>
        <div class="mini">
          <b>{{ d.lanView7 }}</b
          ><span>{{ t('home.last7PostViews') }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Icon from '../Icon.vue';
import MiniBars from './MiniBars.vue';
import { formatBytes, daysAgo, formatDuration, dateOnly } from '../../utils/timefmt';
import { t } from '../../i18n';

const props = defineProps({ stats: { type: Object, required: true }, lan: { type: Object, default: () => ({}) } });

const d = computed(() => {
  const s = props.stats || {};
  const posts = s.posts || 0;
  const new7 = s.new7 || 0;
  const newPrev7 = s.newPrev7 || 0;
  const todayNew = ((s.last7 && s.last7[6]) || {}).count || 0;

  // 近 7 日环比
  let newSub = t('home.deltaNone');
  let deltaCls = '';
  if (newPrev7 > 0) {
    const pct = Math.round(((new7 - newPrev7) / newPrev7) * 100);
    if (pct > 0) {
      newSub = t('home.deltaUp', { n: pct });
      deltaCls = 'up';
    } else if (pct < 0) {
      newSub = t('home.deltaDown', { n: Math.abs(pct) });
      deltaCls = 'down';
    } else {
      newSub = t('home.deltaFlat');
    }
  } else if (new7 > 0) {
    newSub = t('home.deltaNew');
  }

  // 待清理 / 分类完整度
  const uncat = s.uncat || 0;
  const drafts = s.drafts || 0;
  const trash = s.trash || 0;
  const catPct = posts > 0 ? Math.max(0, Math.min(100, Math.round(((posts - uncat) / posts) * 100))) : 100;

  // 上次备份
  const dDays = s.lastBackupAt ? daysAgo(s.lastBackupAt) : null;
  const backupVal =
    dDays == null ? t('home.notBackedUp') : dDays <= 0 ? t('common.today') : t('home.daysAgo', { n: dDays });
  const backupSub = s.lastBackupAt ? dateOnly(s.lastBackupAt) : t('home.backupAdvice');

  // 数据加密
  const encVal = s.encrypted ? t('home.enabled') : t('home.disabled');
  const encCls = s.encrypted ? 'ok' : 'warn';
  const encSub = s.encrypted ? 'AES-256-GCM' : t('home.plaintext');

  // 自动备份检测
  const ab = s.autoBackup || {};
  const abStatus = ab.enabled ? t('home.enabled') : t('home.disabled');
  const abStatusCls = ab.enabled ? 'ok' : 'warn';
  const abSub = ab.enabled
    ? t(ab.schedule === 'daily' ? 'home.daily' : 'home.weekly') + ' · ' + t('home.configured')
    : t('home.notConfigured');

  // 本地存储 / 异常
  const storageStr = formatBytes(s.storageBytes || 0);
  const abnormal7 = s.abnormal7 || 0;
  const abnCls = abnormal7 > 0 ? 'warn' : '';

  // 数据库所在磁盘。
  // ★ 展示具体根盘符（如 "D:"），而不是「数据盘」这种笼统说法 ★
  //   用户反馈：写「数据盘」看不出数据到底在哪块盘上，迁移多盘后无法一眼核实；
  //   而下方再挂一行完整路径（D:\文档盒 Archbox\data）又太长、不好看。
  //   故取值改为盘符本身，并去掉那行小字。
  //   系统盘告警不丢：盘符文字仍按 onSys 染色（.warn），用户照样看得出「在系统盘上」。
  const onSys = !!s.onSystemDrive;
  const sysDiskVal = s.storageDrive || (onSys ? t('home.systemDrive') : t('home.dataDrive'));
  const sysDiskCls = onSys ? 'warn' : 'ok';
  const sysDiskSub = onSys ? t('home.moveOffAdvice') : '';

  // 使用时长（聚焦累计秒数）：近 7 日 vs 前 7 日环比
  const focusToday = s.usageToday || 0;
  const sumSec = arr => (Array.isArray(arr) ? arr : []).reduce((a, x) => a + (Number(x.seconds) || 0), 0);
  const focus7 = sumSec(s.usage7);
  const focusPrev7 = sumSec(s.usagePrev7);
  let focusDelta = t('home.deltaNone');
  let focusCls = '';
  if (focusPrev7 > 0) {
    const pct = Math.round(((focus7 - focusPrev7) / focusPrev7) * 100);
    if (pct > 0) {
      focusDelta = t('home.deltaUp', { n: pct });
      focusCls = 'up';
    } else if (pct < 0) {
      focusDelta = t('home.deltaDown', { n: Math.abs(pct) });
      focusCls = 'down';
    } else {
      focusDelta = t('home.deltaFlat');
    }
  } else if (focus7 > 0) {
    focusDelta = t('home.deltaNew');
  }

  // 7 日柱形图数据
  const last7Bars = (s.last7 || []).map(x => ({ label: x.label, value: Number(x.count) || 0 }));
  const focusBars = (s.usage7 || []).map(x => ({ label: x.label, value: Number(x.seconds) || 0 }));

  // 局域共享概览
  // 访客数已按 IP 去重（计名不计次）且排除本机自浏览，口径由后端 lanVisitorStats 统一提供
  //
  // ★ Beta.168：5 个数字一律过 enabled 守卫。
  // 后端 lan:myStats 已在关闭态归零，这里再兜一道 —— 任一侧将来漏改，都不会
  // 回退成「共享状态=未开启，旁边却写着共享大区 4」的自相矛盾画面。
  // 为什么必须有守卫而不是只信后端：关闭时 lan.sharedRegions（勾选记录）、副本库 sdb、
  // visitorLog 三者都不清，后端若忘了按 enabled 收口就会读出关闭前的旧数据。
  const lan = props.lan || {};
  const lanOn = lan.enabled ? t('home.enabled') : t('home.disabled');
  const lanOnCls = lan.enabled ? 'ok' : 'warn';
  const lanOnNow = !!lan.enabled;
  const lanRegions = lanOnNow ? lan.sharedRegionCount || 0 : 0;
  const lanPosts = lanOnNow ? lan.postCount || 0 : 0;
  const lanV7 = lanOnNow ? lan.visitor7 || 0 : 0;
  const lanVToday = lanOnNow ? lan.visitorToday || 0 : 0;
  const lanView7 = lanOnNow ? lan.postView7 || 0 : 0;

  const compose = [
    { l: t('home.composeRegion'), v: s.regions || 0 },
    { l: t('home.composeCategory'), v: s.cats || 0 },
    { l: t('home.composeTag'), v: s.tags || 0 },
    { l: t('home.composeField'), v: s.fields || 0 },
    { l: t('home.composeNote'), v: s.notes || 0 },
    { l: t('home.composeUser'), v: s.users || 0 }
  ];

  // 登录统计已抽为 independent 组件 LoginStats.vue，此处不再计算

  return {
    posts,
    new7,
    todayNew,
    newSub,
    deltaCls,
    uncat,
    drafts,
    trash,
    catPct,
    backupVal,
    backupSub,
    encVal,
    encCls,
    encSub,
    storageStr,
    abnormal7,
    abnCls,
    compose,
    focusToday,
    focus7,
    focusPrev7,
    focusDelta,
    focusCls,
    last7Bars,
    focusBars,
    abStatus,
    abStatusCls,
    abSub,
    sysDiskVal,
    sysDiskCls,
    sysDiskSub,
    lanOn,
    lanOnCls,
    lanRegions,
    lanPosts,
    lanV7,
    lanVToday,
    lanView7
  };
});
</script>

<style scoped>
.dash {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 12px;
}
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 11px 13px;
}
.p-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
  letter-spacing: 0.02em;
}
.panel-chart {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}

/* 核心概览 */
.hero-body {
  display: flex;
  align-items: center;
  gap: 14px;
}
.hero-num {
  font-size: 34px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.hero-side {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.hstat {
  display: flex;
  align-items: baseline;
  gap: 5px;
}
.hstat b {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.hstat span {
  font-size: 11.5px;
  color: var(--text-2);
}
.delta {
  font-style: normal;
  font-size: 11px;
  margin-left: 4px;
  padding: 1px 7px;
  border-radius: 999px;
}
.delta.up {
  color: var(--ok);
  background: var(--c-green-weak);
}
.delta.down {
  color: var(--danger);
  background: var(--danger-weak);
}

/* 使用时长：去掉左侧大数字，两行小指标 */
.focus-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 待整理 / 清理：轨道/填充复用分类分布水平条样式，保证 wire 主题斜线在浅底轨道上可见 */
.cat-bar {
  height: 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  overflow: hidden;
}
.cat-fill {
  height: 100%;
  background: var(--accent);
  border-radius: var(--radius-sm);
  transition: width 0.3s;
}
.cat-legend {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.cat-legend b {
  color: var(--text);
}
.clean-chips {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.cchip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-2);
  background: var(--surface-2);
  padding: 3px 9px;
  border-radius: 999px;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}
.d-draft {
  background: var(--c-orange);
}
.d-trash {
  background: var(--c-pink);
}

/* 紧凑指标网格（内容构成 / 安全与存储 共用） */
.mini-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px 8px;
}
.mini {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mini b {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.mini span {
  font-size: 11.5px;
  color: var(--text-2);
}
.mini .msub {
  font-size: 10.5px;
  color: var(--text-3);
  font-style: normal;
}
.mini b.ok {
  color: var(--ok);
}
.mini b.warn {
  color: var(--warn);
}

/* 登录统计样式已随卡片迁移至 LoginStats.vue */

/* 黑白线框主题：进度条斜线填充已移至全局 themes.css */
</style>
