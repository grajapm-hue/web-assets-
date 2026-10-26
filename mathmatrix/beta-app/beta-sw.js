// MathMatrix Pro++ Beta Service Worker — Beta V201 SaNa Watch Rest Room.
// This worker and cache stay inside beta-app on the shared GitHub Pages origin.
const CACHE_VERSION = 'mathmatrix-beta-v201-sana-watch-rest-room';

const ASSETS = [
  './index.html',
  './beta.html',
  './criss-cross.html',
  './tunnels-of-meta.html',
  './cave-treasure-hunt.html',
  './treasure-hunt-landscape-prototype/index.html',
  './treasure-hunt-landscape-prototype/assets/interactive-treasure-hunt-maze-original/14-explorers-tired.webp',
  './MultiplyMagic3.html',
  './sound-lab.html',
  './qrcode.min.js',
  './bgm-monkeys.mp3',
  './beta-manifest.json',
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
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS.map((asset) => new Request(asset, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('mathmatrix-beta-') && key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
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
        const cache = await caches.open(CACHE_VERSION);
        const cached =
          await cache.match(req) ||
          await cache.match('./beta.html') ||
          await cache.match('./index.html');

        const controller =
          typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = setTimeout(() => {
          try { if (controller) controller.abort(); } catch (e) {}
        }, 2500);

        try {
          const response = await fetch(
            req,
            controller ? { signal: controller.signal } : undefined
          );
          clearTimeout(timer);
          if (response && response.ok) {
            cache.put(req, response.clone()).catch(() => {});
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
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);
      const networkFetch = fetch(req)
        .then((response) => {
          if (response && response.ok) {
            cache.put(req, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || networkFetch;
    })()
  );
});
