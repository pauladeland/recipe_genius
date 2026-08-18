import { splitList, splitLines, parseBoolean } from './normalize.js';

/** @param {string[][]} rows - first row is headers, rest are data rows */
export function rowsToObjects(rows) {
  const [header, ...dataRows] = rows;
  return dataRows
    .filter((row) => row.some((cell) => cell && cell.trim() !== ''))
    .map((row) => {
      const obj = {};
      header.forEach((colName, i) => {
        obj[colName.trim()] = (row[i] ?? '').trim();
      });
      return obj;
    });
}

export function transformRecipeRow(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status || 'active',
    cuisine: row.cuisine || null,
    protein: splitList(row.protein, ','),
    tags: splitList(row.tags, ','),
    ingredients: splitLines(row.ingredients),
    steps: splitLines(row.steps),
    prepMinutes: row.prep_minutes ? Number(row.prep_minutes) : null,
    cookMinutes: row.cook_minutes ? Number(row.cook_minutes) : null,
    totalMinutes: row.total_minutes ? Number(row.total_minutes) : null,
    servingsCount: row.servings_count ? Number(row.servings_count) : null,
    servings: row.servings || null,
    sourceType: row.source_type || null,
    sourceName: row.source_name || null,
    sourceUrl: row.source_url || null,
    sourceNote: row.source_note || null,
    image: row.image || null,
    imageAlt: row.image_alt || null,
    allergenOverride: row.allergen_override || null,
  };
}

export function transformAvoidanceRow(row) {
  return {
    id: row.id,
    label: row.label,
    severity: row.severity,
    active: parseBoolean(row.active),
    terms: splitList(row.terms, '|'),
    hiddenTerms: splitList(row.hidden_terms, '|'),
    exceptions: splitList(row.exceptions, '|'),
    substitutions: row.substitutions || null,
    notes: row.notes || null,
  };
}

export function transformProtocolRow(row) {
  return {
    id: row.id,
    label: row.label,
    excludes: splitList(row.excludes, '|'),
    active: parseBoolean(row.active),
    advisory: parseBoolean(row.advisory),
    notes: row.notes || null,
  };
}
