// Allergen/avoidance matching engine. Must stay importable unmodified by a
// browser later — no Node-only APIs.

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary, plural-tolerant pattern for a single term. Applied
// IDENTICALLY whether the term comes from terms, hiddenTerms, or
// exceptions — an exceptions entry of "butter bean" must also mask the
// plural "butter beans", or it silently fails on real ingredient text.
//
// The term is run through the same "any non-alphanumeric char is a
// separator" normalization that normalize() applies to the ingredient
// text before matching. Without this, a hyphenated exception like
// "dairy-free butter" builds a pattern requiring a literal hyphen, but
// the text it's matched against has already had that hyphen collapsed
// to a space by normalize() — so the exception can never fire and the
// false positive it exists to prevent slips through.
function termPattern(term) {
  const collapsed = term
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const escaped = escapeRegex(collapsed).replace(/\s+/g, '\\s+');
  return `\\b${escaped}(?:es|s)?\\b`;
}

function buildAlternation(terms) {
  const sorted = [...terms].sort((a, b) => b.length - a.length); // longest-first
  return new RegExp(sorted.map(termPattern).join('|'), 'gi');
}

const SENTINEL = ' ';

function maskExceptions(text, exceptions) {
  if (!exceptions.length) return text;
  return text.replace(buildAlternation(exceptions), (m) => SENTINEL.repeat(m.length));
}

function findMatches(text, terms) {
  if (!terms.length) return [];
  const pattern = buildAlternation(terms);
  const found = new Set();
  let m;
  while ((m = pattern.exec(text)) !== null) {
    found.add(m[0].toLowerCase());
    if (m[0].length === 0) pattern.lastIndex++;
  }
  return [...found];
}

/**
 * @param {string[]} lines - one ingredient per line
 * @param {{id: string, terms: string[], hiddenTerms: string[], exceptions: string[]}} avoidance
 * @returns {Array<{allergenId: string, term: string, level: 'certain'|'possible', line: string, lineIndex: number}>}
 */
export function matchAvoidance(lines, avoidance) {
  const flags = [];
  lines.forEach((rawLine, lineIndex) => {
    const masked = maskExceptions(normalize(rawLine), avoidance.exceptions);
    for (const term of findMatches(masked, avoidance.terms)) {
      flags.push({ allergenId: avoidance.id, term, level: 'certain', line: rawLine, lineIndex });
    }
    for (const term of findMatches(masked, avoidance.hiddenTerms)) {
      flags.push({ allergenId: avoidance.id, term, level: 'possible', line: rawLine, lineIndex });
    }
  });
  return flags;
}

export function matchAllAvoidances(lines, avoidances) {
  return avoidances.flatMap((a) => matchAvoidance(lines, a));
}

/**
 * `allergen_override` mini-DSL. `-id` clears a false positive. `+id:"reason"`
 * forces a missed certain flag. `?id` downgrades certain to possible.
 * Tokens separated by `;`. Unknown/malformed `-` and `?` tokens warn, never
 * throw — that's fail-safe, since the original flag simply stays in place.
 * A malformed or unknown-id `+` token is fail-unsafe instead: it means a
 * human explicitly declared an allergen the matcher missed, and silently
 * dropping it would let that allergen slip into the published data with no
 * signal. So `+` tokens that fail to parse are collected into `errors`
 * rather than `warnings` — this function still never throws itself, it just
 * categorizes the failure so callers can decide to fail the build on it.
 */
export function parseOverrides(overrideString, knownAvoidanceIds) {
  const tokens = (overrideString || '').split(';').map((t) => t.trim()).filter(Boolean);
  const overrides = [];
  const warnings = [];
  const errors = [];

  for (const token of tokens) {
    const clearMatch = token.match(/^-(\w[\w-]*)$/);
    const forceMatch = token.match(/^\+(\w[\w-]*):"(.*)"$/);
    const downgradeMatch = token.match(/^\?(\w[\w-]*)$/);

    if (clearMatch && knownAvoidanceIds.has(clearMatch[1])) {
      overrides.push({ type: 'clear', allergenId: clearMatch[1] });
    } else if (forceMatch && knownAvoidanceIds.has(forceMatch[1])) {
      overrides.push({ type: 'force', allergenId: forceMatch[1], reason: forceMatch[2] });
    } else if (downgradeMatch && knownAvoidanceIds.has(downgradeMatch[1])) {
      overrides.push({ type: 'downgrade', allergenId: downgradeMatch[1] });
    } else if (token.startsWith('+')) {
      errors.push(
        `Malformed or unknown allergen_override force token: "${token}" — this looks like it was meant to force-flag an allergen but could not be parsed. Fix the syntax (+id:"reason") or the id.`
      );
    } else {
      warnings.push(`Unrecognized allergen_override token: "${token}"`);
    }
  }
  return { overrides, warnings, errors };
}

export function applyOverrides(flags, overrides) {
  let result = flags;
  for (const o of overrides) {
    if (o.type === 'clear') {
      result = result.filter((f) => f.allergenId !== o.allergenId);
    } else if (o.type === 'force') {
      result = [...result, { allergenId: o.allergenId, term: o.reason, level: 'certain', line: o.reason, lineIndex: -1 }];
    } else if (o.type === 'downgrade') {
      result = result.map((f) =>
        f.allergenId === o.allergenId && f.level === 'certain' ? { ...f, level: 'possible' } : f
      );
    }
  }
  return result;
}

/**
 * A protocol is satisfied when none of its excludes ids produced a
 * `certain` flag. `possible` flags never disqualify.
 * @returns {{compliant: boolean, violatedBy: string[]}}
 */
export function checkProtocolCompliance(flags, protocol) {
  const certainIds = new Set(flags.filter((f) => f.level === 'certain').map((f) => f.allergenId));
  const violatedBy = protocol.excludes.filter((id) => certainIds.has(id));
  return { compliant: violatedBy.length === 0, violatedBy };
}
