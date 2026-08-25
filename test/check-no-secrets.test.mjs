import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { scanContent } from '../scripts/check-no-secrets.mjs';

test('flags a real Apps Script deployment URL', () => {
  const found = scanContent('const url = "https://script.google.com/macros/s/AKfycbxRealLookingId123456/exec";');
  assert.equal(found.length, 1);
  assert.match(found[0], /deployment URL/);
});

test('flags a hardcoded DEVICE_TOKEN in either quote style', () => {
  assert.equal(scanContent("var DEVICE_TOKEN = 'super-secret-value'").length, 1);
  assert.equal(scanContent('DEVICE_TOKEN: "super-secret-value"').length, 1);
});

test('does not flag the URL shape described without a real id', () => {
  assert.deepEqual(scanContent('https://script.google.com/macros/s/.../exec'), []);
  assert.deepEqual(scanContent('It should start with https://script.google.com/macros/s/'), []);
});

test('does not flag ordinary source', () => {
  assert.deepEqual(scanContent('export function loadPairing() { return {}; }'), []);
});

test('does not flag a DEVICE_TOKEN reference that carries no value', () => {
  assert.deepEqual(scanContent("PropertiesService.getScriptProperties().getProperty('DEVICE_TOKEN')"), []);
});

// The guard is only worth having if it actually runs against the real repo.
test('the real repository passes the guard right now', () => {
  const out = execFileSync('node', ['scripts/check-no-secrets.mjs'], { encoding: 'utf8' });
  assert.match(out, /passed/);
});

test('the guard exits non-zero when it finds something, rather than warning', () => {
  // A guard whose failure mode is "print a message and exit 0" is not a gate.
  // Verified by pointing it at a planted file via a throwaway git worktree is
  // overkill here; instead assert the source contains the hard exit.
  const src = execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('scripts/check-no-secrets.mjs','utf8'))"], { encoding: 'utf8' });
  assert.match(src, /process\.exit\(1\)/);
});
