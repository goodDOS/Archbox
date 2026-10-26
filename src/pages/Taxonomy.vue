<template>
  <div>
    <div class="page-head">
      <div>
        <h1>{{ t('taxonomy.title') }}</h1>
        <div class="desc">{{ t('taxonomy.desc') }}</div>
      </div>
    </div>

    <!-- ★ 循环变量名不要用 t（Beta.282，对应报错 TypeError: t is not a function）。
         模板里的 t 是 i18n 的翻译函数。一旦把循环变量也命名成 t，
         循环体里的 t(...) 就会绑定到那个局部变量（一个数据对象），
         调它等于「把对象当函数调」，抛 TypeError。
         Vue 只在**循环体内部**才发生遮蔽，所以症状极刁钻：页头、表头全正常，
         只有列表行炸；只要列表非空整块渲染就中断，页面看起来是白屏。
         本文件历史上正是这么炸的（标签页），详见下方标签块注释。
         —— 注释里刻意不写完整的错误写法，避免它被当成代码片段扫描或复制扩散。 -->
    <div class="tabs">
      <button v-for="tb in TABS" :key="tb.key" class="tab" :class="{ on: tab === tb.key }" @click="tab = tb.key">
        {{ tb.label }} <span class="badge">{{ counts[tb.key] || 0 }}</span>
      </button>
    </div>

    <!-- 大区 -->
    <div class="card" v-if="tab === 'region'">
      <div class="tbl-bar">
        <button class="btn btn-primary btn-sm" @click="editRegion(null)">{{ t('taxonomy.newRegionBtn') }}</button>
      </div>
      <div class="x-scroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>{{ t('common.name') }}</th>
              <th>{{ t('common.code') }}</th>
              <th>{{ t('taxonomy.colorLabel') }}</th>
              <th>{{ t('taxonomy.catCount') }}</th>
              <th>{{ t('taxonomy.docCount') }}</th>
              <th>{{ t('common.createdAt') }}</th>
              <th style="width: 130px">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in regions" :key="r.id" class="row-click" @click="goto('posts', { regionId: r.id })">
              <td>
                <b>{{ r.name }}</b>
              </td>
              <td>
                <code class="code">{{ r.code || '—' }}</code>
              </td>
              <td><span class="dot" :style="{ background: r.color }"></span></td>
              <td>{{ r.cat_count }}</td>
              <td>{{ r.post_count }}</td>
              <td class="dim">{{ withTz(r.created_at) }}</td>
              <td>
                <button class="btn btn-sm" @click.stop="editRegion(r)">{{ t('common.edit') }}</button>
                <button class="btn btn-sm btn-danger" @click.stop="del(A.regionDelete, r.id, r.name)">
                  {{ t('common.delete') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="empty" v-if="!regions.length">{{ t('taxonomy.noRegions') }}</div>
    </div>

    <!-- 分类 -->
    <div class="card" v-if="tab === 'cat'">
      <div class="tbl-bar">
        <Dropdown v-model="catRegion" :options="catRegionOptions" style="max-width: 200px" />
        <button class="btn btn-primary btn-sm" @click="editCat(null)">{{ t('taxonomy.newCatBtn') }}</button>
      </div>
      <div class="x-scroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>{{ t('common.name') }}</th>
              <th>{{ t('common.code') }}</th>
              <th>{{ t('taxonomy.belongRegion') }}</th>
              <th>{{ t('taxonomy.docCount') }}</th>
              <th>{{ t('common.createdAt') }}</th>
              <th style="width: 130px">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in catRows" :key="c.id" class="row-click" @click="goto('posts', { categoryId: c.id })">
              <td>
                <b>{{ c.name }}</b>
              </td>
              <td>
                <code class="code">{{ c.code || '—' }}</code>
              </td>
              <td>{{ c.region_name }}</td>
              <td>{{ c.post_count }}</td>
              <td class="dim">{{ withTz(c.created_at) }}</td>
              <td>
                <button class="btn btn-sm" @click.stop="editCat(c)">{{ t('common.edit') }}</button>
                <button class="btn btn-sm btn-danger" @click.stop="del(A.catDelete, c.id, c.name)">
                  {{ t('common.delete') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="empty" v-if="!catRows.length">{{ t('taxonomy.noCats') }}</div>
    </div>

    <!-- 标签 ★ 循环变量必须叫 tag，不能叫 t（Beta.282，用户报「聚合管理标签页空白」）。
         原来这里把循环变量命名为 t，而行内又要调 i18n 的翻译函数，
         编译后循环变量遮蔽了翻译函数 —— 每渲染一行都抛 TypeError，
         标签页整块渲染失败、右侧纯白，控制台里是 “t is not a function”。
         大区/分类/字段三页没事，正因它们没用 t 当循环变量。
         全仓守卫：electron/verify/i18n-reactivity.test.mjs 第 5 组「v-for 变量遮蔽 t()」。
         —— 注释里刻意不写完整错误写法，避免被静态扫描或复制扩散。 -->
    <div class="card" v-if="tab === 'tag'">
      <div class="tbl-bar">
        <button class="btn btn-primary btn-sm" @click="editTag(null)">{{ t('taxonomy.newTagBtn') }}</button>
      </div>
      <div class="x-scroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>{{ t('taxonomy.tagName') }}</th>
              <th>{{ t('taxonomy.docCount') }}</th>
              <th>{{ t('common.createdAt') }}</th>
              <th style="width: 130px">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tag in tags" :key="tag.id" class="row-click" @click="goto('posts', { tagId: tag.id })">
              <td>
                <span class="chip"># {{ tag.name }}</span>
              </td>
              <td>{{ tag.post_count }}</td>
              <td class="dim">{{ withTz(tag.created_at) }}</td>
              <td>
                <button class="btn btn-sm" @click.stop="editTag(tag)">{{ t('common.edit') }}</button>
                <button class="btn btn-sm btn-danger" @click.stop="del(A.tagDelete, tag.id, tag.name)">
                  {{ t('common.delete') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="empty" v-if="!tags.length">{{ t('taxonomy.noTags') }}</div>
    </div>

    <!-- 自定义字段 -->
    <div class="card" v-if="tab === 'field'">
      <div class="tbl-bar">
        <span class="dim" style="font-size: 12px">{{ t('taxonomy.fieldHint') }}</span>
        <button class="btn btn-primary btn-sm" @click="editField(null)">{{ t('taxonomy.newFieldBtn') }}</button>
      </div>
      <div class="x-scroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>{{ t('taxonomy.fieldName') }}</th>
              <th>{{ t('common.code') }}</th>
              <th>{{ t('taxonomy.dataType') }}</th>
              <th>{{ t('taxonomy.optionsLabel') }}</th>
              <th>{{ t('common.required') }}</th>
              <th>{{ t('taxonomy.uniqueCheck') }}</th>
              <th>{{ t('taxonomy.docCount') }}</th>
              <th>{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in fields" :key="f.id">
              <td>
                <b>{{ f.name }}</b>
              </td>
              <td>
                <code class="code">{{ f.code }}</code>
              </td>
              <td>
                <span class="badge">{{ typeName(f.type) }}</span>
              </td>
              <td class="dim">{{ (f.options || []).join(' ｜ ') || '—' }}</td>
              <td>{{ f.required ? '✓' : '—' }}</td>
              <td>{{ f.unique_field ? '✓' : '—' }}</td>
              <td>{{ f.post_count }}</td>
              <td>
                <button class="btn btn-sm" @click="editField(f)">{{ t('common.edit') }}</button>
                <button class="btn btn-sm btn-danger" @click="del(A.fieldDelete, f.id, f.name)">
                  {{ t('common.delete') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="empty" v-if="!fields.length">{{ t('taxonomy.noFields') }}</div>
    </div>

    <RegionModal v-if="mRegion" :value="mRegion" @close="mRegion = null" @saved="onSaved" />
    <CategoryModal v-if="mCat" :value="mCat" :regions="regions" @close="mCat = null" @saved="onSaved" />
    <TagModal v-if="mTag" :value="mTag" @close="mTag = null" @saved="onSaved" />
    <FieldModal v-if="mField" :value="mField" @close="mField = null" @saved="onSaved" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { store, goto, refreshRegions, bus } from '../store';
import { okMsg } from '../feedback';
import { A } from '../api';
import { useSubmit } from '../composables/useSubmit';
import RegionModal from '../components/RegionModal.vue';
import CategoryModal from '../components/taxonomy/CategoryModal.vue';
import TagModal from '../components/taxonomy/TagModal.vue';
import FieldModal from '../components/taxonomy/FieldModal.vue';
import Dropdown from '../components/Dropdown.vue';
import { withTz } from '../utils/timefmt';
import { t } from '../i18n';

const TABS = computed(() => [
  { key: 'region', label: t('taxonomy.tabRegion') },
  { key: 'cat', label: t('taxonomy.tabCat') },
  { key: 'tag', label: t('taxonomy.tabTag') },
  { key: 'field', label: t('taxonomy.tabField') }
]);
const FIELD_TYPE_KEYS = {
  text: 'taxonomy.fieldTypeText',
  textarea: 'taxonomy.fieldTypeTextarea',
  number: 'taxonomy.fieldTypeNumber',
  date: 'taxonomy.fieldTypeDate',
  select: 'taxonomy.fieldTypeSelect',
  url: 'taxonomy.fieldTypeUrl'
};
function typeName(type) {
  const k = FIELD_TYPE_KEYS[type];
  return k ? t(k) : type;
}

const tab = ref(store.params.tab || 'region');
const regions = ref([]);
const catRowsAll = ref([]);
const tags = ref([]);
const fields = ref([]);
const catRegion = ref(null);
const mRegion = ref(null);
const mCat = ref(null);
const mTag = ref(null);
const mField = ref(null);

const counts = computed(() => ({
  region: regions.value.length,
  cat: catRowsAll.value.length,
  tag: tags.value.length,
  field: fields.value.length
}));
const catRows = computed(() =>
  catRegion.value ? catRowsAll.value.filter(c => c.region_id === catRegion.value) : catRowsAll.value
);
const catRegionOptions = computed(() => [
  { value: null, label: t('taxonomy.allRegions') },
  ...regions.value.map(r => ({ value: r.id, label: r.name }))
]);

async function loadAll() {
  try {
    regions.value = await A.regions();
    catRowsAll.value = await A.cats({});
    tags.value = await A.tags();
    fields.value = await A.fields();
    return true;
  } catch (e) {
    return false;
  }
}

function editRegion(r) {
  mRegion.value = r ? { id: r.id, name: r.name, code: r.code || '' } : { name: '', code: '' };
}
function editCat(c) {
  mCat.value = c
    ? { id: c.id, regionId: c.region_id, name: c.name, code: c.code || '' }
    : { regionId: catRegion.value || (regions.value[0] || {}).id, name: '', code: '' };
}
/* 形参不叫 t：本文件已导入 i18n 的 t()，用同名形参虽不报错，
 * 但同一个标识符在两处含义不同，改这里时极易把 t('…') 写成 t.name。 */
function editTag(tag) {
  mTag.value = tag ? { id: tag.id, name: tag.name } : { name: '' };
}
function editField(f) {
  mField.value = f
    ? {
        id: f.id,
        name: f.name,
        code: f.code,
        type: f.type,
        options: (f.options || []).join(','),
        required: !!f.required,
        uniqueField: !!f.unique_field
      }
    : { name: '', code: '', type: 'text', options: '', required: false, uniqueField: false };
}

async function onSaved() {
  mRegion.value = mCat.value = mTag.value = mField.value = null;
  await loadAll();
  await refreshRegions();
  // refreshRegions() 已把大区列表写回 store，侧栏 RegionNav（常驻）与首页随后自动同步；
  // 本页数据由上面的 loadAll() 刷新。无需再 bus.emit('refresh')（订阅者皆为 v-if 页面，
  // 广播只会打回本页自身）。
}

const { submit } = useSubmit();

async function del(apiFn, id, name) {
  await submit(() => apiFn({ id }), {
    password: true,
    passwordMessage: t('taxonomy.deletePwdMsg', { name }),
    ok: okMsg.deleted,
    then: async () => {
      await loadAll();
      await refreshRegions();
    }
  });
}

watch(
  () => store.params.tab,
  key => {
    if (key) tab.value = key;
  }
);
onMounted(loadAll);

// 订阅全局刷新（标题栏刷新按钮）
bus.on('refresh', loadAll);
onBeforeUnmount(() => bus.off('refresh', loadAll));
</script>

<style scoped>
.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.tab {
  padding: 7px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 7px;
}
.tab.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 500;
}
.tab.on .badge {
  background: rgba(255, 255, 255, 0.2);
  color: inherit;
  border-color: transparent;
}
.tbl-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
}
.tbl-bar .btn {
  margin-left: auto;
}
.tbl-bar .dim {
  flex: 1;
}
.row-click {
  cursor: pointer;
}
.row-click:hover {
  background: var(--surface-2);
}
.dot {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
/* 卡片底留白，避免最后一行操作按钮紧贴卡片边框 */
.card {
  padding-bottom: 24px;
}
/* 表格操作列：两个按钮之间留出间隔 */
.tbl tbody td > .btn + .btn {
  margin-left: 6px;
}
</style>
