import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// Parsed as text, never imported: `self` and `caches` do not exist under
// node --test, and the worker has no module graph in common with js/.
const sw = readFileSync('sw.js', 'utf8');

test('sw.js lives at the repo root so its default scope can control index.html', () => {
  assert.ok(existsSync('sw.js'));
  assert.ok(!existsSync('js/sw.js'), 'a worker under js/ could never control the root document');
});

test('declares a CACHE_VERSION', () => {
  assert.match(sw, /const CACHE_VERSION = '[^']+'/);
});

test('registers a fetch handler — Chrome requires one for installability', () => {
  assert.match(sw, /addEventListener\(\s*'fetch'/);
});

test('handles install and activate', () => {
  assert.match(sw, /addEventListener\(\s*'install'/);
  assert.match(sw, /addEventListener\(\s*'activate'/);
});

test('never calls skipWaiting on install — content must not swap under an open recipe', () => {
  // Comments are stripped first: the install handler deliberately *mentions*
  // skipWaiting in a comment explaining why it is absent.
  const code = sw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const installBlock = code.slice(code.indexOf("addEventListener('install'"), code.indexOf("addEventListener('activate'"));
  assert.doesNotMatch(installBlock, /skipWaiting\s*\(/);
});

test('precaches every app-shell file, each of which exists on disk', () => {
  const match = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\]/);
  assert.ok(match, 'PRECACHE_URLS not found');
  const urls = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(urls.includes('./'), 'the start_url itself must be precached');
  for (const url of urls) {
    if (url === './') continue;
    assert.ok(existsSync(url), `precached file does not exist: ${url}`);
  }
});

test('precaches every JS module the app actually loads', () => {
  const match = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\]/);
  const urls = new Set([...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  const expected = [
    'js/app.js', 'js/state.js',
    'js/data/static-json-source.js',
    'js/ui/html.js', 'js/ui/badges.js', 'js/ui/theme.js', 'js/ui/surprise.js',
    'js/ui/photo.js', 'js/ui/sync-status.js',
    'js/views/list.js', 'js/views/recipe.js', 'js/views/settings.js',
  ];
  for (const path of expected) assert.ok(urls.has(path), `PRECACHE_URLS is missing ${path}`);
});

test('photos are runtime-cached in their own bucket, never precached', () => {
  const match = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\]/);
  assert.doesNotMatch(match[1], /assets\/photos/, 'photos must not be precached — they are large and optional');
  assert.match(sw, /assets\/photos/, 'but the fetch handler must still cache them at runtime');
});

test('deletes caches from older versions on activate', () => {
  const activateBlock = sw.slice(sw.indexOf("addEventListener('activate'"));
  assert.match(activateBlock, /caches\.delete/);
});

test('only ever handles same-origin GET requests', () => {
  assert.match(sw, /request\.method !== 'GET'/);
  assert.match(sw, /origin !== self\.location\.origin/);
});
