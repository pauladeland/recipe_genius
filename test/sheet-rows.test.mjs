import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsToObjects, transformRecipeRow, transformAvoidanceRow, transformProtocolRow } from '../lib/sheet-rows.js';

test('rowsToObjects maps by header name, not position', () => {
  const rows = [
    ['title', 'id'],
    ['Chimichurri', 'chimichurri-sauce'],
  ];
  const [obj] = rowsToObjects(rows);
  assert.equal(obj.title, 'Chimichurri');
  assert.equal(obj.id, 'chimichurri-sauce');
});

test('rowsToObjects skips fully blank rows', () => {
  const rows = [
    ['id', 'title'],
    ['a', 'A'],
    ['', ''],
    ['b', 'B'],
  ];
  assert.equal(rowsToObjects(rows).length, 2);
});

test('transformRecipeRow splits comma tags and newline ingredient lines', () => {
  const row = {
    id: 'x', title: 'X', status: 'active', cuisine: 'Thai', protein: 'chicken,peanut',
    tags: 'one-pan, quick', ingredients: '1 cup rice\n2 tbsp oil', steps: 'Cook rice.\nAdd oil.',
    prep_minutes: '10', cook_minutes: '20', total_minutes: '30', servings_count: '4', servings: 'Serves 4',
  };
  const recipe = transformRecipeRow(row);
  assert.deepEqual(recipe.tags, ['one-pan', 'quick']);
  assert.deepEqual(recipe.ingredients, ['1 cup rice', '2 tbsp oil']);
  assert.equal(recipe.prepMinutes, 10);
});

test('transformRecipeRow defaults status to active when blank', () => {
  const recipe = transformRecipeRow({ id: 'x', title: 'X', status: '' });
  assert.equal(recipe.status, 'active');
});

test('transformAvoidanceRow splits pipe-delimited terms and parses active boolean', () => {
  const row = { id: 'milk', label: 'Milk', severity: 'allergy', active: 'TRUE', terms: 'milk|butter|cheese', hidden_terms: '', exceptions: 'peanut butter' };
  const avoidance = transformAvoidanceRow(row);
  assert.deepEqual(avoidance.terms, ['milk', 'butter', 'cheese']);
  assert.equal(avoidance.active, true);
});

test('transformProtocolRow parses advisory boolean separately from active', () => {
  const row = { id: 'keto', label: 'Keto', excludes: 'high-carb', active: 'TRUE', advisory: 'TRUE' };
  const protocol = transformProtocolRow(row);
  assert.equal(protocol.advisory, true);
  assert.deepEqual(protocol.excludes, ['high-carb']);
});
