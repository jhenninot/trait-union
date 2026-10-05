import { api } from './api.js'
import { deposerFichier, publier } from './reessais.js'

// Préparation et envoi des photos. Le navigateur réduit chaque photo en deux versions JPEG
// (miniature pour les grilles, plein écran pour l'affichage), puis les envoie directement
// chez l'hébergeur S3 avec des liens signés par le serveur, qui ne reçoit jamais les fichiers.
const VERSIONS = {
  miniature: { cote: 400, qualite: 0.8, max: 300 * 1024 },
  ecran: { cote: 2048, qualite: 0.85, max: 3 * 1024 * 1024 }
}

const versBlob = (canvas, qualite) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualite))

async function reduire(image, { cote, qualite, max }) {
  const echelle = Math.min(1, cote / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * echelle)
  canvas.height = Math.round(image.height * echelle)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white' // fond des images transparentes (PNG)
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  let blob = await versBlob(canvas, qualite)
  // Rare : une image très détaillée dépasse la limite, on baisse la qualité
  for (let q = qualite - 0.1; blob.size > max && q > 0.4; q -= 0.1) blob = await versBlob(canvas, q)
  if (blob.size > max) throw new Error('Cette photo est trop lourde, même réduite')
  return { blob, largeur: canvas.width, hauteur: canvas.height }
}

// Deux versions JPEG d'un fichier image, dans le bon sens (orientation EXIF appliquée)
export async function preparerPhoto(fichier) {
  let image
  try {
    image = await createImageBitmap(fichier, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(`« ${fichier.name} » n'est pas une image lisible par ce navigateur`)
  }
  try {
    const miniature = await reduire(image, VERSIONS.miniature)
    const ecran = await reduire(image, VERSIONS.ecran)
    return { miniature: miniature.blob, ecran: ecran.blob, largeur: ecran.largeur, hauteur: ecran.hauteur }
  } finally {
    image.close()
  }
}

// Date et lieu de prise de vue lus dans l'EXIF d'un JPEG (DateTimeOriginal, en heure locale de
// l'appareil photo ; GPS en degrés décimaux). À défaut de date, celle du fichier ; null si rien de crédible.
async function lireMetadonnees(fichier) {
  const resultat = { priseLe: null, latitude: null, longitude: null }
  try {
    const d = new DataView(await fichier.slice(0, 256 * 1024).arrayBuffer())
    if (d.getUint16(0) === 0xffd8) {
      let o = 2
      while (o + 4 < d.byteLength) {
        const marqueur = d.getUint16(o)
        const longueur = d.getUint16(o + 2)
        if (marqueur === 0xffe1 && d.getUint32(o + 4) === 0x45786966) { // « Exif »
          const exif = o + 10
          const petit = d.getUint16(exif) === 0x4949
          const u16 = (x) => d.getUint16(x, petit)
          const u32 = (x) => d.getUint32(x, petit)
          const texte = (x, n) => String.fromCharCode(...new Uint8Array(d.buffer, x, n))
          const chercher = (ifd, etiquette) => {
            const n = u16(ifd)
            for (let i = 0; i < n; i++) {
              const e = ifd + 2 + i * 12
              if (u16(e) === etiquette) return { nombre: u32(e + 4), valeur: u32(e + 8), enLigne: e + 8 }
            }
            return null
          }
          const ifd0 = exif + u32(exif + 4)
          const sous = chercher(ifd0, 0x8769)
          const entree = (sous && chercher(exif + sous.valeur, 0x9003)) ?? chercher(ifd0, 0x0132)
          if (entree && entree.nombre >= 19) {
            const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(texte(exif + entree.valeur, 19))
            if (m) {
              const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
              if (m[1] > '1900' && !Number.isNaN(date.getTime())) resultat.priseLe = date.toISOString()
            }
          }
          // GPS : latitude/longitude en degrés, minutes, secondes (3 fractions) et leur référence N/S, E/O
          const gps = chercher(ifd0, 0x8825)
          if (gps) {
            const ifdGps = exif + gps.valeur
            const coordonnee = (etiquetteRef, etiquette) => {
              const ref = chercher(ifdGps, etiquetteRef)
              const val = chercher(ifdGps, etiquette)
              if (!ref || !val || val.nombre !== 3) return null
              const base = exif + val.valeur
              const fraction = (i) => {
                const den = u32(base + i * 8 + 4)
                return den ? u32(base + i * 8) / den : NaN
              }
              const deg = fraction(0) + fraction(1) / 60 + fraction(2) / 3600
              const signe = ['S', 'W'].includes(String.fromCharCode(d.getUint8(ref.enLigne))) ? -1 : 1
              return Number.isFinite(deg) ? signe * deg : null
            }
            const latitude = coordonnee(0x0001, 0x0002)
            const longitude = coordonnee(0x0003, 0x0004)
            // (0, 0) : position vide écrite par certains appareils
            if (latitude != null && longitude != null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && (latitude || longitude)) {
              resultat.latitude = latitude
              resultat.longitude = longitude
            }
          }
          break
        }
        if ((marqueur & 0xff00) !== 0xff00) break
        o += 2 + longueur
      }
    }
  } catch { /* EXIF absent ou illisible : on se rabat sur la date du fichier */ }
  if (!resultat.priseLe && fichier.lastModified) resultat.priseLe = new Date(fichier.lastModified).toISOString()
  return resultat
}

// Prépare, envoie et publie une photo dans un cercle ; renvoie la photo publiée
export async function envoyerPhoto(cercleId, fichier, legende, albumId = null) {
  const [p, lieuEtDate] = await Promise.all([preparerPhoto(fichier), lireMetadonnees(fichier)])
  const { id, envois } = await api('POST', `/cercles/${cercleId}/photos`, {
    legende,
    ...lieuEtDate,
    albumId,
    largeur: p.largeur,
    hauteur: p.hauteur,
    tailles: { miniature: p.miniature.size, ecran: p.ecran.size }
  })
  await Promise.all([deposerFichier(envois.miniature, p.miniature, 'image/jpeg'), deposerFichier(envois.ecran, p.ecran, 'image/jpeg')])
  return publier(() => api('POST', `/cercles/${cercleId}/photos/${id}/publier`))
}

// Pseudo-album des photos rangées dans aucun album (tous cercles confondus)
export const NON_CLASSE = 'aucun'
const cerclesDe = (cercles, album) => (album?.cercleId ? cercles.filter((c) => c.id === album.cercleId) : cercles)

// Photos de tous les cercles de la personne accompagnée (en général un seul), les plus récentes
// d'abord. `album` : { cercleId, id } pour un seul album, ou l'album « Non classé ».
export async function photosAccompagne(cercles, album = null) {
  const filtre = album ? `&album=${album.id}` : ''
  const listes = await Promise.all(cerclesDe(cercles, album).map((c) => api('GET', `/cercles/${c.id}/photos?limite=200${filtre}`).catch(() => ({ photos: [] }))))
  return listes.flatMap((l) => l.photos).sort((a, b) => new Date(b.creeLe) - new Date(a.creeLe))
}

// Albums de tous les cercles de la personne accompagnée, avec le cercle de chacun. S'il y a des
// albums, les photos rangées nulle part forment l'album « Non classé », en dernier.
export async function albumsAccompagne(cercles) {
  const reponses = (await Promise.all(cercles.map((c) => api('GET', `/cercles/${c.id}/albums`)
    .then((r) => ({ ...r, cercleId: c.id }))
    .catch(() => null)))).filter(Boolean)
  const albums = reponses.flatMap((r) => r.albums.map((a) => ({ ...a, cercleId: r.cercleId })))
    .filter((a) => a.nombre > 0)
    .sort((a, b) => new Date(b.derniere) - new Date(a.derniere))
  const nombre = reponses.reduce((n, r) => n + r.sansAlbum, 0)
  if (albums.length && nombre) {
    albums.push({
      id: NON_CLASSE,
      cercleId: null,
      nom: 'Non classé',
      nombre,
      nouvelles: reponses.reduce((n, r) => n + (r.sansAlbumNouvelles ?? 0), 0),
      couverture: reponses.filter((r) => r.sansAlbumCouverture).sort((a, b) => new Date(b.sansAlbumDerniere) - new Date(a.sansAlbumDerniere))[0]?.sansAlbumCouverture ?? null
    })
  }
  return albums
}

export const datePrise = (p) => new Date(p.priseLe ?? p.creeLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
export const dateEnvoi = (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

// Albums où des photos sont arrivées depuis la dernière visite de la personne accompagnée,
// pour son écran d'accueil (les plus récents d'abord). `total` : nombre de photos visibles.
export async function nouveautesPhotos(cercles) {
  const reponses = await Promise.all(cercles.map((c) => api('GET', `/cercles/${c.id}/albums`)
    .then((r) => ({ ...r, cercleId: c.id }))
    .catch(() => null)))
  const listes = reponses.filter(Boolean)
  const avecAlbums = listes.some((r) => r.albums.some((a) => a.nombre > 0))
  const albums = listes.flatMap((r) => [
    ...r.albums.filter((a) => a.nouvelles > 0).map((a) => ({ ...a, cercleId: r.cercleId, lien: `/photos?album=${a.id}` })),
    // Photos non classées : leur album « Non classé » s'il y a des albums, sinon toutes les photos
    ...(r.sansAlbumNouvelles > 0
      ? [{ id: `aucun-${r.cercleId}`, nom: avecAlbums ? 'Non classé' : 'Mes photos', nouvelles: r.sansAlbumNouvelles, couverture: r.sansAlbumCouverture, derniere: r.sansAlbumDerniere, lien: `/photos?album=${avecAlbums ? NON_CLASSE : 'tous'}` }]
      : [])
  ])
  return {
    albums: albums.sort((a, b) => new Date(b.derniere) - new Date(a.derniere)),
    total: listes.reduce((n, r) => n + r.total, 0)
  }
}

// La personne connectée vient de regarder un album (null : toutes les photos)
export function marquerVu(cercles, album) {
  const cibles = cerclesDe(cercles, album)
  return Promise.all(cibles.map((c) => api('POST', `/cercles/${c.id}/albums/vus`, { album: album ? album.id : 'tous' }).catch(() => {})))
}
