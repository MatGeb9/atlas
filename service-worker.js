const CACHE = 'atlas-v6';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './vendor/globe.gl.min.js',
  './vendor/textures/earth-night.jpg',
  './vendor/textures/earth-blue-marble.jpg',
  './vendor/textures/earth-dark.jpg',
  './vendor/textures/earth-topology.png',
  './vendor/textures/night-sky.png',
  './vendor/countries-110m.geojson',
  './js/main.js',
  './js/store.js',
  './js/db.js',
  './js/util.js',
  './js/geocode.js',
  './js/globe.js',
  './js/form.js',
  './js/views.js',
  './js/sync.js',
  './js/autosave.js',
  './js/countries.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // On ne met en cache que le même origine (les API externes restent en ligne).
  const sameOrigin = new URL(e.request.url).origin === location.origin;
  if (!sameOrigin) return; // laisse passer Nominatim / esm.sh / Supabase normalement
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(e.request).then((cached) => {
        const fetched = fetch(e.request).then((resp) => {
          // On ne (re)cache que des réponses propres, non redirigées (évite
          // l'empoisonnement du cache et le bug 'redirected' en navigation).
          if (resp.ok && !resp.redirected && resp.type === 'basic') {
            cache.put(e.request, resp.clone());
          }
          return resp;
        }).catch(() => cached);
        return cached || fetched;
      })
    )
  );
});
