/* Afonso — minimal app-shell service worker.
   NetworkFirst for HTML navigations, CacheFirst for hashed assets.
   Bumps CACHE_VERSION to invalidate old caches on release. */
const CACHE_VERSION = "v3";
const RUNTIME_CACHE = `assessor-runtime-${CACHE_VERSION}`;
const ASSET_CACHE = `assessor-assets-${CACHE_VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("assessor-") && n !== RUNTIME_CACHE && n !== ASSET_CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

function isHashedAsset(url) {
  // Ficheiros de marca na raiz (ícones, favicon, manifest) mudam sem hash no
  // nome — nunca podem ficar presos em cache, senão o ícone antigo persiste.
  if (/^\/(favicon|icon-|apple-touch-icon|manifest)/.test(url.pathname)) return false;
  return /\/_build\/|\/assets\/|\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept API/webhook/mcp/OAuth traffic.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/.mcp") ||
    url.pathname.startsWith("/.well-known") ||
    url.pathname.startsWith("/~oauth")
  ) return;

  if (req.mode === "navigate") {
    // Arranque a frio da app instalada: o start_url foi congelado na
    // instalação e pode ainda apontar para a conversa. Reencaminhamos para
    // "Hoje" sem obrigar a reinstalar.
    const coldLaunch =
      req.headers.get("sec-fetch-site") === "none" && !req.referrer;
    if (coldLaunch && /^\/(assessor)?$/.test(url.pathname)) {
      event.respondWith(Response.redirect(new URL("/hoje", self.location.origin).href, 302));
      return;
    }
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback = await caches.match("/assessor");
          if (fallback) return fallback;
          return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })(),
    );
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      })(),
    );
  }
});