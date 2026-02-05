const CACHE_NAME = 'unoric-v1.3';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './css/socios.css',
  './css/lotes.css',
  './css/pagos.css',
  './js/app.js',
  './js/config.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch events
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).then((response) => {
        // Cache rules: 
        // 1. Only GET requests
        // 2. Not Supabase calls
        // 3. Valid response
        if (
          event.request.method === 'GET' && 
          !event.request.url.includes('supabase.co') &&
          response.status === 200
        ) {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        }
        return response;
      });
    }).catch(() => {
        // Fallback or handle offline
    })
  );
});
