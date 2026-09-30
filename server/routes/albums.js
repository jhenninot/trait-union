import { Router } from 'express'
import { and, eq, desc, count, max } from 'drizzle-orm'
import { db } from '../db/index.js'
import { albums, photos } from '../db/schema.js'
import * as valider from '../auth/validation.js'
import { stockageActif } from '../stockage/s3.js'
import { lienAffichage } from './photos.js'

// Albums photos d'un cercle, montés sous /api/cercles/:cercleId/albums après chargerCercle.
// Tout membre peut créer un album ; son auteur et les aidants peuvent le renommer ou le supprimer
// (ses photos sont alors gardées, sans album).
const router = Router()

const peutModifier = (req, album) => req.peutGerer || album.creeParId === req.utilisateur.id

// Albums avec leur nombre de photos et leur couverture (la photo la plus récente),
// plus le nombre total de photos et de photos sans album
router.get('/', async (req, res) => {
  const stockage = await stockageActif()
  const publiees = and(eq(photos.cercleId, req.cercle.id), eq(photos.statut, 'publiee'))
  const [liste, comptes, couvertures] = await Promise.all([
    db.select().from(albums).where(eq(albums.cercleId, req.cercle.id)),
    db.select({ albumId: photos.albumId, nombre: count(), derniere: max(photos.creeLe) }).from(photos).where(publiees).groupBy(photos.albumId),
    db.selectDistinctOn([photos.albumId], { id: photos.id, cercleId: photos.cercleId, albumId: photos.albumId })
      .from(photos).where(publiees).orderBy(photos.albumId, desc(photos.creeLe))
  ])
  const compte = new Map(comptes.map((c) => [c.albumId, c]))
  const couverture = new Map(couvertures.map((p) => [p.albumId, p]))
  const presenter = (album) => {
    const photo = couverture.get(album.id)
    return {
      id: album.id,
      nom: album.nom,
      nombre: compte.get(album.id)?.nombre ?? 0,
      couverture: stockage && photo ? lienAffichage(stockage, photo, 'miniature') : null,
      peutModifier: peutModifier(req, album),
      derniere: compte.get(album.id)?.derniere ?? album.creeLe
    }
  }
  res.json({
    // Les albums où une photo vient d'arriver d'abord
    albums: liste.map(presenter).sort((a, b) => new Date(b.derniere) - new Date(a.derniere)),
    total: comptes.reduce((n, c) => n + c.nombre, 0),
    sansAlbum: compte.get(null)?.nombre ?? 0
  })
})

router.post('/', async (req, res) => {
  const [album] = await db.insert(albums)
    .values({ cercleId: req.cercle.id, creeParId: req.utilisateur.id, nom: valider.texte(req.body.nom, 'nom de l\'album', { max: 100 }) })
    .returning()
  res.status(201).json({ id: album.id, nom: album.nom, nombre: 0, couverture: null, peutModifier: true, derniere: album.creeLe })
})

async function chargerAlbum(req, res, next) {
  const [album] = await db.select().from(albums).where(and(eq(albums.id, req.params.albumId), eq(albums.cercleId, req.cercle.id)))
  if (!album) return res.status(404).json({ erreur: 'Album introuvable' })
  if (!peutModifier(req, album)) return res.status(403).json({ erreur: 'Seuls son auteur et les aidants peuvent modifier cet album' })
  req.album = album
  next()
}

router.patch('/:albumId', chargerAlbum, async (req, res) => {
  const nom = valider.texte(req.body.nom, 'nom de l\'album', { max: 100 })
  await db.update(albums).set({ nom }).where(eq(albums.id, req.album.id))
  res.json({ id: req.album.id, nom })
})

// Supprime l'album ; ses photos restent dans le cercle, sans album
router.delete('/:albumId', chargerAlbum, async (req, res) => {
  await db.delete(albums).where(eq(albums.id, req.album.id))
  res.status(204).end()
})

export default router
