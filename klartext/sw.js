// KlartextKit service worker: makes the kit installable and usable offline. Network-first (so updates land straight away), cache as the fallback.
// Only the small core is pre-cached; each tool is cached the first time you open it, so a phone never stores tools it does not use.
const CACHE = "klartext-v3";
const CORE = ["./", "index.html", "kk.css", "brand.json", "manifest.webmanifest", "icon-192.png", "icon-512.png",
  "core/app.js", "core/dom.js", "core/store.js", "core/tts.js", "core/attend.js", "core/vr.js", "core/perf.js", "core/brand.js", "core/color.js", "core/registry.js", "core/progress.js", "core/prefs.js", "core/srs.js", "core/select.js", "core/german.js",
  "data/cats.js", "modules/ui.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()).catch(() => {}));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("klartext-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.includes("/klartext/")) return;   // only this kit's own files (the VR room's three.js is fetched online)
  e.respondWith(
    fetch(req, { cache: "no-cache" }).then((res) => {   // always ask the server (a cheap 304 when unchanged), so an update is never hidden by the browser's own 10-minute cache
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
