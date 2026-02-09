/* sw.js — SEM PLANO Meteo (stable) */

const CACHE_VERSION = "semplano-meteo-v20260209_1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./logo.png",
  "./favicon.ico",
  "./manifest.webmanifest"
];

// Instala: guarda o “app shell”
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL);
    // força o SW a ficar ativo logo
    await self.skipWaiting();
  })());
});

// Ativa: limpa caches antigas e assume controlo
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

// Fetch: network-first para HTML (sempre tentar ir buscar novo)
//       stale-while-revalidate para css/js/img
//       never-cache para APIs externas (open-meteo, windy, etc.)
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
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith(".webmanifest");

  if (isHTML) {
    // NETWORK FIRST (para apanhar updates)
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
    // STALE WHILE REVALIDATE (rápido e atualiza em background)
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

  // Default: tenta rede, fallback para cache
  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch (e) {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
  })());
});
