import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRecipes,
  validateProtocolReferences,
  validateNoPrivateLeak,
  runAllGates,
  ValidationError,
} from '../scripts/validate.mjs';

test('empty recipe list is an error', () => {
  assert.ok(validateRecipes([], null).errors.some((e) => e.includes('empty')));
});

test('duplicate ids are an error', () => {
  const recipes = [{ id: 'a', title: 'A' }, { id: 'a', title: 'A again' }];
  assert.ok(validateRecipes(recipes, null).errors.some((e) => e.includes('Duplicate')));
});

test('sanity floor trips below 60% of previous count', () => {
  const recipes = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, title: `R${i}` }));
  assert.ok(validateRecipes(recipes, 10).errors.some((e) => e.includes('Sanity floor')));
});

test('sanity floor does not trip at exactly 60%', () => {
  const recipes = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, title: `R${i}` }));
  assert.equal(validateRecipes(recipes, 10).errors.length, 0);
});

test('total_minutes less than prep+cook is a warning, not an error', () => {
  const recipes = [{ id: 'a', title: 'A', prepMinutes: 20, cookMinutes: 20, totalMinutes: 30 }];
  const { errors, warnings } = validateRecipes(recipes, null);
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 1);
});

test('a typo in a protocol excludes id fails the build', () => {
  const protocols = [{ id: 'aip', excludes: ['grains', 'milk', 'nightshaeds'] }];
  const avoidanceIds = new Set(['grains', 'milk', 'nightshades']);
  const errors = validateProtocolReferences(protocols, avoidanceIds).errors;
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('nightshaeds'));
});

test('an unrecognized field on a recipe fails the private-leak allowlist', () => {
  const errors = validateNoPrivateLeak({ id: 'a', title: 'A', notes: 'should never be here' });
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('notes'));
});

test('runAllGates throws ValidationError when any gate fails', () => {
  assert.throws(
    () => runAllGates({ recipes: [], avoidances: [{ id: 'milk' }], protocols: [], previousCount: null }),
    ValidationError
  );
});

test('runAllGates succeeds and returns warnings for a valid, minimal library', () => {
  const { warnings } = runAllGates({
    recipes: [{ id: 'a', title: 'A' }],
    avoidances: [{ id: 'milk' }],
    protocols: [],
    previousCount: null,
  });
  assert.deepEqual(warnings, []);
});
