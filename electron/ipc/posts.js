'use strict';
/**
 * 文档与便签通道：文档列表（分页+筛选）、详情、保存、查重、合并、删除、版本回溯，
 * 以及便签的列表/保存/删除。
 */
const db = require('../db');
const i18n = require('../i18n');
const { S, I, handle, currentUser } = require('./shared');
const { normalizePage } = require('../db/posts');

function registerPosts() {
  handle('post:list', async p => {
    const { limit, offset } = normalizePage(p);
    return {
      total: db.countPosts(p),
      rows: db.listPosts({
        regionId: p.regionId,
        categoryId: p.categoryId,
        tagId: p.tagId,
        q: S(p.q),
        fieldCode: S(p.fieldCode),
        fieldValue: S(p.fieldValue),
        dateFrom: S(p.dateFrom),
        dateTo: S(p.dateTo),
        authorId: S(p.authorId),
        status: S(p.status),
        origin: S(p.origin),
        limit,
        offset
      })
    };
  });
  handle('post:get', async p => db.getPost(I(p.id)));
  handle('post:save', async p =>
    db.savePost(
      {
        id: I(p.id),
        title: p.title,
        regionId: p.regionId,
        categoryId: p.categoryId,
        fields: p.fields,
        tags: p.tags,
        contentHtml: p.contentHtml,
        status: p.status,
        no: S(p.no)
      },
      currentUser()
    )
  );
  // 编辑态查重必须带上该文档的**当前落库值**（originalFields / originalTitle），
  // 否则历史遗留的重复值会把用户永久锁死：那个字段本次没动，却每次都拦下来。
  // 详见 db/posts.js 的 checkDuplicates 注释。
  handle('post:checkDup', async p =>
    db.checkDuplicates({
      id: p.id,
      fields: p.fields,
      title: p.title,
      regionId: p.regionId,
      categoryId: p.categoryId,
      originalFields: p.originalFields,
      originalTitle: p.originalTitle
    })
  );
  handle('post:merge', async p => db.mergePost({ targetId: p.targetId, draft: p.draft }, currentUser()));
  handle('post:delete', async p => {
    db.deletePost(I(p.id), currentUser());
    return true;
  });
  handle('post:listTrash', async p => db.listTrash({ limit: p && p.limit, offset: p && p.offset }));
  handle('post:restoreTrash', async p => {
    db.restoreFromTrash(I(p.id), currentUser());
    return true;
  });
  handle('post:purge', async p => {
    db.purgePost(I(p.id), currentUser());
    return true;
  });
  handle('post:versions', async p => db.listVersions(I(p.postId)));
  // 预览历史版本内容（只读）。归属校验放在 db.getVersionSnapshot 里统一做 ——
  // 快照可能含草稿/机密修订，不能只因为「能列出元数据」就允许读全文。
  handle('post:versionSnapshot', async p => {
    const postId = I(p.postId);
    // 与 post:restore 对齐：先断言「这条文档我能改」，再取快照。
    // 放在 IPC 层是因为 assertOwnership 需要一个「文档级」的前置检查，
    // 而 getVersionSnapshot 自身只关心「这个版本是否属于这条文档」。
    db.assertOwnership(postId, currentUser());
    return db.getVersionSnapshot(postId, I(p.versionId));
  });
  handle('post:restore', async p => {
    db.restoreVersion(I(p.postId), I(p.versionId), currentUser());
    return db.getPost(I(p.postId));
  });
  // 归属相关：统计自己名下文档数 / 把名下全部文档移交给他人
  handle('post:countMine', async () => db.countMyPosts(currentUser()));
  handle('post:transferMine', async p => {
    const uid = currentUser();
    if (!uid) throw new Error(i18n.errKey('settings.errNotLoggedInTransfer'));
    const to = String(p.toUserId || '');
    if (!to) throw new Error(i18n.errKey('common.errPickTargetUser'));
    return db.transferMyPosts(uid, to);
  });

  handle('notes:list', async () => db.listNotes());
  handle('notes:save', async p =>
    db.saveNote({ id: I(p.id), content: p.content, color: S(p.color), sort: p.sort }, currentUser())
  );
  handle('notes:delete', async p => db.deleteNote(I(p.id), currentUser()));
}

module.exports = { registerPosts };
