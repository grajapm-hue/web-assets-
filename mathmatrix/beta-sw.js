// MathMatrix Pro++ BETA Service Worker — own cache namespace, own scope.

const CACHE_VERSION = 'mathmatrix-beta-v255';

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
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) =>
            k.startsWith('mathmatrix-beta-') && k !== CACHE_VERSION
          )
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  const isPage =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    /\.html(\?|$)/.test(req.url);

  if (isPage) {
    event.respondWith(
      (async () => {
        const cached = await caches
          .match(req)
          .then((c) => c || caches.match('./beta.html'));

        const controller =
          typeof AbortController !== 'undefined'
            ? new AbortController()
            : null;

        const timer = setTimeout(() => {
          try {
            if (controller) controller.abort();
          } catch (e) {}
        }, 2500);

        try {
          const response = await fetch(
            req,
            controller ? { signal: controller.signal } : undefined
          );

          clearTimeout(timer);

          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) =>
              cache.put(req, copy)
            );
          }

          return response;
        } catch (e) {
          clearTimeout(timer);
          return cached || Response.error();
        }
      })()
    );

    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) =>
              cache.put(req, copy)
            );
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});