<template>
  <Modal
    :title="`${t('post.diffTitle')} · v${version.version_no} → ${t('post.current')}`"
    icon="stack"
    max-width="1120px"
    @close="$emit('close')"
  >
    <template #default="{ requestClose }">
      <!-- ============ 摘要行 ============ -->
      <div class="df-sum">
        <span class="df-chip" :class="{ on: diff.stats.change > 0 }">{{
          t('post.diffChanged', { n: diff.stats.change })
        }}</span>
        <span class="df-chip" :class="{ on: diff.stats.insert > 0 }">{{
          t('post.diffInserted', { n: diff.stats.insert })
        }}</span>
        <span class="df-chip" :class="{ on: diff.stats.delete > 0 }">{{
          t('post.diffDeleted', { n: diff.stats.delete })
        }}</span>
        <span class="df-chip dim">{{ t('post.diffEqual', { n: diff.stats.equal }) }}</span>
      </div>

      <!-- ★ 元信息差异：快照存了标题/状态/字段/标签，只比正文会出现
         「只改了标题、正文一字未动」却显示「完全相同」的错误结论 -->
      <div class="df-meta" v-if="diff.meta && diff.meta.length">
        <div class="df-meta-row" v-for="m in diff.meta" :key="m.label">
          <!-- kind==='meta' 的行名是 i18n key（postDiff.TAGS_OF），翻译后展示；
             字段行（kind==='field'）的 label 是用户自定义字段名，原样展示。
             t() 对查不到的 key 会原样返回，但这里不依赖那个副作用，显式分流。 -->
          <span class="df-meta-k">{{ m.kind === 'meta' ? t(m.label) : m.label }}</span>
          <span class="df-meta-old">{{ m.old || t('post.emptyParen') }}</span>
          <span class="df-arrow">→</span>
          <span class="df-meta-new">{{ m.new || t('post.emptyParen') }}</span>
        </div>
      </div>

      <!-- 截断横幅：静默截断会让用户误判「无变化」 -->
      <div class="df-warn" v-if="diff.truncated">
        <Icon name="warn" :size="14" />
        <span>{{ t('post.diffTruncated', { n: maxParas }) }}</span>
      </div>

      <div class="df-warn" v-if="diff.identical">
        <Icon name="check" :size="14" />
        <span>{{ t('post.diffIdentical') }}</span>
      </div>

      <!-- ============ 并排双栏 ============ -->
      <!-- ★ 成对行布局：每个 op 一行、含左右两个单元格，视线能横向跟随。
         不做成两个各自独立滚动的窗格 —— 那样无法对照。 -->
      <div class="df-scroll">
        <div class="df-hd">
          <div class="df-hd-col">
            <b>v{{ version.version_no }}</b>
            <span>{{ withTz(version.created_at) }}</span>
            <span class="dim">{{ version.user_name || t('post.system') }}</span>
          </div>
          <div class="df-hd-col">
            <b>{{ t('post.current') }}</b>
            <span>{{ withTz(now) }}</span>
            <span class="dim">{{ currentUser }}</span>
          </div>
        </div>

        <div class="df-body" v-if="visibleOps.length">
          <div class="df-row" v-for="(op, i) in visibleOps" :key="i" :class="'t-' + op.type">
            <!-- ★ Beta.322：图片直接显示，不再是「[图片]」文字 ★
                 三种情形分别渲染：
                   · 整段是纯图（op.onlyImg）→ 走格栅并排，不套 <p>（不然图下方多一条空行）；
                   · 段落里混着图文 → 文字按原来的 diff 片段渲染，图片 token 单独换 <img>；
                   · 只在一侧出现（新增/删除）→ 另一侧留空白格，不做假占位。 -->
            <div class="df-cell">
              <template v-if="op.type !== 'insert'">
                <div v-if="op.onlyImg && op.oldImgs.length" class="df-imgs">
                  <button
                    v-for="(im, k) in op.oldImgs"
                    :key="'o' + k"
                    class="df-img-btn"
                    :class="{ 'df-img-del': op.type === 'delete' || op.oldGone }"
                    :title="t('post.imgZoomOpen')"
                    :aria-label="t('post.imgZoomOpen')"
                    @click="$emit('zoom', im)"
                  >
                    <img class="df-img" :src="im.src" :alt="im.alt || ''" draggable="false" />
                  </button>
                </div>
                <!-- 左列：旧文本。change 时整段做删除标记 -->
                <p v-else-if="op.type === 'delete'" class="df-p del">{{ plainOf(op.oldText) }}</p>
                <p v-else-if="op.type === 'change'" class="df-p">
                  <template v-for="(s, j) in op.tokens" :key="j">
                    <img
                      v-if="s.t === 'img'"
                      class="df-img df-img-inline"
                      :class="{ 'df-skip': s.side === 'ins' }"
                      :src="s.src"
                      :alt="s.alt || ''"
                      draggable="false"
                      @click="$emit('zoom', s)"
                    />
                    <span v-else :class="s.t === 'del' ? 'df-del' : s.t === 'ins' ? 'df-skip' : ''">{{ s.text }}</span>
                  </template>
                </p>
                <p v-else class="df-p eq">
                  <template v-for="(s, j) in richEq(op.oldText)" :key="j">
                    <img
                      v-if="s.t === 'img'"
                      class="df-img df-img-inline"
                      :src="s.src"
                      :alt="s.alt || ''"
                      draggable="false"
                      @click="$emit('zoom', s)"
                    />
                    <span v-else>{{ s.text }}</span>
                  </template>
                </p>
              </template>
            </div>
            <div class="df-cell">
              <template v-if="op.type !== 'delete'">
                <div v-if="op.onlyImg && op.newImgs.length" class="df-imgs">
                  <button
                    v-for="(im, k) in op.newImgs"
                    :key="'n' + k"
                    class="df-img-btn"
                    :class="{ 'df-img-ins': op.type === 'insert' || op.newNew }"
                    :title="t('post.imgZoomOpen')"
                    :aria-label="t('post.imgZoomOpen')"
                    @click="$emit('zoom', im)"
                  >
                    <img class="df-img" :src="im.src" :alt="im.alt || ''" draggable="false" />
                  </button>
                </div>
                <p v-else-if="op.type === 'insert'" class="df-p ins">{{ plainOf(op.newText) }}</p>
                <p v-else-if="op.type === 'change'" class="df-p">
                  <template v-for="(s, j) in op.tokens" :key="j">
                    <img
                      v-if="s.t === 'img'"
                      class="df-img df-img-inline"
                      :class="{ 'df-skip': s.side === 'del' }"
                      :src="s.src"
                      :alt="s.alt || ''"
                      draggable="false"
                      @click="$emit('zoom', s)"
                    />
                    <span v-else :class="s.t === 'ins' ? 'df-ins' : s.t === 'del' ? 'df-skip' : ''">{{ s.text }}</span>
                  </template>
                </p>
                <p v-else class="df-p eq">
                  <template v-for="(s, j) in richEq(op.newText)" :key="j">
                    <img
                      v-if="s.t === 'img'"
                      class="df-img df-img-inline"
                      :src="s.src"
                      :alt="s.alt || ''"
                      draggable="false"
                      @click="$emit('zoom', s)"
                    />
                    <span v-else>{{ s.text }}</span>
                  </template>
                </p>
              </template>
            </div>
          </div>
        </div>

        <div class="df-none" v-else-if="diff.identical">{{ t('post.diffSameNote') }}</div>
        <div class="df-none" v-else>{{ t('post.diffNoParas') }}</div>
      </div>

      <div class="df-note">
        <Icon name="info" :size="14" />
        <div>
          <p>
            {{ t('post.diffOnlyText') }}<b>{{ t('post.diffOnlyTextBold') }}</b
            >{{ t('post.diffOnlyTextTail') }}
          </p>
          <p>
            {{ t('post.diffNoteHist1') }}<b>{{ t('post.diffNoteHist1Bold') }}</b
            >{{ t('post.diffNoteHist2', { v: version.version_no }) }}
          </p>
          <p>{{ t('post.diffNoteRestore') }}</p>
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn" @click="showEqual = !showEqual">
          {{ showEqual ? t('post.hideEqual') : t('post.showEqual') }}
        </button>
        <!-- requestClose 先播退场动画再真正关闭 -->
        <button class="btn btn-primary" @click="requestClose">{{ t('common.close') }}</button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { computed } from 'vue';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';
import { withTz } from '../../utils/timefmt';
import { MAX_PARAS, splitImgTokens, isImgOnly, IMG_TOKEN_RE } from '../../utils/postDiff';
import { t } from '../../i18n';

const props = defineProps({
  // 父组件已算好 diff —— 算法不放组件里，便于单测与复用
  diff: { type: Object, required: true },
  version: { type: Object, required: true },
  now: { type: String, default: '' },
  currentUser: { type: String, default: '' },
  showEqual: { type: Boolean, default: false }
});
defineEmits(['close', 'zoom']);

const maxParas = MAX_PARAS;

/* ---------- 图片渲染辅助（Beta.322） ----------
 *
 * 【为什么图片要「查表 + 拆 token」两步】
 *   算法层把图片变成段落文本里的一个 token（\u0000IMG:xxxxxxxx\u0000），
 *   图片本体放在 diff.images 里。模板里不能直接把 token 打进 v-text，
 *   否则界面上会露出一串控制字符。所以这里统一走 splitImgTokens：
 *   把 token 换成 { t:'img', src } 片段，模板据此渲染 <img>。
 *
 * 【为什么必须成对 side 处理】
 *   change 行里，左右两格共用同一份 op.tokens，但各自只该显示属于自己那一侧的图。
 *   算法给每个 token 标了 side（'old' | 'new' | 'both'），
 *   右格把 side==='del' 的图隐藏、左格把 side==='ins' 的图隐藏，
 *   于是「换图」在左边看到旧图、右边看到新图，而不是两边都显示两张。
 */

/** 纯图片段标记：判据只有一份，在 postDiff 里（isImgOnly），组件不另写一遍 */
function isOnlyImgText(text) {
  return isImgOnly(text);
}

/** 把带 token 的段落文本还原成可读纯文本（纯图片段返回空串，避免露出控制字符） */
function plainOf(text) {
  return String(text || '')
    .replace(IMG_TOKEN_RE, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** 等值段：直接按 token 拆成「文字 + 图片」片段 */
function richEq(text) {
  return splitImgTokens(text, props.diff.images);
}

// ★ 未改动段落默认隐藏：200 段正文改 2 处，只该显示 2 行。
//   显示全文会让真正的改动淹没在噪音里 —— 这正是「diff 很难用」的主因。
//   这里额外给每个 op 补三个渲染用标记（不再改动算法层的返回结构）：
const visibleOps = computed(() => {
  const list = props.showEqual ? props.diff.ops : props.diff.ops.filter(o => o.type !== 'equal');
  return list.map(o => {
    const op = { ...o };
    op.tokens = (o.tokens || []).map(tk => {
      if (tk.t !== 'img') return tk;
      const im = props.diff.images[tk.id] || {};
      return { ...tk, src: im.src || '', alt: im.alt || '' };
    });
    /* 纯图片段：段落里除了图片 token 没有别的字 —— 这种情况套 <p> 会在图下方多一条空行，
       改走格栅并排（.df-imgs）。两侧各自判断：一侧纯图、一侧图文时仍按图文渲染更安全。 */
    op.onlyImg =
      (o.oldImgs && o.oldImgs.length && isOnlyImgText(o.oldText)) ||
      (o.newImgs && o.newImgs.length && isOnlyImgText(o.newText));
    /* 「这一侧的图没了 / 多出来了」：给格栅加删除线/高亮框。
       算法层只有 insert/delete/change 三种 type，纯图段被整段替换时会落到 change，
       故再按图片 id 集合是否相交判一次。 */
    const idsOf = arr => new Set((arr || []).map(x => x.id));
    const oi = idsOf(o.oldImgs);
    const ni = idsOf(o.newImgs);
    op.oldGone = o.type === 'change' && oi.size > 0 && ![...oi].some(id => ni.has(id));
    op.newNew = o.type === 'change' && ni.size > 0 && ![...ni].some(id => oi.has(id));
    return op;
  });
});
</script>

<style scoped>
.df-sum {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.df-chip {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 20px;
  border: 1px solid var(--border);
  color: var(--text-3);
  background: var(--surface-2);
}
.df-chip.on {
  color: var(--text);
  border-color: var(--accent);
}
.df-chip.dim {
  opacity: 0.65;
}

.df-meta {
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.df-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
}
.df-meta-row:last-child {
  border-bottom: 0;
}
/* ★ Beta.253：字段差异改成逐字段一行后，标签会变成「文档编号（NO）」这类长文本，
 *   原来写死的 width:40px 会把标签折断成好几行、与右侧值错位。
 *   改为自适应宽度 + 不收缩 + 上限，兼顾「标签对齐」与「长标签不被压扁」。 */
.df-meta-k {
  flex: none;
  min-width: 40px;
  max-width: 180px;
  color: var(--text-3);
}
/* 字段行：值是可能很长的正文级文本，允许换行，不要撑破弹层 */
.df-meta-row .df-meta-old,
.df-meta-row .df-meta-new {
  overflow-wrap: anywhere;
}
.df-meta-old {
  color: var(--text-3);
  text-decoration: line-through;
}
.df-meta-new {
  color: var(--text);
}
.df-arrow {
  color: var(--text-3);
  flex: none;
}

.df-warn {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  margin-bottom: 12px;
  border: 1px solid var(--warn);
  color: var(--text-2);
}

.df-scroll {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  max-height: 56vh;
  overflow: auto;
}
.df-hd {
  display: grid;
  grid-template-columns: 1fr 1fr;
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  border-bottom: 1px solid var(--border);
}
.df-hd-col {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 9px 12px;
  font-size: 12px;
  color: var(--text-2);
  background: var(--surface-2);
}
.df-hd-col + .df-hd-col {
  border-left: 1px solid var(--border);
}
.df-hd-col b {
  font-size: 13px;
  color: var(--text);
}

.df-body {
  font-size: 13px;
}
.df-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px dashed var(--border);
}
.df-row:last-child {
  border-bottom: 0;
}
.df-cell {
  padding: 9px 12px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.df-cell + .df-cell {
  border-left: 1px solid var(--border);
}
.df-p {
  margin: 0;
  line-height: 1.8;
  white-space: pre-wrap;
}
.df-p.eq {
  color: var(--text-2);
}
/* change 行整行浅底，让「这一段被改过」先于段内细节被看到 */
.t-change .df-cell {
  background: var(--surface-2);
}
.t-insert .df-cell:last-child {
  background: var(--surface-2);
}
.t-delete .df-cell:first-child {
  background: var(--surface-2);
}
.df-p.ins,
.df-p.del {
  color: var(--text);
}

/* 底色用主题的 weak 档（八套主题均已定义），不硬编码色 */
.df-ins {
  background: var(--ok-weak);
  color: var(--ok);
  border-radius: 2px;
  padding: 0 1px;
  font-weight: 600;
}
.df-del {
  background: var(--danger-weak);
  color: var(--danger);
  text-decoration: line-through;
  border-radius: 2px;
  padding: 0 1px;
}
/* 变更行里，属于「对侧」的片段在本格不显示，置空避免重复读两遍 */
.df-skip {
  display: none;
}

/* ================= 对比里的图片（Beta.322） =================
 * 用户要求「版本对比应当显示图片而不是占位符」，所以这里给的是真图。
 *
 * ★ 为什么限高 180px 而不是原始尺寸 ★
 *   对比弹窗是并排双栏，每栏只有约 540px 宽。一张 4000px 的截图按原尺寸铺开
 *   会把一个段落撑成三屏高，左侧和右侧立刻错位、对不上行。
 *   限高 + object-fit:contain 保证任何尺寸的图都在同一视觉高度带内，
 *   「这张图换没换」靠缩略图就能判断，要看细节点开浮窗（@zoom）。
 * ★ 为什么不写死宽高比 ★
 *   width:auto + max-width:100% 让竖图变窄、横图变宽，都居中在格子里。
 */
.df-img {
  display: block;
  max-width: 100%;
  max-height: 180px;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface-2);
  cursor: zoom-in;
}

/* 段落内联图：跟文字同一行，用 middle 对齐，避免被 baseline 顶出半行 */
.df-img-inline {
  display: inline-block;
  vertical-align: middle;
  max-height: 96px;
  margin: 2px 2px 2px 0;
}

/* 纯图段：网格铺开，多张图并排而不是竖着堆（竖堆会把行拉得很长） */
.df-imgs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: flex-start;
}

/* 格栅里的每张图包一层按钮：可聚焦、可键盘打开浮窗（无障碍要求） */
.df-img-btn {
  display: block;
  padding: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
  border-radius: var(--radius-sm);
  line-height: 0;
}
.df-img-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* 被删掉的图（只在旧版）：降饱和 + 红框，与文字的删除线语义对齐，
   但**不**用 line-through —— 在图片上划一道横线什么都看不清。 */
.df-img-del .df-img {
  border-color: var(--danger);
  opacity: 0.62;
  filter: grayscale(0.55);
}
/* 新增的图（只在新版）：绿框，与 .df-ins 同一组 token，不另造色 */
.df-img-ins .df-img {
  border-color: var(--ok);
  box-shadow: 0 0 0 2px var(--ok-weak);
}

.df-none {
  padding: 18px 12px;
  font-size: 12.5px;
  color: var(--text-3);
  text-align: center;
}

.df-note {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.8;
}
.df-note p {
  margin: 0;
}
</style>
