/* eslint-disable no-restricted-globals */
// Mesmo kill-switch passivo mantido no segundo caminho usado por versões antigas.
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