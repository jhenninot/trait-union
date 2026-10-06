import { and, eq, inArray, or, count } from 'drizzle-orm'
import { db } from './db/index.js'
import { photosJeu } from './db/schema.js'
import { ErreurSaisie } from './auth/validation.js'
import { preparerEnvoi, verifierPhotoJeu, supprimerPhotosJeu, lienPhotoJeu, copierPhotoJeu } from './avatars.js'
import { stockageActif } from './stockage/s3.js'

// Photos supplémentaires pour les jeux (en plus de la photo de contact). Elles appartiennent soit à un
// compte (`{ utilisateurId }`, valables dans tous ses cercles), soit à une fiche de l'arbre sans compte
// (`{ personneId }`). L'objet est rangé sous avatars/<identifiant du propriétaire>/<jeton>.jpg.
const MAX = 10
const idDe = (o) => o.utilisateurId ?? o.personneId
const filtre = (o) => (o.utilisateurId ? eq(photosJeu.utilisateurId, o.utilisateurId) : eq(photosJeu.personneId, o.personneId))

export async function listePhotos(owner) {
  const [lignes, stockage] = await Promise.all([db.select().from(photosJeu).where(filtre(owner)).orderBy(photosJeu.creeLe), stockageActif()])
  return lignes.map((l) => ({ id: l.id, url: lienPhotoJeu(stockage, idDe(owner), l.jeton) })).filter((x) => x.url)
}

// Photos de plusieurs propriétaires : Map « u:<compte> » ou « p:<fiche> » → [{ id, url }]
export async function photosDe({ utilisateurIds = [], personneIds = [] }) {
  const conditions = []
  if (utilisateurIds.length) conditions.push(inArray(photosJeu.utilisateurId, utilisateurIds))
  if (personneIds.length) conditions.push(inArray(photosJeu.personneId, personneIds))
  const m = new Map()
  if (!conditions.length) return m
  const [lignes, stockage] = await Promise.all([db.select().from(photosJeu).where(or(...conditions)).orderBy(photosJeu.creeLe), stockageActif()])
  for (const l of lignes) {
    const cle = l.utilisateurId ? `u:${l.utilisateurId}` : `p:${l.personneId}`
    const url = lienPhotoJeu(stockage, l.utilisateurId ?? l.personneId, l.jeton)
    if (!url) continue
    if (!m.has(cle)) m.set(cle, [])
    m.get(cle).push({ id: l.id, url })
  }
  return m
}

async function verifierPlace(owner) {
  const [{ n }] = await db.select({ n: count() }).from(photosJeu).where(filtre(owner))
  if (n >= MAX) throw new ErreurSaisie(`${MAX} photos au plus par personne`)
}

// Ajoute à un routeur : POST <chemin>/photos/envoi, GET et POST <chemin>/photos, DELETE <chemin>/photos/:photoId.
// `ownerDe(req)` donne le propriétaire (après les middlewares d'accès `mw`).
export function routesPhotosJeu(router, chemin, mw, ownerDe) {
  router.get(`${chemin}/photos`, ...mw, async (req, res) => res.json(await listePhotos(await ownerDe(req))))
  router.post(`${chemin}/photos/envoi`, ...mw, async (req, res) => {
    const owner = await ownerDe(req)
    await verifierPlace(owner)
    res.json(await preparerEnvoi(idDe(owner), req.body.taille))
  })
  router.post(`${chemin}/photos`, ...mw, async (req, res) => {
    const owner = await ownerDe(req)
    await verifierPlace(owner)
    const jeton = await verifierPhotoJeu(idDe(owner), req.body.photo)
    await db.insert(photosJeu).values({ ...owner, cercleId: req.cercle?.id ?? null, jeton })
    res.status(201).json(await listePhotos(owner))
  })
  router.delete(`${chemin}/photos/:photoId`, ...mw, async (req, res) => {
    const owner = await ownerDe(req)
    const [l] = await db.delete(photosJeu).where(and(eq(photosJeu.id, req.params.photoId), filtre(owner))).returning()
    if (l) await supprimerPhotosJeu(idDe(owner), [l.jeton])
    res.json(await listePhotos(owner))
  })
}

// Supprime les objets d'un propriétaire (avant d'effacer sa fiche)
export async function purgerPhotos(owner) {
  const lignes = await db.select({ jeton: photosJeu.jeton }).from(photosJeu).where(filtre(owner))
  await supprimerPhotosJeu(idDe(owner), lignes.map((l) => l.jeton))
}

// Une fiche de l'arbre devient un compte (invitation acceptée) : ses photos de jeu passent sur le compte
// (10 au plus en tout) ; celles qui n'ont pas pu être copiées restent sur la fiche.
export async function transfererPhotos(tx, personneId, utilisateurId) {
  const aDeplacer = await tx.select().from(photosJeu).where(eq(photosJeu.personneId, personneId)).orderBy(photosJeu.creeLe)
  if (!aDeplacer.length) return
  const [{ n }] = await tx.select({ n: count() }).from(photosJeu).where(eq(photosJeu.utilisateurId, utilisateurId))
  let place = MAX - n
  const copiees = []
  const inutiles = []
  for (const l of aDeplacer) {
    if (place > 0 && await copierPhotoJeu(personneId, utilisateurId, l.jeton)) {
      await tx.insert(photosJeu).values({ utilisateurId, cercleId: l.cercleId, jeton: l.jeton })
      place--
      copiees.push(l)
    } else if (place <= 0) {
      inutiles.push(l)
    }
  }
  const retirees = [...copiees, ...inutiles]
  if (retirees.length) {
    await tx.delete(photosJeu).where(inArray(photosJeu.id, retirees.map((l) => l.id)))
    await supprimerPhotosJeu(personneId, retirees.map((l) => l.jeton))
  }
}
