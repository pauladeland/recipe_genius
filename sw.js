/* Service worker. Runs in its own global scope — it CANNOT import anything
   from js/. Constants duplicated here are guarded by test/sw.test.mjs.

   Bump CACHE_VERSION whenever anything under js/ or css/ changes. CI fails
   the build if you forget (.github/workflows/test.yml), because a stale
   precache serving old JS against a new library.json is invisible locally
   and broken in the kitchen. */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;
const PHOTO_CACHE = 'photos'; // deliberately unversioned — photo bytes never
                              // change under a filename, and re-downloading
                              // every JPEG on each release is pure waste.

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
];

self.addEventListener('install', (event) => {
  // No skipWaiting() — a new worker waits until every tab using the old one
  // is gone. Swapping the app out from under someone mid-recipe is the one
  // failure this app cannot afford.
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, DATA_CACHE, PHOTO_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/** Stale-while-revalidate: answer from cache now, refresh for next time. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const fresh = await network;
  if (fresh) return fresh;
  // Offline with nothing cached yet. An empty-but-valid library lets the app
  // render its own empty state instead of throwing a parse error.
  return new Response('{"meta":{},"avoidances":[],"protocols":[],"recipes":[]}', {
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Cache-first, and remember anything new. Used for the shell and photos. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Hash routing means every route is the same document; if a navigation
  // can't reach the network, the cached shell is always the right answer.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('index.html', { cacheName: SHELL_CACHE }))
    );
    return;
  }

  if (url.pathname.endsWith('/data/library.json')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.pathname.includes('/assets/photos/')) {
    event.respondWith(cacheFirst(request, PHOTO_CACHE));
    return;
  }

  event.respondWith(
    cacheFirst(request, SHELL_CACHE).catch(() => caches.match(request, { cacheName: SHELL_CACHE }))
  );
});
