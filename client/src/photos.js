import { api } from './api.js'

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

async function deposer(lien, blob) {
  let reponse
  try {
    reponse = await fetch(lien, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } })
  } catch {
    throw new Error('L\'hébergeur des photos ne répond pas (connexion, ou autorisation CORS à refaire dans l\'administration)')
  }
  if (!reponse.ok) throw new Error(`L'hébergeur des photos a refusé l'envoi (erreur ${reponse.status})`)
}

// Prépare, envoie et publie une photo dans un cercle ; renvoie la photo publiée
export async function envoyerPhoto(cercleId, fichier, legende, albumId = null) {
  const p = await preparerPhoto(fichier)
  const { id, envois } = await api('POST', `/cercles/${cercleId}/photos`, {
    legende,
    albumId,
    largeur: p.largeur,
    hauteur: p.hauteur,
    tailles: { miniature: p.miniature.size, ecran: p.ecran.size }
  })
  await Promise.all([deposer(envois.miniature, p.miniature), deposer(envois.ecran, p.ecran)])
  return api('POST', `/cercles/${cercleId}/photos/${id}/publier`)
}

// Photos de tous les cercles de la personne accompagnée (en général un seul), les plus récentes
// d'abord. `album` : { cercleId, id } pour un seul album.
export async function photosAccompagne(cercles, album = null) {
  const cibles = album ? cercles.filter((c) => c.id === album.cercleId) : cercles
  const filtre = album ? `&album=${album.id}` : ''
  const listes = await Promise.all(cibles.map((c) => api('GET', `/cercles/${c.id}/photos?limite=200${filtre}`).catch(() => ({ photos: [] }))))
  return listes.flatMap((l) => l.photos).sort((a, b) => new Date(b.creeLe) - new Date(a.creeLe))
}

// Albums de tous les cercles de la personne accompagnée, avec le cercle de chacun
export async function albumsAccompagne(cercles) {
  const listes = await Promise.all(cercles.map((c) => api('GET', `/cercles/${c.id}/albums`)
    .then((r) => r.albums.map((a) => ({ ...a, cercleId: c.id })))
    .catch(() => [])))
  return listes.flat().filter((a) => a.nombre > 0).sort((a, b) => new Date(b.derniere) - new Date(a.derniere))
}

export const dateEnvoi = (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
