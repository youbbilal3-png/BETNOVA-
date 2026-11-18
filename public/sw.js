const CACHE_NAME = 'betnova-static-v4';
const APP_SHELL = ['/betnova-icon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => undefined));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('betnova-static-') && key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Keep HTML and API data fresh. Cache only versioned static assets.
  if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.svg')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const network = fetch(request).then(response => {
        if (response.ok && response.type !== 'opaque') void cache.put(request, response.clone());
        return response;
      });
      return cached || network.catch(() => Response.error());
    })());
  }
});
