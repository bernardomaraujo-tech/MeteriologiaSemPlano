/* sw.js — SEM PLANO Meteo */

const CACHE_VERSION = "semplano-meteo-v20260224_2";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./logo.png",
  "./manifest.json",

  "./day_clear.jpg",
  "./day_cloudy.jpg",
  "./day_fog.jpg",
  "./day_rain.jpg",
  "./day_storm.jpg",

  "./night_clear.jpg",
  "./night_cloudy.jpg",
  "./night_fog.jpg",
  "./night_rain.jpg",
  "./night_storm.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("semplano-meteo-") && k !== CACHE_VERSION)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só tratamos do nosso origin
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === "navigate" || req.headers.get("accept")?.includes("text/html");
  const isAsset =
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".json");

  if (isHTML) {
    // NETWORK FIRST
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || caches.match("./index.html");
      }
    })());
    return;
  }

  if (isAsset) {
    // STALE WHILE REVALIDATE
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);

      const fetchPromise = fetch(req)
        .then((fresh) => {
          cache.put(req, fresh.clone());
          return fresh;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch (e) {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
  })());
});




