const CACHE_NAME = 'sep-controle-v11';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app-v4.css',
  './app-v5.css',
  './app-v6.css',
  './app-v5-preload.js',
  './app.js',
  './app-v4.js',
  './app-v5.js',
  './app-v5-compat.js',
  './app-v6.js',
  './gemba.html',
  './gemba-blob.html',
  './gemba.css',
  './gemba-original-download.css',
  './gemba-assignment.css',
  './gemba-core.js',
  './gemba-admin.js',
  './gemba-inspector.js',
  './gemba-blob-overrides.js',
  './gemba-assignment.js',
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
