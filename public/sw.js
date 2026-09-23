/* eslint-disable no-restricted-globals */
// Kill-switch passivo do antigo app-shell. Não possui fetch handler e nunca
// recarrega clientes: URLs temporárias de preview não podem ser reutilizadas.
function isLegacyAppCache(name) {
  return /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-|workbox|vite-pwa|mci.*(?:app|shell|asset)/i.test(name);
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.allSettled(names.filter(isLegacyAppCache).map((name) => caches.delete(name)));
    } finally {
      await self.registration.unregister();
    }
  })());
});