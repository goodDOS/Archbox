<template>
  <div class="card sec">
    <h3>
      {{ t('settings.navSecurity') }}
      <span class="badge" :class="secState.encrypted ? 'ok' : 'warn'">{{
        secState.encrypted ? t('settings.encEnabled') : t('settings.encDisabled')
      }}</span>
    </h3>
    <p class="dim">{{ t('settings.encDesc') }}</p>
    <div class="kv">
      <div class="kv-row">
        <span>{{ t('settings.encAlgo') }}</span
        ><code>{{ t('settings.encAlgoVal') }}</code>
      </div>
      <div class="kv-row">
        <span>{{ t('settings.encKdf') }}</span
        ><code>{{ t('settings.encKdfVal') }}</code>
      </div>
      <div class="kv-row">
        <span>{{ t('settings.encFileStatus') }}</span
        ><code>{{ secState.fileEncrypted ? t('settings.encFileEncrypted') : t('settings.encFilePlain') }}</code>
      </div>
      <div class="kv-row">
        <span>{{ t('settings.encRemember') }}</span
        ><code>{{ secState.keyFileExists ? t('settings.encRemembered') : t('settings.encNotRemembered') }}</code>
      </div>
      <div class="kv-row">
        <span>{{ t('settings.encSafeStorage') }}</span
        ><code>{{ secState.safeStorage ? t('settings.encSafeStorageOn') : t('settings.encSafeStorageOff') }}</code>
      </div>
    </div>
    <div class="btns" v-if="!secState.encrypted">
      <button class="btn btn-primary" @click="$emit('open-modal', 'enable')">
        <Icon name="lock" :size="16" /> {{ t('settings.encEnable') }}
      </button>
    </div>
    <div class="btns" v-else>
      <button class="btn" @click="$emit('open-modal', 'change')">{{ t('settings.encChangePass') }}</button>
      <button class="btn" @click="$emit('open-modal', 'disable')">{{ t('settings.encDisable') }}</button>
    </div>
    <div class="tip-box" v-if="secState.encrypted">
      <b><Icon name="warn" :size="14" /> {{ t('settings.encPassLost') }}</b>
      <span class="dim">{{ t('settings.encPassLostBody') }}</span>
    </div>
  </div>
</template>

<script setup>
import Icon from '../Icon.vue';
import { t } from '../../i18n';
defineProps({ secState: { type: Object, required: true } });
defineEmits(['open-modal']);
</script>

<style scoped>
/* .sec / .kv / .btns / .dim.warn 见 styles/components.css，此处仅保留特有样式 */
.tip-box {
  margin-top: 14px;
  background: var(--surface-2);
  border-radius: var(--radius);
  padding: 10px 12px;
  font-size: 12px;
}
</style>
