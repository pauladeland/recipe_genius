import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSettings } from '../js/views/settings.js';

const avoidances = [
  { id: 'milk', label: 'Milk / Dairy', severity: 'allergy' },
  { id: 'egg', label: 'Egg', severity: 'sensitivity' },
  { id: 'nightshades', label: 'Nightshades', severity: 'protocol' },
];

const protocols = [
  { id: 'aip', label: 'AIP / Hashimoto\'s', advisory: false },
  { id: 'vegetarian', label: 'Vegetarian', advisory: false },
  { id: 'keto', label: 'Keto', advisory: true },
];

test('lists every avoidance as a checkbox row', () => {
  const out = renderSettings(avoidances, protocols, { theme: 'system', avoidanceIds: [], activeProtocolId: null, showNonCompliant: false }).toString();
  assert.match(out, /Milk \/ Dairy/);
  assert.match(out, /Egg/);
  assert.match(out, /Nightshades/);
});

test('checks the boxes already in settings.avoidanceIds', () => {
  const out = renderSettings(avoidances, protocols, { theme: 'system', avoidanceIds: ['milk'], activeProtocolId: null, showNonCompliant: false }).toString();
  const milkRow = out.slice(out.indexOf('Milk / Dairy') - 200, out.indexOf('Milk / Dairy'));
  assert.match(milkRow, /checked/);
  const eggRow = out.slice(out.indexOf('>Egg<') - 200, out.indexOf('>Egg<'));
  assert.doesNotMatch(eggRow, /checked/);
});

test('marks the active theme button as pressed', () => {
  const out = renderSettings(avoidances, protocols, { theme: 'dark', avoidanceIds: [], activeProtocolId: null, showNonCompliant: false }).toString();
  const darkIndex = out.indexOf('data-theme-choice="dark"');
  const button = out.slice(darkIndex, darkIndex + 80);
  assert.match(button, /aria-pressed="true"/);
});

test('exposes an h1 heading so route-change focus management can find it', () => {
  const out = renderSettings(avoidances, protocols, { theme: 'system', avoidanceIds: [], activeProtocolId: null, showNonCompliant: false }).toString();
  assert.match(out, /<h1[^>]*tabindex="-1"[^>]*>Settings<\/h1>/);
});

test('lists every protocol as a button, plus an Off option', () => {
  const out = renderSettings(avoidances, protocols, { theme: 'system', avoidanceIds: [], activeProtocolId: null, showNonCompliant: false }).toString();
  assert.match(out, /AIP \/ Hashimoto&#39;s/);
  assert.match(out, /Vegetarian/);
  assert.match(out, />Off</);
});

test('marks the active protocol button as pressed', () => {
  const out = renderSettings(avoidances, protocols, { theme: 'system', avoidanceIds: [], activeProtocolId: 'aip', showNonCompliant: false }).toString();
  const aipIndex = out.indexOf('data-protocol-choice="aip"');
  const button = out.slice(aipIndex, aipIndex + 120);
  assert.match(button, /aria-pressed="true"/);
});

test('marks Off as pressed when no protocol is active', () => {
  const out = renderSettings(avoidances, protocols, { theme: 'system', avoidanceIds: [], activeProtocolId: null, showNonCompliant: false }).toString();
  const offIndex = out.indexOf('data-protocol-choice=""');
  const button = out.slice(offIndex, offIndex + 120);
  assert.match(button, /aria-pressed="true"/);
});

test('an advisory protocol label says so, visibly', () => {
  const out = renderSettings(avoidances, protocols, { theme: 'system', avoidanceIds: [], activeProtocolId: null, showNonCompliant: false }).toString();
  assert.match(out, /Keto \(advisory\)/);
});

test('marks Off as pressed for a stale activeProtocolId that matches no known protocol', () => {
  const out = renderSettings(avoidances, protocols, { theme: 'system', avoidanceIds: [], activeProtocolId: 'no-longer-exists', showNonCompliant: false }).toString();
  const offIndex = out.indexOf('data-protocol-choice=""');
  const offButton = out.slice(offIndex, offIndex + 120);
  assert.match(offButton, /aria-pressed="true"/);
  for (const p of protocols) {
    const idx = out.indexOf(`data-protocol-choice="${p.id}"`);
    assert.match(out.slice(idx, idx + 120), /aria-pressed="false"/);
  }
});

// --- M6: device pairing -----------------------------------------------------

const PAIRED = { endpoint: 'https://script.google.com/macros/s/AKfycbxSAMPLE/exec', token: 'sekrit-token' };
const UNPAIRED = { endpoint: '', token: '' };
const baseSettings = { theme: 'system', avoidanceIds: [], activeProtocolId: null, showNonCompliant: false };

test('unpaired: offers the two pairing fields and a Pair button', () => {
  const out = renderSettings(avoidances, [], baseSettings, UNPAIRED, 0).toString();
  assert.match(out, /id="pair-endpoint"/);
  assert.match(out, /id="pair-token"/);
  assert.match(out, /id="pair-submit"/);
});

test('unpaired: the copy reassures rather than reading as data loss', () => {
  const out = renderSettings(avoidances, [], baseSettings, UNPAIRED, 0).toString();
  assert.match(out, /Your notes are safe/i);
  assert.doesNotMatch(out, /error/i);
});

test('the token field is a password input and never autocompletes', () => {
  const out = renderSettings(avoidances, [], baseSettings, UNPAIRED, 0).toString();
  const idx = out.indexOf('id="pair-token"');
  const field = out.slice(Math.max(0, idx - 200), idx + 200);
  assert.match(field, /type="password"/);
  assert.match(field, /autocomplete="off"/);
});

test('paired: shows the paired state plus re-pair and unpair controls', () => {
  const out = renderSettings(avoidances, [], baseSettings, PAIRED, 0).toString();
  assert.match(out, /Paired as household/i);
  assert.match(out, /id="pair-repair"/);
  assert.match(out, /id="pair-unpair"/);
});

test('paired: NEVER renders the token or the endpoint back into the page', () => {
  // Both are secrets. Echoing them into the DOM puts them in screenshots, in
  // screen-share, and in any future "copy page source" support request.
  const out = renderSettings(avoidances, [], baseSettings, PAIRED, 0).toString();
  assert.doesNotMatch(out, /sekrit-token/);
  assert.doesNotMatch(out, /AKfycbxSAMPLE/);
  assert.doesNotMatch(out, /script\.google\.com/);
});

test('a pending write count is shown when the queue is not empty', () => {
  const out = renderSettings(avoidances, [], baseSettings, PAIRED, 3).toString();
  assert.match(out, /3 .*(waiting|send)/i);
});

test('no pending-count line when the queue is empty', () => {
  const out = renderSettings(avoidances, [], baseSettings, PAIRED, 0).toString();
  assert.doesNotMatch(out, /waiting to send/i);
});

test('renderSettings still works with the pre-M6 three-argument signature', () => {
  const out = renderSettings(avoidances, [], baseSettings).toString();
  assert.match(out, /<h1[^>]*tabindex="-1"[^>]*>Settings<\/h1>/);
  assert.match(out, /id="pair-endpoint"/);
});
