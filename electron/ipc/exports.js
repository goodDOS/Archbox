'use strict';
/**
 * 文本/版式导出通道：Markdown（.md）与 PDF（.pdf）。
 * 取导出所需的完整文档（含正文 HTML 与作者名）。
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { BrowserWindow } = require('electron');
const db = require('../db');
const exportText = require('../services/export-text');
const { saveFile } = require('../services/dialog');
const { compactDate } = require('../services/timefmt');
const state = require('../state');
const i18n = require('../i18n');
const { S, I, handle, currentUser, safeAudit, getLog } = require('./shared');

// 取导出所需的完整文档（含正文 HTML 与作者名）
async function loadExportPosts(p) {
  const rows = db.postsWithFields({
    regionId: p.regionId,
    q: S(p.q),
    dateFrom: S(p.dateFrom),
    dateTo: S(p.dateTo),
    fieldCode: S(p.fieldCode),
    fieldValue: S(p.fieldValue)
  });
  if (!rows.length) throw new Error(i18n.errKey('common.errNoPostsToExport'));
  return rows.map(r => {
    const full = db.getPost(r.id);
    return { ...r, content_html: full ? full.content_html : '', author_name: full ? full.author_name : '' };
  });
}

/**
 * 单篇导出的默认文件名：`文档标题_日期.ext`。
 *
 * 需求：单篇导出是拿去【分享】的，文件名带标题才能让对方一眼认出是哪份文档
 * （批量导出的「文档导出_日期」在分享场景下毫无信息量）。
 *
 * 必须清洗：Windows 文件名非法字符 `/ \ : * ? " < > |` 会让写盘直接失败，
 * 而标题是用户可控的（未过滤就等于让一个特殊字符把导出功能弄坏）。
 * 同时截断长度：标题上限 200 字，直接当文件名会把路径撑爆。
 */
function exportFileName(title, ext) {
  const base =
    String(title || '')
      .replace(/[/\\:*?"<>|]/g, '_') // Windows 非法字符 → 下划线
      .replace(/\s+/g, ' ') // 折叠空白，避免多个空格撑长度
      .trim()
      .slice(0, 60) || i18n.t('sys.docFallbackName'); // 兜底：全是非法字符/空标题时也要有名字
  return `${base}_${compactDate()}.${ext}`;
}

/** 单篇导出：取一条文档，形状正好是 buildMd / buildPdfHtml 需要的（无需另造查询） */
function loadOnePost(id) {
  const post = db.getPost(I(id));
  if (!post) throw new Error(i18n.errKey('common.errPostMissing'));
  return post;
}

/**
 * 局域共享文档的导出（Beta.243）。
 *
 * 【为什么不能走 db.getPost(id)】
 * 共享文档的正文只存在于**对方机器**的共享库里，本机库没有这条记录 ——
 * 这是共享的整个前提（本机只读、不落库）。所以数据只能来自渲染进程：
 * 页面为了显示详情已经把内容取回来了，直接把这份载荷交给主进程生成文档即可，
 * 不必为了导出再向对方请求一次。
 *
 * 【安全】载荷里的 HTML 来自网络对端，buildPdfHtml 会把它内联进页面。
 * 主进程侧必须再过一遍清洗 —— 渲染进程那份校验管不到这里，
 * 而隐藏窗口里 loadURL(file://) 是可以直接执行脚本的。
 * 复用 db.cleanHtml（= core.cleanHtml 的同一份白名单，core.js:45），
 * 不另写一套 allowedTags：两份白名单必然漂移，届时这里就会变成绕过口。
 */
function sanitizeSharedHtml(html) {
  return db.cleanHtml(html);
}

/**
 * 把渲染进程传来的共享文档载荷规整成 buildMd / buildPdfHtml 需要的形状。
 *
 * 载荷来自网络对端，**每个字段都要自己收敛**，不能信任前端已经过滤过：
 *  - 正文过 cleanHtml（见上）
 *  - 标题/编号等进文件名的字段要限长，避免超长或带控制字符
 *  - tags/fields 未必存在，统一补成数组/对象
 */
function normalizeSharedPost(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const title =
    String(p.title || i18n.t('sys.sharedDocTitle'))
      .trim()
      .slice(0, 200) || i18n.t('sys.sharedDocTitle');
  return {
    title,
    no: String(p.no || '')
      .trim()
      .slice(0, 100),
    status: p.status === 'draft' ? 'draft' : 'published',
    rname: String(p.rname || '').slice(0, 100),
    cname: String(p.cname || i18n.t('sys.uncategorized')).slice(0, 100),
    author_name: String(p.author_name || '').slice(0, 100),
    created_at: p.created_at || '',
    updated_at: p.updated_at || '',
    content_html: sanitizeSharedHtml(p.content_html),
    // 共享详情里 tags 是 [{id,name}]、fields 是 [{code,name,type,value}]。
    // ★ 两者都要转成 buildMd/buildPdfHtml 实际读取的形状，转错会「静默丢内容」：
    //   - tags 读 p.tnames（'；' 串接的字符串），不是数组；
    //   - fields 读 p.fields[code]（**以 code 为键的对象**），不是数组 ——
    //     传数组进去 fieldRowsMd 一行都取不到，导出文档会少了全部字段却不报错。
    tnames: (Array.isArray(p.tags) ? p.tags : [])
      .map(t => String((t && t.name) || t || '').trim())
      .filter(Boolean)
      .join('；'),
    fields: (Array.isArray(p.fields) ? p.fields : []).reduce((acc, f) => {
      const code = String((f && f.code) || '').trim();
      if (code) acc[code] = String((f && f.value) || '').slice(0, 5000);
      return acc;
    }, {})
  };
}

/**
 * 把自包含 HTML 打印成 PDF 并写入 filePath（单篇 / 共享两处共用）。
 *
 * 临时目录必须**建子目录且文件固定叫 index.html**：主进程的 CSP 白名单
 * 只把 file://.../index.html 认作「应用页面」并下发 img-src data: 的宽松策略；
 * 若把 archpdf_xxx.html 平铺在 /tmp，会被判为外来页面拿到最严 CSP，
 * 导致正文中的 data URI 内联图片被拦截、导出 PDF 出现裂图。
 */
async function printHtmlToPdf(html, filePath) {
  const tmpDir = path.join(os.tmpdir(), 'archpdf_' + Date.now());
  const tmpHtml = path.join(tmpDir, 'index.html');
  const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(tmpHtml, html, 'utf8');
    await w.loadURL('file://' + tmpHtml);
    const buf = await w.webContents.printToPDF({
      printBackground: true,
      landscape: false,
      pageSize: 'A4'
      // 不显式传 margins：交由 Chromium 使用默认（合法）打印边距，
      // 避免 Electron 30 对边距的严格校验（≥约 11mm 即抛 "margins must be less than or equal to pageSize"）
    });
    await fsp.writeFile(filePath, buf);
  } finally {
    try {
      w.destroy();
    } catch (e) {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

function registerExports() {
  handle('md:export', async p => {
    const posts = await loadExportPosts(p);
    const md = exportText.buildMd(posts, db.listFieldDefs(), { title: p.title || i18n.t('menu.exportDefaultTitle') });
    const filePath = await saveFile({
      title: i18n.t('menu.exportMdTitle'),
      defaultPath: i18n.t('menu.exportFileName', { date: compactDate() }) + '.md',
      filters: [{ name: i18n.t('menu.mdFilter'), extensions: ['md'] }]
    });
    if (!filePath) return null;
    await fsp.writeFile(filePath, md, 'utf8');
    safeAudit(currentUser(), 'Markdown 导出', 'md', '', { count: posts.length, file: path.basename(filePath) });
    getLog().info(`[操作] 导出 Markdown 完成 → ${path.basename(filePath)}（${posts.length} 篇）`);
    return filePath;
  });

  handle('pdf:export', async p => {
    if (!state.win) throw new Error(i18n.errKey('common.errWindowNotReady'));
    const posts = await loadExportPosts(p);
    const html = exportText.buildPdfHtml(posts, db.listFieldDefs(), {
      title: p.title || i18n.t('menu.exportDefaultTitle')
    });
    const filePath = await saveFile({
      title: i18n.t('menu.exportPdfTitle'),
      defaultPath: i18n.t('menu.exportFileName', { date: compactDate() }) + '.pdf',
      filters: [{ name: i18n.t('menu.pdfFilter'), extensions: ['pdf'] }]
    });
    if (!filePath) return null;
    // 打印细节（临时目录 / index.html 命名 / 不传 margins）全部收敛在 printHtmlToPdf，
    // 与单篇、共享两条路径共用同一份实现 —— 那几行里有 CSP 白名单的坑，不能各写一遍。
    await printHtmlToPdf(html, filePath);
    safeAudit(currentUser(), 'PDF 导出', 'pdf', '', { count: posts.length, file: path.basename(filePath) });
    getLog().info(`[操作] 导出 PDF 完成 → ${path.basename(filePath)}（${posts.length} 篇）`);
    return filePath;
  });

  /* ===== 单篇文档导出（分享用，Beta.242）=====
     与上面的批量导出同构，差别只在「取数据」这一步：
     批量走 loadExportPosts（按筛选条件），单篇直接 db.getPost(id)。
     为什么不复用批量通道硬塞 id：buildWhere 表达的是「一组筛选条件」，
     往里塞单篇 id 会让语义变混，且改的是批量查询的底层、影响面更大。 */
  handle('post:exportMd', async p => {
    const post = loadOnePost(p.id);
    const md = exportText.buildMd([post], db.listFieldDefs(), { title: post.title });
    const filePath = await saveFile({
      title: i18n.t('menu.exportMdTitle'),
      defaultPath: exportFileName(post.title, 'md'),
      filters: [{ name: i18n.t('menu.mdFilter'), extensions: ['md'] }]
    });
    if (!filePath) return null;
    await fsp.writeFile(filePath, md, 'utf8');
    safeAudit(currentUser(), '单篇 Markdown 导出', 'md', String(post.id), { file: path.basename(filePath) });
    getLog().info(`[操作] 导出单篇 Markdown 完成 → ${path.basename(filePath)}（${post.title}）`);
    return filePath;
  });

  handle('post:exportPdf', async p => {
    if (!state.win) throw new Error(i18n.errKey('common.errWindowNotReady'));
    const post = loadOnePost(p.id);
    const html = exportText.buildPdfHtml([post], db.listFieldDefs(), { title: post.title });
    const filePath = await saveFile({
      title: i18n.t('menu.exportPdfTitle'),
      defaultPath: exportFileName(post.title, 'pdf'),
      filters: [{ name: i18n.t('menu.pdfFilter'), extensions: ['pdf'] }]
    });
    if (!filePath) return null;
    await printHtmlToPdf(html, filePath);
    safeAudit(currentUser(), '单篇 PDF 导出', 'pdf', String(post.id), { file: path.basename(filePath) });
    getLog().info(`[操作] 导出单篇 PDF 完成 → ${path.basename(filePath)}（${post.title}）`);
    return filePath;
  });

  /* ===== 局域共享文档的导出（Beta.243）=====
     数据来自渲染进程（共享文档只存在于对方机器，本机库里没有这条记录）。 */
  handle('share:exportDoc', async p => {
    const post = normalizeSharedPost(p.post);
    const kind = p.kind === 'pdf' ? 'pdf' : 'md';
    if (kind === 'pdf' && !state.win) throw new Error(i18n.errKey('common.errWindowNotReady'));
    // 字段定义走本机的：共享方与本机的字段表可能不同构，按本机 defs 渲染更稳
    const defs = db.listFieldDefs();
    const body =
      kind === 'md'
        ? exportText.buildMd([post], defs, { title: post.title })
        : exportText.buildPdfHtml([post], defs, { title: post.title });
    const filePath = await saveFile({
      title: kind === 'md' ? i18n.t('menu.exportMdTitle') : i18n.t('menu.exportPdfTitle'),
      defaultPath: exportFileName(post.title, kind),
      filters: [{ name: kind === 'md' ? i18n.t('menu.mdFilter') : i18n.t('menu.pdfFilter'), extensions: [kind] }]
    });
    if (!filePath) return null;
    if (kind === 'md') await fsp.writeFile(filePath, body, 'utf8');
    else await printHtmlToPdf(body, filePath);
    safeAudit(currentUser(), '共享文档导出', kind, '', { title: post.title, from: '局域共享' });
    getLog().info(`[操作] 导出共享文档 ${kind.toUpperCase()} 完成 → ${path.basename(filePath)}（${post.title}）`);
    return filePath;
  });
}

module.exports = { registerExports };
