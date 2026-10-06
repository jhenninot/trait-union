import { and, eq, ne, or, lt, gte, isNull, isNotNull, inArray, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { rendezVous, rappelsEnvoyes, membres, utilisateurs, photos, albums, anniversairesEnvoyes, parametres, appareilsAlertes, sessions, personnes } from '../db/schema.js'
import { occurrences } from '../agenda/recurrence.js'
import { peutVoir } from '../routes/agenda.js'
import { lienAffichage } from '../routes/photos.js'
import { stockageActif } from '../stockage/s3.js'
import { aLesDroits } from '../auth/roles.js'
import { envoyerAlerte, envoyerAux } from './envoi.js'
import { derniereApk } from '../application.js'
import { joursFetes, age } from '../anniversaires.js'
import { chargerArbre, parente } from '../arbre.js'
import { purgerMessages } from '../messagerie/conservation.js'
import { sondagesARelancer, relancerSondage } from '../messagerie/sondages.js'
import { membresCercle } from '../messagerie/droits.js'
import { sondages, conversations } from '../db/schema.js'

// Tâche de fond lancée au démarrage du serveur : chaque minute, elle envoie
// - les rappels de rendez-vous dont l'heure est arrivée ;
// - les alertes « nouvelles photos », une par personne qui a envoyé des photos, quand elle n'en
//   a plus ajouté depuis 2 minutes (envoyer 20 photos ne fait qu'une alerte) ;
// - les anniversaires du jour, à partir de 9 h, aux autres membres des cercles de la personne.
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

// Les alertes d'anniversaire partent entre 9 h et 21 h (rattrapage si le serveur était arrêté à 9 h)
const HEURE_ANNIVERSAIRES = 9
const FIN_ANNIVERSAIRES = 21

async function envoyerAnniversaires(maintenant) {
  if (maintenant.getHours() < HEURE_ANNIVERSAIRES || maintenant.getHours() >= FIN_ANNIVERSAIRES) return
  const fetes = await db.select({ id: utilisateurs.id, prenom: utilisateurs.prenom, nom: utilisateurs.nom, dateNaissance: utilisateurs.dateNaissance })
    .from(utilisateurs)
    .where(and(
      isNull(utilisateurs.desactiveLe),
      inArray(sql`to_char(${utilisateurs.dateNaissance}, 'MM-DD')`, joursFetes(maintenant)),
      // Pas de « 0 an » le jour de la naissance
      sql`extract(year from ${utilisateurs.dateNaissance}) < ${maintenant.getFullYear()}`
    ))
  const finDeJournee = new Date(maintenant)
  finDeJournee.setHours(23, 59, 59, 0)
  const duree = Math.max(600, Math.round((finDeJournee - maintenant) / 1000))
  for (const fete of fetes) {
    // Une seule fois par an, même avec plusieurs serveurs ou après un redémarrage
    const [nouveau] = await db.insert(anniversairesEnvoyes)
      .values({ utilisateurId: fete.id, annee: maintenant.getFullYear() })
      .onConflictDoNothing()
      .returning({ id: anniversairesEnvoyes.id })
    if (!nouveau) continue
    // Tous les autres membres de ses cercles, sauf les auxiliaires de vie (qui ne voient pas
    // les dates de naissance) ; une seule alerte par personne même avec plusieurs cercles en commun
    const destinataires = new Map()
    const cercles = await db.select({ cercleId: membres.cercleId }).from(membres).where(eq(membres.utilisateurId, fete.id))
    for (const { cercleId } of cercles) {
      for (const m of await membresDuCercle(cercleId)) {
        if (m.utilisateurId === fete.id || (!m.peutGerer && m.role === 'auxiliaire') || destinataires.has(m.utilisateurId)) continue
        destinataires.set(m.utilisateurId, { ...m, cercleId })
      }
    }
    const n = age(fete.dateNaissance, maintenant)
    const nom = [fete.prenom, fete.nom].filter(Boolean).join(' ')
    const alerte = {
      categorie: 'anniversaires',
      titre: `Anniversaire de ${fete.prenom}`,
      corps: `${nom} fête ses ${n} an${n > 1 ? 's' : ''} aujourd'hui.`,
      tag: `anniversaire-${fete.id}-${maintenant.getFullYear()}`
    }
    const liste = [...destinataires.values()]
    await envoyerAlerte(liste.filter((m) => m.role === 'accompagne').map((m) => m.utilisateurId), { ...alerte, url: '/' }, { duree })
    // Les aidants et la famille arrivent sur « Famille et aidants » du cercle
    const parCercle = Map.groupBy(liste.filter((m) => m.role !== 'accompagne'), (m) => m.cercleId)
    for (const [cercleId, ms] of parCercle) {
      await envoyerAlerte(ms.map((m) => m.utilisateurId), { ...alerte, url: `/cercles/${cercleId}` }, { duree })
    }
  }
  await envoyerAnniversairesArbre(maintenant, duree)
  // Les traces des années passées ne servent plus
  await db.delete(anniversairesEnvoyes).where(lt(anniversairesEnvoyes.annee, maintenant.getFullYear() - 1))
}

// Anniversaires des personnes de l'arbre généalogique qui n'ont pas de compte (un jeune enfant) :
// aux membres de leur cercle, sauf les auxiliaires de vie ; aux personnes accompagnées seulement
// si la fiche leur est visible. Pas d'alerte pour un défunt.
async function envoyerAnniversairesArbre(maintenant, duree) {
  const fetes = await db.select().from(personnes).where(and(
    isNull(personnes.utilisateurId),
    eq(personnes.exterieur, false),
    eq(personnes.decede, false),
    inArray(sql`to_char(${personnes.dateNaissance}, 'MM-DD')`, joursFetes(maintenant)),
      // Pas de « 0 an » le jour de la naissance
      sql`extract(year from ${personnes.dateNaissance}) < ${maintenant.getFullYear()}`
  ))
  for (const fete of fetes) {
    const [nouveau] = await db.insert(anniversairesEnvoyes)
      .values({ personneId: fete.id, annee: maintenant.getFullYear() })
      .onConflictDoNothing()
      .returning({ id: anniversairesEnvoyes.id })
    if (!nouveau) continue
    const n = age(fete.dateNaissance, maintenant)
    const nom = [fete.prenom, fete.nom].filter(Boolean).join(' ')
    const ans = `${n} an${n > 1 ? 's' : ''}`
    const alerte = { categorie: 'anniversaires', titre: `Anniversaire de ${fete.prenom}`, tag: `anniversaire-${fete.id}-${maintenant.getFullYear()}` }
    const ms = (await membresDuCercle(fete.cercleId)).filter((m) => m.peutGerer || m.role !== 'auxiliaire')
    await envoyerAlerte(ms.filter((m) => m.role !== 'accompagne').map((m) => m.utilisateurId),
      { ...alerte, corps: `${nom} fête ses ${ans} aujourd'hui.`, url: `/cercles/${fete.cercleId}/arbre` }, { duree })
    if (!fete.visibleAide) continue
    // La personne accompagnée lit le lien : « Léo, votre arrière-petit-fils, fête ses 4 ans aujourd'hui. »
    const g = await chargerArbre(fete.cercleId)
    for (const m of ms.filter((x) => x.role === 'accompagne')) {
      const moi = g.personnes.find((p) => p.utilisateurId === m.utilisateurId)
      const r = moi ? parente(g, moi.id, fete.id) : null
      const lien = r && !/ de /.test(r.lien) ? `, votre ${r.lien.toLowerCase()},` : ''
      await envoyerAlerte([m.utilisateurId], { ...alerte, corps: `${fete.prenom}${lien} fête ses ${ans} aujourd'hui.`, url: '/famille' }, { duree })
    }
  }
}

// Nouvelle APK publiée (vérifiée une fois par heure) : alerte sur les téléphones des aidants et de
// la famille qui ont l'application Android avec les alertes et une version plus ancienne. Pas sur
// les appareils des personnes accompagnées : ce sont les aidants qui les mettent à jour.
const INTERVALLE_APK = 60 * MINUTE
let apkVerifieeLe = 0

async function annoncerApplication(maintenant) {
  if (maintenant - apkVerifieeLe < INTERVALLE_APK) return
  apkVerifieeLe = maintenant.getTime()
  const apk = await derniereApk({ forcer: true })
  if (!apk) return
  const [connue] = await db.select().from(parametres).where(eq(parametres.cle, 'apk'))
  // Premier démarrage : on retient la version publiée, sans rien annoncer
  if (!connue) {
    await db.insert(parametres).values({ cle: 'apk', valeur: { version: apk.version } }).onConflictDoNothing()
    return
  }
  // Une seule fois, même avec plusieurs serveurs
  const nouvelle = await db.update(parametres).set({ valeur: { version: apk.version } })
    .where(and(eq(parametres.cle, 'apk'), sql`coalesce((${parametres.valeur}->>'version')::int, 0) < ${apk.version}`))
    .returning()
  if (!nouvelle.length) return
  const lignes = await db.select({ appareil: appareilsAlertes, alertes: utilisateurs.alertes })
    .from(appareilsAlertes)
    .innerJoin(sessions, eq(appareilsAlertes.sessionId, sessions.id))
    .innerJoin(utilisateurs, eq(appareilsAlertes.utilisateurId, utilisateurs.id))
    .where(and(
      eq(appareilsAlertes.type, 'android'),
      ne(sessions.type, 'appareil'),
      isNull(utilisateurs.desactiveLe),
      or(isNull(sessions.versionApk), lt(sessions.versionApk, apk.version))
    ))
  const appareils = lignes.filter((l) => l.alertes?.application !== false).map((l) => l.appareil)
  if (!appareils.length) return
  await envoyerAux(appareils, {
    categorie: 'application',
    titre: 'Nouvelle version de l\'application',
    corps: `La version ${apk.nom} de Trait d'union est disponible. Touchez pour l'installer.`,
    url: '/application',
    tag: 'application'
  }, { duree: 7 * 86_400, urgent: false })
}

// Messages trop anciens effacés (durée de conservation), une fois par heure
let dernierePurge = 0
async function purger(maintenant) {
  if (maintenant - dernierePurge < 60 * MINUTE) return
  dernierePurge = maintenant.getTime()
  const n = await purgerMessages(maintenant)
  if (n) console.log(`Messagerie : ${n} message${n > 1 ? 's' : ''} effacé${n > 1 ? 's' : ''} (durée de conservation)`)
}

// Sondages de dates : la veille de la date limite (à partir de 10 h), une alerte à ceux qui
// n'ont pas encore répondu
async function relancerSondages(maintenant) {
  for (const sondage of await sondagesARelancer(maintenant)) {
    await db.update(sondages).set({ relanceAutoLe: maintenant }).where(eq(sondages.id, sondage.id))
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, sondage.conversationId))
    if (conversation) await relancerSondage(sondage, conversation, await membresCercle(sondage.cercleId))
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
  }
  try {
    await envoyerAnniversaires(maintenant)
  } catch (e) {
    console.error('Alertes d\'anniversaire :', e)
  }
  try {
    await relancerSondages(maintenant)
  } catch (e) {
    console.error('Relance des sondages :', e)
  }
  try {
    await purger(maintenant)
  } catch (e) {
    console.error('Conservation des messages :', e)
  }
  try {
    await annoncerApplication(maintenant)
  } catch (e) {
    console.error('Nouvelle version de l\'application :', e)
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
