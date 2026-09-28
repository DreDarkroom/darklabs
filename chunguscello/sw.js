// ChungusCello service worker: makes the instrument installable and playable
// offline. Network-first (so updates land straight away), cache as fallback.
const CACHE = "chunguscello-v1";
const CORE = [
  "./", "index.html", "style.css", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png",
  "js/app.js", "js/engine.js", "js/cello-worklet.js", "js/fx.js", "js/theory.js", "js/pitch.js", "js/store.js",
  "js/sampler.js", "js/looper.js", "js/phrases.js", "js/midi.js", "js/presets.js", "js/fingerboard.js",
  "js/controls.js", "js/files.js", "js/vr.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("chunguscello-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // only handle our own folder (and the borrowed MeowSynth / ThroatTapper sounds)
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
