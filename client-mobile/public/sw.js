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

// ── Web-Push (Mitteilungen) ──
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { titel: 'Randl Portal', text: event.data && event.data.text() } }
  event.waitUntil(self.registration.showNotification(d.titel || 'Randl Portal', {
    body: d.text || '',
    icon: '/mobile/icons/icon-192.png',
    badge: '/mobile/icons/icon-96.png',
    tag: d.art || 'portal',
    renotify: true,
    data: { link: d.link || '/mobile/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const ziel = new URL((event.notification.data && event.notification.data.link) || '/mobile/', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenster) => {
    const offen = fenster.find((c) => c.url.startsWith(self.location.origin + '/mobile/'))
    if (offen) return offen.navigate(ziel).then((c) => c && c.focus())
    return self.clients.openWindow(ziel)
  }))
})
