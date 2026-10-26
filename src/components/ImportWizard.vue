<template>
  <Modal :title="t('settings.importPackTitle')" icon="upload" max-width="720px" @close="$emit('close')">
    <template #default="{ requestClose }">
      <p class="sub">{{ t('settings.importSub1') }}<code>.archboxpack</code>{{ t('settings.importSub2') }}</p>

      <!-- 步骤内容独立滚动区：顶部说明与底部决策条留在外层固定，避免长内容时上下被截 -->
      <div class="wiz-body">
        <!-- 第 1 步：选择文件 -->
        <template v-if="step === 1">
          <div class="drop" @click="pick">
            <Icon name="upload" :size="34" />
            <p>{{ t('settings.importPickFile') }}</p>
            <p class="dim">{{ t('settings.importPickHint') }}</p>
          </div>
        </template>

        <!-- 第 2 步：预览与策略 -->
        <template v-if="step === 2">
          <!-- 来源甄别：显示文档包指纹与导出时间，配合包内 Ed25519 验签结果 -->
          <div class="pack-origin" v-if="packOrigin.exporter || packOrigin.exportedAt">
            <div class="po-line">
              <span class="po-k">{{ t('settings.poOrigin') }}</span>
              <span class="po-v mono">{{ packOrigin.origin || packOrigin.exporter || t('common.unknown') }}</span>
            </div>
            <div class="po-line" v-if="packOrigin.exportedAt">
              <span class="po-k">{{ t('settings.poExportedAt') }}</span>
              <span class="po-v"
                >{{ packOrigin.exportedAt }}{{ packOrigin.tz ? '（' + packOrigin.tz + '）' : '' }}</span
              >
            </div>
            <div class="po-line">
              <span class="po-k">{{ t('settings.poIntegrity') }}</span>
              <span class="po-v" :class="packOrigin.protected ? 'po-ok' : 'po-warn'">
                {{ packOrigin.protected ? t('settings.poProtected') : t('settings.poHashOnly') }}
              </span>
            </div>
          </div>
          <div class="sum">
            <div class="sum-item">
              <b>{{ packSummary.regions }}</b
              ><span>{{ t('settings.sumRegion') }}</span>
            </div>
            <div class="sum-item">
              <b>{{ packSummary.categories }}</b
              ><span>{{ t('settings.sumCategory') }}</span>
            </div>
            <div class="sum-item">
              <b>{{ packSummary.tags }}</b
              ><span>{{ t('settings.sumTag') }}</span>
            </div>
            <div class="sum-item">
              <b>{{ packSummary.fieldDefs }}</b
              ><span>{{ t('settings.sumField') }}</span>
            </div>
            <div class="sum-item accent">
              <b>{{ packSummary.posts }}</b
              ><span>{{ t('settings.sumPost') }}</span>
            </div>
            <div class="sum-item">
              <b>{{ packSummary.notes }}</b
              ><span>{{ t('settings.sumNote') }}</span>
            </div>
          </div>

          <label class="field-label">{{ t('settings.dedupIntro') }}</label>
          <div class="strategies">
            <label class="st" :class="{ on: strategy === 'merge' }"
              ><input type="radio" value="merge" v-model="strategy" />
              <div>
                <b>{{ t('settings.stMerge') }}</b
                ><span>{{ t('settings.stMergeDesc') }}</span>
              </div></label
            >
            <label class="st" :class="{ on: strategy === 'skip' }"
              ><input type="radio" value="skip" v-model="strategy" />
              <div>
                <b>{{ t('settings.stSkip') }}</b
                ><span>{{ t('settings.stSkipDesc') }}</span>
              </div></label
            >
            <label class="st" :class="{ on: strategy === 'new' }"
              ><input type="radio" value="new" v-model="strategy" />
              <div>
                <b>{{ t('settings.stNew') }}</b
                ><span>{{ t('settings.stNewDesc') }}</span>
              </div></label
            >
            <label class="st" :class="{ on: strategy === 'nodedup' }"
              ><input type="radio" value="nodedup" v-model="strategy" />
              <div>
                <b>{{ t('settings.stNoDedup') }}</b
                ><span>{{ t('settings.stNoDedupDesc') }}</span>
              </div></label
            >
          </div>

          <div class="preview">
            <div class="pv-title">
              {{ t('settings.previewTitle', { n: preview.length, total: packSummary.posts }) }}
            </div>
            <div class="pv-scroll">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>{{ t('settings.colTitle') }}</th>
                    <th>{{ t('settings.sumRegion') }}</th>
                    <th>{{ t('settings.sumCategory') }}</th>
                    <th>{{ t('settings.sumTag') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(p, i) in preview" :key="i">
                    <td>
                      <b>{{ p.title }}</b>
                    </td>
                    <td>{{ p.region }}</td>
                    <td>{{ p.category }}</td>
                    <td class="dim">{{ (p.tags || []).join(' / ') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 询问式确认横幅：置于 step2 内末尾、粘在 wiz-body 底部，宽度与策略框完全对齐且跟随皮肤 -->
          <div class="confirm-banner" v-if="step === 2 && pendingDup > 0">
            <Icon name="warn" :size="16" />
            <span class="cb-text"
              ><b>{{ t('settings.confirmStrategy') }}</b> · {{ strategyHint }}</span
            >
          </div>
        </template>

        <!-- 第 3 步：执行 -->
        <template v-if="step === 3">
          <div class="running">
            <div class="pg-track"><div class="pg-fill" :style="{ width: progress.pct + '%' }"></div></div>
            <p class="dim">{{ progress.msg || t('settings.importing') }}</p>
          </div>
        </template>

        <!-- 第 4 步：结果 -->
        <template v-if="step === 4">
          <div>
            <div class="done-nums">
              <div class="dn">
                <b>{{ summary.created }}</b
                ><span>{{ t('settings.dnCreated') }}</span>
              </div>
              <div class="dn">
                <b>{{ summary.merged }}</b
                ><span>{{ t('settings.dnMerged') }}</span>
              </div>
              <div class="dn">
                <b>{{ summary.skipped }}</b
                ><span>{{ t('settings.dnSkipped') }}</span>
              </div>
              <div class="dn">
                <b>{{ summary.total }}</b
                ><span>{{ t('settings.dnTotal') }}</span>
              </div>
            </div>
            <div class="pv-scroll" style="max-height: 300px" v-if="summary.details && summary.details.length">
              <div class="pv-title">{{ t('settings.detailTitle') }}</div>
              <table class="tbl">
                <thead>
                  <tr>
                    <th style="width: 48px">#</th>
                    <th>{{ t('settings.sumPost') }}</th>
                    <th style="width: 110px">{{ t('settings.colAction') }}</th>
                    <th>{{ t('settings.colReason') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in summary.details" :key="d.index">
                    <td class="dim">{{ d.index }}</td>
                    <td>
                      <b>{{ d.title }}</b>
                    </td>
                    <td>
                      <span class="act" :class="'act-' + d.action">{{ actionLabel(d.action) }}</span>
                    </td>
                    <td class="dim">{{ d.reason }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="pv-scroll" v-if="summary.errors && summary.errors.length" style="max-height: 160px">
              <div class="pv-title">{{ t('settings.errorsTitle') }}</div>
              <p class="err-line" v-for="(e, i) in summary.errors" :key="'e' + i">· {{ e }}</p>
            </div>
          </div>
        </template>
      </div>
      <!-- /.wiz-body -->

      <div class="modal-foot">
        <button class="btn" @click="requestClose">{{ step === 4 ? t('common.close') : t('common.cancel') }}</button>
        <!-- step 2 无重复：仅显示「开始导入」 -->
        <button v-if="step === 2 && pendingDup === 0" class="btn btn-primary" :disabled="busy" @click="startImport">
          {{ busy ? t('settings.preparing') : t('settings.startImport', { n: packSummary.posts }) }}
        </button>
        <!-- step 2 有重复：决策区只保留「确认导入」（返回修改已移除，放弃请点「取消」关闭弹窗） -->
        <button v-if="step === 2 && pendingDup > 0" class="btn btn-primary" :disabled="busy" @click="confirmImport">
          {{ t('settings.confirmImport') }}
        </button>
      </div>
    </template>
  </Modal>

  <!-- 加密包口令输入框 -->
  <PackPassModal
    v-if="needPass"
    mode="unlock"
    :title-override="t('settings.packUnlockTitle')"
    :desc-override="t('settings.packUnlockDesc')"
    @submit="onPassSubmit"
    @close="needPass = false"
  />
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { toastErr, toastOk, toastWarn, toastInfo } from '../feedback';
import { A } from '../api';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import PackPassModal from './PackPassModal.vue';
import { t } from '../i18n';

const emit = defineEmits(['close', 'done']);

const step = ref(1);
const busy = ref(false);
const filePath = ref('');
const packPass = ref(''); // 加密包的口令（decrypt 用）
const needPass = ref(false); // 是否需弹口令框
const packSummary = reactive({ regions: 0, categories: 0, tags: 0, fieldDefs: 0, posts: 0, notes: 0 });
const preview = ref([]);
const strategy = ref('merge');
const progress = reactive({ pct: 0, msg: '' });
const summary = ref(null);
// 文档包来源信息（甄别）：指纹/导出时间/口令保护状态，由 pack:importOpen 返回
const packOrigin = reactive({ exporter: '', origin: '', exportedAt: '', tz: '', app: '', protected: false });
// 询问式确认：检测到重复时，先展示确认横幅，用户确认后才真正写入
const pendingDup = ref(0);
const strategyHint = computed(() => {
  if (pendingDup.value <= 0) return '';
  const n = pendingDup.value;
  if (strategy.value === 'merge') return t('settings.hintMerge', { n });
  if (strategy.value === 'skip') return t('settings.hintSkip', { n });
  if (strategy.value === 'new') return t('settings.hintNew', { n });
  if (strategy.value === 'nodedup') return t('settings.hintNoDedup');
  return '';
});
// 切到「不查重」时无需再询问重复 → 自动收起确认横幅
watch(strategy, s => {
  if (s === 'nodedup' && pendingDup.value > 0) pendingDup.value = 0;
});

onMounted(async () => {
  // 进度订阅：沙箱环境下 A.onProgress 可能不是函数，必须 typeof 守卫
  if (typeof A.onProgress === 'function') {
    try {
      A.onProgress(d => {
        if (d.name === 'pack-import') {
          progress.pct = d.pct;
          progress.msg = d.msg;
        }
      });
    } catch (e) {
      console.warn('[arch] onProgress 订阅失败:', e);
    }
  } else {
    console.warn('[arch] onProgress 不可用, type=', typeof A.onProgress, '；进度条将不更新');
  }
  pick();
});

async function pick() {
  try {
    const r = await A.packImportOpen({ pass: packPass.value });
    if (!r) return;
    filePath.value = r.path;
    // 加密包且未输口令：弹口令框
    if (r.needPass) {
      needPass.value = true;
      return;
    }
    Object.assign(packSummary, r.summary);
    preview.value = r.preview;
    if (r.origin) Object.assign(packOrigin, r.origin);
    step.value = 2;
  } catch (e) {
    toastErr(e);
  }
}

// 口令框提交：拿到口令后重新 open 解密
async function onPassSubmit(pass) {
  packPass.value = pass;
  needPass.value = false;
  await pick();
}

async function run() {
  busy.value = true;
  step.value = 3;
  progress.pct = 0;
  progress.msg = t('settings.readingPack');
  try {
    summary.value = await A.packImportApply({ path: filePath.value, strategy: strategy.value, pass: packPass.value });
    step.value = 4;
    const s = summary.value || {};
    const parts = [];
    if (s.created) parts.push(t('settings.partCreated', { n: s.created }));
    if (s.merged) parts.push(t('settings.partMerged', { n: s.merged }));
    if (s.skipped) parts.push(t('settings.partSkipped', { n: s.skipped }));
    const detail = parts.length ? parts.join('、') : t('settings.noWrite');
    if (s.created || s.merged) toastOk(t('settings.importDoneToast', { detail }));
    else if (s.skipped) toastWarn(t('settings.importAllDup', { n: s.total || 0 }));
    else toastInfo(t('settings.importDoneToast', { detail }));
    emit('done', summary.value);
  } catch (e) {
    toastErr(e);
    step.value = 2;
  } finally {
    busy.value = false;
  }
}

// 「开始导入」按钮：先只读预览查重，若命中重复且策略非「不查重」，弹确认框让用户确认后再写入
async function startImport() {
  if (strategy.value === 'nodedup') {
    run();
    return;
  }
  try {
    const pv = await A.packImportPreview({
      path: filePath.value,
      strategy: strategy.value,
      pass: packPass.value
    });
    if (pv && pv.dupCount > 0) {
      pendingDup.value = pv.dupCount;
      return;
    }
  } catch (e) {
    console.warn('[arch] 导入预览失败，直接执行导入：', e);
  }
  run();
}

// 确认框「确认导入」：真正执行写入
function confirmImport() {
  pendingDup.value = 0;
  run();
}

function actionLabel(a) {
  return (
    {
      created: t('settings.actCreated'),
      'created-nocheck': t('settings.actCreatedNoCheck'),
      'created-suffix': t('settings.actCreatedSuffix'),
      merged: t('settings.dnMerged'),
      skipped: t('settings.dnSkipped'),
      error: t('settings.actError')
    }[a] || a
  );
}
</script>

<style scoped>
.drop {
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius);
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--text-2);
  flex: none;
}
.drop:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.drop p {
  font-size: 13px;
}

.sum {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}
/* 来源甄别块：指纹 / 导出时间 / 验签结果 */
.pack-origin {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  padding: 10px 12px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.po-line {
  display: flex;
  gap: 10px;
  font-size: 12px;
  align-items: baseline;
}
.po-k {
  color: var(--text-2);
  flex-shrink: 0;
  width: 60px;
}
.po-v {
  color: var(--text);
  word-break: break-all;
}
.po-v.mono {
  font-family: var(--font-mono);
  font-size: 11.5px;
}
.po-ok {
  color: var(--ok);
}
.po-warn {
  color: var(--c-orange);
}
.sum-item {
  text-align: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 6px;
  background: var(--surface-2);
}
.sum-item b {
  display: block;
  font-size: 20px;
  line-height: 1.2;
}
.sum-item span {
  font-size: 11px;
  color: var(--text-2);
}
.sum-item.accent {
  border-color: var(--accent);
  background: var(--accent-weak);
}

.strategies {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.st {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 9px 12px;
  cursor: pointer;
}
/* 询问式确认横幅：完整圆角框 + 跟随皮肤的橙色提示色；置于 wiz-body 内末尾并粘底，宽度与策略框对齐 */
.confirm-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--c-orange);
  background: var(--c-orange-weak);
  color: var(--text);
  border-radius: var(--radius);
  padding: 9px 12px;
  margin-top: 14px;
  font-size: 12.5px;
  line-height: 1.5;
  /* 局部层序：position:sticky 的作用域是滚动祖先 .wiz-body，兄弟节点全是 z-index:auto，
   * 所以这个 --z-sticky(2) 只在 wiz-body 内部参与比较，永远不与 .modal-mask / .sp-mask 等竞争。
   * 它是「sticky 局部层序」专用 token，不是 1000 起步的全局刻度（--z-modal 等），
   * 两者语义不同：全局刻度管跨层浮层，这里只管内滚动容器的 sticky 压兄弟。 */
  position: sticky;
  bottom: 0;
  z-index: var(--z-sticky);
}
.confirm-banner .cb-text {
  flex: 1;
}
.confirm-banner b {
  margin-right: 4px;
}
.st.on {
  border-color: var(--accent);
  background: var(--accent-weak);
}
.st b {
  display: block;
  font-size: 13px;
}
.st span {
  font-size: 12px;
  color: var(--text-2);
}

/* 三段式：flex column 子元素。modal-body 已是 flex 列，本块 flex:1 占满剩余空间并独立滚动；banner / foot 在外层 flex:none 固定 */
/* scrollbar-gutter / ::-webkit-scrollbar 的宽度与滑块配色【均见 styles/base.css】公共层，
 * 此处不得重复定义 —— 实测确认下面两条已删的规则是历史漂移而非有意调色：
 *   · width: 8px 与全局同值，纯重复；
 *   · thumb 用 var(--border-strong)，与全局 var(--scroll-thumb) 在 8 个主题里有 6 个取值不同，
 *     其中 wire 主题为 #000000 vs #bbbbbb（纯黑 vs 浅灰）—— 量级过大，不是刻意微调。
 * 且本段是 scoped，编译后为 .wiz-body[data-v-*]::-webkit-scrollbar-thumb，特异性高于全局那份，
 * 即「重复定义会赢」，故它就是导入向导滚动条此前异色的真实原因。
 * 断言 S58 锁死「组件内不得再出现 ::-webkit-scrollbar」。 */
.wiz-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.preview {
  margin-top: 14px;
}
.pv-title {
  font-size: 12px;
  color: var(--text-2);
  margin-bottom: 6px;
}
.pv-scroll {
  max-height: 200px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
}
.pv-scroll td,
.pv-scroll th {
  font-size: 12px;
}

.running {
  padding: 20px 0;
}
.pg-track {
  height: 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  overflow: hidden;
  margin-bottom: 10px;
}
.pg-fill {
  height: 100%;
  background: var(--accent);
  border-radius: var(--radius-sm);
  transition: width 0.2s;
}

.done-nums {
  display: flex;
  gap: 14px;
  margin-bottom: 14px;
}
.dn {
  flex: 1;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
}
.dn b {
  font-size: 22px;
  display: block;
}
.dn span {
  font-size: 12px;
  color: var(--text-2);
}
.err-line {
  font-size: 12px;
  color: var(--text-2);
  padding: 2px 0;
}

.act {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  border: 1px solid transparent;
}
.act-created {
  background: var(--accent-weak);
  color: var(--accent);
  border-color: var(--accent);
}
.act-created-nocheck {
  background: var(--surface-3);
  color: var(--text-2);
  border-color: var(--border-strong);
}
.act-created-suffix {
  background: var(--accent-weak);
  color: var(--accent);
  border-color: var(--accent);
  border-style: dashed;
}
.act-merged {
  background: var(--c-blue-weak);
  color: var(--c-blue);
  border-color: var(--c-blue);
}
.act-skipped {
  background: var(--danger-weak);
  color: var(--danger);
  border-color: var(--danger);
}
.act-error {
  background: var(--danger-weak);
  color: var(--danger);
  border-color: var(--danger);
}
</style>
