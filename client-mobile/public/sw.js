// Minimaler, handgeschriebener Service Worker -- nur damit Chrome/Android die Seite als
// installierbare PWA erkennt (dafuer reicht ein Manifest mit Icons allein nicht, es wird ein
// registrierter Service Worker mit fetch-Handler verlangt). Kein Offline-Caching eingebaut,
// bewusst simpel gehalten: vite-plugin-pwa (workbox-build) scheiterte auf dem Server an
// "Dynamic require of workbox-build is not supported" (Node 18), siehe vite.config.js.
// Bei Bedarf spaeter durch echtes Caching ersetzen (Phase 4).

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})
