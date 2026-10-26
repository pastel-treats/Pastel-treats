// Pastel Treats service worker: app shell offline, photos cached, data always fresh from the network.
const VERSION = 'pt-v6'
const SHELL = ['/', '/logo.svg', '/logo-mint.svg', '/manifest.webmanifest', '/icons/icon-192.png']
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())) })
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return // never cache API / payments
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put('/', cp)) } return r }).catch(() => caches.match('/')))
    return
  }
  if (url.pathname.endsWith('/config.js')) return // always fresh: holds the database connection
  if (/\.(js|css|svg|png|webp|jpg|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, cp)) } return r })))
  }
})

// Tapping a "New order" notification opens (or focuses) the baker's dashboard
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => c.url.includes('#/admin')) || list[0]
    return w ? w.focus() : self.clients.openWindow('./#/admin/orders')
  }))
})
