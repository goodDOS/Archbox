'use strict';
const i18n = require('../i18n');
/**
 * 纯文本/版式导出：Markdown（.md）与 PDF（.pdf）
 * - Markdown：纯字符串拼接，零依赖，利于二次编辑与版本管理
 * - PDF：借助 Electron 渲染进程 Chromium 的 printToPDF，中文与图片由浏览器内核处理，零额外依赖
 * 正文 contentHtml 中的图片已是 base64 内联（data: URI），PDF 由浏览器内核直接渲染，其余 HTML 标签转为可读文本
 */
const { stamp, withTz } = require('./timefmt');
const { APP_NAME } = require('./appinfo');

/** 正文图片已是 base64 内联（data: URI），浏览器内核打印 PDF 时直接渲染，无需再处理 */
function embedImages(html) {
  return html || '';
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- 把正文 HTML 转为 Markdown 片段 ---------- */
function htmlToMarkdown(html) {
  if (!html) return '';
  let s = html;
  // 代码块
  s = s.replace(
    /<pre[^>]*>([\s\S]*?)<\/pre>/gi,
    (m, c) =>
      '\n```\n' +
      stripTags(c)
        .replace(/&nbsp;/g, ' ')
        .trim() +
      '\n```\n'
  );
  // 标题
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  s = s.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  // 引用
  s = s.replace(
    /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (m, c) => '\n> ' + stripTags(c).trim().replace(/\n/g, '\n> ') + '\n'
  );
  // 图片（已是 data: 内联，原样保留；外部 src 原样保留）
  s = s.replace(/<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi, (m, src) => {
    const altM = m.match(/alt=["']([^"']*)["']/i);
    return `\n![${altM ? altM[1] : ''}](${src})\n`;
  });
  // 链接
  s = s.replace(/<a[^>]*\shref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  // 粗体/斜体
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
  // 行内代码（与 strong/em 同级；Markdown 用反引号，不加则导出后只剩裸文本）
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  // 列表
  // ★ Tiptap（Beta.315 起）规范化为 <li><p>文本</p></li>，li 内容里带 <p> 标签。
  //   若原样把 <p> 带进结果，后面的 <p> → \n\n 规则会插在「- 」与文本之间，
  //   把列表项劈成「空列表项 + 独立段落」，列表结构整体报废。
  //   故先剥掉 li 内的段落标签再拼项；行内格式已由上方规则转成 MD 语法。
  //   （旧写法 stripInline(stripTags('$1')) 里 '$1' 先被函数吃掉，stripTags 实际没起作用。）
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (m, c) => '\n- ' + stripInline(c.replace(/<\/?p[^>]*>/gi, '')));
  s = s.replace(/<[uo]l[^>]*>/gi, '').replace(/<\/[uo]l]?>/gi, '');
  // 段落与换行
  s = s.replace(/<p[^>]*>/gi, '\n\n').replace(/<\/p>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<hr[^>]*>/gi, '\n\n---\n\n');
  // 表格（简单转 Markdown 表格）
  s = s.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (m, tb) => tableToMd(tb));
  // 剩余标签去除
  s = stripTags(s);
  // 解码常见实体 + 清理空白
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  s = s
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
}
function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '');
}
function stripInline(s) {
  return s.trim();
}
function tableToMd(tb) {
  const rows = [...tb.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (!rows.length) return '';
  const cellsOf = r =>
    [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => stripTags(m[1]).replace(/\n/g, ' ').trim());
  const out = [];
  rows.forEach((r, i) => {
    const cells = cellsOf(r);
    out.push('| ' + cells.join(' | ') + ' |');
    if (i === 0) out.push('| ' + cells.map(() => '---').join(' | ') + ' |');
  });
  return '\n' + out.join('\n') + '\n';
}

function fieldRowsMd(p, defs) {
  const lines = [];
  for (const fd of defs || []) {
    const val = (p.fields && p.fields[fd.code]) || '';
    if (!val) continue;
    lines.push(`- **${fd.name}**（\`${fd.code}\`）：${val}`);
  }
  return lines.join('\n');
}

/** 生成 Markdown 文档（纯文本） */
function buildMd(posts, defs, options = {}) {
  const title = options.title || i18n.t('sys.exportTitle');
  const exportedAt = stamp();

  const blocks = posts
    .map((p, i) => {
      const tags = (p.tnames || '').split('；').filter(Boolean);
      const tagLine = tags.length ? `\n- ${i18n.t('sys.tagsLabel')}: ${tags.map(t => '#' + t).join(' ')}` : '';
      const fields = fieldRowsMd(p, defs);
      const fieldBlock = fields ? `\n\n**${i18n.t('sys.fieldsBlock')}**\n\n` + fields : '';
      const content = htmlToMarkdown(p.content_html || '');
      const contentBlock = content ? '\n\n' + content : '';
      return `## ${i + 1}. ${p.title}

- ${i18n.t('sys.metaStatus')}: ${p.status === 'draft' ? i18n.t('sys.statusDraft') : i18n.t('sys.statusPublished')}
- ${i18n.t('sys.metaRegion')}: ${p.rname || ''}
- ${i18n.t('sys.metaCategory')}: ${p.cname || i18n.t('sys.uncategorized')}${tagLine}
- ${i18n.t('sys.metaCreated')}: ${withTz(p.created_at)}${p.updated_at ? '　' + i18n.t('sys.metaUpdated') + ': ' + withTz(p.updated_at) : ''}${p.author_name ? '　' + i18n.t('sys.metaAuthor') + ': ' + p.author_name : ''}${fieldBlock}${contentBlock}`;
    })
    .join('\n\n---\n\n');

  return `# ${title}

> ${i18n.t('sys.exportFooter', { time: exportedAt, n: posts.length, app: APP_NAME })}

${blocks}
`;
}

/** 生成用于打印为 PDF 的自包含 HTML（含内嵌图片） */
function buildPdfHtml(posts, defs, options = {}) {
  const title = options.title || i18n.t('sys.exportTitle');
  const exportedAt = stamp();

  const cards = posts
    .map((p, i) => {
      const fieldRows = (defs || [])
        .map(fd => {
          const val = (p.fields && p.fields[fd.code]) || '';
          if (!val) return '';
          return `<tr><td class="fk">${escHtml(fd.name)}<code class="fc">${escHtml(fd.code)}</code></td><td>${escHtml(val)}</td></tr>`;
        })
        .filter(Boolean)
        .join('');
      const tags = (p.tnames || '')
        .split('；')
        .filter(Boolean)
        .map(t => `<span class="tag">#${escHtml(t)}</span>`)
        .join('');
      const content = embedImages(p.content_html || '');
      return `
    <article class="card">
      <header>
        <span class="idx">${i + 1}</span>
        <h2>${escHtml(p.title)}</h2>
        <span class="status ${p.status === 'draft' ? 'draft' : 'pub'}">${p.status === 'draft' ? i18n.t('sys.statusDraft') : i18n.t('sys.statusPublished')}</span>
      </header>
      <div class="meta">
        <span class="chip">${escHtml(p.rname)}</span>
        <span class="chip">${escHtml(p.cname || i18n.t('sys.uncategorized'))}</span>
        ${tags}
      </div>
      ${fieldRows ? `<table class="ftbl"><tbody>${fieldRows}</tbody></table>` : ''}
      <div class="body">${content}</div>
      <footer><span>${i18n.t('sys.metaCreated')}: ${escHtml(withTz(p.created_at))}</span><span>${i18n.t('sys.metaUpdated')}: ${escHtml(withTz(p.updated_at))}</span>${p.author_name ? `<span>${i18n.t('sys.metaAuthor')}: ${escHtml(p.author_name)}</span>` : ''}</footer>
    </article>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escHtml(title)} - ${exportedAt}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #f4f5f7; color: #1a1a1a; line-height: 1.6; padding: 24px; }
  .doc-head { max-width: 900px; margin: 0 auto 24px; }
  .doc-head h1 { font-size: 22px; }
  .doc-head .info { color: #888; font-size: 13px; margin-top: 4px; }
  .container { max-width: 900px; margin: 0 auto; }
  .card { background: #fff; border: 1px solid #e4e7ec; border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
  .card header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .card .idx { width: 26px; height: 26px; border-radius: 50%; background: #3b6df0; color: #fff; display: grid; place-items: center; font-size: 13px; font-weight: 600; flex: none; }
  .card h2 { font-size: 16px; flex: 1; }
  .status { font-size: 11px; padding: 2px 8px; border-radius: 999px; }
  .status.pub { background: #d3f9d8; color: #2da44e; }
  .status.draft { background: #fff3cd; color: #997404; }
  .meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .chip, .tag { font-size: 12px; padding: 2px 9px; border-radius: 999px; background: #eef1f6; color: #555; }
  .tag { background: #e8f0ff; color: #3b6df0; }
  .ftbl { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; }
  .ftbl td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; }
  .ftbl .fk { width: 200px; color: #888; }
  .fc { background: #f0f2f5; padding: 0 5px; border-radius: 4px; font-size: 11px; margin-left: 4px; }
  .body { line-height: 1.85; color: #222; user-select: text; }
  .body p { margin: 8px 0; }
  .body h2, .body h3, .body h4 { margin: 14px 0 6px; }
  .body img { max-width: 100%; border-radius: 8px; border: 1px solid #e4e7ec; margin: 8px 0; }
  .body blockquote { border-left: 3px solid #3b6df0; padding: 4px 14px; color: #666; margin: 10px 0; background: #f8f9fb; border-radius: 0 8px 8px 0; }
  .body ul, .body ol { padding-left: 24px; margin: 6px 0; }
  .body hr { border: none; border-top: 1px dashed #ccc; margin: 12px 0; }
  .body a { color: #3b6df0; }
  .body table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  .body th, .body td { border: 1px solid #ddd; padding: 6px 10px; }
  .card footer { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #eee; font-size: 12px; color: #aaa; display: flex; gap: 16px; }
  @media print { body { background: #fff; padding: 12px; } .card { box-shadow: none; page-break-inside: avoid; } }
</style>
</head>
<body>
<div class="doc-head">
  <h1>${escHtml(title)}</h1>
  <div class="info">${i18n.t('sys.exportFooter', { time: exportedAt, n: posts.length, app: APP_NAME })}</div>
</div>
<div class="container">
${cards}
</div>
</body>
</html>`;
}

module.exports = { buildMd, buildPdfHtml, embedImages };
