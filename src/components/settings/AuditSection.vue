<template>
  <div class="card sec">
    <h3>
      {{ t('settings.auditTitle') }} <span class="badge">{{ audit.total }} {{ t('common.items') }}</span>
    </h3>
    <p class="dim">{{ t('settings.auditDesc') }}</p>
    <div class="chain-status" :class="chainOk ? 'ok' : 'broken'">
      <span class="cs-icon">
        <Icon :name="chainOk ? 'check' : 'warn'" :size="18" />
      </span>
      <div class="cs-body">
        <b>{{ chainOk ? t('settings.chainOk') : t('settings.chainBad') }}</b>
        <span class="dim">{{ chainStatus.detail }}</span>
      </div>
      <button class="btn btn-sm" @click="$emit('reverify')" :disabled="chainBusy">
        <Icon name="check" :size="14" /> {{ chainBusy ? t('settings.verifying') : t('settings.reverifyNow') }}
      </button>
    </div>
    <div class="filter-bar">
      <input
        class="input"
        v-model="auditQ"
        :placeholder="t('settings.auditSearchPh')"
        style="max-width: 260px"
        @keyup.enter="$emit('search', auditQ)"
      />
      <button class="btn btn-sm" @click="$emit('search', auditQ)">{{ t('settings.auditQuery') }}</button>
      <RefreshButton :busy="busy" style="margin-left: auto" @click="$emit('refresh')" />
    </div>
    <div class="audit-scroll">
      <table class="tbl">
        <thead>
          <tr>
            <th style="width: 150px">{{ t('settings.auditColTime') }}</th>
            <th style="width: 70px">{{ t('settings.auditColUser') }}</th>
            <th style="width: 90px">{{ t('settings.auditColUserId') }}</th>
            <th style="width: 120px">{{ t('settings.auditColMac') }}</th>
            <th style="width: 100px">{{ t('settings.auditColAction') }}</th>
            <th>{{ t('settings.auditColEntity') }}</th>
            <th>{{ t('settings.auditColDetail') }}</th>
            <th style="width: 46px">{{ t('settings.auditColChain') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in audit.rows" :key="a.id">
            <td class="dim">{{ withTz(a.created_at) }}</td>
            <td>{{ a.user_name }}</td>
            <td class="dim mono">{{ a.user_id || '—' }}</td>
            <td class="dim mono">{{ a.user_mac || '—' }}</td>
            <td>
              <span class="badge">{{ auditAction(a.action) }}</span>
            </td>
            <td class="dim">{{ a.entity }}{{ a.entity_id ? ' #' + a.entity_id : '' }}</td>
            <td class="dim detail" :title="a.detail">{{ brief(a.detail) }}</td>
            <td>
              <span class="chain-tag" :class="a.self_hash ? 'ok' : 'legacy'" :title="chainTagTitle(a)">
                <Icon :name="a.self_hash ? 'check' : 'clock'" :size="13" />
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <Pager :page="audit.page" :pages="Math.ceil(audit.total / 50)" @navigate="$emit('page', $event)" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import Icon from '../Icon.vue';
import RefreshButton from '../RefreshButton.vue';
import Pager from '../Pager.vue';
import { withTz } from '../../utils/timefmt';
import { t } from '../../i18n';
import { auditAction } from '../../utils/auditText';

const props = defineProps({
  audit: { type: Object, required: true },
  chainStatus: { type: Object, required: true },
  chainBusy: { type: Boolean, default: false },
  busy: { type: Boolean, default: false }
});
defineEmits(['reverify', 'page', 'search', 'refresh']);

const auditQ = ref('');
const chainOk = computed(() => props.chainStatus && props.chainStatus.ok);

function brief(d) {
  try {
    const o = JSON.parse(d || '{}');
    const s = Object.entries(o)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    return s.length > 60 ? s.slice(0, 60) + '…' : s;
  } catch (e) {
    return d || '';
  }
}
function chainTagTitle(a) {
  return a.self_hash
    ? t('settings.chainTagOk', { hash: String(a.self_hash).slice(0, 8) })
    : t('settings.chainTagLegacy');
}
</script>

<style scoped>
/* .sec 见 styles/components.css，此处仅保留本区块特有样式 */
.audit-scroll {
  max-height: 420px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.audit-scroll .tbl {
  min-width: 720px;
}
.detail {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mono {
  font-family: var(--font-mono);
  font-size: 11px;
}
.chain-status {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 14px 0;
  padding: 12px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-2);
  flex-wrap: wrap;
}
.chain-status.ok {
  border-color: var(--c-green);
  background: var(--c-green-weak);
}
.chain-status.broken {
  border-color: var(--danger);
  background: var(--danger-weak);
}
.chain-status .cs-icon {
  display: grid;
  place-items: center;
  flex: none;
}
.chain-status.ok .cs-icon {
  color: var(--c-green);
}
.chain-status.broken .cs-icon {
  color: var(--danger);
}
.chain-status .cs-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.chain-status .cs-body b {
  font-size: 13px;
}
.chain-tag {
  display: inline-grid;
  place-items: center;
  padding: 2px;
  border-radius: var(--radius-sm);
}
.chain-tag.ok {
  color: var(--c-green);
}
.chain-tag.legacy {
  color: var(--text-3);
}
[data-theme='wire'] .chain-status.ok {
  background: transparent;
  border: 1px solid var(--text);
}
[data-theme='wire'] .chain-status.broken {
  background: transparent;
  border: 2px solid var(--text);
}
</style>
