// Service worker de Trait d'union : rend l'application installable et affiche une page
// « hors ligne » quand il n'y a pas de réseau. Les données (/api) ne sont jamais mises en cache :
// elles concernent des personnes et doivent toujours être à jour.
const VERSION = 'v1'
const CACHE = `trait-union-${VERSION}`
const HORS_LIGNE = '/hors-ligne.html'
const A_PRECHARGER = [HORS_LIGNE, '/icones/icone-192.png', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(A_PRECHARGER)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return

  // Pages : toujours le réseau (index.html à jour), la page hors ligne en secours
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(HORS_LIGNE)))
    return
  }

  // Fichiers de la page hors ligne : le réseau, le cache en secours
  if (A_PRECHARGER.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(request)))
    return
  }

  // Fichiers compilés par Vite (nom avec empreinte, donc immuables) : le cache d'abord
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((enCache) => enCache || fetch(request).then((reponse) => {
        if (reponse.ok) {
          const copie = reponse.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copie))
        }
        return reponse
      }))
    )
  }
})
