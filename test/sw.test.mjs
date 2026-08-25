import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

// Parsed as text, never imported: `self` and `caches` do not exist under
// node --test, and the worker shares no module graph with js/.
const sw = readFileSync('sw.js', 'utf8');
const swCode = sw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function constant(name) {
  const m = swCode.match(new RegExp(`const ${name} = '([^']*)'`));
  return m ? m[1] : null;
}

function precacheUrls() {
  const m = swCode.match(/const PRECACHE_URLS = \[([\s\S]*?)\]/);
  assert.ok(m, 'PRECACHE_URLS not found');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** Every module reachable from an entry point by static import, transitively. */
function moduleGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*import\s[^'"]*['"](\.[^'"]+)['"]/gm)) {
      queue.push(normalize(join(dirname(file), m[1])).replace(/\\/g, '/'));
    }
  }
  return seen;
}

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

test('never calls skipWaiting anywhere — content must not swap under an open recipe', () => {
  // Checked against the whole comment-stripped file, not a slice between two
  // handlers: a top-level self.skipWaiting() (the most common way this gets
  // added) sits outside such a slice, and reordering the handlers would make
  // a slice-based check pass vacuously on an empty string.
  assert.doesNotMatch(swCode, /skipWaiting\s*\(/);
});

test('the data and photo caches are NOT versioned — a release must not delete the offline library', () => {
  // CI forces a CACHE_VERSION bump on any app-shell change. If these cache
  // names interpolated the version, every routine CSS tweak would drop the
  // cached recipes and photos, breaking offline exactly when it is needed.
  assert.match(swCode, /const DATA_CACHE = '[^'$]*'/, 'DATA_CACHE must be a literal, not version-interpolated');
  assert.match(swCode, /const PHOTO_CACHE = '[^'$]*'/, 'PHOTO_CACHE must be a literal, not version-interpolated');
  assert.doesNotMatch(swCode, /const DATA_CACHE = `[^`]*\$\{CACHE_VERSION\}/);
  assert.doesNotMatch(swCode, /const PHOTO_CACHE = `[^`]*\$\{CACHE_VERSION\}/);
});

test('the install step seeds the library into the data cache', () => {
  // The app fetches library.json during module evaluation, before this worker
  // controls the page, so a first visit never populates DATA_CACHE on its own.
  // Without seeding, the first offline open renders an empty library.
  const installBlock = swCode.slice(swCode.indexOf("addEventListener('install'"), swCode.indexOf("addEventListener('activate'"));
  assert.ok(installBlock.length > 0);
  assert.match(installBlock, /LIBRARY_PATH/);
  assert.match(installBlock, /DATA_CACHE/);
});

test('never synthesizes a fake empty library — the app must show its own load error', () => {
  // A synthesized {recipes:[]} at status 200 renders a confident
  // "0 recipes — try clearing a filter", blaming the user's filters for a
  // network failure, and defeats js/app.js's real "Couldn't load recipes".
  assert.doesNotMatch(swCode, /new Response\(\s*['"`]\s*\{/);
  assert.doesNotMatch(swCode, /"recipes"\s*:\s*\[\s*\]/);
});

test('only caches genuine same-origin 200s — a captive portal must not poison the shell', () => {
  assert.match(swCode, /status === 200/);
  assert.match(swCode, /type === 'basic'/);
});

test('precaches with cache: reload so a stale or intercepted copy is never committed', () => {
  assert.match(swCode, /cache:\s*'reload'/);
});

test('the stale-while-revalidate refresh is kept alive with event.waitUntil', () => {
  // Without this the browser may terminate the worker as soon as the cached
  // response is returned, killing the update that "next time" depends on.
  const swr = swCode.slice(swCode.indexOf('function staleWhileRevalidate'));
  assert.match(swr, /event\.waitUntil/);
});

test('precaches every app-shell file, each of which exists on disk with exact casing', () => {
  for (const url of precacheUrls()) {
    if (url === './') continue;
    assert.ok(existsSync(url), `precached file does not exist: ${url}`);
  }
  assert.ok(precacheUrls().includes('./'), 'the start_url itself must be precached');
});

test('precaches every stylesheet and script index.html actually references', () => {
  const html = readFileSync('index.html', 'utf8');
  const urls = new Set(precacheUrls());
  const referenced = [
    ...[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]),
  ];
  assert.ok(referenced.length > 0, 'parsed no assets out of index.html');
  for (const ref of referenced) {
    assert.ok(urls.has(ref), `index.html loads ${ref} but PRECACHE_URLS omits it`);
  }
});

test('precaches every module transitively imported from js/app.js', () => {
  // Derived from the real import graph, not a hand-maintained second copy:
  // a module added in a later milestone must not be able to slip through and
  // blow up a cold offline open with a failed dynamic import.
  const urls = new Set(precacheUrls());
  for (const module of moduleGraph('js/app.js')) {
    assert.ok(urls.has(module), `PRECACHE_URLS is missing ${module}`);
  }
});

test('the library path matches the one the app actually requests', () => {
  const source = readFileSync('js/data/static-json-source.js', 'utf8');
  const appUrl = source.match(/const DEFAULT_URL = '([^']+)'/)?.[1];
  assert.equal(constant('LIBRARY_PATH'), appUrl, 'sw.js and static-json-source.js disagree on the library URL');
});

test('the photo prefix matches the one js/ui/photo.js enforces', () => {
  const source = readFileSync('js/ui/photo.js', 'utf8');
  const appPrefix = source.match(/const ALLOWED_PREFIX = '([^']+)'/)?.[1];
  assert.equal(constant('PHOTO_PREFIX'), appPrefix, 'sw.js and photo.js disagree on the photo directory');
});

test('photos are runtime-cached in their own bucket, never precached', () => {
  const inPrecache = precacheUrls().some((u) => u.includes('assets/photos'));
  assert.equal(inPrecache, false, 'photos must not be precached — they are large and optional');
  assert.match(swCode, /PHOTO_CACHE/);
});

test('deletes caches from older versions on activate', () => {
  const activateBlock = swCode.slice(swCode.indexOf("addEventListener('activate'"));
  assert.match(activateBlock, /caches\.delete/);
});

test('only ever handles same-origin GET requests', () => {
  assert.match(swCode, /request\.method !== 'GET'/);
  assert.match(swCode, /origin !== self\.location\.origin/);
});
