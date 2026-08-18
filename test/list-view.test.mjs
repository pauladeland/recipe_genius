import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderList, applyFilters } from '../js/views/list.js';

const avoidances = [
  { id: 'milk', label: 'Milk / Dairy', severity: 'allergy' },
  { id: 'yeast', label: 'Yeast', severity: 'sensitivity' },
];

const recipes = [
  { id: 'a', title: 'Chimichurri Sauce', cuisine: 'Argentinian', prepMinutes: 15, cookMinutes: 0, totalMinutes: 25, servingsCount: 8, flags: [] },
  { id: 'b', title: 'Cheesy Bake', cuisine: null, prepMinutes: 10, cookMinutes: 43, totalMinutes: 63, servingsCount: 6, flags: [{ allergenId: 'milk', term: 'cheese', level: 'certain' }] },
];

test('applyFilters with no filters returns every recipe', () => {
  assert.equal(applyFilters(recipes, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity }).length, 2);
});

test('applyFilters matches title text case-insensitively', () => {
  const result = applyFilters(recipes, { query: 'chimi', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity });
  assert.deepEqual(result.map((r) => r.id), ['a']);
});

test('applyFilters narrows by cuisine', () => {
  const result = applyFilters(recipes, { query: '', cuisines: ['Argentinian'], allergenIds: [], maxPrep: Infinity, maxCook: Infinity });
  assert.deepEqual(result.map((r) => r.id), ['a']);
});

test('applyFilters by allergenIds is an OR match against certain-or-possible flags, never hides — it is a search narrow, not a safety hide', () => {
  const result = applyFilters(recipes, { query: '', cuisines: [], allergenIds: ['milk'], maxPrep: Infinity, maxCook: Infinity });
  assert.deepEqual(result.map((r) => r.id), ['b']);
});

test('applyFilters narrows by prep and cook ceilings independently', () => {
  const result = applyFilters(recipes, { query: '', cuisines: [], allergenIds: [], maxPrep: 12, maxCook: Infinity });
  assert.deepEqual(result.map((r) => r.id), ['b']);
});

test('renderList shows a result count and one card per matching recipe', () => {
  const out = renderList({ meta: {}, avoidances, protocols: [], recipes }, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity }).toString();
  assert.match(out, /2 recipes/);
  assert.match(out, /Chimichurri Sauce/);
  assert.match(out, /Cheesy Bake/);
});

test('renderList shows a danger badge for a certain allergy flag', () => {
  const out = renderList({ meta: {}, avoidances, protocols: [], recipes }, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity }).toString();
  assert.match(out, /badge-danger/);
  assert.match(out, /Contains milk/);
});

test('renderList shows an empty state and names the query when nothing matches', () => {
  const out = renderList({ meta: {}, avoidances, protocols: [], recipes }, { query: 'nonexistent-xyz', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity }).toString();
  assert.match(out, /class="empty-state"/);
  assert.match(out, /nonexistent-xyz/);
});

test('renderList escapes a recipe title containing markup', () => {
  const malicious = [{ id: 'x', title: '<img src=x onerror=alert(1)>', cuisine: null, prepMinutes: 5, cookMinutes: 5, totalMinutes: 10, servingsCount: 1, flags: [] }];
  const out = renderList({ meta: {}, avoidances, protocols: [], recipes: malicious }, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity }).toString();
  assert.doesNotMatch(out, /<img/);
  assert.match(out, /&lt;img/);
});
