import { Router } from 'express'
import { and, eq, lt, desc, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { photos, albums, utilisateurs } from '../db/schema.js'
import * as valider from '../auth/validation.js'
import { ErreurSaisie } from '../auth/validation.js'
import { stockageActif, lienSigne, infoObjet, supprimerObjet } from '../stockage/s3.js'
import { lienAvatar } from '../avatars.js'
import { ALBUM_CONVERSATIONS, photosAlbumConversations } from '../messagerie/album.js'

// Photos d'un cercle, montées sous /api/cercles/:cercleId/photos après chargerCercle
// (req.cercle, req.role, req.peutGerer). Tout membre du cercle voit et ajoute des photos.
// Les fichiers ne passent jamais par ce serveur : il signe des liens avec lesquels le
// navigateur envoie les photos (PUT) puis les affiche (GET) directement chez l'hébergeur S3.
const router = Router()

// Deux versions préparées par le navigateur avant l'envoi (client/src/photos.js)
const VARIANTES = { miniature: 300 * 1024, ecran: 3 * 1024 * 1024 } // taille maximale en octets
const DUREE_ENVOI = 15 * 60 // secondes
const HEURE = 3600 * 1000
// Les liens d'affichage sont signés à une heure arrondie à 6 h et valables 12 h : ils restent
// identiques un moment, ce qui permet au navigateur de garder les images en cache.
const FENETRE_AFFICHAGE = 6 * HEURE
const DUREE_AFFICHAGE = 12 * 3600

export const cleObjet = (photo, variante) => `cercles/${photo.cercleId}/photos/${photo.id}/${variante}.jpg`

// La personne qui l'a envoyée et les aidants peuvent supprimer une photo
const peutSupprimer = (req, photo) => req.peutGerer || photo.creeParId === req.utilisateur.id

async function exigerStockage(req, res, next) {
  req.stockage = await stockageActif()
  if (!req.stockage) return res.status(503).json({ erreur: 'Le partage de photos n\'est pas encore configuré par l\'administrateur' })
  next()
}

// Lien d'affichage d'une version d'une photo (aussi utilisé pour les couvertures d'albums)
export function lienAffichage(stockage, photo, variante) {
  const date = new Date(Math.floor(Date.now() / FENETRE_AFFICHAGE) * FENETRE_AFFICHAGE)
  return lienSigne(stockage, 'GET', cleObjet(photo, variante), {
    duree: DUREE_AFFICHAGE,
    date,
    query: { 'response-cache-control': 'private, max-age=43200' }
  })
}

function presenter(req, photo) {
  const lien = (variante) => lienAffichage(req.stockage, photo, variante)
  return {
    id: photo.id,
    cercleId: photo.cercleId,
    albumId: photo.albumId ?? null,
    legende: photo.legende,
    largeur: photo.largeur,
    hauteur: photo.hauteur,
    creeLe: photo.creeLe,
    creeParPrenom: photo.creeParPrenom ?? null,
    creeParAvatar: photo.creeParId ? lienAvatar(req.stockage, photo.creeParId, photo.creeParAvatar) : null,
    deMoi: photo.creeParId === req.utilisateur.id,
    peutSupprimer: peutSupprimer(req, photo),
    miniature: lien('miniature'),
    ecran: lien('ecran')
  }
}

const colonnes = {
  id: photos.id,
  cercleId: photos.cercleId,
  creeParId: photos.creeParId,
  creeParPrenom: utilisateurs.prenom,
  creeParAvatar: utilisateurs.avatar,
  albumId: photos.albumId,
  legende: photos.legende,
  largeur: photos.largeur,
  hauteur: photos.hauteur,
  creeLe: photos.creeLe
}

// Album du cercle désigné par `id` (null pour « sans album ») ; lève une erreur s'il n'existe pas
async function albumDuCercle(req, id) {
  if (id == null || id === '') return null
  const [album] = await db.select({ id: albums.id }).from(albums)
    .where(and(eq(albums.id, String(id)), eq(albums.cercleId, req.cercle.id)))
  if (!album) throw new ErreurSaisie('Album introuvable')
  return album.id
}

// Liste des photos publiées, les plus récentes d'abord. ?avant=<date ISO> pour la suite,
// ?album=<id> pour un album, ?album=aucun pour les photos sans album.
router.get('/', async (req, res) => {
  req.stockage = await stockageActif()
  if (!req.stockage) return res.json({ actif: false, photos: [] })
  if (req.query.album === ALBUM_CONVERSATIONS) {
    const avant = req.query.avant ? new Date(req.query.avant) : null
    if (avant && Number.isNaN(avant.getTime())) throw new ErreurSaisie('Date invalide')
    const limite = Math.min(Number(req.query.limite) || 60, 200)
    const liste = await photosAlbumConversations(req.cercle.id, req.utilisateur.id, req.stockage, { avant, limite })
    return res.json({ actif: true, photos: liste, suite: liste.length === limite })
  }
  const conditions = [eq(photos.cercleId, req.cercle.id), eq(photos.statut, 'publiee')]
  if (req.query.avant) {
    const avant = new Date(req.query.avant)
    if (Number.isNaN(avant.getTime())) throw new ErreurSaisie('Date invalide')
    conditions.push(lt(photos.creeLe, avant))
  }
  if (req.query.album === 'aucun') conditions.push(isNull(photos.albumId))
  else if (req.query.album) conditions.push(eq(photos.albumId, await albumDuCercle(req, req.query.album)))
  const limite = Math.min(Number(req.query.limite) || 60, 200)
  const liste = await db.select(colonnes).from(photos)
    .leftJoin(utilisateurs, eq(photos.creeParId, utilisateurs.id))
    .where(and(...conditions))
    .orderBy(desc(photos.creeLe))
    .limit(limite)
  res.json({ actif: true, photos: liste.map((p) => presenter(req, p)), suite: liste.length === limite })
})

function entier(valeur, champ, max) {
  const n = Number(valeur)
  if (!Number.isInteger(n) || n <= 0 || n > max) throw new ErreurSaisie(`Valeur invalide pour « ${champ} »`)
  return n
}

// Supprime les envois jamais terminés (fichiers compris) de plus d'un jour
async function nettoyerEnvoisAbandonnes(stockage, cercleId) {
  const abandonnes = await db.select().from(photos)
    .where(and(eq(photos.cercleId, cercleId), eq(photos.statut, 'envoi'), lt(photos.creeLe, new Date(Date.now() - 24 * HEURE))))
  for (const photo of abandonnes) {
    for (const variante of Object.keys(VARIANTES)) await supprimerObjet(stockage, cleObjet(photo, variante))
    await db.delete(photos).where(eq(photos.id, photo.id))
  }
}

// 1re étape d'un envoi : enregistre la photo et renvoie un lien d'envoi par version.
// Corps : { legende, albumId, largeur, hauteur, tailles: { miniature, ecran } } (tailles en octets)
router.post('/', exigerStockage, async (req, res) => {
  const tailles = Object.fromEntries(Object.entries(VARIANTES).map(([v, max]) => {
    const taille = Number(req.body.tailles?.[v])
    if (!Number.isInteger(taille) || taille <= 0) throw new ErreurSaisie('Taille de photo invalide')
    if (taille > max) throw new ErreurSaisie('Photo trop lourde')
    return [v, taille]
  }))
  const [photo] = await db.insert(photos).values({
    cercleId: req.cercle.id,
    creeParId: req.utilisateur.id,
    albumId: await albumDuCercle(req, req.body.albumId),
    legende: valider.texte(req.body.legende, 'légende', { obligatoire: false, max: 500 }),
    largeur: entier(req.body.largeur, 'largeur', 10000),
    hauteur: entier(req.body.hauteur, 'hauteur', 10000),
    taille: Object.values(tailles).reduce((a, b) => a + b, 0)
  }).returning()
  // La taille et le type font partie de la signature : l'hébergeur refuse tout autre fichier
  const envois = Object.fromEntries(Object.keys(VARIANTES).map((v) => [v, lienSigne(req.stockage, 'PUT', cleObjet(photo, v), {
    duree: DUREE_ENVOI,
    entetes: { 'content-type': 'image/jpeg', 'content-length': tailles[v] }
  })]))
  nettoyerEnvoisAbandonnes(req.stockage, req.cercle.id).catch((e) => console.error('Nettoyage des photos :', e.message))
  res.status(201).json({ id: photo.id, envois })
})

async function chargerPhoto(req, res, next) {
  const [photo] = await db.select().from(photos)
    .where(and(eq(photos.id, req.params.photoId), eq(photos.cercleId, req.cercle.id)))
  if (!photo) return res.status(404).json({ erreur: 'Photo introuvable' })
  req.photo = photo
  next()
}

// 2e étape : le navigateur a envoyé les fichiers ; on vérifie qu'ils sont bien arrivés
router.post('/:photoId/publier', exigerStockage, chargerPhoto, async (req, res) => {
  const photo = req.photo
  if (photo.creeParId !== req.utilisateur.id) return res.status(403).json({ erreur: 'Seule la personne qui envoie la photo peut la publier' })
  if (photo.statut === 'envoi') {
    for (const variante of Object.keys(VARIANTES)) {
      if (!await infoObjet(req.stockage, cleObjet(photo, variante))) {
        return res.status(400).json({ erreur: 'La photo n\'est pas arrivée chez l\'hébergeur, réessayez' })
      }
    }
    await db.update(photos).set({ statut: 'publiee' }).where(eq(photos.id, photo.id))
  }
  res.json(presenter(req, { ...photo, creeParPrenom: req.utilisateur.prenom, creeParAvatar: req.utilisateur.avatar }))
})

// Modifie la légende et/ou l'album (seuls les champs envoyés changent ; albumId null = sans album)
router.patch('/:photoId', chargerPhoto, async (req, res) => {
  if (!peutSupprimer(req, req.photo)) return res.status(403).json({ erreur: 'Seuls son auteur et les aidants peuvent modifier cette photo' })
  const modifs = {}
  if ('legende' in req.body) modifs.legende = valider.texte(req.body.legende, 'légende', { obligatoire: false, max: 500 })
  if ('albumId' in req.body) modifs.albumId = await albumDuCercle(req, req.body.albumId)
  if (Object.keys(modifs).length) await db.update(photos).set(modifs).where(eq(photos.id, req.photo.id))
  const photo = { ...req.photo, ...modifs }
  res.json({ id: photo.id, legende: photo.legende, albumId: photo.albumId })
})

router.delete('/:photoId', exigerStockage, chargerPhoto, async (req, res) => {
  if (!peutSupprimer(req, req.photo)) return res.status(403).json({ erreur: 'Seuls son auteur et les aidants peuvent supprimer cette photo' })
  for (const variante of Object.keys(VARIANTES)) await supprimerObjet(req.stockage, cleObjet(req.photo, variante))
  await db.delete(photos).where(eq(photos.id, req.photo.id))
  res.status(204).end()
})

export default router
