import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shellFilesIn, parseVersion, checkVersionBump } from '../scripts/check-cache-version.mjs';

test('js/ and css/ changes are app-shell changes', () => {
  assert.deepEqual(shellFilesIn(['js/app.js', 'css/app.css']), ['js/app.js', 'css/app.css']);
});

test('index.html and the manifest are app-shell changes too — both are precached', () => {
  assert.deepEqual(shellFilesIn(['index.html']), ['index.html']);
  assert.deepEqual(shellFilesIn(['manifest.webmanifest']), ['manifest.webmanifest']);
});

test('data, docs, tests, and workflows are not app-shell changes', () => {
  assert.deepEqual(
    shellFilesIn(['data/library.json', 'docs/SHEET.md', 'test/sw.test.mjs', '.github/workflows/test.yml', 'README.md']),
    []
  );
});

test('parseVersion reads v<number> and rejects anything else', () => {
  assert.equal(parseVersion('v1'), 1);
  assert.equal(parseVersion('v12'), 12);
  assert.equal(parseVersion('1'), null);
  assert.equal(parseVersion('v1.2'), null);
  assert.equal(parseVersion(''), null);
  assert.equal(parseVersion(null), null);
});

test('no shell changes means the check does not apply', () => {
  assert.equal(checkVersionBump('v1', 'v1', []).ok, true);
});

test('a shell change with no version bump fails', () => {
  const result = checkVersionBump('v1', 'v1', ['js/app.js']);
  assert.equal(result.ok, false);
  assert.match(result.message, /does not move forward/);
});

test('a forward bump passes', () => {
  const result = checkVersionBump('v1', 'v2', ['js/app.js']);
  assert.equal(result.ok, true);
  assert.match(result.message, /v1 -> v2/);
});

test('an UNPARSEABLE version at HEAD is a hard failure, never a pass', () => {
  // Regression: switching sw.js to double quotes made the regex miss, `after`
  // came back null, and the guard reported "moved v1 -> null. OK." and exited 0.
  const result = checkVersionBump('v1', null, ['js/app.js']);
  assert.equal(result.ok, false);
  assert.match(result.message, /Could not read CACHE_VERSION/);
});

test('moving the version BACKWARDS fails — it reuses a cache name still on devices', () => {
  const result = checkVersionBump('v2', 'v1', ['css/app.css']);
  assert.equal(result.ok, false);
  assert.match(result.message, /does not move forward/);
});

test('a non-numeric version scheme fails rather than silently passing', () => {
  assert.equal(checkVersionBump('v1', 'shiny', ['js/app.js']).ok, false);
  assert.equal(checkVersionBump('beta', 'v2', ['js/app.js']).ok, false);
});

test('a brand-new sw.js on the branch has nothing to compare against', () => {
  assert.equal(checkVersionBump(null, 'v1', ['js/app.js']).ok, true);
});

test('the real sw.js declares a version this guard can actually parse', () => {
  // Pins the guard's regex to the file it guards: a reformat of sw.js that the
  // guard cannot read would otherwise only surface as a CI failure later.
  const sw = readFileSync('sw.js', 'utf8');
  const version = (sw.match(/const CACHE_VERSION = '([^']+)'/) || [])[1] ?? null;
  assert.notEqual(version, null, 'check-cache-version.mjs cannot read sw.js CACHE_VERSION');
  assert.notEqual(parseVersion(version), null, `CACHE_VERSION '${version}' is not a v<number>`);
});
