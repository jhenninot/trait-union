import { and, eq, ne, or, lt, gte, isNull, isNotNull, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { rendezVous, rappelsEnvoyes, membres, utilisateurs, photos, albums } from '../db/schema.js'
import { occurrences } from '../agenda/recurrence.js'
import { peutVoir } from '../routes/agenda.js'
import { lienAffichage } from '../routes/photos.js'
import { stockageActif } from '../stockage/s3.js'
import { aLesDroits } from '../auth/roles.js'
import { envoyerAlerte } from './envoi.js'

// Tâche de fond lancée au démarrage du serveur : chaque minute, elle envoie
// - les rappels de rendez-vous dont l'heure est arrivée ;
// - les alertes « nouvelles photos », une par personne qui a envoyé des photos, quand elle n'en
//   a plus ajouté depuis 2 minutes (envoyer 20 photos ne fait qu'une alerte).
const MINUTE = 60_000
const JOUR = 1440 * MINUTE
// Un rappel en retard (serveur arrêté) part encore s'il a moins de 15 minutes
const RETARD_MAX = 15 * MINUTE
const CALME_PHOTOS = 2 * MINUTE

// Heure à laquelle part l'alerte d'une répétition : `rappel` minutes avant le début, ou avant
// 9 h le premier jour pour une journée entière (0 = le matin même, 1440 = la veille à 9 h)
export function heureAlerte(rdv, occ) {
  const reference = new Date(occ.debut)
  if (rdv.journeeEntiere) reference.setHours(9, 0, 0, 0)
  return { reference, alerte: new Date(reference.getTime() - rdv.rappel * MINUTE) }
}

// Membres du cercle qui ont un compte actif, avec ce qu'il faut pour appliquer les droits
async function membresDuCercle(cercleId) {
  const liste = await db.select({ utilisateurId: membres.utilisateurId, role: membres.role, estAdmin: utilisateurs.estAdmin })
    .from(membres)
    .innerJoin(utilisateurs, eq(membres.utilisateurId, utilisateurs.id))
    .where(and(eq(membres.cercleId, cercleId), isNull(utilisateurs.desactiveLe)))
  return liste.map((m) => ({ ...m, peutGerer: m.estAdmin || aLesDroits(m.role, 'aidant') }))
}

const deux = (n) => String(n).padStart(2, '0')
const heure = (d) => `${d.getHours()}h${deux(d.getMinutes())}`
const memeJour = (a, b) => a.toDateString() === b.toDateString()

function nomDuJour(d, maintenant) {
  const demain = new Date(maintenant)
  demain.setDate(demain.getDate() + 1)
  if (memeJour(d, maintenant)) return 'Aujourd\'hui'
  if (memeJour(d, demain)) return 'Demain'
  const texte = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

// « Aujourd'hui à 14h30 · Cabinet du Dr Martin », « Demain, toute la journée »
export function texteRappel(rdv, occ, maintenant = new Date()) {
  const debut = new Date(occ.debut)
  const quand = rdv.journeeEntiere ? `${nomDuJour(debut, maintenant)}, toute la journée` : `${nomDuJour(debut, maintenant)} à ${heure(debut)}`
  return rdv.lieu ? `${quand} · ${rdv.lieu}` : quand
}

async function envoyerRappels(maintenant) {
  const depuis = new Date(maintenant - RETARD_MAX)
  // Rendez-vous avec alerte qui peuvent avoir une répétition dans les 8 prochains jours
  // (alerte au plus une semaine avant, plus 9 h pour une journée entière)
  const horizon = new Date(maintenant.getTime() + 8 * JOUR)
  const candidats = await db.select().from(rendezVous).where(and(
    isNotNull(rendezVous.rappel),
    lt(rendezVous.debut, horizon),
    or(
      and(eq(rendezVous.recurrence, 'aucune'), gte(rendezVous.debut, new Date(depuis - JOUR))),
      and(ne(rendezVous.recurrence, 'aucune'), or(isNull(rendezVous.recurrenceFin), gte(rendezVous.recurrenceFin, new Date(depuis - JOUR))))
    )
  ))
  const membresParCercle = new Map()
  for (const rdv of candidats) {
    // Les répétitions qui commencent dans la fenêtre possible, puis celles dont l'alerte est due
    const fenetreDebut = new Date(depuis.getTime() - JOUR)
    const fenetreFin = new Date(maintenant.getTime() + rdv.rappel * MINUTE + JOUR)
    const dues = occurrences(rdv, fenetreDebut, fenetreFin).filter((occ) => {
      const { alerte } = heureAlerte(rdv, occ)
      return alerte > depuis && alerte <= maintenant && new Date(occ.debut) >= fenetreDebut
    })
    for (const occ of dues) {
      const { reference, alerte } = heureAlerte(rdv, occ)
      // Une seule fois, même avec plusieurs serveurs ou après un redémarrage
      const [nouveau] = await db.insert(rappelsEnvoyes)
        .values({ rendezVousId: rdv.id, occurrence: occ.occurrence, prevuLe: alerte })
        .onConflictDoNothing()
        .returning({ id: rappelsEnvoyes.id })
      if (!nouveau) continue
      if (!membresParCercle.has(rdv.cercleId)) membresParCercle.set(rdv.cercleId, await membresDuCercle(rdv.cercleId))
      // Seulement les personnes qui voient le rendez-vous (mêmes règles que l'agenda)
      const destinataires = membresParCercle.get(rdv.cercleId).filter((m) => peutVoir(m, rdv))
      const corps = texteRappel(rdv, occ, maintenant)
      for (const chemin of ['accompagne', 'autres']) {
        const ids = destinataires.filter((m) => (m.role === 'accompagne') === (chemin === 'accompagne')).map((m) => m.utilisateurId)
        await envoyerAlerte(ids, {
          categorie: 'rendezVous',
          titre: rdv.titre,
          corps,
          url: chemin === 'accompagne' ? '/agenda' : `/cercles/${rdv.cercleId}/agenda`,
          tag: `rdv-${rdv.id}-${occ.occurrence}`
        }, { urgent: true, duree: Math.max(600, Math.round((reference - maintenant) / 1000) + 3600) })
      }
    }
  }
  // Les traces de plus d'un mois ne servent plus
  await db.delete(rappelsEnvoyes).where(lt(rappelsEnvoyes.prevuLe, new Date(maintenant - 31 * JOUR)))
}

async function envoyerPhotos(maintenant) {
  // Personnes qui ont publié des photos pas encore annoncées et n'en ajoutent plus
  const groupes = await db.select({ cercleId: photos.cercleId, creeParId: photos.creeParId })
    .from(photos)
    .where(and(eq(photos.statut, 'publiee'), isNull(photos.alerteLe)))
    .groupBy(photos.cercleId, photos.creeParId)
    .having(lt(sql`max(${photos.modifieLe})`, new Date(maintenant - CALME_PHOTOS)))
  if (!groupes.length) return
  const stockage = await stockageActif()
  for (const { cercleId, creeParId } of groupes) {
    const annoncees = await db.update(photos).set({ alerteLe: maintenant })
      .where(and(
        eq(photos.cercleId, cercleId),
        creeParId ? eq(photos.creeParId, creeParId) : isNull(photos.creeParId),
        eq(photos.statut, 'publiee'),
        isNull(photos.alerteLe)
      ))
      .returning()
    if (!annoncees.length) continue
    const n = annoncees.length
    const [auteur] = creeParId ? await db.select({ prenom: utilisateurs.prenom }).from(utilisateurs).where(eq(utilisateurs.id, creeParId)) : []
    const idsAlbums = [...new Set(annoncees.map((p) => p.albumId))]
    let dansAlbum = ''
    if (idsAlbums.length === 1 && idsAlbums[0]) {
      const [album] = await db.select({ nom: albums.nom }).from(albums).where(eq(albums.id, idsAlbums[0]))
      if (album) dansAlbum = ` dans l'album « ${album.nom} »`
    }
    const quoi = n === 1 ? 'une photo' : `${n} photos`
    let corps = `${auteur?.prenom ?? 'Quelqu\'un'} a ajouté ${quoi}${dansAlbum}`
    if (n === 1 && annoncees[0].legende) corps += ` : ${annoncees[0].legende}`
    const plusRecente = annoncees.reduce((a, b) => (a.creeLe > b.creeLe ? a : b))
    const image = stockage ? lienAffichage(stockage, plusRecente, 'miniature') : null
    // Pas les auxiliaires de vie (pas d'accès aux photos), ni la personne qui les a envoyées
    const destinataires = (await membresDuCercle(cercleId))
      .filter((m) => m.utilisateurId !== creeParId && (m.peutGerer || m.role !== 'auxiliaire'))
    const album = idsAlbums.length === 1 ? idsAlbums[0] : null
    for (const chemin of ['accompagne', 'autres']) {
      const ids = destinataires.filter((m) => (m.role === 'accompagne') === (chemin === 'accompagne')).map((m) => m.utilisateurId)
      await envoyerAlerte(ids, {
        categorie: 'photos',
        titre: n === 1 ? 'Nouvelle photo' : 'Nouvelles photos',
        corps,
        url: chemin === 'accompagne' ? (album ? `/photos?album=${album}` : '/photos') : `/cercles/${cercleId}/photos`,
        tag: `photos-${cercleId}`,
        image
      }, { duree: 2 * 86_400 })
    }
  }
}

let enCours = false
async function tour() {
  if (enCours) return
  enCours = true
  const maintenant = new Date()
  try {
    await envoyerRappels(maintenant)
  } catch (e) {
    console.error('Rappels de rendez-vous :', e)
  }
  try {
    await envoyerPhotos(maintenant)
  } catch (e) {
    console.error('Alertes photos :', e)
  } finally {
    enCours = false
  }
}

export function demarrerAlertes() {
  setTimeout(tour, 5000)
  setInterval(tour, MINUTE).unref()
}

// Pour les essais : un tour immédiat
export const tourAlertes = tour
