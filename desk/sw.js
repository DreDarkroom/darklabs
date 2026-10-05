/* DarkDesk: keeps its own files so it opens with no signal. Network first, the stored copy as the fallback. Your notes are not in here: they stay in the page's own storage. */
const CACHE = 'darkdesk-v1';
const FILES = ['./', 'index.html', 'app.js', 'logic.js', 'vault.js', 'projects.js', 'desk.css', 'manifest.webmanifest', 'icon.svg', '../robots.css', '../robots.js', '../kit/prefs.js', '../kit/ctx.js'];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => {}))))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; }).catch(() => caches.match(r, { ignoreSearch: true })));
});
