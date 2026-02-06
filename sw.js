const CACHE = "meteo-pwa-v2";
const ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.json", "./logo.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE ? caches.delete(k) : null)))
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // API: network-first
  if (url.hostname.includes("open-meteo.com")) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // App: cache-first
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
