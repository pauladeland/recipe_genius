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

test('a flag referencing an unknown avoidance id is skipped rather than throwing', () => {
  const flags = [{ allergenId: 'unknown-thing', term: 'x', level: 'certain' }];
  assert.deepEqual(computeBadges(flags, avoidances), []);
});
