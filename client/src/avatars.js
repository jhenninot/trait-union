import { api } from './api.js'
import { deposerFichier } from './reessais.js'

// Avatars : une photo recadrée en carré dans le navigateur (RecadrageAvatar.vue) puis envoyée directement chez
// l'hébergeur S3. Les anciens modèles 3D (client/public/avatars/) restent affichés mais ne sont plus proposés.

const COTE = 320 // px
const TAILLE_MAX = 200 * 1024

const versBlob = (canvas, qualite) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualite))

// Ouvre une image choisie par la personne, déjà tournée selon ses données EXIF
export async function ouvrirImage(fichier) {
  try {
    return await createImageBitmap(fichier, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Ce fichier n\'est pas une image lisible par ce navigateur')
  }
}

// Découpe le carré choisi dans l'écran de recadrage (sx, sy, cote en pixels de l'image source)
// et le réduit en carré de 320 px JPEG, compressé sous 200 Ko
export async function recadrer(source, { sx, sy, cote }) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = COTE
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white' // fond des images transparentes (PNG)
  ctx.fillRect(0, 0, COTE, COTE)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, sx, sy, cote, cote, 0, 0, COTE, COTE)
  let blob = await versBlob(canvas, 0.85)
  for (let q = 0.75; blob.size > TAILLE_MAX && q > 0.4; q -= 0.1) blob = await versBlob(canvas, q)
  return blob
}

// `base` : '/profil' pour soi-même, ou '/cercles/<id>/membres/<id>' pour une personne accompagnée.
// Renvoient { avatar (adresse de l'image), avatarChoix }.
export const choisirAvatar = (base, choix) => api('PUT', `${base}/avatar`, { avatar: choix })

// Photos supplémentaires d'une personne de l'arbre (jeux) : `base` = '/cercles/<id>/arbre/personnes/<id>'.
// Renvoie la liste [{ id, url }] mise à jour.
export async function ajouterPhotoJeu(base, blob) {
  const { photo, envoi } = await api('POST', `${base}/photos/envoi`, { taille: blob.size })
  await deposerFichier(envoi, blob, 'image/jpeg')
  return api('POST', `${base}/photos`, { photo })
}
export const retirerPhotoJeu = (base, photoId) => api('DELETE', `${base}/photos/${photoId}`)

// `blob` : la photo déjà recadrée (voir recadrer)
export async function envoyerPhotoAvatar(base, blob) {
  const { photo, envoi } = await api('POST', `${base}/avatar/envoi`, { taille: blob.size })
  await deposerFichier(envoi, blob, 'image/jpeg')
  return choisirAvatar(base, photo)
}
