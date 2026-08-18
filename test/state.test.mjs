import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from '../js/state.js';

test('empty hash routes to the list view', () => {
  assert.deepEqual(parseRoute(''), { name: 'list' });
});

test('#/ routes to the list view', () => {
  assert.deepEqual(parseRoute('#/'), { name: 'list' });
});

test('#/r/<id> routes to the recipe view with the id', () => {
  assert.deepEqual(parseRoute('#/r/chimichurri-sauce'), { name: 'recipe', recipeId: 'chimichurri-sauce' });
});

test('#/settings routes to the settings view', () => {
  assert.deepEqual(parseRoute('#/settings'), { name: 'settings' });
});

test('an unrecognized hash falls back to the list view', () => {
  assert.deepEqual(parseRoute('#/nonsense'), { name: 'list' });
});
