// Offline: every game file goes into the cache on install and is served from it from then on.
// When any file in public/ changes, bump VERSION here and in game.js — otherwise devices stay on the old version.
// The music (public/music/) is not in the list: a track goes into its own cache when it is first played, and that
// cache outlives the versions, so an update does not download the music again.
// A new version installs in the background and takes over at once; the running page offers a reload on the home screen.
const VERSION = '0.28.0';
const CACHE = `fruit-v${VERSION}`;
const MUSIC = 'fruit-music-1';
const ASSETS = [
  './',
  'art.js',
  'audio.js',
  'data.js',
  'game.js',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'index.html',
  'manifest.webmanifest',
  'telemetry.js',
  'vendor/nunito-cyrillic-900-normal.woff2',
  'vendor/nunito-latin-900-normal.woff2',
  'view.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fruit-') && k !== CACHE && k !== MUSIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/healthz')) return;
  if (url.pathname.includes('/music/')) {
    e.respondWith(caches.open(MUSIC).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.status === 200) c.put(req, res.clone()).catch(() => {}); // no room: it is fetched again next time
      return res;
    }));
    return;
  }
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const page = await c.match('index.html');
        if (page) return page;
      }
      return fetch(req);
    }),
  );
});
