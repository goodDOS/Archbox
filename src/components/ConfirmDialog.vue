<template>
  <Modal
    v-if="state.open"
    :title="state.title"
    :icon="state.danger ? 'warn' : 'info'"
    :danger="!!state.danger"
    max-width="420px"
    @close="onClosed"
  >
    <template #default="{ requestClose }">
      <div class="cm-body">{{ state.message }}</div>
      <div class="modal-foot">
        <!-- ★ 退场时序：按钮只调 requestClose 启动退场动画，动画播完后 Modal 的
             @close 才兑现 Promise 并关闭 open。不能在按钮里直接 resolveConfirm——
             那样 open=false 会瞬间卸载 Modal，退场动画被跳过（Beta.299 修复）。
             本次点击的结果（确定/取消）先存进局部 ref，close 时读取。 -->
        <button
          class="btn"
          @click="
            result = false;
            requestClose();
          "
        >
          {{ t('ui.confirmCancel') }}
        </button>
        <button
          class="btn"
          :class="state.danger ? 'btn-danger' : 'btn-primary'"
          @click="
            result = true;
            requestClose();
          "
        >
          {{ t('ui.confirmOk') }}
        </button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { ref } from 'vue';
import { useConfirmState, resolveConfirm } from '../composables/useConfirm';
import { t } from '../i18n';
import Modal from './Modal.vue';

const state = useConfirmState();
// 本次点击的结果：确定=true / 取消=false。点遮罩或 × 关闭时保持默认 false。
const result = ref(false);

/** 退场动画播完后由 Modal 触发：兑现 Promise 并关闭弹窗 */
function onClosed() {
  resolveConfirm(result.value);
  state.open = false;
}
</script>

<style scoped>
.cm-body {
  font-size: 13.5px;
  color: var(--text-2);
  line-height: 1.7;
  white-space: pre-wrap;
}
</style>
