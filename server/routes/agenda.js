import { Router } from 'express'
import { and, eq, ne, or, gte, lt, inArray, isNull, asc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { rendezVous, utilisateurs } from '../db/schema.js'
import * as valider from '../auth/validation.js'
import { ErreurSaisie } from '../auth/validation.js'
import { RECURRENCES, occurrences } from '../agenda/recurrence.js'

// Agenda d'un cercle, monté sous /api/cercles/:cercleId/rendez-vous après chargerCercle
// (req.cercle, req.role, req.peutGerer). Tout membre du cercle peut ajouter un rendez-vous.
const router = Router()

const VISIBILITES = ['tous', 'aidants', 'accompagne', 'accompagne_aidants']

// Niveaux visibles selon le rôle. Les aidants (et les administrateurs) ont une vue
// d'aidant ; un proche ne voit que « tous ». La personne qui a créé un rendez-vous le
// voit toujours, quel que soit son niveau.
function niveauxVisibles(req) {
  if (req.peutGerer) return ['tous', 'aidants', 'accompagne_aidants']
  if (req.role === 'accompagne') return ['tous', 'accompagne', 'accompagne_aidants']
  return ['tous']
}

function filtreVisibles(req) {
  return and(
    eq(rendezVous.cercleId, req.cercle.id),
    or(inArray(rendezVous.visibilite, niveauxVisibles(req)), eq(rendezVous.creeParId, req.utilisateur.id))
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

// Un rendez-vous peut durer plusieurs jours, être une journée entière (ou plusieurs)
// et se répéter tous les N jours, semaines, mois ou ans, jusqu'à une date facultative.
function lireSaisie(body) {
  const debut = date(body.debut, 'début')
  const journeeEntiere = Boolean(body.journeeEntiere)
  let fin = date(body.fin, 'fin', { obligatoire: false })
  // Journée entière sans fin précisée : jusqu'à la fin du premier jour
  if (journeeEntiere && !fin) fin = new Date(debut.getTime() + 86_400_000 - 60_000)
  if (fin && fin < debut) throw new ErreurSaisie('La fin doit être après le début')
  const visibilite = body.visibilite ?? 'tous'
  if (!VISIBILITES.includes(visibilite)) throw new ErreurSaisie('Niveau de visibilité invalide')
  const recurrence = body.recurrence ?? 'aucune'
  if (!RECURRENCES.includes(recurrence)) throw new ErreurSaisie('Répétition invalide')
  const intervalle = Number(body.intervalle ?? 1)
  if (!Number.isInteger(intervalle) || intervalle < 1 || intervalle > 99) throw new ErreurSaisie('L\'intervalle de répétition doit être entre 1 et 99')
  const recurrenceFin = recurrence === 'aucune' ? null : date(body.recurrenceFin, 'fin de la répétition', { obligatoire: false })
  if (recurrenceFin && recurrenceFin < debut) throw new ErreurSaisie('La répétition doit s\'arrêter après le premier rendez-vous')
  return {
    recurrence,
    intervalle,
    recurrenceFin,
    titre: valider.texte(body.titre, 'titre'),
    lieu: valider.texte(body.lieu, 'lieu', { obligatoire: false }),
    notes: valider.texte(body.notes, 'notes', { obligatoire: false, max: 2000 }),
    debut,
    fin,
    journeeEntiere,
    visibilite
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
  recurrence: rendezVous.recurrence,
  intervalle: rendezVous.intervalle,
  recurrenceFin: rendezVous.recurrenceFin,
  creeParId: rendezVous.creeParId,
  creeParPrenom: utilisateurs.prenom,
  modifieLe: rendezVous.modifieLe
}

const estVisible = (req, rdv) => niveauxVisibles(req).includes(rdv.visibilite) || rdv.creeParId === req.utilisateur.id

// Une occurrence garde l'identifiant de sa série ; `cle` la distingue des autres
// et serieDebut / serieFin servent à modifier la série entière.
const presenter = (req, serie = null) => ({ creeParId, occurrence = 0, ...rdv }) => ({
  ...rdv,
  cle: `${rdv.id}:${occurrence}`,
  serieDebut: (serie ?? rdv).debut,
  serieFin: (serie ?? rdv).fin,
  deMoi: creeParId === req.utilisateur.id,
  peutModifier: peutModifier(req, { creeParId })
})

// Un rendez-vous que l'on n'a pas le droit de voir apparaît quand même dans l'agenda,
// mais sans rien d'autre que ses horaires (« Rendez-vous privé »).
const masquer = ({ id, occurrence = 0, debut, fin, journeeEntiere }) => ({ id, cle: `${id}:${occurrence}`, debut, fin, journeeEntiere, masque: true })

// Liste des rendez-vous, éventuellement entre ?depuis= et ?jusqua= (dates ISO)
router.get('/', async (req, res) => {
  const depuis = date(req.query.depuis, 'depuis', { obligatoire: false })
  const jusqua = date(req.query.jusqua, 'jusqua', { obligatoire: false })
  const simples = [eq(rendezVous.recurrence, 'aucune')]
  // Un rendez-vous commencé avant « depuis » mais pas encore fini reste affiché
  if (depuis) simples.push(or(gte(rendezVous.debut, depuis), gte(rendezVous.fin, depuis)))
  if (jusqua) simples.push(lt(rendezVous.debut, jusqua))
  // Les séries qui se répètent sont filtrées après calcul de leurs occurrences
  const series = [ne(rendezVous.recurrence, 'aucune')]
  if (jusqua) series.push(lt(rendezVous.debut, jusqua))
  if (depuis) series.push(or(isNull(rendezVous.recurrenceFin), gte(rendezVous.recurrenceFin, new Date(depuis - 366 * 86_400_000))))
  const lignes = await db.select(colonnes).from(rendezVous)
    .leftJoin(utilisateurs, eq(rendezVous.creeParId, utilisateurs.id))
    .where(and(eq(rendezVous.cercleId, req.cercle.id), or(and(...simples), and(...series))))
    .orderBy(asc(rendezVous.debut))
    .limit(1000)
  const liste = lignes
    .flatMap((serie) => occurrences(serie, depuis, jusqua).map((o) => (estVisible(req, serie) ? presenter(req, serie)(o) : masquer(o))))
    .sort((a, b) => a.debut - b.debut)
    .slice(0, 2000)
  res.json(liste)
})

router.post('/', async (req, res) => {
  const [rdv] = await db.insert(rendezVous)
    .values({ ...lireSaisie(req.body), cercleId: req.cercle.id, creeParId: req.utilisateur.id })
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
  await db.update(rendezVous).set(lireSaisie(req.body)).where(eq(rendezVous.id, req.rdv.id))
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
