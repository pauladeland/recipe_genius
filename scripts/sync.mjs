#!/usr/bin/env node
// GitHub Action entrypoint. Fetches the public Sheet via Sheets API v4,
// transforms it, matches avoidances, validates, and commits
// data/library.json only if content changed. Zero npm dependencies.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

import { rowsToObjects, transformRecipeRow, transformAvoidanceRow, transformProtocolRow } from '../lib/sheet-rows.js';
import { matchAllAvoidances, parseOverrides, applyOverrides, checkProtocolCompliance } from '../lib/matcher.js';
import { runAllGates, ValidationError } from './validate.mjs';

const SHEET_ID = process.env.PUBLIC_SHEET_ID;
const API_KEY = process.env.SHEETS_API_KEY;
const OUT_PATH = 'data/library.json';

async function fetchTab(tabName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tabName)}?key=${API_KEY}`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Sheets API returned ${res.status} for tab "${tabName}"`);
      const json = await res.json();
      return json.values || [];
    } catch (err) {
      lastError = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  throw lastError;
}

function readPreviousLibrary() {
  return existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf8')) : null;
}

function contentHash(obj) {
  const { meta, ...rest } = obj;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

async function main() {
  if (!SHEET_ID || !API_KEY) {
    throw new Error('PUBLIC_SHEET_ID and SHEETS_API_KEY must be set.');
  }

  const [recipeRows, avoidanceRows, protocolRows] = await Promise.all([
    fetchTab('Recipes'),
    fetchTab('Avoidances'),
    fetchTab('Protocols'),
  ]);

  const allRecipes = rowsToObjects(recipeRows).map(transformRecipeRow);
  const avoidances = rowsToObjects(avoidanceRows).map(transformAvoidanceRow).filter((a) => a.active);
  const protocols = rowsToObjects(protocolRows).map(transformProtocolRow).filter((p) => p.active);
  const avoidanceIds = new Set(avoidances.map((a) => a.id));
  const warnings = [];

  const KNOWN_STATUSES = new Set(['active', 'draft', 'archived']);
  for (const r of allRecipes) {
    const normalized = String(r.status).trim().toLowerCase();
    if (!KNOWN_STATUSES.has(normalized)) {
      warnings.push(`Recipe "${r.id}": unrecognized status "${r.status}" — treated as inactive.`);
    }
  }

  const activeRecipes = allRecipes.filter((r) => String(r.status).trim().toLowerCase() === 'active');

  for (const recipe of activeRecipes) {
    let flags = matchAllAvoidances(recipe.ingredients, avoidances);
    const { overrides, warnings: overrideWarnings } = parseOverrides(recipe.allergenOverride, avoidanceIds);
    warnings.push(...overrideWarnings.map((w) => `${recipe.id}: ${w}`));
    flags = applyOverrides(flags, overrides);
    recipe.flags = flags;

    recipe.protocolCompliance = {};
    for (const protocol of protocols) {
      recipe.protocolCompliance[protocol.id] = checkProtocolCompliance(flags, protocol).compliant;
    }
    delete recipe.allergenOverride; // input-only column, not part of the public shape
  }

  const previous = readPreviousLibrary();
  const allowShrink = String(process.env.ALLOW_SHRINK).toLowerCase() === 'true';
  const previousCount = allowShrink ? null : previous?.recipes?.length ?? null;

  let gateWarnings;
  try {
    ({ warnings: gateWarnings } = runAllGates({ recipes: activeRecipes, avoidances, protocols, previousCount }));
  } catch (err) {
    if (err instanceof ValidationError) {
      console.error('Validation failed — data/library.json was NOT modified:\n' + err.message);
      process.exit(1);
    }
    throw err;
  }

  const library = {
    meta: {
      generatedAt: new Date().toISOString(),
      schemaVersion: 1,
      recipeCount: activeRecipes.length,
      warnings: [...warnings, ...gateWarnings],
    },
    avoidances,
    protocols,
    recipes: activeRecipes,
  };

  if (previous && contentHash(previous) === contentHash(library)) {
    console.log('No content changes — skipping commit.');
    return;
  }

  mkdirSync('data', { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(library, null, 2) + '\n');
  console.log(`Wrote ${OUT_PATH} with ${activeRecipes.length} recipes.`);

  if (process.env.CI) {
    execSync('git config user.name "github-actions[bot]"');
    execSync('git config user.email "github-actions[bot]@users.noreply.github.com"');
    execSync(`git add ${OUT_PATH}`);
    execSync(`git commit -m "sync: ${activeRecipes.length} recipes, ${avoidances.length} avoidances"`);
    execSync('git push');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
