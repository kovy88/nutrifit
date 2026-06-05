// ── NutriFit Service Worker — offline cache
const CACHE_NAME = 'nutriplan-v9';
// Marketing landing only — the in-browser app was retired, so we no longer
// precache the old /js/* app bundle (kept the SW install from failing on
// removed files, and stops shipping dead code to visitors).
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/legal.html',
  '/delete-account.html',
  '/manifest.json',
  '/favicon.jpg',
  '/css/variables.css',
  '/css/layout.css',
  '/css/components.css',
  '/js/vercel-analytics.js',
];

// Install — cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first for app shell/API, stale-while-revalidate for static assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // API calls and external resources — network only (don't cache)
  if (url.pathname.startsWith('/api/') ||
      url.hostname !== self.location.hostname) {
    return;
  }

  // HTML navigace musí vždy zkusit síť, jinak po deployi zůstane stará aplikace.
  if (event.request.mode === 'navigate' ||
      event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }

  // Static assets — stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const fetched = fetch(event.request).then(response => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || fetched;
      })
    )
  );
});
