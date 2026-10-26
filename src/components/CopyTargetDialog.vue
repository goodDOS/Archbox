<template>
  <Modal :title="t('post.copyTargetTitle')" icon="copy" max-width="520px" @close="close">
    <template #default="{ requestClose }">
      <p class="sub">
        {{ t('post.copyIntro1') }} <b>{{ postTitle }}</b> {{ t('post.copyIntro2') }}<b>{{ t('post.copyIntro3') }}</b
        >{{ t('post.copyIntro4') }}
      </p>

      <!-- 归属方式三选一。默认「新建拷贝大区」——最省心，
           不需要用户先去别处建好大区再回来拷，也不会把外部文档混进自有大区。 -->
      <div class="mode-list">
        <label v-for="m in MODES" :key="m.value" class="mode" :class="{ on: mode === m.value }">
          <input type="radio" name="copy-target-mode" :value="m.value" v-model="mode" />
          <div class="mode-main">
            <b>{{ m.label }}</b>
            <span class="mode-desc">{{ m.desc }}</span>
          </div>
        </label>
      </div>

      <!-- 新建大区 / 分类 -->
      <template v-if="mode === 'new'">
        <div class="row-2">
          <div>
            <label class="field-label">{{ t('post.regionName') }}</label>
            <input class="input" v-model.trim="newRegionName" maxlength="40" :placeholder="t('post.regionNamePh')" />
          </div>
          <div>
            <label class="field-label"
              >{{ t('post.regionCode') }}<span class="dim">{{ t('post.optionalParen') }}</span></label
            >
            <input
              class="input"
              v-model.trim="newRegionCode"
              maxlength="20"
              :placeholder="regionCodePlaceholder"
              style="font-family: var(--font-mono)"
            />
          </div>
        </div>
        <div class="row-2" style="margin-top: 12px">
          <div>
            <label class="field-label"
              >{{ t('post.categoryName') }}<span class="dim">{{ t('post.optionalParen') }}</span></label
            >
            <input
              class="input"
              v-model.trim="newCategoryName"
              maxlength="40"
              :placeholder="sourceCategoryName || t('post.noCategory')"
            />
          </div>
          <div>
            <label class="field-label"
              >{{ t('post.categoryCode') }}<span class="dim">{{ t('post.optionalParen') }}</span></label
            >
            <input
              class="input"
              v-model.trim="newCategoryCode"
              maxlength="20"
              :placeholder="categoryCodePlaceholder"
              style="font-family: var(--font-mono)"
            />
          </div>
        </div>
        <p class="hint dim">
          {{ t('post.copyHint1') }}<b>{{ t('post.copyHint1Bold') }}</b
          >{{ t('post.copyHint1Tail') }} <span class="hint-strong">{{ t('post.copyHintStrong') }}</span
          >{{ t('post.copyHint2') }}
          <br />
          {{ t('post.copyHint3') }} <code class="code">HR</code>{{ t('post.copyHint3Mid') }} {{ t('post.copyHint3B')
          }}<b>{{ t('post.copyHint3Bold') }}</b
          >{{ t('post.copyHint3End') }}
        </p>
      </template>

      <!-- 选择已有大区 / 分类 -->
      <template v-if="mode === 'existing'">
        <label class="field-label">{{ t('post.targetRegion') }}</label>
        <Dropdown v-model="pickRegionId" :options="regionOptions" :placeholder="t('post.pickRegionPh')" />

        <label class="field-label"
          >{{ t('post.targetCategory') }}<span class="dim">{{ t('post.optionalParen') }}</span></label
        >
        <Dropdown
          v-model="pickCategoryId"
          :options="categoryOptions"
          :disabled="!pickRegionId || loadingCats"
          :placeholder="t('post.pickCategoryPh')"
        />
        <p class="hint dim" v-if="pickRegionId && !loadingCats && categoryOptions.length <= 1">
          {{ t('post.noCatInRegion') }}
        </p>
      </template>

      <!-- 跟随源文档 -->
      <p class="hint dim" v-if="mode === 'follow'">
        {{ t('post.followHint1') }}{{ sourceRegionName || t('post.sharedCopy') }}{{ t('post.followHint1Tail')
        }}<template v-if="sourceCategoryName"
          >{{ t('post.followHint2') }}{{ sourceCategoryName }}{{ t('post.followHint2Tail') }}</template
        >{{ t('post.followHint3') }}
      </p>

      <p v-if="err" class="err">{{ err }}</p>

      <div class="modal-foot">
        <button class="btn" @click="requestClose">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" :disabled="!canConfirm || busy" @click="confirm">
          {{ busy ? t('post.copying') : t('post.confirmCopy') }}
        </button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { A } from '../api';
import Modal from './Modal.vue';
import Dropdown from './Dropdown.vue';
import { t } from '../i18n';

const props = defineProps({
  postTitle: { type: String, default: '' },
  sourceRegionName: { type: String, default: '' },
  sourceCategoryName: { type: String, default: '' },
  busy: { type: Boolean, default: false }
});
const emit = defineEmits(['close', 'confirm']);

// computed：模式名与说明随语言切换重新求值
const MODES = computed(() => [
  { value: 'new', label: t('post.modeNew'), desc: t('post.modeNewDesc') },
  { value: 'existing', label: t('post.modeExisting'), desc: t('post.modeExistingDesc') },
  { value: 'follow', label: t('post.modeFollow'), desc: t('post.modeFollowDesc') }
]);

const mode = ref('new'); // 默认新建，省心且不污染自有大区
const newRegionName = ref(t('post.sharedCopy'));
const newRegionCode = ref('');
const newCategoryName = ref('');
const newCategoryCode = ref('');
const pickRegionId = ref(null);
const pickCategoryId = ref(null);
const regions = ref([]);
const cats = ref([]);
const loadingCats = ref(false);
const err = ref('');

/**
 * 代码占位提示：与后端「按名称推导」的规则保持一致（取名称中的 ASCII 字母/数字并大写，
 * 一个都没有则退回 LAN）。让用户一眼知道留空会发生什么，避免以为留空就是没有代码。
 */
function deriveCode(name) {
  const ascii = String(name || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 12);
  return ascii || 'LAN';
}
const regionCodePlaceholder = computed(() => deriveCode(newRegionName.value) || t('post.autoGenerate'));
// ★ 必须写 props.sourceCategoryName ★
//   模板里可以直接写 sourceCategoryName（Vue 自动解包 props），但 <script setup> 里
//   没有这个变量，漏写 props. 会抛 ReferenceError: sourceCategoryName is not defined。
//   该错误发生在 computed 求值时，会被整棵组件树吞成一个渲染告警——
//   现象是「弹窗打开就报错、确认按钮点了没反应」，很难从界面看出根因（Beta.215 实测踩到）。
const categoryCodePlaceholder = computed(
  () => deriveCode(newCategoryName.value || props.sourceCategoryName) || t('post.autoGenerate')
);

const regionOptions = computed(() => regions.value.map(r => ({ value: r.id, label: r.name })));
const categoryOptions = computed(() => [
  { value: null, label: t('post.noCategoryParen') },
  ...cats.value.map(c => ({ value: c.id, label: c.name }))
]);

const canConfirm = computed(() => {
  if (mode.value === 'new') return !!newRegionName.value;
  if (mode.value === 'existing') return !!pickRegionId.value;
  return true; // follow：无需额外输入
});

async function loadRegions() {
  try {
    regions.value = (await A.regions()) || [];
  } catch (e) {
    regions.value = [];
  }
}
async function loadCats(regionId) {
  cats.value = [];
  pickCategoryId.value = null;
  if (!regionId) return;
  loadingCats.value = true;
  try {
    cats.value = (await A.cats({ regionId })) || [];
  } catch (e) {
    cats.value = [];
  } finally {
    loadingCats.value = false;
  }
}
watch(pickRegionId, v => loadCats(v));
// 切到「放入已有大区」时若还没加载过大区列表，按需拉一次
watch(mode, v => {
  if (v === 'existing' && !regions.value.length) loadRegions();
});

onMounted(loadRegions);

function close() {
  if (!props.busy) emit('close');
}

function confirm() {
  if (!canConfirm.value || props.busy) return;
  err.value = '';
  if (mode.value === 'new') {
    emit('confirm', {
      mode: 'new',
      regionName: newRegionName.value,
      // ★ Beta.215：把用户填的代码一起交给主进程 ★
      //   以前这里不传 code，主进程只能写死 'LAN'，导致所有拷贝大区/分类同码。
      regionCode: newRegionCode.value || '',
      categoryName: newCategoryName.value || '',
      categoryCode: newCategoryCode.value || ''
    });
  } else if (mode.value === 'existing') {
    emit('confirm', {
      mode: 'existing',
      regionId: pickRegionId.value,
      categoryId: pickCategoryId.value || null
    });
  } else {
    emit('confirm', { mode: 'follow' });
  }
}
</script>

<style scoped>
.mode-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
}
.mode {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  background: var(--surface-2);
  transition:
    border-color 0.12s,
    background 0.12s;
}
.mode:hover {
  border-color: var(--border-strong);
}
/* 选中态：左侧强调色描边 + 主题色浅底，与全应用单选风格一致 */
.mode.on {
  border-color: var(--accent);
  background: var(--accent-weak);
}
.mode input {
  margin-top: 3px;
  flex: none;
}
.mode-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.mode-desc {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.5;
}
/* 两栏栅格。
 * Beta.218 曾在这里加「padding 4px + margin -4px」，专门给 .input:focus 向外扩 3px 的
 * 辉光留空间；Beta.285 去掉了辉光本身（改为只换边框色），这份预留就没有意义了，
 * 一并删除 —— 留着只会让两栏比同级内容窄/宽 8px，反而破坏对齐。 */
.row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.hint {
  font-size: 12px;
  line-height: 1.6;
  margin-top: 8px;
}
.hint-strong {
  color: var(--text-2);
}
.err {
  color: var(--danger);
  font-size: 12.5px;
  margin-top: 10px;
}
.dim {
  color: var(--text-3);
  font-weight: 400;
}
/* 提示文案里的代码示例（如 HR）：等宽字体，与表格里的 .code 观感一致 */
.hint .code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-2);
}
</style>
