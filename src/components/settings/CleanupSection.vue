<template>
  <!--
    数据清洗（Beta.317 起为独立栏目，位置在「数据加密」下方）。

    【为什么是独立栏目而不是塞进数据加密卡片】
      Beta.316 曾把它挂在 security 分区的 card-stack 里。菜单上点不到、切换语言后
      也搜不到，用户看到的是数据加密下面挂着两张卡片 —— 与「独立成一个栏目」的
      意图不符。清洗与加密是两件事：加密管「谁能读」，清洗管「删了没用的之后占多少」。

    【为什么是一个"容器"而不是只有一个按钮】
      用户明确的定位是「除了图片还可以拓展到其它方面」。所以这里的结构刻意做成
      **清洗项列表**：每个 item 一行，各自有预检数字与执行按钮。后续加「孤儿字段值」
      「空分类」「过期版本快照」只需往 CLEANUP_ITEMS 里加一项 + 后端 cleanup.js 加一个分支，
      界面与交互完全复用。

    【为什么必须先预检再执行】
      清洗是破坏性操作。直接给按钮，用户点下去只看到一个不知后果的确认框；
      先显示「可清理 N 项 / Y MB」，用户才能判断"这个数字值不值得动手"。
      预检（cleanup:stats）与实际执行（cleanup:run）在后端共用同一个扫描函数，
      两个数字不会漂移。

    【密码校验】与删除文档/清空回收站同一把尺子（ui-theme-rules 第 7 节：
      破坏性操作必须验密码）。走 useSubmit 的 password 选项，不另写一套。
  -->
  <div class="card sec">
    <h3>
      {{ t('settings.cleanupTitle') }}
      <span class="badge">{{ t('settings.cleanupBadge') }}</span>
    </h3>
    <p class="dim">{{ t('settings.cleanupDesc') }}</p>

    <!-- ★ Beta.324：图片文件清单已移出本卡，独立成「数据清洗」之下的第二张卡
         （用户原话「图片文件应独立在数据清洗板块之下」）。本卡只保留清洗项本身；
         清理完成后经 @cleaned 通知父层刷新清单 —— 清完数字不跟着变，用户会以为没成功。
         耦合方向：父层（SettingsPage）持有清单引用，本卡不发消息、不直接摸别人的 ref。 -->
    <div class="cl-list">
      <div class="cl-item" v-for="it in CLEANUP_ITEMS" :key="it.key">
        <div class="cl-main">
          <b>{{ t(it.titleKey) }}</b>
          <span class="dim cl-desc">{{ t(it.descKey) }}</span>
          <!-- 预检结果：加载中 / 可清理数量 / 上次执行结果 -->
          <span class="cl-stat">
            <template v-if="busy[it.key]">{{ t('settings.cleanupScanning') }}</template>
            <!-- Beta.325：空标签没有「字节」口径，统计的是「空名标签行数 + 牵连文档数」，
                 单独走 found/last/pwdMsg 三组文案，不与图片项共用带 {size} 的模板 -->
            <template v-else-if="last[it.key]">
              {{
                it.key === 'emptyTags'
                  ? t('settings.cleanupEmptyTagsLast', {
                      n: last[it.key].removed,
                      m: last[it.key].removedDocs || 0
                    })
                  : t('settings.cleanupLastResult', { n: last[it.key].removed, size: last[it.key].freedText })
              }}
            </template>
            <template v-else-if="stats[it.key]">
              <span :class="{ warn: stats[it.key].removable > 0 }">
                <template v-if="stats[it.key].removable">
                  {{
                    it.key === 'emptyTags'
                      ? t('settings.cleanupEmptyTagsFound', {
                          n: stats[it.key].removable,
                          m: stats[it.key].removableDocs || 0
                        })
                      : t('settings.cleanupFound', {
                          n: stats[it.key].removable,
                          size: stats[it.key].removableText
                        })
                  }}
                </template>
                <template v-else>{{ t('settings.cleanupClean') }}</template>
              </span>
            </template>
          </span>
        </div>
        <div class="cl-btns">
          <button class="btn btn-sm" :disabled="!!busy[it.key]" @click="scan(it.key)">
            {{ t('settings.cleanupScan') }}
          </button>
          <button
            class="btn btn-sm btn-danger"
            :disabled="!!busy[it.key] || !stats[it.key] || !stats[it.key].removable"
            @click="runItem(it)"
          >
            {{ t('settings.cleanupRun') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 口径说明：用户最关心的"会不会把我要的东西删掉"要写清楚，而不是藏在注释里 -->
    <div class="tip-box">
      <b><Icon name="info" :size="14" /> {{ t('settings.cleanupScopeTitle') }}</b>
      <span class="dim">{{ t('settings.cleanupScopeBody') }}</span>
    </div>
  </div>
</template>

<script setup>
import { reactive, onMounted } from 'vue';
import Icon from '../Icon.vue';
import { t } from '../../i18n';
import { A } from '../../api';
import { toastErr } from '../../feedback';
import { useSubmit } from '../../composables/useSubmit';

/**
 * 清洗项清单（前端唯一来源）。
 * 后端 electron/ipc/cleanup.js 的 ITEMS 必须与这里的 key 一一对应——
 * 加项时两处同改，否则调不通（后端会抛「未知的清洗项」）。
 */
const CLEANUP_ITEMS = [
  { key: 'images', titleKey: 'settings.cleanupImagesTitle', descKey: 'settings.cleanupImagesDesc' },
  // Beta.325：空标签（用户需求「保存时清除空标签」的存量层）。后端 electron/ipc/cleanup.js
  // 的 ITEMS 与这里的 key 一一对应；显示口径是「空名标签行数 + 牵连文档数」，不是字节。
  { key: 'emptyTags', titleKey: 'settings.cleanupEmptyTagsTitle', descKey: 'settings.cleanupEmptyTagsDesc' }
];

const stats = reactive({});
const busy = reactive({});
const last = reactive({});

/** 清理完成事件（Beta.324）：父层据此刷新独立的图片文件清单。
 *  为什么不自己持有清单组件的 ref —— 清单已是另一张卡，由父层平铺渲染，
 *  子组件跨过去摸别人的 ref 会把两棵子树耦成一张网，父层一个 @cleaned 就够。 */
const emit = defineEmits(['cleaned']);

const { submit } = useSubmit();
/** 预检：只统计，不写库 */
async function scan(key) {
  busy[key] = true;
  try {
    stats[key] = await A.cleanupStats({ item: key });
  } catch (e) {
    toastErr(e);
  } finally {
    busy[key] = false;
  }
}

/** 执行清洗：破坏性操作，先验密码 */
function runItem(it) {
  busy[it.key] = true;
  submit(() => A.cleanupRun({ item: it.key }), {
    password: true,
    passwordTitle: t('settings.cleanupPwdTitle'),
    passwordAction: t('settings.cleanupRun'),
    // Beta.325：空标签项的确认文案用「标签数 + 牵连文档数」，不用图片项的 {size}
    passwordMessage:
      it.key === 'emptyTags'
        ? t('settings.cleanupEmptyTagsPwdMsg', {
            n: stats[it.key] ? stats[it.key].removable : 0,
            m: stats[it.key] ? stats[it.key].removableDocs || 0 : 0
          })
        : t('settings.cleanupPwdMsg', {
            title: t(it.titleKey),
            n: stats[it.key] ? stats[it.key].removable : 0,
            size: stats[it.key] ? stats[it.key].removableText : ''
          }),
    // ★ 成功提示只在这一处出（run() 内部统一 toast）：
    //   此前 then 里另调了一次 toast，导致「已清理 N 项」弹两遍。
    //   用函数形态是为了拿到真实 removed 数——写成字符串会在弹窗前就求值成 n:0。
    ok: r => t('settings.cleanupDone', { n: r ? r.removed : 0 }),
    then: r => {
      last[it.key] = r;
      // 清完立刻重扫：数字归零才是"真的清干净了"的证据，比一句 toast 可信
      scan(it.key);
      // 通知父层刷新图片文件清单：清掉的图不应还挂在列表里，否则用户以为没删干净
      emit('cleaned');
    }
  }).finally(() => {
    busy[it.key] = false;
  });
}

// 进页面即预检一次：用户不必先点「扫描」才知道有没有可清的
onMounted(() => {
  CLEANUP_ITEMS.forEach(it => scan(it.key));
});
</script>

<style scoped>
/* .sec / .btns / .dim 见 styles/components.css，此处仅保留本区块特有样式 */
.cl-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.cl-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.cl-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.cl-main b {
  font-size: 13.5px;
}
.cl-desc {
  font-size: 12px;
  line-height: 1.6;
}
.cl-stat {
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.cl-stat .warn {
  color: var(--warn);
}
.cl-btns {
  display: flex;
  gap: 8px;
  flex: none;
}
.tip-box {
  margin-top: 14px;
  background: var(--surface-2);
  border-radius: var(--radius);
  padding: 10px 12px;
  font-size: 12px;
}
</style>
