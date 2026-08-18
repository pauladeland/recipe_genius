// The anti-wipe, anti-leak gate. The only code path that writes
// data/library.json is one that has already passed every check here.

export class ValidationError extends Error {}

const ALLOWED_RECIPE_KEYS = new Set([
  'id', 'title', 'status', 'cuisine', 'protein', 'tags', 'ingredients', 'steps',
  'prepMinutes', 'cookMinutes', 'totalMinutes', 'servingsCount', 'servings',
  'sourceType', 'sourceName', 'sourceUrl', 'sourceNote', 'image', 'imageAlt',
  'flags', 'protocolCompliance',
]);

const ALLOWED_AVOIDANCE_KEYS = new Set([
  'id', 'label', 'severity', 'active', 'terms', 'hiddenTerms', 'exceptions',
  'substitutions', 'notes',
]);

const ALLOWED_PROTOCOL_KEYS = new Set([
  'id', 'label', 'excludes', 'active', 'advisory', 'notes',
]);

export function validateRecipes(recipes, previousCount) {
  const errors = [];
  const warnings = [];

  if (recipes.length === 0) {
    errors.push('No active recipes found — refusing to write an empty library.');
  }

  const ids = new Set();
  for (const r of recipes) {
    if (!r.id) errors.push(`Recipe "${r.title || '(untitled)'}" has no id.`);
    if (!r.title) errors.push(`Recipe "${r.id || '(no id)'}" has no title.`);
    if (ids.has(r.id)) errors.push(`Duplicate recipe id: "${r.id}"`);
    ids.add(r.id);

    if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) {
      errors.push(`Recipe "${r.id}" is active but has no ingredient lines — refusing to publish an unscreened recipe.`);
    }

    if (r.totalMinutes != null && r.prepMinutes != null && r.cookMinutes != null) {
      if (r.totalMinutes < r.prepMinutes + r.cookMinutes) {
        warnings.push(`Recipe "${r.id}": total_minutes (${r.totalMinutes}) is less than prep+cook (${r.prepMinutes + r.cookMinutes}).`);
      }
    }
  }

  if (previousCount != null && previousCount > 0) {
    const floor = previousCount * 0.6;
    if (recipes.length < floor) {
      errors.push(
        `Sanity floor tripped: ${recipes.length} recipes is below 60% of the previous ${previousCount}. ` +
        `Pass ALLOW_SHRINK=true to override for a deliberate purge.`
      );
    }
  }

  return { errors, warnings };
}

export function validateAvoidances(avoidances) {
  const errors = avoidances.length === 0 ? ['No active avoidance rows found.'] : [];
  return { errors, warnings: [] };
}

export function validateProtocolReferences(protocols, avoidanceIds) {
  const errors = [];
  for (const p of protocols) {
    for (const excludeId of p.excludes) {
      if (!avoidanceIds.has(excludeId)) {
        errors.push(`Protocol "${p.id}" excludes unknown avoidance id "${excludeId}".`);
      }
    }
  }
  return { errors, warnings: [] };
}

export function validateNoPrivateLeak(recipe) {
  const errors = [];
  for (const key of Object.keys(recipe)) {
    if (!ALLOWED_RECIPE_KEYS.has(key)) {
      errors.push(`Recipe "${recipe.id}" has an unrecognized field "${key}" not in the public allowlist.`);
    }
  }
  return errors;
}

export function validateNoPrivateLeakAvoidance(avoidance) {
  const errors = [];
  for (const key of Object.keys(avoidance)) {
    if (!ALLOWED_AVOIDANCE_KEYS.has(key)) {
      errors.push(`Avoidance "${avoidance.id}" has an unrecognized field "${key}" not in the public allowlist.`);
    }
  }
  return errors;
}

export function validateNoPrivateLeakProtocol(protocol) {
  const errors = [];
  for (const key of Object.keys(protocol)) {
    if (!ALLOWED_PROTOCOL_KEYS.has(key)) {
      errors.push(`Protocol "${protocol.id}" has an unrecognized field "${key}" not in the public allowlist.`);
    }
  }
  return errors;
}

export function runAllGates({ recipes, avoidances, protocols, previousCount }) {
  const avoidanceIds = new Set(avoidances.map((a) => a.id));
  const allErrors = [];
  const allWarnings = [];

  const r = validateRecipes(recipes, previousCount);
  allErrors.push(...r.errors);
  allWarnings.push(...r.warnings);

  allErrors.push(...validateAvoidances(avoidances).errors);
  allErrors.push(...validateProtocolReferences(protocols, avoidanceIds).errors);

  for (const recipe of recipes) {
    allErrors.push(...validateNoPrivateLeak(recipe));
  }

  for (const avoidance of avoidances) {
    allErrors.push(...validateNoPrivateLeakAvoidance(avoidance));
  }

  for (const protocol of protocols) {
    allErrors.push(...validateNoPrivateLeakProtocol(protocol));
  }

  if (allErrors.length > 0) {
    throw new ValidationError(allErrors.join('\n'));
  }
  return { warnings: allWarnings };
}
