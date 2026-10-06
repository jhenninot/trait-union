import { reactive } from 'vue'
import { api } from './api.js'
import { fermerAide } from './aide.js'
import { dernieresActions } from './journal.js'

// Signalement d'un bug par un utilisateur : le formulaire (navigation/FenetreSignalement.vue,
// monté dans App.vue) s'ouvre depuis le menu et depuis l'aide. Envoi par email aux administrateurs
// via POST /api/signalements (server/signalement.js).
export const MAX_CAPTURES = 3
export const signalement = reactive({ ouvert: false })

export function ouvrirSignalement() {
  fermerAide()
  signalement.ouvert = true
}
export const fermerSignalement = () => { signalement.ouvert = false }

// Informations techniques jointes (l'utilisateur peut les retirer)
export function contexteTechnique() {
  return {
    page: location.pathname,
    navigateur: navigator.userAgent,
    fenetre: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio || 1}x`,
    connexion: navigator.onLine ? 'en ligne' : 'hors ligne',
    heure: new Date().toString(),
    actions: dernieresActions().join('\n')
  }
}

const lire = (blob) => new Promise((resolve, reject) => {
  const lecteur = new FileReader()
  lecteur.onload = () => resolve(lecteur.result)
  lecteur.onerror = () => reject(lecteur.error)
  lecteur.readAsDataURL(blob)
})

// Réduit une capture (1600 px au plus, JPEG) pour rester sous la limite des pièces jointes
export async function reduireCapture(fichier) {
  let image
  try { image = await createImageBitmap(fichier, { imageOrientation: 'from-image' }) } catch { throw new Error(`« ${fichier.name || 'Ce fichier'} » n'est pas une image lisible`) }
  const echelle = Math.min(1, 1600 / Math.max(image.width, image.height))
  const toile = document.createElement('canvas')
  toile.width = Math.round(image.width * echelle)
  toile.height = Math.round(image.height * echelle)
  const ctx = toile.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, toile.width, toile.height)
  ctx.drawImage(image, 0, 0, toile.width, toile.height)
  const blob = await new Promise((resolve) => toile.toBlob(resolve, 'image/jpeg', 0.8))
  if (!blob) throw new Error('Image illisible')
  return { nom: (fichier.name || 'capture').replace(/\.[^.]+$/, '') + '.jpg', blob, apercu: URL.createObjectURL(blob) }
}

export async function envoyerSignalement({ description, attendu, captures, contexte }) {
  const pieces = await Promise.all(captures.map(async (c) => ({ nom: c.nom, donnees: await lire(c.blob) })))
  return api('POST', '/signalements', { description, attendu, contexte, pieces })
}
