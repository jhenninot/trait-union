import { Router } from 'express'
import { and, eq, or, gte, lt, inArray, asc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { rendezVous, utilisateurs } from '../db/schema.js'
import * as valider from '../auth/validation.js'
import { ErreurSaisie } from '../auth/validation.js'

// Agenda d'un cercle, monté sous /api/cercles/:cercleId/rendez-vous après chargerCercle
// (req.cercle, req.role, req.peutGerer). Tout membre du cercle peut ajouter un rendez-vous.
const router = Router()

const VISIBILITES = ['tous', 'aidants', 'accompagne', 'accompagne_aidants']

// Niveaux visibles selon le rôle. Les aidants (et les administrateurs) ont une vue
// d'aidant ; un proche ne voit que « tous ». La personne qui a créé un rendez-vous le
// voit toujours, quel que soit son niveau. Une auxiliaire de vie ne voit que les rendez-vous
// cochés « auxiliaires », quel que soit leur niveau.
const estAuxiliaire = (req) => !req.peutGerer && req.role === 'auxiliaire'

function niveauxVisibles(req) {
  if (req.peutGerer) return ['tous', 'aidants', 'accompagne_aidants']
  if (req.role === 'accompagne') return ['tous', 'accompagne', 'accompagne_aidants']
  if (estAuxiliaire(req)) return []
  return ['tous']
}

function filtreVisibles(req) {
  const niveaux = niveauxVisibles(req)
  return and(
    eq(rendezVous.cercleId, req.cercle.id),
    or(
      niveaux.length ? inArray(rendezVous.visibilite, niveaux) : undefined,
      estAuxiliaire(req) ? eq(rendezVous.auxiliaires, true) : undefined,
      eq(rendezVous.creeParId, req.utilisateur.id)
    )
  )
}

// La personne qui l'a créé et les aidants peuvent modifier ou supprimer un rendez-vous
const peutModifier = (req, rdv) => req.peutGerer || rdv.creeParId === req.utilisateur.id

function date(valeur, champ, { obligatoire = true } = {}) {
  if (valeur == null || valeur === '') {
    if (obligatoire) throw new ErreurSaisie(`Le champ « ${champ} » est obligatoire`)
    return null
  }
  const d = new Date(valeur)
  if (Number.isNaN(d.getTime())) throw new ErreurSaisie(`Le champ « ${champ} » n'est pas une date valide`)
  return d
}

function lireSaisie(req) {
  const body = req.body
  const debut = date(body.debut, 'début')
  const journeeEntiere = Boolean(body.journeeEntiere)
  const fin = journeeEntiere ? null : date(body.fin, 'fin', { obligatoire: false })
  if (fin && fin < debut) throw new ErreurSaisie('La fin doit être après le début')
  // Ce qu'ajoute une auxiliaire est par défaut pour les aidants, et toujours visible des auxiliaires
  const visibilite = body.visibilite ?? (estAuxiliaire(req) ? 'aidants' : 'tous')
  if (!VISIBILITES.includes(visibilite)) throw new ErreurSaisie('Niveau de visibilité invalide')
  return {
    titre: valider.texte(body.titre, 'titre'),
    lieu: valider.texte(body.lieu, 'lieu', { obligatoire: false }),
    notes: valider.texte(body.notes, 'notes', { obligatoire: false, max: 2000 }),
    debut,
    fin,
    journeeEntiere,
    visibilite,
    auxiliaires: estAuxiliaire(req) || Boolean(body.auxiliaires)
  }
}

const colonnes = {
  id: rendezVous.id,
  titre: rendezVous.titre,
  lieu: rendezVous.lieu,
  notes: rendezVous.notes,
  debut: rendezVous.debut,
  fin: rendezVous.fin,
  journeeEntiere: rendezVous.journeeEntiere,
  visibilite: rendezVous.visibilite,
  auxiliaires: rendezVous.auxiliaires,
  creeParId: rendezVous.creeParId,
  creeParPrenom: utilisateurs.prenom,
  modifieLe: rendezVous.modifieLe
}

const estVisible = (req, rdv) => niveauxVisibles(req).includes(rdv.visibilite) ||
  (estAuxiliaire(req) && rdv.auxiliaires) || rdv.creeParId === req.utilisateur.id

const presenter = (req) => ({ creeParId, ...rdv }) => ({
  ...rdv,
  deMoi: creeParId === req.utilisateur.id,
  peutModifier: peutModifier(req, { creeParId })
})

// Un rendez-vous que l'on n'a pas le droit de voir apparaît quand même dans l'agenda,
// mais sans rien d'autre que ses horaires (« Rendez-vous privé »).
const masquer = ({ id, debut, fin, journeeEntiere }) => ({ id, debut, fin, journeeEntiere, masque: true })

// Liste des rendez-vous, éventuellement entre ?depuis= et ?jusqua= (dates ISO)
router.get('/', async (req, res) => {
  const depuis = date(req.query.depuis, 'depuis', { obligatoire: false })
  const jusqua = date(req.query.jusqua, 'jusqua', { obligatoire: false })
  const conditions = [eq(rendezVous.cercleId, req.cercle.id)]
  // Un rendez-vous commencé avant « depuis » mais pas encore fini reste affiché
  if (depuis) conditions.push(or(gte(rendezVous.debut, depuis), gte(rendezVous.fin, depuis)))
  if (jusqua) conditions.push(lt(rendezVous.debut, jusqua))
  const liste = await db.select(colonnes).from(rendezVous)
    .leftJoin(utilisateurs, eq(rendezVous.creeParId, utilisateurs.id))
    .where(and(...conditions))
    .orderBy(asc(rendezVous.debut))
    .limit(500)
  res.json(liste.map((rdv) => (estVisible(req, rdv) ? presenter(req)(rdv) : masquer(rdv))))
})

router.post('/', async (req, res) => {
  const [rdv] = await db.insert(rendezVous)
    .values({ ...lireSaisie(req), cercleId: req.cercle.id, creeParId: req.utilisateur.id })
    .returning()
  res.status(201).json(presenter(req)({ ...rdv, creeParPrenom: req.utilisateur.prenom }))
})

async function chargerRendezVous(req, res, next) {
  const [rdv] = await db.select().from(rendezVous).where(and(eq(rendezVous.id, req.params.rdvId), filtreVisibles(req)))
  if (!rdv) return res.status(404).json({ erreur: 'Rendez-vous introuvable' })
  if (!peutModifier(req, rdv)) return res.status(403).json({ erreur: 'Seuls son auteur et les aidants peuvent modifier ce rendez-vous' })
  req.rdv = rdv
  next()
}

router.put('/:rdvId', chargerRendezVous, async (req, res) => {
  await db.update(rendezVous).set(lireSaisie(req)).where(eq(rendezVous.id, req.rdv.id))
  const [rdv] = await db.select(colonnes).from(rendezVous)
    .leftJoin(utilisateurs, eq(rendezVous.creeParId, utilisateurs.id))
    .where(eq(rendezVous.id, req.rdv.id))
  res.json(presenter(req)(rdv))
})

router.delete('/:rdvId', chargerRendezVous, async (req, res) => {
  await db.delete(rendezVous).where(eq(rendezVous.id, req.rdv.id))
  res.status(204).end()
})

export default router
