// Service worker for the SINGLE-FILE edition (MathsMatrix-puzzle-v1.31.1.html).
//
// The stock sw.js caches sixteen separate files by name. In the single-file
// edition those files do not exist — every picture, icon and the music live
// inside the page itself — so the stock worker fails to install and you get no
// offline support at all.
//
// This one has only one thing to look after: the page.
//
// Upload BOTH files to your site:
//    MathsMatrix-puzzle-v1.31.1.html  ->  index.html
//    sw-standalone.js                 ->  sw-standalone.js
//
// If you ever edit the page, change the version below so returning visitors are
// given the new copy instead of the old cached one.

const CACHE_VERSION = 'mathsmatrix-puzzle-v1.31';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(['./', './index.html']))
      .then(() => self.skipWaiting())
      // If one of those two is missing we still install; the fetch handler below
      // will fill the cache from the first successful visit.
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, cache second: online you always get the newest page,
// offline you get the last copy that worked.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!req.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
