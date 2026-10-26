<template>
  <Modal :title="t('post.tagCloudTitle')" icon="tag" max-width="560px" @close="close">
    <template #default="{ requestClose }">
      <!-- 顶部：搜索 + 新建。搜索框常驻，几百个标签时靠打字定位比滚动快得多 -->
      <div class="tc-toolbar">
        <input
          class="input tc-search"
          v-model="kw"
          :placeholder="t('post.tagCloudSearch')"
          maxlength="20"
          ref="searchRef"
          @keydown.enter.prevent="toggleFirst"
        />
        <button
          v-if="canCreate"
          class="btn btn-sm"
          :disabled="!kw.trim() || !!exists"
          :title="exists ? t('post.tagCloudExists') : t('post.tagCloudCreate')"
          @click="create"
        >
          + {{ t('post.tagCloudCreate') }}
        </button>
      </div>

      <!-- 标签云：字号与颜色深浅由使用次数决定（用得越多越大越深），扫一眼就能看出热标签。
           这一层是滚动容器 —— 标签几百个时只在框内滚，不会把弹窗撑破屏幕。 -->
      <div class="tc-body" v-if="visibleTags.length">
        <button
          v-for="tag in visibleTags"
          :key="tag.id"
          type="button"
          class="tc-tag"
          :class="[heatClass(tag), { on: isPicked(tag.name) }]"
          :style="heatStyle(tag)"
          :title="t('post.tagCloudCount', { n: tag.post_count || 0 })"
          :aria-pressed="isPicked(tag.name)"
          @click="toggle(tag.name)"
        >
          <span class="tc-name">{{ tag.name }}</span>
          <span v-if="tag.post_count > 0" class="tc-count">{{ tag.post_count }}</span>
        </button>
      </div>
      <div class="tc-empty" v-else-if="kw.trim()">
        {{ t('post.tagCloudNoMatch', { kw: kw.trim() }) }}
      </div>
      <div class="tc-empty" v-else>{{ t('post.tagCloudEmpty') }}</div>

      <div class="modal-foot">
        <span class="tc-hint">{{ t('post.tagCloudPicked', { n: picked.length, max: max }) }}</span>
        <button class="btn" @click="requestClose">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" @click="apply">{{ t('post.tagCloudApply') }}</button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
/**
 * 标签云弹窗（取代原生 <datalist>）。
 *
 * 【为什么要换掉 datalist】原实现是 <input list="tag-suggest"> + <datalist>。
 *   Chromium 下 datalist 的下拉由 OS 原生绘制，CSS 完全无法控制：没有边框、
 *   没有内边距、不跟随主题，标签一多就直接铺成一块占满整屏的黑块（用户截图即此）。
 *   连"最多显示几条、多了滚动"这种最低要求都做不到 —— 因为它根本不在文档流里。
 *   自建弹窗把渲染权拿回来，才能谈样式和滚动。
 *
 * 【交互口径】
 *   · 点标签 = 立刻加入/移除（按压式多选，aria-pressed 同步状态），最后「确定」一次性回写。
 *     不逐次回写父组件，是因为父组件每 write 一次都在记脏标记；取消时还要回滚，
 *     徒增状态机。这里草稿态留给自己，父组件只看到一次最终结果。
 *   · 已在文档里的标签预先点亮：用户点开是为了「再加几个」，而不是从空白重选，
 *     不预选的话一点「确定」就会把原有标签全冲掉。
 *   · 搜索命中 + 回车 = 选中第一个命中项；一个都没命中 + 有新建权限 = 回车即新建。
 *     两种意图都很常见，用「是否命中」分流，不需要用户记住两套键。
 */
import { ref, computed, nextTick, onMounted } from 'vue';
import Modal from '../Modal.vue';
import { t } from '../../i18n';

const props = defineProps({
  /** 全部标签：[{ id, name, post_count }] */
  tags: { type: Array, default: () => [] },
  /** 已选标签名（按名称，与 posts 的 tags 字段口径一致） */
  selected: { type: Array, default: () => [] },
  /** 标签上限，超出即不可再选 */
  max: { type: Number, default: 10 },
  /** 是否允许就地新建标签（只读数据源时禁止） */
  canCreate: { type: Boolean, default: false }
});
const emit = defineEmits(['close', 'apply', 'created']);

const kw = ref('');
const searchRef = ref(null);
/** 草稿选中态：字符串数组，与父组件的 form.tags 同构 */
const picked = ref([...(props.selected || [])]);

const exists = computed(() => {
  const n = kw.value.trim();
  return !!n && props.tags.some(x => x.name === n);
});

/** 过滤：按名称包含匹配，不区分大小写。后端已按使用次数倒序，这里保持原序 */
const visibleTags = computed(() => {
  const q = kw.value.trim().toLowerCase();
  if (!q) return props.tags;
  return props.tags.filter(x => String(x.name).toLowerCase().includes(q));
});

// ---- 热度分级：post_count 的最大值作分母，三档 ----
const maxCount = computed(() => props.tags.reduce((m, x) => Math.max(m, x.post_count || 0), 0));
function heatClass(tag) {
  if (!maxCount.value || !tag.post_count) return 'lv0';
  const r = tag.post_count / maxCount.value;
  return r >= 0.66 ? 'lv3' : r >= 0.33 ? 'lv2' : 'lv1';
}
// 只给字号：颜色交给 class（走主题变量），两者分工，换主题时不必重算内联样式
function heatStyle(tag) {
  const lv = heatClass(tag);
  return { fontSize: lv === 'lv3' ? '15px' : lv === 'lv2' ? '14px' : '13px' };
}

function isPicked(name) {
  return picked.value.includes(name);
}

function toggle(name) {
  const i = picked.value.indexOf(name);
  if (i >= 0) {
    picked.value.splice(i, 1);
    return;
  }
  if (picked.value.length >= props.max) return;
  picked.value.push(name);
}

function toggleFirst() {
  const first = visibleTags.value[0];
  if (first) {
    toggle(first.name);
    return;
  }
  if (props.canCreate && kw.value.trim() && !exists.value) create();
}

/** 就地新建标签：写完立刻点亮，用户少一步「新建后再找它」 */
async function create() {
  const name = kw.value.trim().slice(0, 20);
  if (!name || !props.canCreate) return;
  emit('created', name);
  if (picked.value.length < props.max && !isPicked(name)) picked.value.push(name);
  kw.value = '';
}

function apply() {
  emit('apply', [...picked.value]);
  emit('close');
}
function close() {
  emit('close');
}

onMounted(() =>
  nextTick(() => {
    searchRef.value && searchRef.value.focus();
  })
);
</script>

<style scoped>
/* ★ 这一行不需要任何左右内缩（Beta.285 定案：辉光已去除）
 *
 * 三轮试错的结论，记下来免得再加回去：
 *   ① 加 `padding: 0 6px` 想给辉光留空间 → 搜索框比标签云窄 12px、与底部按钮左沿不齐，
 *      用户一眼看出「搜索框这一行宽度没对齐」；
 *   ② 给 .modal-body 加负 margin 抵消 padding → 缓冲被抵消成 0，辉光照样被裁；
 *   ③ 最终去掉辉光本身（.input:focus 只换边框色），问题从根上消失。
 *
 * 现在这里**什么都不用加**：工具栏与标签云、底部按钮同属 .modal-body 的内容区，
 * 只要三者都没有多余的水平 padding / margin，border box 就天然齐平。
 *
 * 判据：**溢出物在哪里产生，就在哪里消除**。
 *   box-shadow 是画在盒外的，只要还在用，就永远要和所有祖先的 overflow 博弈；
 *   改用边框色（画在盒内）之后，任何 overflow 都裁不到，也就不需要任何余量。
 */
.tc-toolbar {
  display: flex;
  gap: 8px;
  margin: 0 0 10px;
  flex: none;
}
.tc-search {
  flex: 1;
  min-width: 0;
}

/* ★ 滚动关键：给最大高度 + overflow-y:auto。
   高度用 vh 换算而不是固定像素 —— 弹窗本身有 max-height:86vh，
   标签云再吃掉 34vh 后仍余下图栏与底部按钮的空间，窗口再矮也不会溢出。
 *
 * ★ Beta.286：min-height 84px → 40px。
 *   84px 是早期为「空态也留出可点击区域」定的，那时标签云还是候选区。
 *   改成按压式多选之后，只有一两个标签时这 84px 里 60px 是纯空白，
 *   弹窗正文被顶开一块，用户截图里一眼就能看出来。
 *   40px ≈ 单行标签实高（13px 字号 ×1.5 + 上下 4px padding + 2px 边框 ≈ 36px）再留 4px 余量，
 *   单行标签既贴边又不悬空。**上限与滚动判定不受影响**：仍是 max-height + overflow-y:auto，
 *   标签一多该滚照滚 —— 下限只决定「最少占多高」，不决定「何时开始滚」。 */
.tc-body {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-content: flex-start;
  max-height: min(340px, 34vh);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  flex: 1 1 auto;
  min-height: 40px;
  /* 滚动时给一条细滚动条，与全站 .scroll-thumb 口径一致 */
  scrollbar-width: thin;
}
.tc-body::-webkit-scrollbar {
  width: 8px;
}
.tc-body::-webkit-scrollbar-thumb {
  background: var(--scroll-thumb);
  border-radius: 4px;
}

.tc-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 11px;
  border-radius: 999px;
  cursor: pointer;
  background: var(--surface);
  color: var(--text-2);
  border: 1px solid var(--border-strong);
  font: inherit;
  line-height: 1.5;
  transition:
    background 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease;
}
.tc-tag:hover {
  border-color: var(--accent);
  color: var(--text);
}
/* 热度：lv0 = 没人用过（最淡），lv3 = 最热 */
.tc-tag.lv1 {
  color: var(--text-2);
}
.tc-tag.lv2 {
  color: var(--text);
}
.tc-tag.lv3 {
  color: var(--text);
  border-color: var(--accent);
  background: var(--accent-weak);
}
.tc-tag.on {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent);
  font-weight: 600;
}
.tc-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tc-count {
  font-size: 11px;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
.tc-tag.on .tc-count {
  opacity: 0.85;
}

.tc-empty {
  padding: 22px 10px;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  flex: none;
}
.tc-hint {
  margin-right: auto;
  font-size: 12px;
  color: var(--text-3);
  align-self: center;
}
</style>
