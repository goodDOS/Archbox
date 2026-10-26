<template>
  <div>
    <div class="section-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 4h16v12H8l-4 4V4Z" />
      </svg>
      {{ t('home.notesBoard') }}
    </div>
    <div class="notes">
      <div class="note-card" v-for="n in notes" :key="n.id" :style="{ background: n.color }">
        <textarea
          v-model="n.content"
          maxlength="2000"
          :placeholder="t('home.notePlaceholder')"
          :disabled="!store.writable"
          @blur="saveNote(n)"
          spellcheck="false"
        ></textarea>
        <div class="note-foot">
          <span class="note-date">{{ fmtDate(n.created_at) }}</span>
          <div class="note-actions">
            <div class="dots">
              <span
                v-for="c in NOTE_COLORS"
                :key="c"
                class="d"
                :class="{ disabled: !store.writable }"
                :style="{ background: c, outline: n.color === c ? '1.5px solid var(--text)' : 'none' }"
                @click="store.writable && recolor(n, c)"
              ></span>
            </div>
            <button class="note-del" @click="delNote(n)" :disabled="!store.writable" :title="t('home.noteDeleteTitle')">
              ✕
            </button>
          </div>
        </div>
      </div>
      <button class="note-add" @click="addNote" :disabled="!store.writable">{{ t('home.addNote') }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { store, bus } from '../../store';
import { run } from '../../feedback';
import { A } from '../../api';
import { requirePassword } from '../../composables/useGuard';
import { dateOnly } from '../../utils/timefmt';
import { t } from '../../i18n';

const notes = ref([]);
const NOTE_COLORS = ['#ffe58f', '#d3f9d8', '#d0ebff', '#ffe3e3', '#e5dbff', '#f0f0f0'];

function fmtDate(s) {
  return dateOnly(s);
}

async function load() {
  try {
    notes.value = await A.notes();
  } catch (e) {}
}
// 便签数量计入首页「内容构成」卡（由 Home 持有 stats）。
// NotesBoard 是 Home 的子组件，自身改不到父组件的 stats，
// 故增删后必须广播 refresh 让 Home 重取统计，否则该卡计数滞后。
async function addNote() {
  await run(() => A.noteSave({ content: '', color: NOTE_COLORS[notes.value.length % NOTE_COLORS.length] }), {
    ok: t('home.noteAdded'),
    then: r => {
      notes.value = r;
      bus.emit('refresh');
    }
  });
}
async function saveNote(n) {
  await run(() => A.noteSave({ id: n.id, content: n.content, color: n.color }));
}
async function recolor(n, c) {
  n.color = c;
  await saveNote(n);
}
async function delNote(n) {
  const ok = await requirePassword(t('home.noteDelPwd'));
  if (!ok) return;
  await run(() => A.noteDelete({ id: n.id }), {
    ok: t('home.noteDeleted'),
    then: r => {
      notes.value = r;
      bus.emit('refresh');
    }
  });
}

onMounted(load);
// 订阅全局刷新（标题栏刷新按钮）：其它视图改数据后回到首页需同步
bus.on('refresh', load);
onBeforeUnmount(() => bus.off('refresh', load));
</script>

<style scoped>
.notes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
/* 便签卡片始终是浅色纸底（NOTE_COLORS 全为浅色 pastel，由用户选择且随卡片持久化），
 * 不随主题翻转 —— 因此卡片内的墨色/分隔线/色点环必须固定为深色系，
 * 不能使用 --text / --border 等主题 token，否则暗色主题下会变成「浅底浅字」不可读。
 * 这里把散落的 rgba/#hex 收敛为局部命名变量，便于统一调整且自解释。 */
.note-card {
  --note-ink: #333; /* 正文墨色 */
  --note-ink-soft: rgba(0, 0, 0, 0.45); /* 日期等次要信息 */
  --note-ink-faint: rgba(0, 0, 0, 0.35); /* 删除按钮常态 */
  --note-hairline: rgba(0, 0, 0, 0.06); /* 卡片描边 */
  --note-dot-ring: rgba(0, 0, 0, 0.15); /* 取色点描边 */
  --note-danger: #c0392b; /* 删除按钮 hover */
  border-radius: var(--radius);
  padding: 10px 12px;
  min-height: 130px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
  border: 1px solid var(--note-hairline);
}
.note-card textarea {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  font-size: 13px;
  line-height: 1.6;
  color: var(--note-ink);
}
.note-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
}
.note-date {
  font-size: 11px;
  color: var(--note-ink-soft);
}
.note-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dots {
  display: flex;
  gap: 5px;
}
.d {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  cursor: pointer;
  border: 1px solid var(--note-dot-ring);
}
.d.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.note-del {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--note-ink-faint);
  font-size: 12px;
}
.note-del:hover {
  color: var(--note-danger);
}
.note-add {
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius);
  min-height: 130px;
  background: transparent;
  cursor: pointer;
  color: var(--text-3);
  font-size: 13px;
}
.note-add:hover {
  color: var(--accent);
  border-color: var(--accent);
}
</style>
