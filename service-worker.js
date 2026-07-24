const CACHE_NAME = 'sep-controle-v8';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app-v4.css',
  './app.js',
  './app-v4.js',
  './gemba.html',
  './gemba.css',
  './gemba-diagnostics.css',
  './gemba-core.js',
  './gemba-token-diagnostic.js',
  './gemba-admin.js',
  './gemba-inspector.js',
  './gemba-actions-bridge.js',
  './gemba-init.js',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
