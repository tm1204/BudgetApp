// Cache name — bump this string with every release to force old caches
// to be cleared and users to be prompted to refresh
const CACHE_NAME = 'budget-app-v5.3.2';

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

// Install — pre-cache all assets. Deliberately does NOT call skipWaiting()
// here: activating immediately would let this worker take control of pages
// that are still running the OLD app.js in memory, serving a mix of old
// in-memory JS and newly-cached assets before the user ever agreed to
// refresh. Instead this worker sits in "waiting" until app.js explicitly
// tells it to activate (see the 'message' listener below), which only
// happens once the user has confirmed the reload prompt.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Lets app.js hand control over to this worker only once the user has
// confirmed they want to update, rather than activating unprompted.
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
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