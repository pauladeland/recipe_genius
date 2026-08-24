import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderList, renderResultsBody, applyFilters } from '../js/views/list.js';

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

test('applyFilters matches a query against ingredient text, not just the title', () => {
  const withIngredients = [
    { ...recipes[0], ingredients: ['1 shallot', '2 cloves garlic'] },
    { ...recipes[1], ingredients: ['1 cup flour', '2 eggs'] },
  ];
  const result = applyFilters(withIngredients, { query: 'garlic', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity });
  assert.deepEqual(result.map((r) => r.id), ['a']);
});

test('applyFilters narrows by total-time ceiling independently of prep/cook', () => {
  const result = applyFilters(recipes, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity, maxTotal: 30 });
  assert.deepEqual(result.map((r) => r.id), ['a']);
});

test('applyFilters narrows by tags — an OR match, like allergenIds', () => {
  const tagged = [
    { ...recipes[0], tags: ['sauce', 'quick'] },
    { ...recipes[1], tags: ['bake'] },
  ];
  const result = applyFilters(tagged, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity, tags: ['quick'] });
  assert.deepEqual(result.map((r) => r.id), ['a']);
});

test('applyFilters onePanOnly keeps only recipes tagged one-pan', () => {
  const tagged = [
    { ...recipes[0], tags: ['one-pan'] },
    { ...recipes[1], tags: ['bake'] },
  ];
  const result = applyFilters(tagged, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity, onePanOnly: true });
  assert.deepEqual(result.map((r) => r.id), ['a']);
});

test('applyFilters maxIngredients keeps only recipes at or under the ingredient count', () => {
  const withIngredients = [
    { ...recipes[0], ingredients: ['a', 'b', 'c'] },
    { ...recipes[1], ingredients: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
  ];
  const result = applyFilters(withIngredients, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity, maxIngredients: 7 });
  assert.deepEqual(result.map((r) => r.id), ['a']);
});

test('applyFilters treats an empty tags array and default onePanOnly/maxIngredients as no restriction', () => {
  assert.equal(applyFilters(recipes, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity }).length, 2);
});

test('applyFilters composes onePanOnly and maxIngredients as AND, not OR', () => {
  const withBoth = [
    { ...recipes[0], tags: ['one-pan'], ingredients: ['a', 'b'] },       // passes both
    { ...recipes[1], tags: ['one-pan'], ingredients: Array(8).fill('x') }, // one-pan but too many ingredients
  ];
  const result = applyFilters(withBoth, {
    query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity,
    onePanOnly: true, maxIngredients: 7,
  });
  assert.deepEqual(result.map((r) => r.id), ['a']);
});

test('renderFilterBar never lists one-pan as a Tags checkbox — it is the quick-filter chip\'s alone to control', () => {
  const tagged = [{ ...recipes[0], tags: ['one-pan', 'sauce'] }];
  const out = renderList({ meta: {}, avoidances, protocols: [], recipes: tagged }, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity }).toString();
  assert.doesNotMatch(out, /name="tag" value="one-pan"/);
  assert.match(out, /name="tag" value="sauce"/);
});

test('renderFilterBar renders a tag checkbox for every distinct tag across recipes', () => {
  const tagged = [{ ...recipes[0], tags: ['quick', 'sauce'] }, { ...recipes[1], tags: ['bake'] }];
  const out = renderList({ meta: {}, avoidances, protocols: [], recipes: tagged }, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity }).toString();
  assert.match(out, /name="tag" value="quick"/);
  assert.match(out, /name="tag" value="sauce"/);
  assert.match(out, /name="tag" value="bake"/);
});

test('renderFilterBar renders a total-time slider alongside prep and cook', () => {
  const out = renderList({ meta: {}, avoidances, protocols: [], recipes }, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity }).toString();
  assert.match(out, /id="total-slider"/);
  assert.match(out, /TOTAL ≤/);
});

test('renderFilterBar renders one-pan and max-7-ingredients quick chips, aria-pressed reflecting current state', () => {
  const out = renderList({ meta: {}, avoidances, protocols: [], recipes }, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity, onePanOnly: true }).toString();
  assert.match(out, /data-chip="one-pan"[^>]*aria-pressed="true"/);
  assert.match(out, /data-chip="max-7-ingredients"[^>]*aria-pressed="false"/);
});

test('renderFilterBar renders a Surprise Us button', () => {
  const out = renderList({ meta: {}, avoidances, protocols: [], recipes }, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity }).toString();
  assert.match(out, /id="surprise-btn"/);
  assert.match(out, />Surprise us</);
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

test('renderList exposes an h1 heading so route-change focus management can find it', () => {
  const out = renderList({ meta: {}, avoidances, protocols: [], recipes }, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity }).toString();
  assert.match(out, /<h1[^>]*tabindex="-1"[^>]*>Browse recipes<\/h1>/);
});

test('renderResultsBody returns just the count and cards, with no filter bar or h1 — for in-place updates that must not touch the filter controls', () => {
  const out = renderResultsBody({ meta: {}, avoidances, protocols: [], recipes }, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity }).toString();
  assert.match(out, /2 recipes/);
  assert.doesNotMatch(out, /search-input/);
  assert.doesNotMatch(out, /<h1/);
});

test('a badgeAvoidances subset scopes which badges render, independent of the full avoidance list', () => {
  const milkOnly = [avoidances[0]];
  const out = renderList({ meta: {}, avoidances, protocols: [], recipes }, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity }, milkOnly).toString();
  assert.match(out, /Contains milk/);
});

test('badgeAvoidances defaults to the full avoidance list when omitted', () => {
  const withYeastFlag = [{ ...recipes[1], flags: [...recipes[1].flags, { allergenId: 'yeast', term: 'vinegar', level: 'possible' }] }];
  const out = renderList({ meta: {}, avoidances, protocols: [], recipes: withYeastFlag }, { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity }).toString();
  assert.match(out, /Contains milk/);
  assert.match(out, /May contain yeast/);
});
