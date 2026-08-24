import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickSurprise } from '../js/ui/surprise.js';

const recipes = [
  { id: 'a', title: 'A', cuisine: 'Italian', prepMinutes: 10, cookMinutes: 10, totalMinutes: 20, ingredients: [], tags: [], flags: [] },
  { id: 'b', title: 'B', cuisine: 'Thai', prepMinutes: 10, cookMinutes: 10, totalMinutes: 20, ingredients: [], tags: [], flags: [] },
  { id: 'c', title: 'C', cuisine: 'Thai', prepMinutes: 10, cookMinutes: 10, totalMinutes: 20, ingredients: [], tags: [], flags: [] },
];

const noFilters = { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity };

test('pickSurprise returns null when no recipes match the current filters', () => {
  const result = pickSurprise(recipes, { ...noFilters, cuisines: ['French'] }, () => 0);
  assert.equal(result, null);
});

test('pickSurprise only picks from recipes that pass the current filters', () => {
  const filterState = { ...noFilters, cuisines: ['Thai'] };
  for (const fakeRandom of [0, 0.5, 0.999]) {
    const result = pickSurprise(recipes, filterState, () => fakeRandom);
    assert.ok(['b', 'c'].includes(result), `expected b or c, got ${result}`);
  }
});

test('pickSurprise uses the injected random function deterministically', () => {
  assert.equal(pickSurprise(recipes, noFilters, () => 0), 'a');
  assert.equal(pickSurprise(recipes, noFilters, () => 0.999), 'c');
});

test('pickSurprise on a single-match filter always returns that one recipe', () => {
  const result = pickSurprise(recipes, { ...noFilters, cuisines: ['Italian'] }, () => 0.7);
  assert.equal(result, 'a');
});

test('pickSurprise clamps an out-of-spec randomFn() === 1 to the last match instead of throwing', () => {
  const result = pickSurprise(recipes, noFilters, () => 1);
  assert.equal(result, 'c');
});
