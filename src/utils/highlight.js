/** HTML 转义 + 关键词高亮（防 XSS：先转义再包裹 <mark>） */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlight(text, kw) {
  const t = esc(text);
  if (!kw) return t;
  return t.replace(new RegExp(escRe(esc(kw)), 'gi'), m => `<mark class="mark">${m}</mark>`);
}

export function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

export function snippet(text, kw, len = 130) {
  const t = String(text || '');
  if (!kw) return t.slice(0, len);
  const i = t.toLowerCase().indexOf(String(kw).toLowerCase());
  if (i < 0) return t.slice(0, len);
  const start = Math.max(0, i - 40);
  return (start > 0 ? '…' : '') + t.slice(start, start + len);
}
