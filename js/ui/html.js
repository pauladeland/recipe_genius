// Auto-escaping tagged template. Every view module builds markup through
// this — it is the only thing standing between Sheet-entered recipe text
// (untrusted once a second person can edit the Sheet) and innerHTML.

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

function isHtmlResult(value) {
  return value != null && typeof value === 'object' && '__html' in value;
}

function toSafeString(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(toSafeString).join('');
  if (isHtmlResult(value)) return value.__html;
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += toSafeString(values[i]) + strings[i + 1];
  }
  return { __html: out, toString: () => out };
}

/** Escape hatch for genuinely trusted, pre-built HTML. Use sparingly. */
export function raw(str) {
  return { __html: str, toString: () => str };
}
