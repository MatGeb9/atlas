const CACHE = 'atlas-v14';
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
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // externes (Nominatim/esm.sh/Supabase) en direct

  // Vendor (moteur, textures, geojson) : gros et statiques → cache-first.
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(caches.open(CACHE).then((cache) =>
      cache.match(e.request).then((cached) => cached || fetch(e.request).then((resp) => {
        if (resp.ok && resp.type === 'basic') cache.put(e.request, resp.clone());
        return resp;
      }))));
    return;
  }

  // App (HTML/JS/CSS) : RÉSEAU D'ABORD → toujours la dernière version en ligne,
  // repli sur le cache hors-ligne. Évite de rester bloqué sur une vieille version.
  e.respondWith(
    fetch(e.request).then((resp) => {
      if (resp.ok && !resp.redirected && resp.type === 'basic') {
        const clone = resp.clone();
        caches.open(CACHE).then((cache) => cache.put(e.request, clone));
      }
      return resp;
    }).catch(() => caches.open(CACHE).then((cache) =>
      cache.match(e.request).then((c) => c || (e.request.mode === 'navigate' ? cache.match('./index.html') : Response.error()))))
  );
});
