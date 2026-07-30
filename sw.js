// Cache name — bump this string with every release to force old caches
// to be cleared and users to be prompted to refresh
const CACHE_NAME = 'budget-app-v5.0.1';

// All app assets cached for offline use
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './version.json',
  './Icons/icon-192.png',
  './Icons/icon-512.png'
];

// Install — pre-cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // activate immediately instead of waiting for old tabs to close
});

// Activate — delete any caches that don't match the current CACHE_NAME
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim(); // take control of any already-open pages
});

// Fetch — serve from cache first, fall back to network if not cached
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});