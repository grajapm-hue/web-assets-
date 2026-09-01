// Service worker for the SINGLE-FILE edition (PUBLISH-THIS-MathMatrix-v152.html).
//
// The stock sw.js caches a dozen separate files by name. In the single-file
// edition those files do not exist -- every picture, icon and the music live
// inside the page itself -- so the stock worker fails to install and you get
// no offline support at all.
//
// This one has only one thing to look after: the page.
//
// Upload BOTH files to your site:
//    PUBLISH-THIS-MathMatrix-v152.html  ->  index.html
//    sw-standalone.js                  ->  sw-standalone.js
//
// If you ever edit the page, change the version below so returning visitors are
// given the new copy instead of the old cached one.

const CACHE_VERSION = 'mathmatrix-standalone-v152';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(['./', './index.html'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Network first, so an edit you upload is picked up; the cache is the fallback
// for when there is no signal.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
      return res;
    }).catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html')))
  );
});
