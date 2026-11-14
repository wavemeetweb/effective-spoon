const CACHE_NAME = 'meetly-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Ignore non-GET requests, Chrome extensions, Supabase, and PeerJS connections
  if (e.request.method !== 'GET' || 
      e.request.url.startsWith('chrome-extension') || 
      e.request.url.startsWith('wss:') ||
      e.request.url.includes('supabase') ||
      e.request.url.includes('peerjs')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Check if we received a valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        // Clone and cache
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        // Fallback to cache if offline
        return caches.match(e.request).then((cachedResponse) => {
          // If not in cache, return a valid empty response to prevent crash
          return cachedResponse || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});
