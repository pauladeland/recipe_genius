import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBadges } from '../js/ui/badges.js';

const avoidances = [
  { id: 'milk', label: 'Milk / Dairy', severity: 'allergy' },
  { id: 'yeast', label: 'Yeast', severity: 'sensitivity' },
  { id: 'nightshades', label: 'Nightshades', severity: 'protocol' },
];

test('a certain allergy flag becomes a danger badge with CONTAINS copy', () => {
  const flags = [{ allergenId: 'milk', term: 'parmesan', level: 'certain' }];
  const badges = computeBadges(flags, avoidances);
  assert.equal(badges.length, 1);
  assert.equal(badges[0].weight, 'danger');
  assert.equal(badges[0].text, 'Contains milk / dairy');
});

test('a possible allergy flag becomes a caution badge with CHECK FOR copy (imperative)', () => {
  const flags = [{ allergenId: 'milk', term: 'pesto', level: 'possible' }];
  const badges = computeBadges(flags, avoidances);
  assert.equal(badges[0].weight, 'caution');
  assert.equal(badges[0].text, 'Check for milk / dairy');
});

test('a certain sensitivity flag becomes a caution badge with CONTAINS copy', () => {
  const flags = [{ allergenId: 'yeast', term: 'nutritional yeast', level: 'certain' }];
  const badges = computeBadges(flags, avoidances);
  assert.equal(badges[0].weight, 'caution');
  assert.equal(badges[0].text, 'Contains yeast');
});

test('a possible sensitivity flag becomes a caution badge with passive "May contain" copy', () => {
  const flags = [{ allergenId: 'yeast', term: 'vinegar', level: 'possible' }];
  const badges = computeBadges(flags, avoidances);
  assert.equal(badges[0].weight, 'caution');
  assert.equal(badges[0].text, 'May contain yeast');
});

test('a protocol flag becomes a quiet info badge, lowercase label only, regardless of level', () => {
  const flags = [{ allergenId: 'nightshades', term: 'potato', level: 'certain' }];
  const badges = computeBadges(flags, avoidances);
  assert.equal(badges[0].weight, 'info');
  assert.equal(badges[0].text, 'nightshades');
});

test('multiple flags for the same allergen collapse into one badge, deduped by allergenId+level', () => {
  const flags = [
    { allergenId: 'milk', term: 'parmesan', level: 'certain' },
    { allergenId: 'milk', term: 'cheese', level: 'certain' },
  ];
  const badges = computeBadges(flags, avoidances);
  assert.equal(badges.length, 1);
  assert.equal(badges[0].text, 'Contains milk / dairy');
});

test('badges sort danger, then caution, then info', () => {
  const flags = [
    { allergenId: 'nightshades', term: 'potato', level: 'certain' },
    { allergenId: 'milk', term: 'butter', level: 'certain' },
    { allergenId: 'yeast', term: 'vinegar', level: 'possible' },
  ];
  const badges = computeBadges(flags, avoidances);
  assert.deepEqual(badges.map((b) => b.weight), ['danger', 'caution', 'info']);
});

test('an empty flags array produces no badges', () => {
  assert.deepEqual(computeBadges([], avoidances), []);
});

test('a badge carries the offending line and term as a cause', () => {
  const flags = [{ allergenId: 'milk', term: 'parmesan', level: 'certain', line: '6 oz Parmesan, freshly grated', lineIndex: 2 }];
  const badges = computeBadges(flags, avoidances);
  assert.deepEqual(badges[0].causes, [{ line: '6 oz Parmesan, freshly grated', term: 'parmesan' }]);
});

test('multiple distinct lines for the same allergen all appear as separate causes', () => {
  const flags = [
    { allergenId: 'milk', term: 'butter', level: 'certain', line: '2 tbsp butter', lineIndex: 0 },
    { allergenId: 'milk', term: 'cheese', level: 'certain', line: '1 cup shredded cheese', lineIndex: 3 },
  ];
  const badges = computeBadges(flags, avoidances);
  assert.equal(badges[0].causes.length, 2);
  assert.deepEqual(badges[0].causes.map((c) => c.line), ['2 tbsp butter', '1 cup shredded cheese']);
});

test('the same line/term pair is not duplicated in causes', () => {
  const flags = [
    { allergenId: 'milk', term: 'butter', level: 'certain', line: '2 tbsp butter', lineIndex: 0 },
    { allergenId: 'milk', term: 'butter', level: 'certain', line: '2 tbsp butter', lineIndex: 0 },
  ];
  const badges = computeBadges(flags, avoidances);
  assert.equal(badges[0].causes.length, 1);
});

test('substitutions text passes through from the avoidance row', () => {
  const withSubs = [...avoidances, { id: 'milk', label: 'Milk / Dairy', severity: 'allergy', substitutions: 'oat milk; coconut cream' }];
  const flags = [{ allergenId: 'milk', term: 'butter', level: 'certain', line: '2 tbsp butter', lineIndex: 0 }];
  const badges = computeBadges(flags, withSubs);
  assert.equal(badges[0].substitutions, 'oat milk; coconut cream');
});

test('a missing substitutions value on the avoidance row is null, not undefined', () => {
  const flags = [{ allergenId: 'milk', term: 'butter', level: 'certain', line: '2 tbsp butter', lineIndex: 0 }];
  const badges = computeBadges(flags, avoidances); // shared `avoidances` fixture has no substitutions field
  assert.equal(badges[0].substitutions, null);
});

test('a flag referencing an unknown avoidance id is skipped rather than throwing', () => {
  const flags = [{ allergenId: 'unknown-thing', term: 'x', level: 'certain' }];
  assert.deepEqual(computeBadges(flags, avoidances), []);
});
