export function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function splitList(value, delimiter = '|') {
  if (!value) return [];
  return value.split(delimiter).map((s) => s.trim()).filter(Boolean);
}

export function splitLines(value) {
  if (!value) return [];
  return value.split('\n').map((s) => s.trim()).filter(Boolean);
}

export function parseBoolean(value) {
  return String(value).trim().toUpperCase() === 'TRUE';
}
