import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { scanContent, ALLOWLIST } from '../scripts/check-no-secrets.mjs';

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

test('the guard exits non-zero on a PLANTED secret in a real tracked file', () => {
  // The previous version of this test grepped the guard's own source for the
  // string "process.exit(1)". That would have passed even if main() never
  // called scanContent -- and it did pass while the ALLOWLIST had a hole big
  // enough to hide a real endpoint in js/ui/pairing.js. Plant and run instead.
  const victim = 'lib/normalize.js';
  const original = readFileSync(victim, 'utf8');
  try {
    const planted = '\n// https://script.google.com/macros/s/AKfycbwPLANTEDFORTEST1234567890/exec\n';
    writeFileSync(victim, original + planted);
    let exitCode = 0;
    try {
      execFileSync('node', ['scripts/check-no-secrets.mjs'], { encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
      exitCode = err.status;
    }
    assert.equal(exitCode, 1, 'the guard must FAIL the build, not warn');
  } finally {
    writeFileSync(victim, original);
  }
});

test('every ALLOWLIST entry is load-bearing', () => {
  // An entry that matches nothing is not harmless: it is a permanent, silent
  // exemption on a file that may later receive a real secret. This assertion
  // is what would have caught the pairing.js/settings.js/app.js hole.
  for (const file of ALLOWLIST) {
    const content = readFileSync(file, 'utf8');
    assert.ok(
      scanContent(content).length > 0,
      `${file} is allowlisted but matches no pattern -- remove it from the allowlist`
    );
  }
});

test('the allowlist stays small enough to eyeball', () => {
  assert.ok(ALLOWLIST.size <= 6, `allowlist has grown to ${ALLOWLIST.size} entries`);
});
