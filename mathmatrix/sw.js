// MathMatrix Pro++ Service Worker — full offline support
// Bump CACHE_VERSION whenever you update the game HTML so kids get the new version.

const CACHE_VERSION = 'mathmatrix-v21';

const ASSETS = [
  './',
  './KidsMathsMatrixPuzzle.html',
  './manifest.json',
  './cheat-3x3.png',
  './cheat-4x4.png',
  './cheat-5x5.png',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// Install: cache everything the game needs
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first, so the game opens instantly with zero network.
// Falls back to network only for anything not cached, and silently
// updates the cache in the background when online.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached); // offline: whatever we have
      return cached || networkFetch;
    })
  );
});
