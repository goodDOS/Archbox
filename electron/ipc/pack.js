'use strict';
/**
 * 文档包通道：导出为带完整性签名的 ZIP 文档包、打开预览、按策略导入应用。
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const db = require('../db');
const archpack = require('../services/archpack');
const { pickFile, saveFile } = require('../services/dialog');
const { compactDate } = require('../services/timefmt');
const state = require('../state');
const i18n = require('../i18n');
const { handle, currentUser, safeAudit, getLog, S } = require('./shared');

function registerPack() {
  /* ---------- 文档包导入导出（异步，进度推送） ---------- */
  handle('pack:export', async p => {
    const filter = p || {};
    const pass = p.pass ? String(p.pass) : '';
    if (!db.countPosts(filter)) throw new Error(i18n.errKey('common.errNoPostsToExport'));
    const buf = await archpack.buildZipPack(db, filter, pass || undefined);
    const filePath = await saveFile({
      title: i18n.t('menu.packExportTitle'),
      defaultPath: i18n.t('menu.packFileName', { date: compactDate() }) + '.archboxpack',
      filters: [{ name: i18n.t('menu.packFilter'), extensions: ['archboxpack'] }]
    });
    if (!filePath) return null;
    await fsp.writeFile(filePath, buf);
    const { manifest } = archpack.parseZipPackBuffer(buf, pass || undefined); // 解包自检（CRC32+口令解密）并取 manifest 用于摘要
    const summary = archpack.summaryOf(manifest);
    safeAudit(currentUser(), '文档包导出', 'archboxpack', '', {
      count: summary.posts,
      file: path.basename(filePath),
      protected: !!pass
    });
    getLog().info(`[操作] 导出文档包 完成 → ${path.basename(filePath)}（${summary.posts} 篇，口令保护：${!!pass}）`);
    return filePath;
  });

  handle('pack:importOpen', async p => {
    const pass = (p && p.pass) || '';
    const fp = await pickFile({
      title: i18n.t('menu.packImportTitle'),
      filters: [{ name: i18n.t('menu.packImportFilter'), extensions: ['archboxpack', 'json', 'zip'] }]
    });
    if (!fp) return null;
    const buf = await fsp.readFile(fp);
    // 加密包且未提供口令：返回 needPass，让前端弹口令框后带 pass 重试
    if (archpack.packEncrypted(buf) && !pass) {
      return { path: fp, encrypted: true, needPass: true };
    }
    const { data, origin } = await archpack.openPackFile(fp, pass || undefined);
    const summary = archpack.summaryOf(data);
    const preview = (data.data.posts || []).slice(0, 10).map(p => ({
      title: p.title,
      region: p.region,
      category: p.category,
      tags: p.tags || []
    }));
    return { path: fp, summary, preview, totalPosts: summary.posts, origin };
  });
  handle('pack:importApply', async p => {
    const { data, assetBuf } = await archpack.openPackFile(S(p.path), p.pass || undefined);
    const summary = await archpack.applyPackImport(
      {
        data,
        assetBuf,
        strategy: ['merge', 'skip', 'new', 'nodedup'].includes(p.strategy) ? p.strategy : 'skip',
        userId: currentUser()
      },
      ({ pct, msg }) => {
        if (state.win) state.win.webContents.send('task:progress', { name: 'pack-import', pct, msg });
      }
    );
    return summary;
  });
  // 导入预览（只读查重）：用于「询问式」策略在执行前弹确认框
  handle('pack:importPreview', async p => {
    const { data } = await archpack.openPackFile(S(p.path), p.pass || undefined);
    return archpack.previewPackImport({
      data,
      strategy: ['merge', 'skip', 'new', 'nodedup'].includes(p.strategy) ? p.strategy : 'skip'
    });
  });
  // 探测文档包是否口令加密（无需口令，供前端决定是否弹口令框）
  handle('pack:isEncrypted', async p => {
    const buf = await fsp.readFile(S(p.path));
    return archpack.packEncrypted(buf);
  });
}

module.exports = { registerPack };
