<template>
  <Modal :title="dialogTitle" icon="layers" max-width="520px" @close="$emit('cancel')">
    <template #default="{ requestClose }">
      <p class="sub">{{ dialogSub }}</p>

      <div class="dup-list">
        <div class="dup" v-for="(c, i) in conflicts" :key="i">
          <div class="dup-field">
            <span class="badge warn"
              >{{ fieldText(c)
              }}<template v-if="c.code && c.code !== 'title' && c.code !== 'title_region_cat'"
                >（{{ c.code }}）</template
              ></span
            >
            <code>{{ c.value }}</code>
          </div>
          <div class="dup-target">
            {{ t('post.dupWithPre') }}<a @click="$emit('view', c.postId)">{{ c.postTitle }}</a
            >》（ID {{ c.postId }}）{{ t('post.dupWithPost')
            }}<template v-if="c.code === 'title' || c.code === 'title_region_cat'"> · {{ scopeText(c) }}</template>
          </div>
        </div>
      </div>

      <div v-if="conflicts.length > 1">
        <label class="field-label">{{ t('post.mergeTarget') }}</label>
        <Dropdown v-model="targetId" :options="targetOptions" />
      </div>

      <div class="rules">
        {{ t('post.mergeRules') }}
      </div>

      <div class="modal-foot" style="flex-wrap: wrap">
        <button class="btn" @click="requestClose">{{ t('post.backToEdit') }}</button>
        <button class="btn" @click="$emit('forceNew')">{{ t('post.forceNew') }}</button>
        <button class="btn btn-primary" @click="doMerge">{{ t('post.mergeInto') }}</button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { ref, computed } from 'vue';
import Modal from './Modal.vue';
import Dropdown from './Dropdown.vue';
import { t } from '../i18n';

const props = defineProps({ conflicts: { type: Array, default: () => [] } });
const emit = defineEmits(['merge', 'forceNew', 'cancel', 'view']);
const targetId = ref(props.conflicts[0] ? props.conflicts[0].postId : null);

const targetOptions = computed(() =>
  props.conflicts.map(c => ({
    value: c.postId,
    label: `《${c.postTitle}》（ID ${c.postId}）`
  }))
);

// ★ Beta.258：标题撞名纳入查重后，这个弹窗不再只处理「字段重复」，
//   标题与「发现字段重复」并列会让用户困惑（标题不是字段）。
//   有标题冲突时用「发现重复文档」，纯字段冲突时沿用旧文案。
const hasTitleConflict = computed(() => props.conflicts.some(c => c.code === 'title' || c.code === 'title_region_cat'));
const dialogTitle = computed(() => (hasTitleConflict.value ? t('post.dupDocTitle') : t('post.dupFieldTitle')));
const dialogSub = computed(() => (hasTitleConflict.value ? t('post.dupDocSub') : t('post.dupFieldSub')));

// ★ Beta.258：同名冲突要说明「撞在哪」——同大区同分类是几乎确定的重复导入，
//   跨大区/跨分类只是同名，处置方式不同。只丢一个标题出来，用户无法判断该不该合并。
function scopeText(c) {
  const where = [c.rname, c.cname].filter(Boolean).join(' / ') || t('post.noRegion');
  return c.code === 'title_region_cat' ? t('post.scopeSameDoc', { where }) : t('post.scopeSameName', { where });
}

// ★ Beta.271：冲突字段名改由前端按语言渲染。
//   主进程只回展示码（field='title'|'scope'），不再回中文——
//   同一个冲突描述要跟着界面语言走，主进程替它定语言就会分家。
function fieldText(c) {
  if (c.code === 'title' || c.code === 'title_region_cat') {
    return c.field === 'scope' ? t('post.dupFieldTitleScope') : t('post.dupFieldTitleOnly');
  }
  return c.field || c.code || '';
}

function doMerge() {
  if (!targetId.value) return;
  emit('merge', targetId.value);
}
</script>

<style scoped>
.dup-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dup {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
}
.dup-field {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.dup-field code {
  background: var(--surface-3);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 12.5px;
}
.dup-target {
  margin-top: 6px;
  font-size: 12.5px;
  color: var(--text-2);
}
.dup-target a {
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline;
}
.rules {
  margin-top: 14px;
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.7;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}
</style>
