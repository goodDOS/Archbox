<template>
  <Mask mask-class="modal-mask" @close="$emit('close')">
    <template #default="{ requestClose }">
      <!--
        ★ 弹窗内部所有关闭入口都必须调 requestClose，而不是直接 $emit('close') ★
        直接 emit 会跳过退场动画（遮罩瞬间消失）；requestClose 先播完再 emit。
        点遮罩空白处由 Mask 自己处理，这里不重复绑。
      -->
      <div class="modal" :class="{ 'modal-danger': danger }" :style="maxWidth ? { maxWidth } : null">
        <div v-if="title" class="modal-head">
          <span v-if="icon" class="modal-icon" :class="{ danger }">
            <Icon :name="icon" :size="16" />
          </span>
          <h3 class="title">{{ title }}</h3>
          <button
            v-if="closable"
            class="modal-close"
            type="button"
            @click="requestClose"
            :aria-label="t('ui.modalClose')"
          >
            <Icon name="x" :size="16" />
          </button>
        </div>
        <div class="modal-body">
          <!-- 内容也拿得到 requestClose：footer 里的「取消」要复用它，
               否则点取消会跳过退场。 -->
          <slot :requestClose="requestClose" />
        </div>
      </div>
    </template>
  </Mask>
</template>

<script setup>
import Icon from './Icon.vue';
import Mask from './Mask.vue';
import { t } from '../i18n';

defineProps({
  title: { type: String, default: '' },
  icon: { type: String, default: '' },
  closable: { type: Boolean, default: true },
  danger: { type: Boolean, default: false },
  maxWidth: { type: String, default: '460px' }
});
defineEmits(['close']);
</script>
