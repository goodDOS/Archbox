'use strict';
/**
 * 数据清洗通道（Beta.316）。
 *
 * 【为什么不并进 storage.js】storage 是「目录与备份」域；数据清洗是「按规则回收/规整
 *   既有数据」的独立域，后续还会加新项（孤儿字段值、空分类、过期版本快照…）。
 *   分成独立域后，加清洗项只改本文件 + CleanupSection 一项，不动 storage。
 *
 * 【两项接口的口径】
 *   stats —— 只读预检，返回「能清掉多少」，供界面在用户动手前如实展示；
 *   run   —— 真正执行，返回实际清理结果。
 *   两者共用 db-images 的 scanReferences（单一来源），预检数字与实清数字不会漂移。
 *
 * 【权限】破坏性操作：要求可写（state.writable）且写审计。密码校验由前端统一走
 *   useSubmit 的 password 选项（与删除文档/清空回收站同一把尺子），此处不重复实现。
 */
const db = require('../db');
const dbImages = require('../services/db-images');
const state = require('../state');
const { formatBytes } = require('../services/fs-utils');
const { handle, currentUser, safeAudit, getLog } = require('./shared');
const i18n = require('../i18n');

/** 清洗项白名单：新增项必须同时出现在这里与前端 CleanupSection 的列表里 */
const ITEMS = ['images', 'emptyTags'];

function assertWritable() {
  if (!state.writable) throw new Error(i18n.errKey('common.errReadonlyCleanup'));
}

function registerCleanup() {
  /**
   * 预检：不写库，只统计。
   * @param {{item?: string}} p item 缺省为 'images'
   * @returns {{item:string, removable:number, removableBytes:number, removableText:string, total:number, totalText:string}}
   */
  handle('cleanup:stats', async p => {
    const item = (p && p.item) || 'images';
    if (!ITEMS.includes(item)) throw new Error(i18n.errKey('common.errUnknownCleanupItem', { item }));
    if (item === 'emptyTags') {
      // Beta.325：空标签没有字节概念（省下的是两行脏记录），统计口径改为
      // 「空名标签行数 + 牵连的文档关联数」——用户要判断的是牵连面，不是体积。
      const s = db.emptyTagStats();
      return {
        item,
        removable: s.empty,
        removableDocs: s.linked,
        removableText: '',
        removableBytes: 0,
        total: s.empty,
        totalText: ''
      };
    }
    const s = dbImages.imageStatistics();
    return {
      item,
      removable: s.stale,
      removableBytes: s.staleBytes,
      removableText: formatBytes(s.staleBytes),
      total: s.total,
      totalText: formatBytes(s.totalBytes)
    };
  });

  /**
   * 图片清单（Beta.322 · 「图片文件」板块）。
   *
   * 【为什么只读也放这里】它服务于「数据清洗」的判断：看清哪张图没人用，
   *   才敢点清理。与 stats 同域，前端也同在一个卡片里。
   *
   * 【为什么不返回 base64】图片本体几百 KB 一张，整表拉过来会直接撑爆 IPC 载荷。
   *   清单只给元数据 + 引用关系；缩略图按 id 单张取（cleanup:imageData）。
   *
   * @param {{page?:number, size?:number, q?:string, only?:'unused'|'all'}} p
   */
  handle('cleanup:imageList', async p => dbImages.buildImageInventory(p || {}));

  /**
   * 单张图片的 data URI：清单里点一行看原图时按 id 取。
   * 不做批量 —— 一次一张，内存与载荷都可控。
   * @param {{id:number}} p
   * @returns {{id:number, src:string}|null}
   */
  handle('cleanup:imageData', async p => {
    const id = p && p.id;
    const src = dbImages.imageDataUri(id);
    return src ? { id: parseInt(id, 10), src } : null;
  });

  /**
   * 执行清洗。
   * @param {{item?: string}} p
   * @returns {{item:string, removed:number, freedText:string}}
   */
  handle('cleanup:run', async p => {
    const item = (p && p.item) || 'images';
    if (!ITEMS.includes(item)) throw new Error(i18n.errKey('common.errUnknownCleanupItem', { item }));
    assertWritable();
    if (item === 'emptyTags') {
      // Beta.325：空标签是「删不掉的存量脏数据」的根因修复（sameSnapshot 归一化
      // 让 ['']≡[]，用户手动删空 chip 再保存会被判无改动，关联永远留在库里）。
      // 读侧过滤让界面不再显示，这里把库里的根真正删掉。
      const before = db.emptyTagStats();
      const removed = db.purgeEmptyTags();
      db.persistNow();
      safeAudit(currentUser(), '数据清洗', 'cleanup', '', { item, removed, unlinked: before.linked });
      getLog().info(`[操作] 数据清洗 · 空标签 完成：删除 ${removed} 个，解除 ${before.linked} 条文档关联`);
      return { item, removed, removedDocs: before.linked, freedText: '' };
    }
    const before = dbImages.imageStatistics();
    const removed = dbImages.purgeUnusedImages();
    // 落盘：清洗只改内存中的库，不 persist 的话重启后会从磁盘旧镜像读回来
    db.persistNow();
    safeAudit(currentUser(), '数据清洗', 'cleanup', '', {
      item,
      removed,
      freedBytes: before.staleBytes
    });
    getLog().info(`[操作] 数据清洗 · 图片 完成：删除 ${removed} 张，释放 ${formatBytes(before.staleBytes)}`);
    return { item, removed, freedText: formatBytes(before.staleBytes) };
  });
}

module.exports = { registerCleanup, CLEANUP_ITEMS: ITEMS };
