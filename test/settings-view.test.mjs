import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSettings } from '../js/views/settings.js';

const avoidances = [
  { id: 'milk', label: 'Milk / Dairy', severity: 'allergy' },
  { id: 'egg', label: 'Egg', severity: 'sensitivity' },
  { id: 'nightshades', label: 'Nightshades', severity: 'protocol' },
];

test('lists every avoidance as a checkbox row', () => {
  const out = renderSettings(avoidances, { theme: 'system', avoidanceIds: [] }).toString();
  assert.match(out, /Milk \/ Dairy/);
  assert.match(out, /Egg/);
  assert.match(out, /Nightshades/);
});

test('checks the boxes already in settings.avoidanceIds', () => {
  const out = renderSettings(avoidances, { theme: 'system', avoidanceIds: ['milk'] }).toString();
  const milkRow = out.slice(out.indexOf('Milk / Dairy') - 200, out.indexOf('Milk / Dairy'));
  assert.match(milkRow, /checked/);
  const eggRow = out.slice(out.indexOf('>Egg<') - 200, out.indexOf('>Egg<'));
  assert.doesNotMatch(eggRow, /checked/);
});

test('marks the active theme button as pressed', () => {
  const out = renderSettings(avoidances, { theme: 'dark', avoidanceIds: [] }).toString();
  const darkIndex = out.indexOf('data-theme-choice="dark"');
  const button = out.slice(darkIndex, darkIndex + 80);
  assert.match(button, /aria-pressed="true"/);
});

test('exposes an h1 heading so route-change focus management can find it', () => {
  const out = renderSettings(avoidances, { theme: 'system', avoidanceIds: [] }).toString();
  assert.match(out, /<h1[^>]*tabindex="-1"[^>]*>Settings<\/h1>/);
});
