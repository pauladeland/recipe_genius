import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('css/print.css', 'utf8');

test('every rule is inside a print media query — this file must never affect the screen', () => {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutPrintBlock = withoutComments.replace(/@media\s+print\s*\{[\s\S]*\}/, '');
  assert.equal(withoutPrintBlock.trim(), '', 'found rules outside @media print');
});

test('hides the chrome that has no meaning on paper', () => {
  for (const selector of ['.app-header', '.filterbar', '.app-footer', '.skip-link']) {
    assert.ok(css.includes(selector), `print stylesheet does not hide ${selector}`);
  }
});

test('forces ink-on-white so a dark theme does not print a black page', () => {
  assert.match(css, /background:\s*#fff/i);
  assert.match(css, /color:\s*#000/i);
});

test('expands badge disclosures so allergen causes survive printing', () => {
  assert.match(css, /\.badge-detail-body\s*\{[^}]*display:\s*block/);
});

test('keeps the safety disclaimer on the printed page', () => {
  assert.ok(!/\.detail-footer\s*\{[^}]*display:\s*none/.test(css), 'the disclaimer must print');
});

test('index.html links the print stylesheet with media="print"', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /<link rel="stylesheet" href="css\/print\.css" media="print">/);
});
