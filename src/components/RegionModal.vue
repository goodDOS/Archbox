<template>
  <Modal
    :title="isEdit ? t('settings.regionEditTitle') : t('settings.regionNewTitle')"
    icon="folder"
    max-width="440px"
    @close="close"
  >
    <template #default="{ requestClose }">
      <p class="sub">{{ t('settings.regionSub') }}</p>

      <label class="field-label">{{ t('settings.regionName') }}<span class="req">*</span></label>
      <input
        class="input"
        v-model.trim="form.name"
        maxlength="40"
        :placeholder="t('settings.regionNamePh')"
        ref="nameRef"
        @keyup.enter="save"
      />

      <label class="field-label">{{ t('settings.regionCode') }}<span class="req">*</span></label>
      <input class="input" v-model.trim="form.code" maxlength="20" :placeholder="t('settings.regionCodePh')" />

      <label class="field-label">{{ t('settings.regionColor') }}</label>
      <div class="colors">
        <span
          v-for="c in COLORS"
          :key="c"
          class="c"
          :class="{ on: form.color === c }"
          :style="{ background: c }"
          @click="form.color = c"
        ></span>
        <!-- ★ 自定义取色（Beta.288）：原生 color 选择器，不引入第三方依赖。
             当前颜色不在预设 9 色里时，这个「取色器」色块点亮，提示"当前是自定义色"。 -->
        <ColorPicker v-model="form.color" :active="isCustom" class="c c-custom" />
        <span class="c-hex mono">{{ form.color }}</span>
      </div>

      <div class="modal-foot">
        <!-- requestClose 来自 Modal 的 slot 作用域：先播退场动画再真正关闭 -->
        <button class="btn" @click="requestClose">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" :disabled="!form.name || busy" @click="save">
          {{ busy ? t('settings.saving') : t('common.save') }}
        </button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { refreshRegions } from '../store';
import { run, toast } from '../feedback';
import { A } from '../api';
import Modal from './Modal.vue';
import ColorPicker from './ColorPicker.vue';
import { DEFAULT_ACCENT, REGION_COLORS } from '../store/modules/theme';
import { t } from '../i18n';

const props = defineProps({
  value: { type: Object, default: null } // 编辑对象（含 id）或 null（新建）
});
const emit = defineEmits(['close', 'saved']);

// ★ 纯 props/emit：本组件不再读写 store.ui.regionModal/regionEdit，
//   弹窗开关状态由调用方（App.vue）持有，保存后的跳转/刷新也由调用方在 @saved 里决定。
//   这样同一组件在「侧栏流程」与「聚合页流程」下行为完全一致、无副作用。
const edit = computed(() => props.value ?? {});
const isEdit = computed(() => !!edit.value.id);

const nameRef = ref(null);
const busy = ref(false);
// 大区预设标识色盘由 theme.js 单一导出（REGION_COLORS）
const COLORS = REGION_COLORS;

const form = reactive({ id: null, name: '', code: '', color: DEFAULT_ACCENT });
function syncForm() {
  form.id = edit.value.id || null;
  form.name = edit.value.name || '';
  form.code = edit.value.code || '';
  form.color = edit.value.color || DEFAULT_ACCENT;
}
syncForm();
onMounted(() => {
  nameRef.value && nameRef.value.focus();
});

// 当前色是否来自自定义取色（不在预设 9 色里）
const isCustom = computed(() => !COLORS.includes(form.color));

function close() {
  emit('close');
}

async function save() {
  if (!form.name || busy.value) return;
  if (!form.code) {
    toast(t('settings.errRegionCode'), 'err');
    return;
  }
  const editing = isEdit.value;
  await run(() => A.regionSave({ id: form.id, name: form.name, code: form.code, color: form.color }), {
    busy,
    ok: editing ? t('settings.regionUpdated') : t('settings.regionCreated', { name: form.name }),
    then: async () => {
      await refreshRegions();
      // 把「是否编辑」随 saved 一并交给调用方：侧栏流程据此决定是否跳转新大区
      emit('saved', { editing, name: form.name });
    }
  });
}
</script>

<style scoped>
.colors {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.c {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: 2px solid transparent;
  transition:
    border-color 0.1s,
    box-shadow 0.1s;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.c:hover {
  border-color: var(--border-strong);
}
.c.on {
  border-color: var(--text);
  /* 用 inset box-shadow 做选中态：完全内部渲染，不外溢、不改变 layout box、
     不会被任何 overflow:hidden 裁切，第一个色块与其他色块视觉大小完全一致。
     同时 2px border + 2px inset 让选中态"外描边 + 内高亮"双层视觉，
     比外环 outline 在第一个色块处更协调 */
  box-shadow: inset 0 0 0 2px var(--text);
}
/* 自定义取色器：视觉上与预设色块同尺寸，弹层由 ColorPicker 组件自绘（Beta.303 起） */
.c-custom {
  border-style: dashed;
}
.c-custom.on {
  border-color: var(--text);
}
/* 当前颜色的 hex 值：方便用户核对与复制 */
.c-hex {
  font-size: 11px;
  color: var(--text-3);
  font-family: var(--font-mono);
}
</style>
