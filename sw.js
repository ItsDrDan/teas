/* TEAS Study Hub offline support: pages and data load from the network when online
   (so updates show up right away) and from this cache when offline. */
const CACHE = "teas-hub-10";
const CORE = ["./", "index.html", "practice.html", "data/daily.json", "data/search.json", "data/learn.json", "data/glossary.json", "manifest.webmanifest"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("teas-hub-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // fonts, brand kit and stats go straight to the network
  const isAsset = url.pathname.includes("/assets/");
  if (isAsset) { // art rarely changes: cache first
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; })));
    return;
  }
  e.respondWith(fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; })
    .catch(() => caches.match(req, {ignoreSearch: true}).then(hit => hit || caches.match("index.html"))));
});
