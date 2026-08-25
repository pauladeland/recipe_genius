/* Service worker. Runs in its own global scope — it CANNOT import anything
   from js/. The two paths it duplicates from the app (the library URL and the
   photo directory) are pinned by test/sw.test.mjs against their real
   definitions in js/data/static-json-source.js and js/ui/photo.js.

   Bump CACHE_VERSION whenever anything under js/, css/, index.html, or the
   manifest changes. CI fails the build if you forget
   (scripts/check-cache-version.mjs), because a stale precache serving old JS
   against a new library.json is invisible locally and broken in the kitchen. */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;

// DATA and PHOTO caches are deliberately UNVERSIONED, and that is load-bearing.
// CI forces a CACHE_VERSION bump on any app-shell change, so versioning these
// would mean every routine CSS tweak deletes the offline recipe library and the
// downloaded photos — the app would lose its offline data on every release, in
// exactly the situation (no signal, at the store) the cache exists for.
const DATA_CACHE = 'data';
const PHOTO_CACHE = 'photos';

// Paths duplicated from the app; see the header note and test/sw.test.mjs.
const LIBRARY_PATH = 'data/library.json';
const PHOTO_PREFIX = 'assets/photos/';

const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/app.css',
  'css/print.css',
  'js/app.js',
  'js/state.js',
  'js/data/static-json-source.js',
  'js/ui/html.js',
  'js/ui/badges.js',
  'js/ui/theme.js',
  'js/ui/surprise.js',
  'js/ui/photo.js',
  'js/ui/sync-status.js',
  'js/views/list.js',
  'js/views/recipe.js',
  'js/views/settings.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-512-maskable.png',
];

/**
 * A response is only safe to cache if it came from our own origin as a real
 * 200. Without this a captive portal — hotel, airport, café, i.e. exactly
 * where someone opens a recipe app — can answer js/app.js with its own login
 * HTML at status 200, which cache-first would then serve as the app's
 * JavaScript forever, with no in-app way out.
 */
function isCacheable(response) {
  return !!response && response.status === 200 && response.type === 'basic';
}

async function safePut(cacheName, request, response) {
  if (!isCacheable(response)) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch {
    // Quota exceeded, or a response that cannot be stored. Not fatal — the
    // network answer still reaches the page.
  }
}

self.addEventListener('install', (event) => {
  // No skipWaiting() — a new worker waits until every tab using the old one is
  // gone. Swapping the app out from under someone mid-recipe is the one
  // failure this app cannot afford.
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // `cache: 'reload'` bypasses the HTTP cache so a precache can never commit
    // a stale — or captive-portal — copy of the shell.
    await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));

    // The library has to be seeded here, not left to the first page fetch.
    // The app requests library.json during module evaluation, before this
    // worker has claimed the page, so on a first visit that request bypasses
    // the worker entirely and nothing is ever written to DATA_CACHE. Without
    // this line the first offline open renders an empty library — the exact
    // journey this milestone exists to make work.
    const response = await fetch(new Request(LIBRARY_PATH, { cache: 'reload' }));
    await safePut(DATA_CACHE, LIBRARY_PATH, response);
  })());
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, DATA_CACHE, PHOTO_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/**
 * Stale-while-revalidate: answer from cache now, refresh for next time. The
 * refresh is handed to event.waitUntil, without which the browser is free to
 * terminate the worker the moment the cached response is returned — killing
 * the in-flight update, so "next time" would never arrive.
 */
function staleWhileRevalidate(event, cacheName) {
  const { request } = event;
  const refresh = fetch(request)
    .then(async (response) => {
      await safePut(cacheName, request, response);
      return response;
    })
    .catch(() => null);

  return caches.open(cacheName)
    .then((cache) => cache.match(request))
    .then((cached) => {
      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      // Nothing cached yet: the network answer is all there is. If it fails,
      // let the rejection through so the app renders its own "Couldn't load
      // recipes" state. Synthesizing an empty-but-valid library here would
      // instead render a confident "0 recipes — try clearing a filter",
      // blaming the user's filters for a network problem.
      return refresh.then((response) => {
        if (response) return response;
        throw new Error('offline and no cached library');
      });
    });
}

/** Cache-first, and remember anything new. Used for the shell and photos. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await safePut(cacheName, request, response);
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The document is served from the same versioned cache as its scripts and
  // styles. Network-first here would let a freshly deployed index.html run
  // against the previous version's cached JS for as long as the old worker
  // stays alive — which, with skipWaiting deliberately absent, can be weeks on
  // an installed phone. One policy for the whole shell keeps HTML and JS in
  // lockstep; new content still arrives via the library's stale-while-
  // revalidate, and new code arrives when the waiting worker activates.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html', { cacheName: SHELL_CACHE })
        .then((cached) => cached || fetch(request))
    );
    return;
  }

  if (url.pathname.endsWith(`/${LIBRARY_PATH}`)) {
    event.respondWith(staleWhileRevalidate(event, DATA_CACHE));
    return;
  }

  if (url.pathname.includes(`/${PHOTO_PREFIX}`)) {
    event.respondWith(cacheFirst(request, PHOTO_CACHE));
    return;
  }

  event.respondWith(cacheFirst(request, SHELL_CACHE));
});
