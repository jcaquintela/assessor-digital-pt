// Guarded service worker registration. Skips dev, iframe/preview, and ?sw=off.
// In refused contexts, unregisters any existing /sw.js so stale caches evict.

const SW_PATH = "/sw.js";

function isRefusedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.top !== window.self) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterOwn() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => r.active?.scriptURL.endsWith(SW_PATH) || r.installing?.scriptURL.endsWith(SW_PATH) || r.waiting?.scriptURL.endsWith(SW_PATH))
      .map((r) => r.unregister()),
  );
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (isRefusedContext()) {
    void unregisterOwn();
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_PATH, { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        // Força a procura de uma versão nova a cada arranque, para que
        // correções de arranque cheguem sem reinstalar a app.
        void reg.update();
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "activated") void reg.update();
          });
        });
      })
      .catch((err) => console.warn("[pwa] SW register failed", err));
  });
}