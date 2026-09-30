import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from './db/index.js'
import { utilisateurs } from './db/schema.js'
import { ErreurSaisie } from './auth/validation.js'
import { stockageActif, lienSigne, infoObjet, supprimerObjet } from './stockage/s3.js'

// Avatar d'un compte, enregistré dans utilisateurs.avatar :
// - « modele:<id> » : un des modèles 3D fournis avec l'application (client/public/avatars/<id>.webp)
// - « photo:<jeton> » : une photo recadrée en carré par le navigateur et envoyée directement chez
//   l'hébergeur S3, comme les photos des cercles ; le serveur ne la reçoit jamais.
// Sans avatar, l'application affiche l'initiale du prénom.

const TAILLE_MAX = 200 * 1024 // octets (photo JPEG de 320 × 320 px)
const DUREE_ENVOI = 15 * 60
const HEURE = 3600 * 1000
// Même principe que les photos : lien stable 6 h, valable 12 h, pour le cache du navigateur
const FENETRE_AFFICHAGE = 6 * HEURE
const DUREE_AFFICHAGE = 12 * 3600

const cleObjet = (utilisateurId, jeton) => `avatars/${utilisateurId}/${jeton}.jpg`

// Adresse de l'image d'un avatar enregistré, ou null (pas d'avatar, ou photo sans stockage configuré)
export function lienAvatar(stockage, utilisateurId, avatar) {
  if (!avatar) return null
  const [type, valeur] = avatar.split(':')
  if (type === 'modele') return `/avatars/${valeur}.webp`
  if (type !== 'photo' || !stockage) return null
  const date = new Date(Math.floor(Date.now() / FENETRE_AFFICHAGE) * FENETRE_AFFICHAGE)
  return lienSigne(stockage, 'GET', cleObjet(utilisateurId, valeur), {
    duree: DUREE_AFFICHAGE,
    date,
    query: { 'response-cache-control': 'private, max-age=43200' }
  })
}

// Fonction (utilisateurId, avatar) → adresse, avec la configuration du stockage lue une seule fois.
// Pratique pour présenter une liste de personnes.
export async function liensAvatars() {
  const stockage = await stockageActif()
  return (utilisateurId, avatar) => lienAvatar(stockage, utilisateurId, avatar)
}

// Avatar prêt à envoyer au navigateur : l'adresse de l'image et le choix enregistré
export async function presenterAvatar(utilisateur) {
  const lien = await liensAvatars()
  return { avatar: lien(utilisateur.id, utilisateur.avatar), avatarChoix: utilisateur.avatar ?? null }
}

// 1re étape d'un changement de photo : lien d'envoi signé pour une nouvelle photo
export async function preparerEnvoi(utilisateurId, taille) {
  const stockage = await stockageActif()
  if (!stockage) throw new ErreurSaisie('Le stockage des photos n\'est pas encore configuré par l\'administrateur')
  taille = Number(taille)
  if (!Number.isInteger(taille) || taille <= 0) throw new ErreurSaisie('Taille de photo invalide')
  if (taille > TAILLE_MAX) throw new ErreurSaisie('Photo trop lourde')
  const jeton = crypto.randomBytes(8).toString('hex')
  const envoi = lienSigne(stockage, 'PUT', cleObjet(utilisateurId, jeton), {
    duree: DUREE_ENVOI,
    entetes: { 'content-type': 'image/jpeg', 'content-length': taille }
  })
  return { photo: `photo:${jeton}`, envoi }
}

// Enregistre le nouvel avatar (null pour revenir à l'initiale) et supprime l'ancienne photo
export async function changerAvatar(utilisateur, choix) {
  let avatar = null
  const stockage = await stockageActif()
  if (choix != null && choix !== '') {
    const [, type, valeur] = String(choix).match(/^(modele|photo):([a-z0-9-]{1,60})$/) ?? []
    if (!type) throw new ErreurSaisie('Avatar invalide')
    if (type === 'photo' && choix !== utilisateur.avatar) {
      if (!stockage) throw new ErreurSaisie('Le stockage des photos n\'est pas encore configuré par l\'administrateur')
      if (!await infoObjet(stockage, cleObjet(utilisateur.id, valeur))) {
        throw new ErreurSaisie('La photo n\'est pas arrivée chez l\'hébergeur, réessayez')
      }
    }
    avatar = `${type}:${valeur}`
  }
  await db.update(utilisateurs).set({ avatar }).where(eq(utilisateurs.id, utilisateur.id))
  const ancienne = utilisateur.avatar?.startsWith('photo:') && utilisateur.avatar !== avatar ? utilisateur.avatar.slice(6) : null
  if (ancienne && stockage) {
    await supprimerObjet(stockage, cleObjet(utilisateur.id, ancienne)).catch((e) => console.error('Suppression d\'un ancien avatar :', e.message))
  }
  return { avatar: lienAvatar(stockage, utilisateur.id, avatar), avatarChoix: avatar }
}
