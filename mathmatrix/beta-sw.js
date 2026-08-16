// MathMatrix Pro++ BETA Service Worker — own cache namespace, own scope.
// Bump CACHE_VERSION whenever BETA_VER bumps in beta.html, same discipline as
// the real sw.js/CACHE_VERSION pair, so a stale cache can never outlive a
// fresh version label.
//
// Raja, after three rounds landing on the same wall — "install"/"download"
// can only ever fall back to the same manual instructions without a real
// manifest: build the real thing now. This file exists so that decision
// doesn't cost the fast-iteration workflow beta has always had — same
// network-first-for-HTML strategy the real sw.js already uses (v57 there,
// "instant updates on 1 refresh, cache-first for assets, offline fallback"),
// reused here rather than reinvented.

const CACHE_VERSION = 'mathmatrix-beta-v147';

const ASSETS = [
  './beta.html',
  './beta-manifest.json',
  './bgm-monkeys.mp3',
  './cheat-3x3.png',
  './cheat-4x4.png',
  './cheat-5x5.png',
  './cheat-6x6.png',
  './cheat-8x8.png',
  './cheat-10x10.png',
  './cheat-3cube.png',
  './cheat-ramanujan.jpg',
  // No cheat-binary.png here. It has never existed (beta.html says so itself,
  // where the CHEAT map deliberately has no 'binary' entry) -- and listing a
  // file that 404s is not a harmless spare line: cache.addAll() rejects if ANY
  // single request fails, so the install event failed and this worker cached
  // NOTHING. Beta's offline play has been silently dead the whole time it was
  // listed. Found while auditing both asset lists before the promotion.
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// Install: cache everything the beta needs
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old beta cache versions only — never touches the real
// app's own 'mathmatrix-v*' caches, different namespace entirely.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k.startsWith('mathmatrix-beta-') && k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy — identical shape to the real sw.js:
//  • Pages (HTML / navigations): NETWORK-FIRST — always load the newest
//    version when online, so a version bump shows on a single refresh. Falls
//    back to the cached page only when offline.
//  • Everything else (images, icons, manifest, bgm): CACHE-FIRST for instant,
//    offline loads, with a quiet background refresh.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const isPage = req.mode === 'navigate' || req.destination === 'document' || /\.html(\?|$)/.test(req.url);

  if (isPage) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return response;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./beta.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return response;
        })
        .catch(() => cached); // offline: whatever we have
      return cached || networkFetch;
    })
  );
});
