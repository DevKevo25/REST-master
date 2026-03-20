// ─── API Tester Service Worker ───────────────────────────────────────────────
const CACHE_NAME = 'apitester-v2';
const FONT_CACHE = 'apitester-fonts-v2';

// App shell files — everything needed to run offline
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Google Fonts URLs to pre-cache
const FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@400;600;700;800&display=swap'
];

// ─── Install: cache app shell ─────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate: clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: serve from cache, fall back to network ───────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google Fonts: cache-first (fonts rarely change)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const fresh = await fetch(event.request);
          cache.put(event.request, fresh.clone());
          return fresh;
        } catch {
          // Font failed, return empty response — app still works with system fonts
          return new Response('', { status: 200 });
        }
      })
    );
    return;
  }

  // App shell: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(fresh => {
          // Dynamically cache any new same-origin files
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, fresh.clone());
            return fresh;
          });
        }).catch(() => {
          // Fallback to index.html for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }

  // API requests (cross-origin) — always go to network, never intercept
  // This is critical: we must NOT cache or modify the user's actual API calls
  event.respondWith(fetch(event.request));
});
