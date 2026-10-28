// JARVIS service worker: caches the app shell so JARVIS opens offline.
// Bump CACHE when files change; old caches are removed on activate (rollback = redeploy previous version).
const CACHE = 'jarvis-shell-v0.1.1';
const SHELL = ['./', './index.html', './css/style.css', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './js/app.js', './js/engine.js', './js/parser.js', './js/dates.js', './js/store.js', './js/backup.js', './js/permissions.js', './js/apps.js', './js/voice.js', './js/storage.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('jarvis-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return; // never touch other sites
  // network-first for same-origin (fresh updates), fallback to cache when offline
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && (url.origin === self.location.origin || isFont)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./'))));
});
