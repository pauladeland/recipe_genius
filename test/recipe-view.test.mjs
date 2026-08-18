import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderRecipe, renderNotFound } from '../js/views/recipe.js';

const avoidances = [{ id: 'milk', label: 'Milk / Dairy', severity: 'allergy' }];

const recipe = {
  id: 'parmesan-crusted-butter-beans',
  title: 'Parmesan-Crusted Butter Beans',
  sourceType: 'book',
  sourceName: null,
  sourceUrl: 'Justine Snacks (cookbook)',
  sourceNote: null,
  prepMinutes: 10,
  cookMinutes: 43,
  totalMinutes: 63,
  servingsCount: 6,
  servings: 'Serves 6',
  ingredients: ['1 (15-oz) can butter beans, drained', '6 oz Parmesan, freshly grated'],
  steps: ['Preheat oven to 400°F.', 'Bake 40–45 min until golden.'],
  flags: [{ allergenId: 'milk', term: 'parmesan', level: 'certain' }],
};

test('renders the title, times, and servings', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  assert.match(out, /Parmesan-Crusted Butter Beans/);
  assert.match(out, /10.*min prep/s);
  assert.match(out, /43.*min cook/s);
  assert.match(out, /63.*min total/s);
  assert.match(out, /Serves 6/);
});

test('renders a danger badge above the title for a certain allergy', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  const badgeIndex = out.indexOf('badge-danger');
  const titleIndex = out.indexOf('detail-title');
  assert.ok(badgeIndex > -1 && badgeIndex < titleIndex, 'badge must render before the title');
  assert.match(out, /Contains milk/);
});

test('renders source attribution quietly, without a source_url the text is plain (not linked)', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  assert.match(out, /Justine Snacks \(cookbook\)/);
  assert.doesNotMatch(out, /<a[^>]*Justine Snacks/);
});

test('links source_url when it looks like a real http(s) url', () => {
  const withUrl = { ...recipe, sourceUrl: 'https://example.com/recipe' };
  const out = renderRecipe(withUrl, avoidances).toString();
  assert.match(out, /<a href="https:\/\/example\.com\/recipe"/);
});

test('never renders a javascript: url as a live link', () => {
  const malicious = { ...recipe, sourceUrl: 'javascript:alert(1)' };
  const out = renderRecipe(malicious, avoidances).toString();
  assert.doesNotMatch(out, /<a href="javascript:/);
});

test('renders every ingredient and step line', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  for (const line of recipe.ingredients) assert.match(out, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const line of recipe.steps) assert.match(out, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('°', '.')));
});

test('renders the persistent disclaimer footer', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  assert.match(out, /Ingredient checks are automatic and can miss things\. Always read labels\./);
});

test('renderNotFound names the missing id and does not throw', () => {
  const out = renderNotFound('made-up-id').toString();
  assert.match(out, /made-up-id/);
});
