<template>
  <!--
    遮罩层（Beta.286）：变暗 + 背景模糊 + 入场/退场动画。弹窗与抽屉共用同一套。

    点击判定用 @click.self：只有点在遮罩本身、而不是弹窗内容上，才触发关闭。

    ★ 两个 class 的分工 ★
      `.mask`      —— 仅做"铺满视口 + 脱离文档流"，与主题无关；
      `maskClass`  —— 决定暗度、模糊半径、层级、动画：'modal-mask' 或 'sp-mask'，
                      这两套具体样式在 base.css，因为它们要跟主题覆盖规则放在一起。
  -->
  <div
    ref="rootEl"
    class="mask"
    :class="[maskClass, { 'is-leaving': leaving }]"
    @click.self="requestClose"
    @animationend="onAnimEnd"
  >
    <!-- slot 把 requestClose 透给内容：弹窗里的"取消/确定/×"都该走同一条退场路径 -->
    <slot :requestClose="requestClose" />
  </div>
</template>

<script setup>
/**
 * 遮罩层组件。
 *
 * 【为什么要单独做成组件，而不是各弹窗自己写一层 div】
 *   Beta.286 给遮罩加了模糊和淡入淡出。入场好办（把 animation 挂在元素上即可），
 *   退场却不行 —— Chromium 移除节点的瞬间动画立即中断。常规解法是 <Transition> 包裹，
 *   但本项目 15 处弹窗各自 `v-if` 独立组件，逐个改成 Transition 等于写 15 份重复钩子，
 *   以后新增弹窗还极容易漏。所以把退场时序收敛到这一处：
 *
 *     1. 任何"关闭意图"（点遮罩 / 点 × / 取消 / Esc）→ 调 requestClose()
 *     2. requestClose() 先挂 `.is-leaving` 播退场动画
 *     3. 动画播完（animationend）或超时兜底后才 emit('close')
 *     4. 父组件的 v-if 这时才移除整块 —— 动画已经完整播完
 *
 * 【时长只有一个真相】
 *   JS 不写死 140ms，而是读 getComputedStyle 的 animation-duration，
 *   改动画时长只需改 base.css 一处。读不到（jsdom / 极端环境）退回 180ms 兜底：
 *   宁可多等一帧，也不能提前把元素删掉导致动画被切。
 *
 * 【重复点击必须幂等】
 *   退场那 140ms 里用户完全可能再点一次"确定"。若不拦，
 *   emit('close') 会执行两次，父组件若带副作用（记脏、清草稿）就执行两遍。
 */
import { ref, onMounted } from 'vue';

defineProps({
  /** 'modal-mask'（弹窗）| 'sp-mask'（侧滑抽屉）。对应 base.css 里的两套遮罩样式 */
  maskClass: { type: String, default: 'modal-mask' }
});
const emit = defineEmits(['close']);

const rootEl = ref(null);
const leaving = ref(false);
// 用普通变量而非 ref：它只用于幂等判定，不需要触发视图更新
let finished = false;
let timer = null;

const FALLBACK_MS = 180; // 读不到 CSS 时的退场时长
const MAX_WAIT_MS = 260; // 最长等待：任何情况下不超过它，避免动画事件丢失导致"关不掉"

/** 从 CSS 读退场时长（ms）。animation-duration 可能形如 "0.14s" 或 "140ms" */
function leaveMs() {
  try {
    const raw = rootEl.value ? getComputedStyle(rootEl.value).animationDuration : '';
    const first = String(raw).split(',')[0].trim();
    const n = parseFloat(first);
    if (!isFinite(n) || n <= 0) return FALLBACK_MS;
    return /ms$/.test(first) ? n : n * 1000;
  } catch (e) {
    return FALLBACK_MS;
  }
}

function finish() {
  if (finished) return;
  finished = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  emit('close');
}

/** 请求关闭。重复调用直接忽略（见文件头「重复点击必须幂等」） */
function requestClose() {
  if (finished || leaving.value) return;
  leaving.value = true;
  // 先挂 class 让动画起跑，再按实际时长排兜底定时器
  const ms = Math.min(leaveMs() + 40, MAX_WAIT_MS);
  timer = setTimeout(finish, ms);
}

/** 只认遮罩自己播完的动画；弹窗内部元素的动画（如过渡）冒泡上来不算 */
function onAnimEnd(e) {
  if (e.target !== e.currentTarget) return;
  if (leaving.value) finish();
}

// 首帧把 backdrop-filter 的变量先算一遍，避免出现"先不模糊、下一帧突然模糊"的跳变
onMounted(() => {
  if (rootEl.value) void rootEl.value.offsetHeight;
});

defineExpose({ requestClose });
</script>

<style scoped>
/* 只管"铺满视口、脱离文档流"。暗度 / 模糊 / 层级 / 动画都在 base.css ——
 * 那里才有主题覆盖（八套主题的遮罩颜色各不相同），放 scoped 里会被拆散。 */
.mask {
  position: fixed;
  inset: 0;
}
</style>
