'use strict';
/**
 * 便签：CRUD（列表返回由 save/delete 复用）
 * 依赖 core 的查询助手与审计。
 */
const core = require('./core');

const { all, run, insert, audit, persist, nowIso } = core;

function listNotes() {
  return all('SELECT * FROM notes ORDER BY sort,id');
}
function saveNote(p, userId) {
  const content = String(p.content || '').slice(0, 2000);
  const color = /^#[0-9a-fA-F]{6}$/.test(p.color || '') ? p.color : '#ffe58f';
  if (p.id) {
    run('UPDATE notes SET content=?,color=?,updated_at=? WHERE id=?', [content, color, nowIso(), p.id]);
  } else {
    const newId = insert('INSERT INTO notes(content,color,sort,created_at,updated_at) VALUES(?,?,?,?,?)', [
      content,
      color,
      parseInt(p.sort || 0, 10) || 0,
      nowIso(),
      nowIso()
    ]);
    audit(userId, '新建便签', 'note', newId, {});
  }
  persist();
  return listNotes();
}
function deleteNote(id, userId) {
  run('DELETE FROM notes WHERE id=?', [id]);
  audit(userId, '删除便签', 'note', id, {});
  persist();
  return listNotes();
}

module.exports = {
  listNotes,
  saveNote,
  deleteNote
};
