<template>
  <div class="versions card no-print">
    <div class="fc-title">{{ t('post.versionHistoryCount', { n: versions.length }) }}</div>
    <div class="ver" v-for="v in versions" :key="v.id" :class="{ 'is-current': v.is_current }">
      <div class="ver-info">
        <b>v{{ v.version_no }}</b>
        <!-- 「当前版本」＝ v.is_current（后端按 MAX(version_no) 判定，见 listVersions）。
             语义依据：saveVersion 保证最新版本的内容恒等于当前落库内容，
             所以最高版本号就是「现在这份内容」的版本号。 -->
        <span class="ver-badge" v-if="v.is_current">{{ t('post.currentVersion') }}</span>
        <span>{{ withTz(v.created_at) }}</span>
        <span>{{ v.user_name || t('post.system') }}</span>
        <!-- ★ 如实显示体积：saveVersion 无去重，含内联图片的正文会反复把快照撑大，
             版本号序列干净但库在悄悄膨胀 —— 显示体积比默默去重更诚实（去重会破坏序列语义）。 -->
        <span class="ver-size" v-if="v.size != null">{{ formatBytes(v.size) }}</span>
      </div>
      <div class="ver-acts">
        <button class="btn btn-sm" @click="$emit('preview', v)" :disabled="busy" :title="t('post.previewVerTip')">
          {{ t('common.preview') }}
        </button>
        <!-- 对比是纯只读：不绑 writable，与「预览」同一口径（只读文档也该能看清自己改过什么） -->
        <button class="btn btn-sm" @click="$emit('compare', v)" :disabled="busy" :title="t('post.compareTip')">
          {{ t('post.compare') }}
        </button>
        <!-- 当前版本＝文档现在的内容，恢复它是一次空操作（后端 saveVersion 也会去重），故直接禁用 -->
        <button
          class="btn btn-sm"
          @click="$emit('restore', v)"
          :disabled="busy || !writable || v.is_current"
          :title="v.is_current ? t('post.curVerTip') : t('post.restoreVerTip')"
        >
          {{ t('common.restore') }}
        </button>
      </div>
    </div>
    <div class="empty" v-if="!versions.length">{{ t('post.noVersions') }}</div>
  </div>
</template>

<script setup>
import { withTz, formatBytes } from '../../utils/timefmt';
import { t } from '../../i18n';
defineProps({
  versions: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  writable: { type: Boolean, default: true }
});
defineEmits(['restore', 'preview', 'compare']);
</script>

<style scoped>
/* 历史版本侧栏（右列，sticky 跟随滚动）。
 *
 * 【top 必须让开「吸顶页头 + 页头下方那段留白」】
 *   页头 .page-head.sticky-head 是 position:sticky，滚动时钉在 .main 最顶端
 *   （吸附线已由 top:-20px 提到容器顶），可见高度 55px（--sticky-head-h 43 + 上下内边距与描边）；
 *   页头下方还留了 --card-gap（16px）的间距，让正文首卡与卡片间距一致。
 *   本栏若 top:0，滚上去会滑到页头**底下**与之重叠，版本行被标题条压住。
 *   ★ 具体数值不要在这里心算（51+16=67 看起来对，实际会被多推 8px）：
 *     sticky 的 top 相对滚动容器的 **padding box** 解析，而 .main 有 padding-top:20px，
 *     故必须做基准换算。真实取值由 base.css 的 --sticky-rail-top 统一给出，
 *     该值是**在真实页面上扫参实测**确定的（详见那里的注释），本组件只负责引用。
 *     fallback 也必须与该值 51px 一致，否则变量一旦取不到就会出现"两处脱节"。
 * 【必须给背景】sticky 只是"停在原位"，下方内容仍会从本栏背后穿过；
 *   组件根元素原本无背景色，滚动时会看到卡片从版本列表背后透出来叠字。
 *   用 --surface 与左右内容卡片同底。
 * 【z-index 比页头低一档】页头是 --z-hint(1000)，本栏取 --z-below-hint(999)：两者不重叠时无差别，
 *   万一视口极窄导致错位，也是页头盖住侧栏（正确方向），而不是反压标题条。 */
.versions {
  padding: 4px 14px 12px;
  position: sticky;
  top: var(--sticky-rail-top, 51px);
  z-index: var(--z-below-hint);
  background: var(--surface);
}
.ver {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px dashed var(--border);
}
.ver-info {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--text-2);
}
.ver-info b {
  font-size: 13px;
  color: var(--text);
}
/* 当前版本行：左侧加一道主题色竖条 + 版本号染色，让「我现在是哪一版」一眼可见。
 * 颜色全部走 CSS 变量（--accent / --accent-text），8 套主题下都成立。 */
.ver.is-current {
  border-left: 2px solid var(--accent);
  padding-left: 8px;
  margin-left: -8px;
}
.ver.is-current .ver-info b {
  color: var(--accent);
}
.ver-badge {
  align-self: flex-start;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.6;
  background: var(--accent);
  color: var(--accent-text);
}
/* 三个按钮并排：预览与对比是只读操作（不受 writable 影响），恢复才受只读与忙碌限制 */
.ver-acts {
  display: flex;
  gap: 6px;
  flex: none;
}
.ver-acts .btn {
  padding: 4px 8px;
}
.ver-size {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
</style>
