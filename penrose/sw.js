// Penrose service worker: installable and playable offline. Network-first (so updates land straight
// away) with the cache as fallback. Bump CACHE with every release that changes a file in CORE.
const CACHE = "penrose-v2";
const CORE = ["./", "index.html", "style.css", "manifest.webmanifest", "icon.svg",
  "js/app.js", "js/engine.js", "js/conductor.js", "js/dsp.js", "js/theory.js", "js/visuals.js", "js/midi.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()).catch(() => {})); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("penrose-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => { if (res.ok && res.type === "basic") { const c = res.clone(); caches.open(CACHE).then((x) => x.put(req, c)); } return res; })
    .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error()))));
});
