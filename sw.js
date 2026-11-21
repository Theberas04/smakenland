/* Smakenland offline-shell. Verhoog CACHE bij elke wijziging van de bestanden. */
const CACHE = 'smakenland-1.2.0';
const BESTANDEN = [
  './',
  'index.html',
  'styles.css',
  'content.js',
  'art.js',
  'levels.js',
  'engine.js',
  'sudoku.js',
  'app.js',
  'sudoku-view.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BESTANDEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((sleutels) => Promise.all(sleutels.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((gecached) => {
      if (gecached) return gecached;
      return fetch(e.request).then((antwoord) => {
        const kopie = antwoord.clone();
        caches.open(CACHE).then((c) => c.put(e.request, kopie)).catch(() => {});
        return antwoord;
      });
    }).catch(() => caches.match('index.html'))
  );
});
