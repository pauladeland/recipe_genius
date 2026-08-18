import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, splitList, splitLines, parseBoolean } from '../lib/normalize.js';

test('slugify lowercases and hyphenates', () => {
  assert.equal(slugify('Chimichurri Sauce'), 'chimichurri-sauce');
});

test('slugify strips accents', () => {
  assert.equal(slugify('Crème Fraîche'), 'creme-fraiche');
});

test('splitList splits on pipe and trims', () => {
  assert.deepEqual(splitList('milk|butter | cream'), ['milk', 'butter', 'cream']);
});

test('splitList returns empty array for blank input', () => {
  assert.deepEqual(splitList(''), []);
  assert.deepEqual(splitList(undefined), []);
});

test('splitLines splits on newline and trims', () => {
  assert.deepEqual(splitLines('a\nb \n c'), ['a', 'b', 'c']);
});

test('parseBoolean reads TRUE case-insensitively', () => {
  assert.equal(parseBoolean('TRUE'), true);
  assert.equal(parseBoolean('true'), true);
  assert.equal(parseBoolean('FALSE'), false);
  assert.equal(parseBoolean(''), false);
});
