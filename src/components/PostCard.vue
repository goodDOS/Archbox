<template>
  <div class="card pc lift" @click="$emit('open', post.id)">
    <div class="pc-head">
      <b v-if="!query" class="pc-title">{{ post.title }}</b>
      <b v-else class="pc-title" v-html="hl(post.title)"></b>
      <span class="badge" v-if="post.status === 'draft'">{{ t('posts.draft') }}</span>
      <span class="badge badge-imp" v-if="post.imported_at" :title="t('posts.importedFromPack')">{{
        t('common.import')
      }}</span>
      <span class="badge badge-copy" v-if="post.copied_at" :title="t('posts.copiedFromLan')">{{
        t('posts.copy')
      }}</span>
    </div>
    <p class="pc-snip" v-if="!query">{{ post.content_text }}</p>
    <p class="pc-snip" v-else v-html="hl(snip(post.content_text))"></p>
    <p class="pc-field" v-if="post.fvalues" v-html="query ? hl(post.fvalues) : post.fvalues"></p>
    <div class="pc-meta">
      <span v-if="post.rname">{{ post.rname }} / {{ post.cname || t('common.unclassified') }}</span>
      <span v-else>{{ post.cname || t('common.unclassified') }}</span>
      <!-- 作者：仅本机列表可点（跳「按作者筛选」）。
           局域共享列表必须传 :clickable="false"：那里的 author_id 是**对方机器**的用户 id，
           拿到本机文档库里筛选必然查不到人，点下去只会跳到一个空列表、像是坏了。
           作者名本身仍是纯文本，信息不丢。 -->
      <span
        class="pc-author"
        v-if="post.author_name"
        :class="{ 'is-link': clickable }"
        @click.stop="clickable && gotoAuthor()"
        >@{{ post.author_name }}</span
      >
      <span v-if="post.no" class="pc-no">{{ post.no }}</span>
      <span class="pc-time">{{ withTz(post[dateKey]) }}</span>
    </div>
  </div>
</template>

<script setup>
import { highlight, snippet } from '../utils/highlight';
import { withTz } from '../utils/timefmt';
import { goto } from '../store';
import { t } from '../i18n';

const props = defineProps({
  post: { type: Object, required: true },
  query: { type: String, default: '' },
  dateKey: { type: String, default: 'updated_at' },
  // 作者名是否可点（跳「按作者筛选」）。局域共享列表须显式传 false，理由见模板注释。
  clickable: { type: Boolean, default: true }
});
defineEmits(['open']);

function hl(t) {
  return highlight(t || '', props.query);
}
function snip(t) {
  return snippet(t || '', props.query);
}
function gotoAuthor() {
  if (!props.post.author_id) return;
  goto('posts', { authorId: props.post.author_id, authorName: props.post.author_name });
}
</script>

<style scoped>
.pc {
  padding: 14px 16px;
  cursor: pointer;
} /* 悬停抬升交互来自 .lift（components.css） */
.pc-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pc-title {
  font-size: 14.5px;
}
.pc-snip {
  color: var(--text-2);
  font-size: 12.5px;
  margin: 6px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pc-field {
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--accent);
}
/* 元信息行：align-items:center 让这一行里的各段文字**垂直居中对齐**。
 * 此前没写 align-items，flex 子项默认 stretch，而各段字体不同
 * （作者名 11.5px、编号 11px 等宽），行盒高度被撑开后基线就错开了。 */
.pc-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11.5px;
  color: var(--text-3);
  flex-wrap: wrap;
}
/* 作者名：默认纯文本（不可点）。只有 clickable=true 时才给链接外观与手型。 */
.pc-author {
  color: var(--text-3);
}
.pc-author.is-link {
  cursor: pointer;
  color: var(--accent);
}
.pc-author.is-link:hover {
  text-decoration: underline;
}
/* 文档编号：与同行文字**同字号**。
 * 此前这里单独用 11px（比同行的 11.5px 小一号）还换成等宽字体，
 * 于是编号这一段明显比左右邻居小、且基线偏低 —— 用户报「文档编号没与同行对齐」。
 * 等宽字体保留（编号要能按位对齐、好核对），但字号必须跟同行一致。 */
.pc-no {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: inherit;
}
/* 时间：靠 margin-left:auto 顶到行末（原来写在行内 style 上，这里收成 class 便于统一管控） */
.pc-time {
  margin-left: auto;
}
/* 来源甄别：由文档包导入的文档加一枚区分色徽章（用令牌，跟随主题） */
.badge-imp {
  background: var(--accent);
  color: var(--accent-text);
  cursor: help;
}
/* 来源甄别：由局域共享拷贝的文档。用 --ok 与「导入」的 --accent 区分，避免两枚徽章混淆 */
.badge-copy {
  background: var(--ok);
  color: var(--accent-text);
  cursor: help;
}
</style>
