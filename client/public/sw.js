// Service worker de Trait d'union : rend l'application installable et affiche une page
// « hors ligne » quand il n'y a pas de réseau. Les données (/api) ne sont jamais mises en cache :
// elles concernent des personnes et doivent toujours être à jour.
// Il reçoit aussi les photos partagées vers la PWA installée (share_target du manifeste)
// et affiche les alertes envoyées par le serveur (Web Push, server/alertes/envoi.js).
const VERSION = 'v3'
const CACHE = `trait-union-${VERSION}`
const HORS_LIGNE = '/hors-ligne.html'
const A_PRECHARGER = [HORS_LIGNE, '/icones/icone-192.png', '/manifest.webmanifest']
// Photos partagées en attente, lues puis effacées par la page /recevoir (src/partage.js)
const CACHE_PARTAGE = 'trait-union-partage'
const MAX_RECUES = 30

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(A_PRECHARGER)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE && c !== CACHE_PARTAGE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  )
})

// Photos partagées depuis une autre application : gardées dans un cache, puis la page les propose
async function recevoirPartage(request) {
  try {
    const donnees = await request.formData()
    const fichiers = donnees.getAll('photos').filter((f) => f instanceof File && f.type.startsWith('image/'))
    await caches.delete(CACHE_PARTAGE)
    const cache = await caches.open(CACHE_PARTAGE)
    await Promise.all(fichiers.slice(0, MAX_RECUES).map((f, i) => cache.put(
      `/partage-recu/${i}`,
      new Response(f, { headers: { 'Content-Type': f.type, 'X-Nom': encodeURIComponent(f.name || 'photo.jpg') } })
    )))
  } catch {
    // Rien de lisible : la page dira qu'aucune photo n'est en attente
  }
  return Response.redirect('/recevoir', 303)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method === 'POST' && url.origin === location.origin && url.pathname === '/partage-recu') {
    event.respondWith(recevoirPartage(request))
    return
  }
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

// --- Alertes : { titre, corps, url, tag, image } envoyées par le serveur
self.addEventListener('push', (event) => {
  let alerte = {}
  try {
    alerte = event.data?.json() ?? {}
  } catch {
    alerte = { corps: event.data?.text() }
  }
  event.waitUntil(self.registration.showNotification(alerte.titre || 'Trait d\'union', {
    body: alerte.corps || '',
    icon: '/icones/icone-192.png',
    badge: '/icones/badge-96.png',
    image: alerte.image || undefined,
    tag: alerte.tag || undefined,
    renotify: Boolean(alerte.tag),
    lang: 'fr',
    data: { url: alerte.url || '/' }
  }))
})

// Toucher l'alerte ouvre la bonne page, dans une fenêtre déjà ouverte si possible
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', location.origin)
  if (url.origin !== location.origin) return
  event.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const fenetre = fenetres.find((f) => new URL(f.url).origin === location.origin)
    if (fenetre) {
      await fenetre.focus()
      return fenetre.navigate(url.href).catch(() => self.clients.openWindow(url.href))
    }
    return self.clients.openWindow(url.href)
  })())
})
