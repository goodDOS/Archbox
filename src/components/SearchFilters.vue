<template>
  <div class="card search-filters">
    <div class="sf-row">
      <input
        ref="inputRef"
        class="input q"
        :value="q"
        :placeholder="placeholder"
        @input="onInput"
        @keyup.enter="search"
      />
      <button class="btn btn-primary" @click="search">{{ t('common.search') }}</button>
    </div>
    <div class="filters">
      <template v-for="f in activeFilters" :key="f">
        <div v-if="f === 'date'" class="f-item">
          <span class="f-label">{{ t('search.dateRange') }}</span>
          <DatePicker v-model="dateFrom" :placeholder="t('search.dateFrom')" />
          <span class="f-sep">{{ t('search.to') }}</span>
          <DatePicker v-model="dateTo" :placeholder="t('search.dateTo')" />
        </div>
        <div v-else-if="f === 'region'" class="f-item">
          <span class="f-label">{{ t('search.region') }}</span>
          <Dropdown v-model="regionId" :options="regionOptions" @change="search" />
        </div>
        <div v-else-if="f === 'category'" class="f-item">
          <span class="f-label">{{ t('search.category') }}</span>
          <Dropdown v-model="categoryId" :options="categoryOptions" @change="search" />
        </div>
        <div v-else-if="f === 'tag'" class="f-item">
          <span class="f-label">{{ t('search.tag') }}</span>
          <Dropdown v-model="tagId" :options="tagOptions" @change="search" />
        </div>
        <div v-else-if="f === 'field'" class="f-item">
          <span class="f-label">{{ t('search.field') }}</span>
          <Dropdown v-model="fieldCode" :options="fieldOptions" style="max-width: 150px" @change="search" />
          <input
            class="input"
            v-model="fieldValue"
            :placeholder="t('search.fieldValuePlaceholder')"
            @keyup.enter="search"
          />
        </div>
        <div v-else-if="f === 'author'" class="f-item">
          <span class="f-label">{{ t('common.author') }}</span>
          <Dropdown v-model="authorId" :options="authorOptions" @change="search" />
        </div>
        <div v-else-if="f === 'origin'" class="f-item">
          <span class="f-label">{{ t('search.origin') }}</span>
          <Dropdown v-model="origin" :options="originOptions" @change="search" />
        </div>
      </template>
      <button v-if="showReset" class="btn btn-sm" @click="reset">{{ t('search.resetFilters') }}</button>
    </div>
  </div>
</template>

<script>
// ★ 筛选项唯一清单（全仓库仅此一处定义）★
// 顺序即渲染顺序：日期范围 → 大区 → 分类 → 标签 → 字段 → 作者 → 来源
// 渲染分支、prop 默认值、所有调用页面的 :filters 全部引用它；新增筛选项只能改这里。
//
// 为什么要收归组件：这份清单曾被硬编码 3 份（两个页面各一份 + prop 默认值一份），
// 其中 2 份漏了 'origin' —— 于是「所有文档」有来源筛选而「全局搜索」没有，
// 两页调的是同一个 API、同一套后端，能力全在，只差这一行数组。
// 复本项目铁律：同一份逻辑不得在多处重写。
export const SEARCH_FILTER_KEYS = Object.freeze(['date', 'region', 'category', 'tag', 'field', 'author', 'origin']);
</script>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { store } from '../store';
import { A } from '../api';
import { toast } from '../feedback';
import Dropdown from './Dropdown.vue';
import DatePicker from './DatePicker.vue';
import { t } from '../i18n';

const props = defineProps({
  // 需要显示的筛选项，顺序即渲染顺序。
  // 默认即唯一清单 SEARCH_FILTER_KEYS，调用页面不得各自抄写 —— 抄写就是本次 bug 的根因。
  // 用工厂形式：编译器会把 props 提到模块级，直接写 default: SEARCH_FILTER_KEYS 有 TDZ 风险。
  filters: { type: Array, default: () => SEARCH_FILTER_KEYS },
  // 是否允许「空字段（无关键词也无筛选）」直接搜索：true=显示全部（所有文档页），false=提示不搜（全局搜索页）
  allowEmpty: { type: Boolean, default: false },
  placeholder: { type: String, default: () => t('search.keywordPlaceholder') },
  showReset: { type: Boolean, default: true },
  // 初始筛选（由外部跳转预置，如聚合管理带大区/分类/标签、作者跳转带作者）
  initial: { type: Object, default: () => ({}) },
  emptyMsg: { type: String, default: () => t('search.emptyMsg') }
});
const emit = defineEmits(['search', 'reset']);

const q = ref('');
const inputRef = ref(null);
const dateFrom = ref('');
const dateTo = ref('');
const regionId = ref(null);
const categoryId = ref(null);
const tagId = ref(null);
const fieldCode = ref('');
const fieldValue = ref('');
const authorId = ref(null);
// 来源甄别：null=全部 / true=仅导入文档 / false=仅本机自建
const origin = ref(null);
const cats = ref([]);
const tags = ref([]);
const fields = ref([]);

const regions = computed(() => store.regions);
const users = computed(() => store.users);
const activeFilters = computed(() => props.filters);

// 自建下拉（Dropdown）的统一 options 形态：[{ value, label }]，首项「全部」
const regionOptions = computed(() => [
  { value: null, label: t('common.all') },
  ...regions.value.map(r => ({ value: r.id, label: r.name }))
]);
const categoryOptions = computed(() => [
  { value: null, label: t('common.all') },
  ...cats.value.map(c => ({ value: c.id, label: c.region_name ? `${c.name}（${c.region_name}）` : c.name }))
]);
const tagOptions = computed(() => [
  { value: null, label: t('common.all') },
  ...tags.value.map(t => ({
    value: t.id,
    label: t.post_count != null ? `# ${t.name}（${t.post_count}）` : `# ${t.name}`
  }))
]);
const fieldOptions = computed(() => [
  { value: '', label: t('search.allFields') },
  ...fields.value.map(fld => ({ value: fld.code, label: `${fld.name}（${fld.code}）` }))
]);
const authorOptions = computed(() => [
  { value: null, label: t('common.all') },
  ...users.value.map(u => ({ value: u.id, label: u.name }))
]);
// 来源甄别下拉：四态枚举（与后端 buildWhere 的 f.origin 一一对应）
// ★ 用枚举而非布尔 ★ 文档包导入 / 局域共享拷贝是两种独立来源，
// 布尔「是否导入」无法表达「拷贝文档」，且会把拷贝文档错算进「本机自建」。
const originOptions = computed(() => [
  { value: null, label: t('common.all') },
  { value: 'import', label: t('search.originImport') },
  { value: 'copy', label: t('search.originCopy') },
  { value: 'local', label: t('search.originLocal') }
]);

function onInput(e) {
  q.value = e.target.value;
}

function buildParams() {
  return {
    q: q.value,
    dateFrom: dateFrom.value || null,
    dateTo: dateTo.value || null,
    regionId: regionId.value,
    categoryId: categoryId.value || null,
    tagId: tagId.value || null,
    fieldCode: fieldCode.value || null,
    fieldValue: fieldValue.value || null,
    authorId: authorId.value || null,
    origin: origin.value || null
  };
}

function hasAny() {
  return (
    q.value.trim() ||
    regionId.value ||
    categoryId.value ||
    tagId.value ||
    fieldCode.value ||
    fieldValue.value ||
    authorId.value ||
    dateFrom.value ||
    dateTo.value ||
    origin.value != null
  );
}

function search() {
  if (!props.allowEmpty && !hasAny()) {
    toast(props.emptyMsg);
    return;
  }
  emit('search', buildParams());
}

/* ★ 选完筛选项立即加载（Beta.320）。
 * 下拉自带 @change 已直连 search()；DatePicker 只抛 update:modelValue，且提交日期后
 * 弹层自行关闭、用户没有「再点搜索」的动作，故在此监听日期变化补一次自动加载。
 *
 * 两处「不是用户改的」必须跳过，否则会误触发一次多余查询：
 *   · syncing=true —— apply() 批量回填（初始参数 / 同页跳转）期间，父页面自己会调 search
 *   · 两个日期在 apply 里先后赋值，第一次赋值时值还是半成品 */
let syncing = false;
watch([dateFrom, dateTo], () => {
  if (syncing) return;
  search();
});

function reset() {
  // 重置由父页面在 @reset 里自行加载，这里不应再被日期 watch 补一次查询
  syncing = true;
  q.value = '';
  dateFrom.value = '';
  dateTo.value = '';
  regionId.value = null;
  categoryId.value = null;
  tagId.value = null;
  fieldCode.value = '';
  fieldValue.value = '';
  authorId.value = null;
  origin.value = null;
  emit('reset');
  nextTick(() => {
    syncing = false;
  });
}

// 由父页面在「同页切换」时调用，覆盖某几个筛选并触发搜索（如搜索结果中点作者）
function apply(p = {}) {
  // 回填期间同步标记，避免日期 watch 在参数只填了一半时就自动查一次
  syncing = true;
  if (p.q != null) q.value = p.q;
  if ('dateFrom' in p) dateFrom.value = p.dateFrom || '';
  if ('dateTo' in p) dateTo.value = p.dateTo || '';
  if ('regionId' in p) regionId.value = p.regionId ?? null;
  if ('categoryId' in p) categoryId.value = p.categoryId ?? null;
  if ('tagId' in p) tagId.value = p.tagId ?? null;
  if ('fieldCode' in p) fieldCode.value = p.fieldCode ?? '';
  if ('fieldValue' in p) fieldValue.value = p.fieldValue ?? '';
  if ('authorId' in p) authorId.value = p.authorId ?? null;
  // ★ 不保留旧的 imported 布尔兼容分支：来源早已是四态枚举（全部/文档包导入/局域共享拷贝/本机自建），
  //   布尔「是否导入」既表达不了「拷贝文档」，也会把拷贝文档错算进「本机自建」。
  //   且该分支已无任何调用点，留着只会给 origin 留第二套编码。
  if ('origin' in p) origin.value = p.origin || null;
  // watch 是异步（pre flush）触发的，等它跑完再解除标记
  nextTick(() => {
    syncing = false;
  });
}

function focus() {
  inputRef.value && inputRef.value.focus();
}
function getParams() {
  return buildParams();
}

onMounted(async () => {
  // 先同步应用初始筛选（在 await 之前），确保父页面 onMounted 调用 .search() 时筛选已就绪
  apply(props.initial);
  // 下拉数据源异步加载（不影响 initial 应用与搜索）
  A.cats({})
    .then(r => {
      cats.value = r;
    })
    .catch(() => {});
  A.tags()
    .then(r => {
      tags.value = r;
    })
    .catch(() => {});
  A.fields()
    .then(r => {
      fields.value = r;
    })
    .catch(() => {});

  // 作者下拉依赖 store.users；登录/设置等流程都只把用户列表塞进各自本地 ref，
  // 从不写回 store.users，导致这里下拉无可选作者，点击作者跳转后只显示默认项。
  // 主动拉取完整用户列表并覆盖，数据到位后再对齐一次，使 select 能匹配到对应
  // option 并显示作者名
  try {
    const list = await A.users();
    if (list && list.length) {
      store.users = list;
      apply(props.initial);
    }
  } catch (e) {}
});

// 同页跳转（如文档页内点击作者/聚合）不会重挂载本组件，需监听 initial 变化，
// 把新参数重新套用到筛选器并触发搜索，否则筛选器会停留在上一次状态
watch(
  () => props.initial,
  v => {
    apply(v);
    search();
  }
);

defineExpose({ search, reset, apply, focus, getParams });
</script>

<style scoped>
.search-filters {
  padding: 14px 16px;
}
.sf-row {
  display: flex;
  gap: 10px;
}
.q {
  font-size: 15px;
  padding: 10px 14px;
}
.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.f-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
/* ★ 筛选控件统一尺寸（Beta.320）：
 * 之前 .dropdown 是 width:100%（在 flex 里随选项文字伸缩）、DatePicker 是 min-width:120px
 * 且高度 30px 与下拉的 34px 不一致 —— 同一排筛选框宽的宽、窄的窄，换个长一点的大区名
 * 就再变一次，视觉上永远对不齐。统一为「定宽 + 同高」：
 * 宽度只由筛选项自身决定，与选项文字无关；超长文案交给 ellipsis 截断，不撑破布局。
 *
 * 子组件内部的 class 用 :deep() 触达（scoped 无法直接命中 Dropdown / DatePicker 内部）。 */
.f-item :deep(.dropdown),
.f-item :deep(.dp) {
  width: 168px;
  flex: none;
}
.f-item :deep(.dd-trigger),
.f-item :deep(.dp-trigger) {
  width: 100%;
  height: 30px;
  box-sizing: border-box;
}
/* 日期范围是两个框并排 + 中间「至」，必须比单个下拉窄，否则一行放不下其余筛选项 */
.f-item :has(:deep(.dp)) :deep(.dp) {
  width: 128px;
}
/* 字段值输入框与「字段名」下拉是一组，同宽同高 */
.f-item .input {
  width: 168px;
  height: 30px;
  box-sizing: border-box;
  padding: 0 8px;
  font-size: 12.5px;
}
.f-label {
  font-size: 12px;
  color: var(--text-2);
  writing-mode: horizontal-tb;
  white-space: nowrap;
  flex-shrink: 0;
}
/* 日期范围内的连接词「至」：比 .f-label(text-2) 更弱一级，故用局部类而非覆写全局 .dim */
.f-sep {
  color: var(--text-3);
  font-size: 12px;
}
</style>
