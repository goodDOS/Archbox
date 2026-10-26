<template>
  <div>
    <div class="page-head">
      <div>
        <h1>{{ t('guide.title') }}</h1>
        <div class="desc">{{ t('guide.subtitle') }}</div>
      </div>
    </div>

    <!-- ============ 产品概述 ============ -->
    <div class="card bio">
      <h2>{{ t('guide.introTitle') }}</h2>
      <p>{{ t('guide.introP1') }}</p>
      <p>{{ t('guide.introP2') }}</p>
    </div>

    <!-- ============ 适用范围 ============ -->
    <h3 class="sec">{{ t('guide.scopeTitle') }}</h3>
    <div class="grid grid-2">
      <div class="card neg">
        <div class="neg-hd">
          <div class="neg-ic"><Icon name="check" :size="20" /></div>
          <b>{{ t('guide.scopeYes') }}</b>
        </div>
        <p>{{ t('guide.scopeYesBody') }}</p>
      </div>
      <div class="card neg">
        <div class="neg-hd">
          <div class="neg-ic neg-ic-no"><Icon name="x" :size="20" /></div>
          <b>{{ t('guide.scopeNo') }}</b>
        </div>
        <p>{{ t('guide.scopeNoBody') }}</p>
      </div>
    </div>

    <p class="jab">
      <b>{{ t('guide.scopeVerdictLabel') }}</b
      >{{ t('guide.scopeVerdict') }}
    </p>

    <!-- ============ 功能特性 ============ -->
    <h3 class="sec">{{ t('guide.featuresTitle') }}</h3>

    <div class="grid grid-2">
      <div class="card cap">
        <div class="cap-hd">
          <span class="cap-no">01</span><b>{{ t('guide.f1Title') }}</b>
        </div>
        <p>{{ t('guide.f1Body') }}</p>
        <div class="cost">{{ t('guide.f1Limit') }}</div>
      </div>

      <div class="card cap">
        <div class="cap-hd">
          <span class="cap-no">02</span><b>{{ t('guide.f2Title') }}</b>
        </div>
        <p>{{ t('guide.f2Body') }}</p>
        <div class="cost">{{ t('guide.f2Limit') }}</div>
      </div>

      <div class="card cap">
        <div class="cap-hd">
          <span class="cap-no">03</span><b>{{ t('guide.f3Title') }}</b>
        </div>
        <p>{{ t('guide.f3Body') }}</p>
        <div class="cost">{{ t('guide.f3Limit') }}</div>
      </div>

      <div class="card cap">
        <div class="cap-hd">
          <span class="cap-no">04</span><b>{{ t('guide.f4Title') }}</b>
        </div>
        <p>{{ t('guide.f4Body') }}</p>
        <div class="cost">{{ t('guide.f4Limit') }}</div>
      </div>

      <div class="card cap">
        <div class="cap-hd">
          <span class="cap-no">05</span><b>{{ t('guide.f5Title') }}</b>
        </div>
        <p>{{ t('guide.f5Body') }}</p>
        <div class="cost">{{ t('guide.f5Limit') }}</div>
      </div>

      <div class="card cap">
        <div class="cap-hd">
          <span class="cap-no">06</span><b>{{ t('guide.f6Title') }}</b>
        </div>
        <p>{{ t('guide.f6Body') }}</p>
        <div class="cost">{{ t('guide.f6Limit') }}</div>
      </div>

      <div class="card cap">
        <div class="cap-hd">
          <span class="cap-no">07</span><b>{{ t('guide.f7Title') }}</b>
        </div>
        <p>{{ t('guide.f7Body') }}</p>
        <div class="cost">{{ t('guide.f7Limit') }}</div>
      </div>

      <div class="card cap">
        <div class="cap-hd">
          <span class="cap-no">08</span><b>{{ t('guide.f8Title') }}</b>
        </div>
        <p>{{ t('guide.f8Body') }}</p>
        <div class="cost">{{ t('guide.f8Limit') }}</div>
      </div>

      <div class="card cap">
        <div class="cap-hd">
          <span class="cap-no">09</span><b>{{ t('guide.f9Title') }}</b>
        </div>
        <p>{{ t('guide.f9Body') }}</p>
        <div class="cost">{{ t('guide.f9Limit') }}</div>
      </div>

      <div class="card cap">
        <div class="cap-hd">
          <span class="cap-no">10</span><b>{{ t('guide.f10Title') }}</b>
        </div>
        <p>{{ t('guide.f10Body') }}</p>
        <div class="cost">{{ t('guide.f10Limit') }}</div>
      </div>
    </div>

    <!-- ============ 两类凭证说明 ============ -->
    <h3 class="sec">{{ t('guide.passwordTitle') }}</h3>
    <div class="card pw">
      <div class="pw-row">
        <div class="pw-k"><Icon name="user" :size="16" /> {{ t('guide.pwAccount') }}</div>
        <div class="pw-v">{{ t('guide.pwAccountBody') }}</div>
      </div>
      <div class="pw-row">
        <div class="pw-k"><Icon name="lock" :size="16" /> {{ t('guide.pwDb') }}</div>
        <div class="pw-v">{{ t('guide.pwDbBody') }}</div>
      </div>
      <p class="pw-note">{{ t('guide.pwNote') }}</p>
    </div>

    <!-- ============ 首次使用指引 ============ -->
    <h3 class="sec">{{ t('guide.startTitle') }}</h3>
    <div class="card walk">
      <ol class="steps">
        <li>{{ t('guide.s1') }}</li>
        <li>{{ t('guide.s2') }}</li>
        <li>{{ t('guide.s3') }}</li>
        <li>{{ t('guide.s4') }}</li>
        <li>{{ t('guide.s5') }}</li>
        <li>{{ t('guide.s6') }}</li>
        <li>{{ t('guide.s7') }}</li>
        <li>{{ t('guide.s8') }}</li>
        <li>{{ t('guide.s9') }}</li>
        <li>{{ t('guide.s10') }}</li>
      </ol>
    </div>

    <!-- ============ 程序完整性保护 ============ -->
    <h3 class="sec">{{ t('guide.tamperTitle') }}</h3>
    <div class="card tamper">
      <p>{{ t('guide.tamperIntro') }}</p>
      <div class="tamper-row">
        <div class="tamper-k"><Icon name="lock" :size="16" /> {{ t('guide.tamperLayer1') }}</div>
        <div class="tamper-v">{{ t('guide.tamperLayer1Body') }}</div>
      </div>
      <div class="tamper-row">
        <div class="tamper-k"><Icon name="warn" :size="16" /> {{ t('guide.tamperLayer2') }}</div>
        <div class="tamper-v">{{ t('guide.tamperLayer2Body') }}</div>
      </div>
      <p class="tamper-note">{{ t('guide.tamperNote') }}</p>
    </div>

    <!-- ============ 故障排查 ============ -->
    <h3 class="sec">{{ t('guide.crashTitle') }}</h3>
    <div class="card crash">
      <ol class="steps">
        <li>{{ t('guide.c1') }}</li>
        <li>{{ t('guide.c2') }}</li>
        <li>{{ t('guide.c3') }}</li>
        <li>{{ t('guide.c4') }}</li>
        <li>
          {{ t('guide.c5', { dir: logDirPath }) }}
          <!-- 看完路径就能就地打开，省得再让用户自己贴到资源管理器里找 -->
          <button class="btn btn-sm li-btn" @click="openLogDir">
            <Icon name="folder-open" :size="15" /> {{ t('settings.openLogDir') }}
          </button>
        </li>
      </ol>
    </div>

    <!-- ============ 不适用场景 ============ -->
    <h3 class="sec">{{ t('guide.unfitTitle') }}</h3>
    <div class="card unfit">
      <h3>{{ t('guide.unfitLead') }}</h3>
      <ul class="unfit-list">
        <li>{{ t('guide.u1') }}</li>
        <li>{{ t('guide.u2') }}</li>
        <li>{{ t('guide.u3') }}</li>
        <li>{{ t('guide.u4') }}</li>
        <li>{{ t('guide.u5') }}</li>
      </ul>
    </div>

    <p class="coda">
      <b>{{ t('guide.coda') }}</b>
    </p>

    <p class="tail dim">
      {{ t('guide.tail') }}
    </p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { store } from '../store';
import { A } from '../api';
import { toastInfo, toastErr } from '../feedback';
import Icon from '../components/Icon.vue';
import { t } from '../i18n';

// 日志目录的**绝对路径**，由主进程 settings:getAll 的 logDir 字段给出。
// ★ 页面不猜路径：日志在 userData/logs，数据目录在 userData/data，两者同级；
//   拼 `dataDir + '/logs'` 会得到一个不存在的目录（这正是原文案那句「数据目录的
//   logs\ 下」错的地方）。取不到时退回省略号，宁可让用户去设置页看，也不给假路径。
const logDirPath = ref('…');

async function loadLogDir() {
  try {
    if (!store.settings) store.settings = await A.settingsAll();
    if (store.settings && store.settings.logDir) logDirPath.value = store.settings.logDir;
  } catch (e) {
    /* 取不到就保持省略号，不阻塞说明页渲染 */
  }
}

async function openLogDir() {
  try {
    await A.logOpen();
    toastInfo(t('settings.logDirOpened'));
  } catch (e) {
    toastErr(e, t('settings.logDirOpenFailed'));
  }
}

onMounted(loadLogDir);
</script>

<style scoped>
/* 开场块：左强调竖线，把"产品概述"的调子立住 */
.bio {
  padding: 22px 24px 20px;
  border-left: 3px solid var(--accent);
}
.bio h2 {
  font-size: 19px;
  line-height: 1.5;
  margin-bottom: 12px;
}
.bio p {
  line-height: 1.9;
  font-size: 13px;
  color: var(--text-2);
}
.bio p + p {
  margin-top: 10px;
}
.bio b {
  color: var(--text);
}
.aside {
  color: var(--text-3) !important;
  font-size: 12.5px !important;
}

/* 小标题：整页唯一的层级锚点，克制使用
   对齐：整页的视觉基线是卡片正文的左边缘 = 容器边 + 19px
   （卡片 = 1px 边框 + 18px 内边距，但 .bio 卡另算，见下）。
     · margin-left 取 0        → 竖线与卡片外边框左边缘齐（260）
     · padding-left 取 16px    → 竖线 3px + 16px = 19px，标题文字落在 279
   注意 border-left 的 3px **计入**偏移，所以 padding 要比目标值少 3px。
   此前是 margin 2px + padding 10px：竖线比卡片右偏 2px、文字落在 272，
   与正文 279 差 7px，全页一致地"看着有点歪"。 */
.sec {
  margin: 24px 0 12px;
  font-size: 15px;
  font-weight: 600;
  padding-left: 16px;
  border-left: 3px solid var(--accent);
}

/* 立场卡 */
.neg {
  padding: 16px 18px;
}
/* 图标与标题同行：图标是视觉锚点，标题紧跟其右、垂直居中。
   此前图标独占一行、标题在下方，标题离卡片左边缘只有 0 偏移而正文缩进 18px，
   整块看着像没对齐。挪到一行后左边缘天然一致。 */
.neg-hd {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 9px;
}
.neg-ic {
  width: 34px;
  height: 34px;
  border-radius: var(--radius);
  flex: none; /* 不允许被标题挤扁 */
  display: grid;
  place-items: center;
  background: var(--accent-weak);
  color: var(--accent);
}
/* 「不适用」的图标走中性色。
   两卡都染 --accent 会把否定项也说成「推荐」——而这一卡整段恰恰是边界说明。
   不是警告级（不该用 --warn 抢眼），只是不该顶着主色。 */
.neg-ic-no {
  background: var(--surface-2);
  color: var(--text-3);
}
/* ★ 必须用 > 直接子选择器：写 .neg b 会把 <p> 里那些行内强调 <b> 也变成
   display:block，正文被拆成一行一句（实测就是这么坏掉的）。
   现在标题在 .neg-hd 里，选择器跟着下沉一层——同理必须用 >，
   否则 .neg-hd 下若出现其它行内 <b> 仍会被误伤。
   字号 15px 与 .sec 分节标题同档：同行之后它就是这块的主标题，不该弱于正文。 */
.neg-hd > b {
  font-size: 15px;
}
.neg p {
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.8;
}
.neg p b {
  color: var(--text);
}

/* 一句判断：略重的收束条
   色块类元素的左边缘一律与卡片外边框齐（margin-left 0），
   不再留那 2px —— 整页所有块级元素的左基线只有两条：容器边 或 正文行（19px）。 */
.jab {
  margin: 12px 0 2px;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--accent-weak);
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.85;
}
.jab b {
  color: var(--text);
}

/* 功能卡：序号 + 标题 + 正文 + 限制说明 */
.cap {
  padding: 16px 18px;
}
.cap-hd {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 8px;
}
.cap-no {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-weak);
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  flex: none;
}
.cap-hd b {
  font-size: 14px;
}
.cap p {
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.8;
}
.cap p b {
  color: var(--text);
}
.cost {
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px dashed var(--border);
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.75;
}
.cost b {
  color: var(--text-2);
}

/* 两类凭证：左右对照，避免用户继续混淆 */
.pw {
  padding: 6px 18px 14px;
}
.pw-row {
  display: flex;
  gap: 14px;
  padding: 12px 0;
  align-items: flex-start;
}
.pw-row + .pw-row {
  border-top: 1px dashed var(--border);
}
.pw-k {
  flex: none;
  width: 118px;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
}
.pw-v {
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.85;
}
.pw-v b {
  color: var(--text);
}
.pw-note {
  margin-top: 4px;
  padding: 11px 13px;
  border-radius: var(--radius);
  background: var(--accent-weak);
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.8;
}
.pw-note b {
  color: var(--text);
}

/* 首次使用指引 */
.walk {
  padding: 8px 10px;
}
.steps {
  margin: 0;
  padding-left: 24px;
}
.steps li {
  padding: 9px 4px;
  line-height: 1.8;
  font-size: 13px;
  color: var(--text-2);
}
.steps li::marker {
  color: var(--accent);
  font-weight: 700;
}
.steps li b {
  color: var(--text);
}

/* 边界说明块 */
.unfit {
  padding: 18px 20px;
  border-left: 3px solid var(--warn);
}
.unfit h3 {
  font-size: 14px;
  margin-bottom: 10px;
}
.unfit-list {
  margin: 0;
  padding-left: 20px;
}
.unfit-list li {
  padding: 5px 0;
  line-height: 1.8;
  font-size: 12.5px;
  color: var(--text-2);
}
.unfit-list li::marker {
  color: var(--warn);
}
.unfit-list li b {
  color: var(--text);
}

/* 完整性说明块：两层看守，用与凭证块同构的「键值行」排版，便于对照 */
.tamper {
  padding: 16px 20px;
}
.tamper > p {
  line-height: 1.9;
  font-size: 13px;
  color: var(--text-2);
}
.tamper > p b {
  color: var(--text);
}
.tamper-row {
  display: flex;
  gap: 14px;
  padding: 12px 0;
  align-items: flex-start;
}
.tamper-row + .tamper-row {
  border-top: 1px dashed var(--border);
}
.tamper-k {
  flex: none;
  width: 88px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: 12.5px;
  font-weight: 600;
  padding-top: 1px;
}
.tamper-v {
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.85;
}
.tamper-v b {
  color: var(--text);
}
.tamper-note {
  margin-top: 4px;
  padding: 11px 13px;
  border-radius: var(--radius);
  background: var(--accent-weak);
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.8;
}
.tamper-note b {
  color: var(--text);
}
.dim2 {
  color: var(--text-3);
  font-size: 12px;
}

/* 故障排查块：复用 .steps 的编号列表 */
.crash {
  padding: 8px 10px;
}
/* 步骤里内嵌的按钮：跟正文同一行时会顶到行首基线，用 inline-flex + 小间距拉平 */
.li-btn {
  margin-left: 6px;
  vertical-align: middle;
  font-size: 12px;
}

/* 收尾：色块，左边缘与卡片边框齐（同 .jab） */
.coda {
  margin: 16px 0 2px;
  padding: 14px 16px;
  border-radius: var(--radius);
  background: var(--accent-weak);
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.9;
}
.coda b {
  color: var(--text);
  font-size: 13.5px;
}
/* 页脚小字：无底色，属正文行 → 与卡片正文对齐（同 .sec 的文字基线 19px） */
.tail {
  margin-top: 18px;
  padding-left: 19px;
  font-size: 12px;
  line-height: 1.8;
}
</style>
