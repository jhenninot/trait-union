import { lienSigne, supprimerObjet } from '../stockage/s3.js'

// Photos et messages vocaux de la messagerie : comme les photos du cercle, ils sont chez
// l'hébergeur S3 (cercles/<cercle>/messages/<message>/...), envoyés et lus directement par le
// navigateur avec des liens signés. Le serveur ne reçoit jamais les fichiers.
export const VARIANTES_PHOTO = { miniature: 300 * 1024, ecran: 3 * 1024 * 1024 } // taille maximale en octets
export const VOCAL_MAX = 3 * 1024 * 1024
export const DUREE_VOCAL_MAX = 120 // secondes
// Formats enregistrés par les navigateurs (MediaRecorder) : Chrome et Android en WebM ou Ogg, Safari en MP4
export const FORMATS_VOCAL = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac' }

const HEURE = 3600 * 1000
const FENETRE_AFFICHAGE = 6 * HEURE
const DUREE_AFFICHAGE = 12 * 3600
export const DUREE_ENVOI = 15 * 60

const dossier = (message) => `cercles/${message.cercleId}/messages/${message.id}`
export const clePhoto = (message, variante) => `${dossier(message)}/${variante}.jpg`
export const cleVocal = (message) => `${dossier(message)}/vocal.${message.fichier?.extension ?? 'webm'}`

// Clés de tous les fichiers d'un message
export function clesFichiers(message) {
  if (message.type === 'photo') return Object.keys(VARIANTES_PHOTO).map((v) => clePhoto(message, v))
  if (message.type === 'vocal') return [cleVocal(message)]
  return []
}

// Lien de lecture, identique pendant quelques heures pour que le navigateur garde le fichier en cache
export function lienLecture(stockage, cle) {
  const date = new Date(Math.floor(Date.now() / FENETRE_AFFICHAGE) * FENETRE_AFFICHAGE)
  return lienSigne(stockage, 'GET', cle, { duree: DUREE_AFFICHAGE, date, query: { 'response-cache-control': 'private, max-age=43200' } })
}

export async function supprimerFichiers(stockage, message) {
  if (!stockage) return
  for (const cle of clesFichiers(message)) await supprimerObjet(stockage, cle)
}
