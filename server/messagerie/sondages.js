import { and, eq, inArray, isNull, isNotNull, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { sondages, sondageReponses } from '../db/schema.js'
import { ErreurSaisie } from '../auth/validation.js'
import * as valider from '../auth/validation.js'
import { envoyerAlerte } from '../alertes/envoi.js'
import { participants } from './droits.js'

// Sondage de dates façon Doodle (repris du « Repas à organiser » de FamilyGest), publié dans
// « Toute la famille ». Choix de Julien (2026-10-01) :
// - aidants et proches lancent un sondage ; tout le monde y répond (personnes accompagnées
//   comprises, depuis leur tablette : Oui / Peut-être / Non pour chaque date) ;
// - un aidant peut répondre à la place d'une personne accompagnée (« répondu par … ») ;
// - relance : bouton « Relancer » et alerte automatique la veille de la date limite ;
// - la date retenue crée un rendez-vous dans l'agenda et un message prévient la famille.

export const REPONSES = ['oui', 'peut_etre', 'non']
export const MOMENTS = ['journee', 'midi', 'soir', 'heure']
export const MAX_DATES = 30
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const HEURE_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// Une date AAAA-MM-JJ qui existe vraiment
export function dateValide(d) {
  if (typeof d !== 'string' || !DATE_RE.test(d)) return false
  const [a, m, j] = d.split('-').map(Number)
  const x = new Date(Date.UTC(a, m - 1, j))
  return x.getUTCMonth() === m - 1 && x.getUTCDate() === j
}

// Dates proposées : valides, sans doublon, triées
export function nettoyerDates(dates) {
  if (!Array.isArray(dates)) return []
  return [...new Set(dates.map((d) => String(d).trim()).filter(dateValide))].sort().slice(0, MAX_DATES)
}

// Saisie d'un sondage (création ou modification)
export function lireSondage(body) {
  const dates = nettoyerDates(body.dates)
  if (!dates.length) throw new ErreurSaisie('Choisissez au moins une date')
  const moment = body.moment ?? 'journee'
  if (!MOMENTS.includes(moment)) throw new ErreurSaisie('Moment invalide')
  const heure = moment === 'heure' ? String(body.heure ?? '') : null
  if (moment === 'heure' && !HEURE_RE.test(heure)) throw new ErreurSaisie('Indiquez l\'heure (par exemple 14:30)')
  const dateLimite = body.dateLimite || null
  if (dateLimite && !dateValide(dateLimite)) throw new ErreurSaisie('Date limite invalide')
  return {
    titre: valider.texte(body.titre, 'titre', { max: 120 }),
    lieu: valider.texte(body.lieu, 'lieu', { obligatoire: false, max: 200 }),
    moment,
    heure,
    dates,
    dateLimite
  }
}

// Réponses d'une personne : seulement les dates du sondage et les trois réponses possibles
export function nettoyerReponses(reponses, dates) {
  const permises = new Set(dates)
  return Object.fromEntries(Object.entries(reponses && typeof reponses === 'object' ? reponses : {})
    .filter(([d, r]) => permises.has(d) && REPONSES.includes(r)))
}

// Décompte par date ; la meilleure : le plus de « oui », puis de « peut-être »
export function resumer(sondage, reponses) {
  const parDate = sondage.dates.map((date) => {
    const n = { date, oui: 0, peutEtre: 0, non: 0 }
    for (const r of reponses) {
      const v = r.reponses?.[date]
      if (v === 'oui') n.oui++
      else if (v === 'peut_etre') n.peutEtre++
      else if (v === 'non') n.non++
    }
    return n
  })
  const meilleure = parDate.reduce((a, d) => (!a || d.oui > a.oui || (d.oui === a.oui && d.peutEtre > a.peutEtre) ? d : a), null)
  return { parDate, meilleure: meilleure && (meilleure.oui || meilleure.peutEtre) ? meilleure.date : null }
}

// A-t-elle répondu (au moins une date) ?
export const aRepondu = (r) => Boolean(r && Object.keys(r.reponses ?? {}).length)

// Sondages et réponses de plusieurs messages (fil d'une conversation)
export async function sondagesDesMessages(messageIds) {
  if (!messageIds.length) return new Map()
  const liste = await db.select().from(sondages).where(inArray(sondages.messageId, messageIds))
  const reponses = liste.length
    ? await db.select().from(sondageReponses).where(inArray(sondageReponses.sondageId, liste.map((s) => s.id)))
    : []
  return new Map(liste.map((s) => [s.messageId, { sondage: s, reponses: reponses.filter((r) => r.sondageId === s.id) }]))
}

export async function chargerSondage(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null
  const [s] = await db.select().from(sondages).where(eq(sondages.id, id))
  if (!s) return null
  const reponses = await db.select().from(sondageReponses).where(eq(sondageReponses.sondageId, s.id))
  return { sondage: s, reponses }
}

// Qui répond : les participants de la conversation (voir participants() dans droits.js)
// moi : membre du cercle ; repondants : participants
export function presenterSondage({ sondage, reponses }, { moi, repondants, lienAvatar, detail = false }) {
  const ouvert = !sondage.dateRetenue
  const parPersonne = new Map(reponses.map((r) => [r.utilisateurId, r]))
  const mienne = parPersonne.get(moi.utilisateurId)
  const ontRepondu = repondants.filter((m) => aRepondu(parPersonne.get(m.utilisateurId)))
  const resultat = {
    id: sondage.id,
    titre: sondage.titre,
    lieu: sondage.lieu,
    moment: sondage.moment,
    heure: sondage.heure,
    dates: sondage.dates,
    dateLimite: sondage.dateLimite,
    dateRetenue: sondage.dateRetenue,
    rendezVousId: sondage.rendezVousId,
    ouvert,
    ...resumer(sondage, reponses.filter((r) => repondants.some((m) => m.utilisateurId === r.utilisateurId))),
    mesReponses: mienne?.reponses ?? {},
    monCommentaire: mienne?.commentaire ?? '',
    nombre: repondants.length,
    repondu: ontRepondu.length,
    ontRepondu: ontRepondu.map((m) => ({ utilisateurId: m.utilisateurId, prenom: m.prenom, avatar: lienAvatar(m.utilisateurId, m.avatar) })),
    attendus: repondants.filter((m) => !aRepondu(parPersonne.get(m.utilisateurId))).map((m) => m.prenom),
    // Lancer, modifier, relancer, retenir une date : son auteur et les aidants
    peutGerer: sondage.creeParId === moi.utilisateurId || moi.role === 'aidant',
    peutRepondre: ouvert && repondants.some((m) => m.utilisateurId === moi.utilisateurId)
  }
  if (detail) {
    resultat.lignes = repondants.map((m) => {
      const r = parPersonne.get(m.utilisateurId)
      const par = r?.reponduParId && r.reponduParId !== m.utilisateurId ? repondants.find((x) => x.utilisateurId === r.reponduParId)?.prenom ?? 'un aidant' : null
      return {
        utilisateurId: m.utilisateurId,
        prenom: m.prenom,
        role: m.role,
        avatar: lienAvatar(m.utilisateurId, m.avatar),
        moi: m.utilisateurId === moi.utilisateurId,
        reponses: r?.reponses ?? {},
        commentaire: r?.commentaire ?? '',
        reponduPar: par,
        // Un aidant peut répondre pour une personne accompagnée
        modifiable: ouvert && (m.utilisateurId === moi.utilisateurId || (moi.role === 'aidant' && m.role === 'accompagne'))
      }
    })
  }
  return resultat
}

// Sondages ouverts dont la date limite est demain : relance automatique, une fois, à partir de 10 h
export async function sondagesARelancer(maintenant) {
  if (maintenant.getHours() < 10) return []
  const demain = new Date(maintenant)
  demain.setDate(demain.getDate() + 1)
  const jour = `${demain.getFullYear()}-${String(demain.getMonth() + 1).padStart(2, '0')}-${String(demain.getDate()).padStart(2, '0')}`
  return db.select().from(sondages).where(and(
    isNull(sondages.dateRetenue), isNull(sondages.relanceAutoLe), isNotNull(sondages.dateLimite),
    sql`${sondages.dateLimite} <= ${jour}::date`, sql`${sondages.dateLimite} >= ${jour}::date - 1`,
    sql`not exists (select 1 from messages m where m.id = ${sondages.messageId} and m.retire_le is not null)`
  ))
}

// « samedi 17 octobre »
export function jourEnClair(date) {
  const [a, m, j] = date.split('-').map(Number)
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// « à midi », « le soir », « à 14h30 », « » (journée)
export function momentEnClair(s) {
  if (s.moment === 'midi') return 'à midi'
  if (s.moment === 'soir') return 'le soir'
  if (s.moment === 'heure' && s.heure) return `à ${s.heure.replace(':', 'h')}`
  return ''
}

// Alerte aux personnes qui n'ont pas encore répondu (aussi envoyée automatiquement la veille de
// la date limite, server/alertes/planificateur.js)
export async function relancerSondage(sondage, conversation, liste, { auteur = null } = {}) {
  const { reponses } = await chargerSondage(sondage.id)
  const faites = new Map(reponses.map((r) => [r.utilisateurId, r]))
  const attendus = participants(conversation, liste).filter((m) => !aRepondu(faites.get(m.utilisateurId)) && m.utilisateurId !== auteur?.utilisateurId)
  const corps = `${sondage.titre} : ${sondage.dateLimite ? `réponses attendues avant le ${jourEnClair(sondage.dateLimite)}` : 'dites quels jours vous pouvez venir'}`
  const tag = `sondage-${sondage.id}`
  await envoyerAlerte(attendus.filter((m) => m.role === 'accompagne').map((m) => m.utilisateurId), { categorie: 'messages', titre: 'On attend ta réponse', corps, url: '/messages', tag })
  await envoyerAlerte(attendus.filter((m) => m.role !== 'accompagne').map((m) => m.utilisateurId), {
    categorie: 'messages', titre: 'Sondage · Toute la famille', corps, url: `/cercles/${conversation.cercleId}/messages?c=${conversation.id}&sondage=${sondage.id}`, tag
  })
  return attendus.map((m) => m.prenom)
}
