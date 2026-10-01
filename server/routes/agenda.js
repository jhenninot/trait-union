import { Router } from 'express'
import { and, eq, ne, or, gte, lt, inArray, isNull, asc } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db/index.js'
import { rendezVous, utilisateurs, membres } from '../db/schema.js'
import * as valider from '../auth/validation.js'
import { ErreurSaisie } from '../auth/validation.js'
import { RECURRENCES, occurrences, occurrenceNumero } from '../agenda/recurrence.js'

// Agenda d'un cercle, monté sous /api/cercles/:cercleId/rendez-vous après chargerCercle
// (req.cercle, req.role, req.peutGerer). Tout membre du cercle peut ajouter un rendez-vous.
const router = Router()

const VISIBILITES = ['tous', 'aidants', 'accompagne', 'accompagne_aidants']
// Alerte au plus une semaine avant (en minutes)
const RAPPEL_MAX = 7 * 24 * 60

// Niveaux visibles selon le rôle. Les aidants (et les administrateurs) ont une vue
// d'aidant ; un proche ne voit que « tous ». La personne qui a créé un rendez-vous le
// voit toujours, quel que soit son niveau. Une auxiliaire de vie ne voit que les rendez-vous
// cochés « auxiliaires », quel que soit leur niveau.
const estAuxiliaire = (req) => !req.peutGerer && req.role === 'auxiliaire'

// Niveaux visibles pour un rôle dans le cercle (peutGerer : aidant ou administrateur)
export function niveauxVisibles({ role, peutGerer }) {
  if (peutGerer) return ['tous', 'aidants', 'accompagne_aidants']
  if (role === 'accompagne') return ['tous', 'accompagne', 'accompagne_aidants']
  if (role === 'auxiliaire') return []
  return ['tous']
}

// Niveaux destinés aux personnes accompagnées : dans un cercle qui en a plusieurs, le
// rendez-vous peut ne concerner que l'une d'elles (accompagneId), les autres ne le voient pas
const NIVEAUX_ACCOMPAGNE = ['accompagne', 'accompagne_aidants']
const estAccompagne = ({ role, peutGerer }) => !peutGerer && role === 'accompagne'

// Vrai si la personne (utilisateurId, role, peutGerer) peut voir le rendez-vous ;
// sert aussi à choisir qui reçoit son alerte (server/alertes/planificateur.js)
export const peutVoir = ({ utilisateurId, role, peutGerer }, rdv) =>
  (niveauxVisibles({ role, peutGerer }).includes(rdv.visibilite) &&
    !(estAccompagne({ role, peutGerer }) && NIVEAUX_ACCOMPAGNE.includes(rdv.visibilite) && rdv.accompagneId && rdv.accompagneId !== utilisateurId)) ||
  (!peutGerer && role === 'auxiliaire' && rdv.auxiliaires) || rdv.creeParId === utilisateurId

const qui = (req) => ({ utilisateurId: req.utilisateur.id, role: req.role, peutGerer: req.peutGerer })

// Même règle que peutVoir, en SQL
export function filtreNiveaux({ utilisateurId, role, peutGerer }) {
  const niveaux = niveauxVisibles({ role, peutGerer })
  if (!niveaux.length) return undefined
  if (!estAccompagne({ role, peutGerer })) return inArray(rendezVous.visibilite, niveaux)
  return or(
    eq(rendezVous.visibilite, 'tous'),
    and(inArray(rendezVous.visibilite, NIVEAUX_ACCOMPAGNE), or(isNull(rendezVous.accompagneId), eq(rendezVous.accompagneId, utilisateurId)))
  )
}

function filtreVisibles(req) {
  return and(
    eq(rendezVous.cercleId, req.cercle.id),
    or(
      filtreNiveaux(qui(req)),
      estAuxiliaire(req) ? eq(rendezVous.auxiliaires, true) : undefined,
      eq(rendezVous.creeParId, req.utilisateur.id)
    )
  )
}

// Règles de modification (validées par Julien le 2026-09-30) :
// - l'auteur, quel que soit son rôle, modifie ou supprime toujours ses rendez-vous ;
// - aidants et administrateurs modifient ou suppriment tout ce qu'ils voient ;
// - proches et auxiliaires : seulement les leurs ;
// - seul l'auteur change qui peut voir le rendez-vous.
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
function lireSaisie(req) {
  const body = req.body
  const debut = date(body.debut, 'début')
  const journeeEntiere = Boolean(body.journeeEntiere)
  let fin = date(body.fin, 'fin', { obligatoire: false })
  // Journée entière sans fin précisée : jusqu'à la fin du premier jour
  if (journeeEntiere && !fin) fin = new Date(debut.getTime() + 86_400_000 - 60_000)
  if (fin && fin < debut) throw new ErreurSaisie('La fin doit être après le début')
  // Ce qu'ajoute une auxiliaire est par défaut pour les aidants, et toujours visible des auxiliaires
  const visibilite = body.visibilite ?? (estAuxiliaire(req) ? 'aidants' : 'tous')
  if (!VISIBILITES.includes(visibilite)) throw new ErreurSaisie('Niveau de visibilité invalide')
  const recurrence = body.recurrence ?? 'aucune'
  if (!RECURRENCES.includes(recurrence)) throw new ErreurSaisie('Répétition invalide')
  const intervalle = Number(body.intervalle ?? 1)
  if (!Number.isInteger(intervalle) || intervalle < 1 || intervalle > 99) throw new ErreurSaisie('L\'intervalle de répétition doit être entre 1 et 99')
  const recurrenceFin = recurrence === 'aucune' ? null : date(body.recurrenceFin, 'fin de la répétition', { obligatoire: false })
  if (recurrenceFin && recurrenceFin < debut) throw new ErreurSaisie('La répétition doit s\'arrêter après le premier rendez-vous')
  // Absent : inchangé lors d'une modification (la tablette ne propose pas tous les délais)
  let rappel
  if ('rappel' in body) {
    rappel = body.rappel == null || body.rappel === '' ? null : Number(body.rappel)
    if (rappel != null && (!Number.isInteger(rappel) || rappel < 0 || rappel > RAPPEL_MAX)) throw new ErreurSaisie('Délai d\'alerte invalide')
  }
  return {
    rappel,
    recurrence,
    intervalle,
    recurrenceFin,
    titre: valider.texte(body.titre, 'titre'),
    lieu: valider.texte(body.lieu, 'lieu', { obligatoire: false }),
    notes: valider.texte(body.notes, 'notes', { obligatoire: false, max: 2000 }),
    debut,
    fin,
    journeeEntiere,
    visibilite,
    // Une personne accompagnée qui note un rendez-vous « pour moi » le garde pour elle seule
    accompagneId: !NIVEAUX_ACCOMPAGNE.includes(visibilite) ? null
      : estAccompagne(req) ? req.utilisateur.id
        : body.accompagneId || null,
    auxiliaires: estAuxiliaire(req) || Boolean(body.auxiliaires)
  }
}

// La personne choisie doit être accompagnée dans ce cercle
async function verifierAccompagne(req, saisie) {
  if (!saisie.accompagneId || estAccompagne(req)) return saisie
  if (!/^[0-9a-f-]{36}$/i.test(saisie.accompagneId)) throw new ErreurSaisie('Personne accompagnée inconnue')
  const [m] = await db.select({ id: membres.id }).from(membres).where(and(
    eq(membres.cercleId, req.cercle.id), eq(membres.utilisateurId, saisie.accompagneId), eq(membres.role, 'accompagne')
  ))
  if (!m) throw new ErreurSaisie('Personne accompagnée inconnue dans ce cercle')
  return saisie
}

const modificateur = alias(utilisateurs, 'modificateur')
const concerne = alias(utilisateurs, 'concerne')

const colonnes = {
  id: rendezVous.id,
  titre: rendezVous.titre,
  lieu: rendezVous.lieu,
  notes: rendezVous.notes,
  debut: rendezVous.debut,
  fin: rendezVous.fin,
  journeeEntiere: rendezVous.journeeEntiere,
  visibilite: rendezVous.visibilite,
  accompagneId: rendezVous.accompagneId,
  accompagnePrenom: concerne.prenom,
  auxiliaires: rendezVous.auxiliaires,
  recurrence: rendezVous.recurrence,
  intervalle: rendezVous.intervalle,
  recurrenceFin: rendezVous.recurrenceFin,
  rappel: rendezVous.rappel,
  creeParId: rendezVous.creeParId,
  creeParPrenom: utilisateurs.prenom,
  modifieParId: rendezVous.modifieParId,
  modifieParPrenom: modificateur.prenom,
  exclusions: rendezVous.exclusions,
  modifieLe: rendezVous.modifieLe
}

const estVisible = (req, rdv) => peutVoir(qui(req), rdv)

// Une occurrence garde l'identifiant de sa série ; `cle` la distingue des autres
// et serieDebut / serieFin servent à modifier la série entière.
const presenter = (req, serie = null) => ({ creeParId, occurrence = 0, exclusions, modifieParId, modifieParPrenom, ...rdv }) => ({
  ...rdv,
  cle: `${rdv.id}:${occurrence}`,
  occurrence,
  // « Modifié par … » seulement quand ce n'est pas l'auteur qui a fait la dernière modification
  modifieParPrenom: modifieParId && modifieParId !== creeParId ? modifieParPrenom : null,
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
    .leftJoin(modificateur, eq(rendezVous.modifieParId, modificateur.id))
    .leftJoin(concerne, eq(rendezVous.accompagneId, concerne.id))
    .where(and(eq(rendezVous.cercleId, req.cercle.id), or(and(...simples), and(...series))))
    .orderBy(asc(rendezVous.debut))
    .limit(1000)
  // Une personne accompagnée ne voit pas du tout les rendez-vous destinés à une autre
  // (pas de « Rendez-vous privé » qui l'inquiéterait sur sa tablette)
  const pourUneAutre = (serie) => estAccompagne(req) && NIVEAUX_ACCOMPAGNE.includes(serie.visibilite) &&
    serie.accompagneId && serie.accompagneId !== req.utilisateur.id && serie.creeParId !== req.utilisateur.id
  const liste = lignes
    .filter((serie) => !pourUneAutre(serie))
    .flatMap((serie) => occurrences(serie, depuis, jusqua).map((o) => (estVisible(req, serie) ? presenter(req, serie)(o) : masquer(o))))
    .sort((a, b) => a.debut - b.debut)
    .slice(0, 2000)
  res.json(liste)
})

router.post('/', async (req, res) => {
  const saisie = await verifierAccompagne(req, lireSaisie(req))
  const [rdv] = await db.insert(rendezVous)
    .values({ ...saisie, rappel: saisie.rappel ?? null, cercleId: req.cercle.id, creeParId: req.utilisateur.id })
    .returning()
  const [personne] = rdv.accompagneId ? await db.select({ prenom: utilisateurs.prenom }).from(utilisateurs).where(eq(utilisateurs.id, rdv.accompagneId)) : []
  res.status(201).json(presenter(req)({ ...rdv, creeParPrenom: req.utilisateur.prenom, accompagnePrenom: personne?.prenom ?? null }))
})

async function chargerRendezVous(req, res, next) {
  const [rdv] = await db.select().from(rendezVous).where(and(eq(rendezVous.id, req.params.rdvId), filtreVisibles(req)))
  if (!rdv) return res.status(404).json({ erreur: 'Rendez-vous introuvable' })
  if (!peutModifier(req, rdv)) return res.status(403).json({ erreur: 'Seuls son auteur et les aidants peuvent modifier ce rendez-vous' })
  req.rdv = rdv
  next()
}

// Pour une série qui se répète, on agit sur une date (« occurrence »), sur cette date
// et les suivantes (« suivantes ») ou sur toute la série (« serie », par défaut).
// `occurrence` est le numéro de la répétition concernée (0 = la première).
function lirePortee(req) {
  const portee = req.body?.portee ?? req.query.portee ?? 'serie'
  if (!['occurrence', 'suivantes', 'serie'].includes(portee)) throw new ErreurSaisie('Portée invalide')
  const numero = Number(req.body?.occurrence ?? req.query.occurrence ?? 0)
  if (!Number.isInteger(numero) || numero < 0) throw new ErreurSaisie('Date invalide')
  const occ = occurrenceNumero(req.rdv, numero)
  if (!occ) throw new ErreurSaisie('Cette date ne fait pas partie du rendez-vous')
  if (req.rdv.recurrence === 'aucune' || (portee === 'suivantes' && numero === 0)) return { portee: 'serie', numero, occ }
  return { portee, numero, occ }
}

// Fin d'une série coupée : 23h59 la veille de la date où elle s'arrête (le formulaire
// affiche la fin de répétition au jour près)
const veille = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 23, 59)

// Le formulaire envoie les dates de la répétition modifiée
router.put('/:rdvId', chargerRendezVous, async (req, res) => {
  const serie = req.rdv
  const saisie = lireSaisie(req)
  if (serie.creeParId !== req.utilisateur.id) {
    saisie.visibilite = serie.visibilite
    saisie.accompagneId = serie.accompagneId
    saisie.auxiliaires = serie.auxiliaires
  } else await verifierAccompagne(req, saisie)
  saisie.modifieParId = req.utilisateur.id
  if (saisie.rappel === undefined) saisie.rappel = serie.rappel
  const { portee, numero, occ } = lirePortee(req)
  const copie = { ...saisie, cercleId: serie.cercleId, creeParId: serie.creeParId }
  await db.transaction(async (tx) => {
    if (portee === 'serie') {
      // Déplacer une date déplace toute la série d'autant
      const debut = new Date(serie.debut.getTime() + (saisie.debut - occ.debut))
      const fin = saisie.fin ? new Date(debut.getTime() + (saisie.fin - saisie.debut)) : null
      const memeRythme = saisie.recurrence === serie.recurrence && saisie.intervalle === serie.intervalle && +debut === +serie.debut
      await tx.update(rendezVous).set({ ...saisie, debut, fin, exclusions: memeRythme ? serie.exclusions : [] })
        .where(eq(rendezVous.id, serie.id))
    } else if (portee === 'occurrence') {
      // La date sort de la série et devient un rendez-vous à part
      await tx.update(rendezVous).set({ exclusions: [...serie.exclusions, numero] }).where(eq(rendezVous.id, serie.id))
      await tx.insert(rendezVous).values({ ...copie, recurrence: 'aucune', intervalle: 1, recurrenceFin: null })
    } else {
      // La série s'arrête avant cette date ; une nouvelle série prend le relais
      await tx.update(rendezVous).set({ recurrenceFin: veille(occ.debut) }).where(eq(rendezVous.id, serie.id))
      await tx.insert(rendezVous).values(copie)
    }
  })
  res.status(204).end()
})

router.delete('/:rdvId', chargerRendezVous, async (req, res) => {
  const { portee, numero, occ } = lirePortee(req)
  if (portee === 'serie') await db.delete(rendezVous).where(eq(rendezVous.id, req.rdv.id))
  else if (portee === 'occurrence') {
    await db.update(rendezVous).set({ exclusions: [...req.rdv.exclusions, numero], modifieParId: req.utilisateur.id }).where(eq(rendezVous.id, req.rdv.id))
  } else {
    await db.update(rendezVous).set({ recurrenceFin: veille(occ.debut), modifieParId: req.utilisateur.id }).where(eq(rendezVous.id, req.rdv.id))
  }
  res.status(204).end()
})

export default router
