// Offline support: cache the app shell, serve it when there is no network.
const CACHE = 'budget-elias-v6';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.json', 'icon.svg', 'sync.js', 'sync-core.js', 'firebase-config.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first so updates show up right away; fall back to cache when offline.
self.addEventListener('fetch', (e) => {
  // Only handle this app's own files; Firebase and fonts go straight to the network.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
