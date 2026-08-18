import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchAvoidance, parseOverrides, applyOverrides, checkProtocolCompliance } from '../lib/matcher.js';

const milk = {
  id: 'milk',
  terms: ['milk', 'butter', 'ghee', 'cream', 'cheese', 'parmesan', 'cheddar'],
  hiddenTerms: ['pesto', 'brioche'],
  exceptions: ['peanut butter', 'cocoa butter', 'butter lettuce', 'butter bean', 'dairy-free butter', 'dairy-free cheese'],
};

const yeast = {
  id: 'yeast',
  terms: ['yeast', 'nutritional yeast'],
  hiddenTerms: ['soy sauce', 'vinegar', 'bouillon'],
  exceptions: ['yeast-free'],
};

const seeds = {
  id: 'seeds',
  terms: ['sesame', 'flax', 'chia', 'mustard', 'tahini'],
  hiddenTerms: ['hummus'],
  exceptions: [],
};

const meat = {
  id: 'meat',
  terms: ['beef', 'pork', 'bacon', 'venison', 'elk'],
  hiddenTerms: ['gelatin'],
  exceptions: [],
};

test('peanut butter does not match milk', () => {
  assert.equal(matchAvoidance(['2 tbsp peanut butter'], milk).length, 0);
});

test('cocoa butter does not match milk', () => {
  assert.equal(matchAvoidance(['1/4 cup cocoa butter'], milk).length, 0);
});

test('butter lettuce does not match milk', () => {
  assert.equal(matchAvoidance(['1 head butter lettuce'], milk).length, 0);
});

test('ghee matches milk as certain', () => {
  const flags = matchAvoidance(['1 tbsp ghee'], milk);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].level, 'certain');
});

test('dairy-free butter does not match milk (plural-safe exception)', () => {
  assert.equal(matchAvoidance(['2 tbsp dairy-free butter'], milk).length, 0);
});

test('dairy-free cheese does not match milk', () => {
  assert.equal(matchAvoidance(['1/4 cup dairy-free cheese'], milk).length, 0);
});

test('a named cheese (Parmesan) matches milk as certain', () => {
  const flags = matchAvoidance(['6 ounces Parmesan, freshly grated'], milk);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].level, 'certain');
});

test('soy sauce matches yeast as possible', () => {
  const flags = matchAvoidance(['1/4 cup soy sauce'], yeast);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].level, 'possible');
});

test('yeast-free tamari does not match yeast', () => {
  assert.equal(matchAvoidance(['2 tbsp yeast-free tamari'], yeast).length, 0);
});

test('nutritional yeast matches yeast as certain', () => {
  const flags = matchAvoidance(['1/4 cup nutritional yeast'], yeast);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].level, 'certain');
});

test('tahini matches seeds as certain (upgraded from possible)', () => {
  const flags = matchAvoidance(['1/4 cup tahini'], seeds);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].level, 'certain');
});

test('Dijon mustard matches seeds via the bare "mustard" term', () => {
  const flags = matchAvoidance(['1 Tbsp Dijon mustard'], seeds);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].level, 'certain');
});

test('venison matches meat even though it is not a supermarket meat', () => {
  const flags = matchAvoidance(['7 lbs venison'], meat);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].allergenId, 'meat');
});

test('a plural exception masks plural ingredient text (butter bean -> butter beans)', () => {
  assert.equal(
    matchAvoidance(['1 (15-ounce) can butter beans, drained and rinsed'], milk).length,
    0
  );
});

test('override -yeast clears a false positive', () => {
  const flags = matchAvoidance(['1/4 cup red wine vinegar'], yeast);
  assert.equal(flags.length, 1);
  const { overrides } = parseOverrides('-yeast', new Set(['yeast']));
  assert.equal(applyOverrides(flags, overrides).length, 0);
});

test('override +milk:"reason" forces a missed flag', () => {
  const { overrides } = parseOverrides('+milk:"ghee in the tarka"', new Set(['milk']));
  const result = applyOverrides([], overrides);
  assert.equal(result.length, 1);
  assert.equal(result[0].allergenId, 'milk');
  assert.equal(result[0].level, 'certain');
});

test('override ?milk downgrades certain to possible', () => {
  const flags = matchAvoidance(['1 tbsp ghee'], milk);
  const { overrides } = parseOverrides('?milk', new Set(['milk']));
  assert.equal(applyOverrides(flags, overrides)[0].level, 'possible');
});

test('an unknown override token produces a warning, not a throw', () => {
  const { warnings } = parseOverrides('-nonexistent-thing', new Set(['milk', 'yeast']));
  assert.equal(warnings.length, 1);
});

test('a malformed + token (wrong quote style) produces an error, not a warning, and does not throw', () => {
  const { overrides, warnings, errors } = parseOverrides('+milk:\'wrong quotes\'', new Set(['milk', 'yeast']));
  assert.equal(overrides.length, 0);
  assert.equal(warnings.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /force token/);
});

test('a + token with an unknown id produces an error, not a warning', () => {
  const { overrides, warnings, errors } = parseOverrides('+nonexistent:"reason"', new Set(['milk', 'yeast']));
  assert.equal(overrides.length, 0);
  assert.equal(warnings.length, 0);
  assert.equal(errors.length, 1);
});

test('protocol compliance fails on a certain match, passes on possible only', () => {
  const protocol = { id: 'vegetarian', excludes: ['meat', 'fish'] };
  assert.equal(
    checkProtocolCompliance([{ allergenId: 'meat', level: 'certain' }], protocol).compliant,
    false
  );
  assert.equal(
    checkProtocolCompliance([{ allergenId: 'meat', level: 'possible' }], protocol).compliant,
    true
  );
});

test('protocol violatedBy lists exactly which avoidances tripped it', () => {
  const flags = [
    { allergenId: 'meat', level: 'certain' },
    { allergenId: 'nightshades', level: 'certain' },
  ];
  const protocol = { id: 'aip', excludes: ['grains', 'meat', 'nightshades', 'dairy'] };
  assert.deepEqual(checkProtocolCompliance(flags, protocol).violatedBy.sort(), ['meat', 'nightshades']);
});
