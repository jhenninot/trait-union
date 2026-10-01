import { Router } from 'express'
import { and, eq, or, gt, ne, isNull, isNotNull, desc, count, max, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { albums, photos, albumsVus, membres } from '../db/schema.js'
import * as valider from '../auth/validation.js'
import { ErreurSaisie } from '../auth/validation.js'
import { stockageActif } from '../stockage/s3.js'
import { lienAffichage } from './photos.js'

// Albums photos d'un cercle, montés sous /api/cercles/:cercleId/albums après chargerCercle.
// Tout membre peut créer un album ; son auteur et les aidants peuvent le renommer ou le supprimer
// (ses photos sont alors gardées, sans album).
const router = Router()

const peutModifier = (req, album) => req.peutGerer || album.creeParId === req.utilisateur.id

// Nombre de photos publiées qu'une personne n'a pas encore regardées, par album
// (ses propres photos ne comptent pas)
function nonVuesPar(cercleId, utilisateurId) {
  return db.select({ albumId: photos.albumId, nombre: count() }).from(photos)
    .leftJoin(albumsVus, and(
      eq(albumsVus.utilisateurId, utilisateurId),
      eq(albumsVus.cercleId, photos.cercleId),
      sql`${albumsVus.albumId} is not distinct from ${photos.albumId}`
    ))
    .where(and(
      eq(photos.cercleId, cercleId),
      eq(photos.statut, 'publiee'),
      or(isNull(albumsVus.vuLe), gt(photos.creeLe, albumsVus.vuLe)),
      or(isNull(photos.creeParId), ne(photos.creeParId, utilisateurId))
    ))
    .groupBy(photos.albumId)
}

// Albums avec leur nombre de photos et leur couverture (la photo la plus récente),
// plus le nombre total de photos et de photos sans album. `nouvelles` : photos arrivées depuis
// la dernière fois que la personne connectée a regardé l'album (toutes si jamais regardé).
router.get('/', async (req, res) => {
  const stockage = await stockageActif()
  const publiees = and(eq(photos.cercleId, req.cercle.id), eq(photos.statut, 'publiee'))
  const [liste, comptes, couvertures, nonVues] = await Promise.all([
    db.select().from(albums).where(eq(albums.cercleId, req.cercle.id)),
    db.select({ albumId: photos.albumId, nombre: count(), derniere: max(photos.creeLe) }).from(photos).where(publiees).groupBy(photos.albumId),
    db.selectDistinctOn([photos.albumId], { id: photos.id, cercleId: photos.cercleId, albumId: photos.albumId })
      .from(photos).where(publiees).orderBy(photos.albumId, desc(photos.creeLe)),
    nonVuesPar(req.cercle.id, req.utilisateur.id)
  ])
  const compte = new Map(comptes.map((c) => [c.albumId, c]))
  const couverture = new Map(couvertures.map((p) => [p.albumId, p]))
  const nouvelles = new Map(nonVues.map((c) => [c.albumId, c.nombre]))
  const lienCouverture = (albumId) => {
    const photo = couverture.get(albumId)
    return stockage && photo ? lienAffichage(stockage, photo, 'miniature') : null
  }
  const presenter = (album) => {
    return {
      id: album.id,
      nom: album.nom,
      nombre: compte.get(album.id)?.nombre ?? 0,
      nouvelles: nouvelles.get(album.id) ?? 0,
      couverture: lienCouverture(album.id),
      peutModifier: peutModifier(req, album),
      derniere: compte.get(album.id)?.derniere ?? album.creeLe
    }
  }
  res.json({
    // Les albums où une photo vient d'arriver d'abord
    albums: liste.map(presenter).sort((a, b) => new Date(b.derniere) - new Date(a.derniere)),
    total: comptes.reduce((n, c) => n + c.nombre, 0),
    sansAlbum: compte.get(null)?.nombre ?? 0,
    sansAlbumNouvelles: nouvelles.get(null) ?? 0,
    sansAlbumCouverture: lienCouverture(null),
    sansAlbumDerniere: compte.get(null)?.derniere ?? null
  })
})

// Pour l'accueil des aidants et des proches : pour chaque personne accompagnée du cercle,
// le nombre de photos qu'elle n'a pas encore regardées et sa dernière visite des photos.
router.get('/accompagnes', async (req, res) => {
  const liste = await db.select({ utilisateurId: membres.utilisateurId }).from(membres)
    .where(and(eq(membres.cercleId, req.cercle.id), eq(membres.role, 'accompagne'), isNotNull(membres.utilisateurId)))
  res.json(await Promise.all(liste.map(async ({ utilisateurId }) => {
    const [nonVues, [visite]] = await Promise.all([
      nonVuesPar(req.cercle.id, utilisateurId),
      db.select({ vuLe: max(albumsVus.vuLe) }).from(albumsVus)
        .where(and(eq(albumsVus.utilisateurId, utilisateurId), eq(albumsVus.cercleId, req.cercle.id)))
    ])
    return { utilisateurId, nouvelles: nonVues.reduce((n, c) => n + c.nombre, 0), vuLe: visite?.vuLe ?? null }
  })))
})

// La personne connectée vient de regarder des photos. Corps : { album: <id> | 'aucun' | 'tous' }
// ('aucun' : les photos sans album ; 'tous' : toutes les photos du cercle, donc tous les albums).
router.post('/vus', async (req, res) => {
  const choix = String(req.body.album ?? '')
  let ids
  if (choix === 'tous') {
    const liste = await db.select({ id: albums.id }).from(albums).where(eq(albums.cercleId, req.cercle.id))
    ids = [null, ...liste.map((a) => a.id)]
  } else if (choix === 'aucun') {
    ids = [null]
  } else {
    const [album] = choix
      ? await db.select({ id: albums.id }).from(albums).where(and(eq(albums.id, choix), eq(albums.cercleId, req.cercle.id)))
      : []
    if (!album) throw new ErreurSaisie('Album introuvable')
    ids = [album.id]
  }
  const vuLe = new Date()
  await db.insert(albumsVus)
    .values(ids.map((albumId) => ({ utilisateurId: req.utilisateur.id, cercleId: req.cercle.id, albumId, vuLe })))
    .onConflictDoUpdate({ target: [albumsVus.utilisateurId, albumsVus.cercleId, albumsVus.albumId], set: { vuLe } })
  res.status(204).end()
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
