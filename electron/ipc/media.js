'use strict';
/**
 * 图片上传通道：选图后以 base64 内联进正文（v3 不再分储文件）。
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { pickFile } = require('../services/dialog');
const i18n = require('../i18n');
const { handle, currentUser, safeAudit } = require('./shared');

function registerMedia() {
  /* ---------- 图片上传（base64 内联进正文） ---------- */
  handle('img:upload', async () => {
    const fp = await pickFile({
      title: i18n.t('menu.insertImage'),
      filters: [{ name: i18n.t('menu.imageFilter'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }]
    });
    if (!fp) return null;
    const ext = (path.extname(fp) || '.png').replace('.', '').toLowerCase();
    if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext))
      throw new Error(i18n.errKey('common.errImgFormat'));
    const buf = await fsp.readFile(fp);
    if (buf.length > 20 * 1024 * 1024) throw new Error(i18n.errKey('common.errImgTooBig'));
    // v3：图片直接 base64 内联进正文，不再分储文件
    const MIME_BY_EXT = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml'
    };
    const mime = MIME_BY_EXT[ext] || `image/${ext}`;
    const url = `data:${mime};base64,${buf.toString('base64')}`;
    safeAudit(currentUser(), '上传图片', 'inline-image', '', { file: path.basename(fp), bytes: buf.length });
    return { id: null, url };
  });
}

module.exports = { registerMedia };
