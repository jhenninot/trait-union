import { and, eq, or, ne, lt, gte, isNull, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { membres, rendezVous, albums } from '../db/schema.js'
import { occurrences } from '../agenda/recurrence.js'
import { mesCercles } from '../routes/auth.js'

// Assistant vocal de la personne accompagnée, sans IA : on cherche des mots-clés dans ce
// qu'elle a dit (reconnaissance vocale du téléphone ou du navigateur) et on répond par une
// phrase à lire à voix haute, éventuellement avec une page à ouvrir ou des choix à proposer.
//
// Tout est ici plutôt que dans le front pour qu'une skill Alexa puisse s'en servir plus tard :
// Alexa reconnaît elle-même l'intention (JourneeIntent, HeureIntent…) et n'aura qu'à appeler
// repondre(utilisateur, intention, parametres) pour obtenir la phrase à dire.

export const INTENTIONS = ['journee', 'demain', 'heure', 'date', 'agenda', 'photos', 'famille', 'personne', 'accueil', 'merci', 'inconnue']

const JOURS_AGENDA = 60

// Minuscules, sans accents ni ponctuation : « Qu'est-ce que j'ai aujourd'hui ? » → « qu est ce que j ai aujourd hui »
export const normaliser = (texte) => String(texte ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const contient = (phrase, mots) => mots.some((m) => ` ${phrase} `.includes(` ${m}`))

// Mots-clés de chaque intention, du plus précis au plus général : la première qui correspond gagne.
// Les débuts de mots suffisent (« photo » trouve « photos »).
const MOTS_CLES = [
  ['heure', ['quelle heure', 'l heure', 'heure est']],
  ['demain', ['demain']],
  ['date', ['quel jour', 'quelle date', 'la date', 'on est quel', 'sommes nous', 'quel mois', 'quelle annee', 'on est le']],
  ['journee', ['aujourd hui', 'ma journee', 'la journee', 'programme', 'qu est ce que je fais', 'je fais quoi', 'prevu', 'faire quoi']],
  ['photos', ['photo', 'image', 'album', 'souvenir']],
  ['agenda', ['agenda', 'rendez vous', 'rdv', 'calendrier', 'semaine', 'quand']],
  ['famille', ['famille', 'enfant', 'fils', 'fille', 'petit', 'proche', 'qui sont', 'mari', 'femme', 'frere', 'soeur']],
  ['accueil', ['accueil', 'retour', 'maison', 'debut']],
  // En dernier : « merci, montre les photos » doit ouvrir les photos
  ['merci', ['merci', 'c est bon', 'rien', 'stop', 'arrete', 'tais toi', 'au revoir']]
]

// Ce que la personne voit : sa famille, son agenda (mêmes règles que « Mon agenda »,
// sans les rendez-vous privés) et ses albums. Seuls les cercles où elle est accompagnée comptent.
async function donneesPersonne(utilisateur, jours = JOURS_AGENDA) {
  const ids = (await mesCercles(utilisateur.id)).filter((c) => c.role === 'accompagne').map((c) => c.id)
  if (!ids.length) return { famille: [], agenda: [], albums: [] }
  const maintenant = new Date()
  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
  const fin = new Date(debut.getTime() + jours * 86_400_000)
  const [famille, lignes, listeAlbums] = await Promise.all([
    db.select({ prenom: membres.prenom, nom: membres.nom, role: membres.role, utilisateurId: membres.utilisateurId })
      .from(membres).where(inArray(membres.cercleId, ids)),
    db.select().from(rendezVous).where(and(
      inArray(rendezVous.cercleId, ids),
      or(inArray(rendezVous.visibilite, ['tous', 'accompagne', 'accompagne_aidants']), eq(rendezVous.creeParId, utilisateur.id)),
      lt(rendezVous.debut, fin),
      or(
        and(eq(rendezVous.recurrence, 'aucune'), or(gte(rendezVous.debut, debut), gte(rendezVous.fin, debut))),
        and(ne(rendezVous.recurrence, 'aucune'), or(isNull(rendezVous.recurrenceFin), gte(rendezVous.recurrenceFin, debut)))
      )
    )),
    db.select({ id: albums.id, nom: albums.nom }).from(albums).where(inArray(albums.cercleId, ids))
  ])
  return {
    famille: famille.filter((m) => m.role !== 'accompagne' && m.utilisateurId !== utilisateur.id),
    agenda: lignes.flatMap((r) => occurrences(r, debut, fin)).sort((a, b) => a.debut - b.debut),
    albums: listeAlbums
  }
}

// --- Phrases (écrites pour être lues : pas d'abréviations ni de symboles)

const heureParlee = (d) => {
  const h = d.getHours()
  const m = d.getMinutes()
  if (h === 12 && m === 0) return 'midi'
  if (h === 0 && m === 0) return 'minuit'
  return `${h} heure${h > 1 ? 's' : ''}${m ? ` ${m}` : ''}`
}
const dateParlee = (d) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const memeJour = (a, b) => a.toDateString() === b.toDateString()

function quandParle(rdv, { avecJour = true } = {}) {
  const aujourdhui = new Date()
  const demain = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate() + 1)
  const jour = memeJour(rdv.debut, aujourdhui) ? 'aujourd\'hui' : memeJour(rdv.debut, demain) ? 'demain' : dateParlee(rdv.debut)
  const heure = rdv.journeeEntiere ? '' : `à ${heureParlee(rdv.debut)}`
  return [avecJour ? jour : '', heure].filter(Boolean).join(' ')
}

const listeParlee = (elements) => elements.length <= 1
  ? elements.join('')
  : `${elements.slice(0, -1).join(', ')} et ${elements.at(-1)}`

// `apres` : ne garde que ce qui n'est pas encore terminé (programme d'aujourd'hui)
function programme(agenda, jour, libelle, apres = null) {
  const tous = agenda.filter((r) => r.debut <= new Date(jour.getTime() + 86_400_000 - 1) && (r.fin ?? r.debut) >= jour)
  const duJour = apres ? tous.filter((r) => (r.fin ?? r.debut) > apres) : tous
  if (!duJour.length) return tous.length ? `Plus rien n'est prévu ${libelle}.` : `Rien n'est prévu ${libelle}.`
  const elements = duJour.slice(0, 5).map((r) => `${r.journeeEntiere || r.debut < jour ? '' : `à ${heureParlee(r.debut)}, `}${r.titre}`)
  const suite = duJour.length > 5 ? ` Et ${duJour.length - 5} autres choses.` : ''
  return `${libelle.charAt(0).toUpperCase()}${libelle.slice(1)}, vous avez : ${listeParlee(elements)}.${suite}`
}

const MOTS_ALBUM_IGNORES = new Set(['photo', 'photos', 'album', 'albums', 'souvenirs', 'famille', 'avec', 'chez', 'dans'])

const CHOIX = [
  { libelle: 'Ma journée', emoji: '☀️', intention: 'journee' },
  { libelle: 'Mes photos', emoji: '🖼️', lien: '/photos' },
  { libelle: 'Ma famille', emoji: '👨‍👩‍👧', lien: '/famille' },
  { libelle: 'Mon agenda', emoji: '📅', lien: '/agenda' }
]

// Réponse à une intention : { texte (à lire), lien (page à ouvrir, facultatif), choix (facultatif) }
export async function repondre(utilisateur, intention, parametres = {}) {
  const maintenant = new Date()
  const aujourdhui = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
  switch (intention) {
    case 'heure':
      return { texte: `Il est ${heureParlee(maintenant)}.` }
    case 'date':
      return { texte: `Nous sommes ${dateParlee(maintenant)} ${maintenant.getFullYear()}.` }
    case 'journee': {
      const { agenda } = await donneesPersonne(utilisateur, 1)
      const h = maintenant.getHours()
      const moment = h < 6 || h >= 22 ? 'la nuit' : h < 12 ? 'le matin' : h < 18 ? 'l\'après-midi' : 'le soir'
      return {
        texte: `Bonjour ${utilisateur.prenom}. Nous sommes ${dateParlee(maintenant)}, il est ${heureParlee(maintenant)}, c'est ${moment}. ${programme(agenda, aujourdhui, 'aujourd\'hui', maintenant)}`,
        lien: '/'
      }
    }
    case 'demain': {
      const { agenda } = await donneesPersonne(utilisateur, 2)
      return { texte: programme(agenda, new Date(aujourdhui.getTime() + 86_400_000), 'demain'), lien: '/agenda' }
    }
    case 'agenda': {
      const { agenda } = await donneesPersonne(utilisateur)
      const prochains = agenda.filter((r) => (r.fin ?? r.debut) >= maintenant).slice(0, 3)
      if (!prochains.length) return { texte: 'Rien n\'est prévu pour le moment. Voici votre agenda.', lien: '/agenda' }
      return { texte: `Voici votre agenda. Prochainement : ${listeParlee(prochains.map((r) => `${r.titre}, ${quandParle(r)}`))}.`, lien: '/agenda' }
    }
    case 'personne': {
      const { agenda } = await donneesPersonne(utilisateur)
      const prenom = parametres.prenom
      const avec = agenda.filter((r) => (r.fin ?? r.debut) >= maintenant && normaliser(r.titre).split(' ').includes(normaliser(prenom)))
      if (!avec.length) return { texte: `Je ne vois pas de rendez-vous avec ${prenom} pour l'instant. Voici votre famille.`, lien: '/famille' }
      return { texte: `${avec[0].titre}, ${quandParle(avec[0])}.`, lien: '/agenda' }
    }
    case 'photos': {
      if (parametres.album) return { texte: `Voici l'album ${parametres.album.nom}.`, lien: `/photos?album=${parametres.album.id}` }
      return { texte: 'Voici vos photos.', lien: '/photos' }
    }
    case 'famille':
      return { texte: 'Voici votre famille.', lien: '/famille' }
    case 'accueil':
      return { texte: 'Je vous ramène à l\'accueil.', lien: '/' }
    case 'merci':
      return { texte: 'D\'accord. Je reste là si vous avez besoin.' }
    default:
      return { texte: 'Je n\'ai pas bien compris. Que voulez-vous faire ?', choix: CHOIX }
  }
}

// Trouve l'intention dans ce qu'a dit la personne. `phrases` : les propositions de la
// reconnaissance vocale, de la plus probable à la moins probable.
export async function comprendre(utilisateur, phrases) {
  const normalisees = phrases.map(normaliser).filter(Boolean)
  if (!normalisees.length) return { intention: 'inconnue', parametres: {} }
  const { famille, albums: listeAlbums } = await donneesPersonne(utilisateur, 0)
  for (const phrase of normalisees) {
    const mots = phrase.split(' ')
    // Un album cité (« les photos de Noël » pour l'album « Noël 2025 ») ouvre cet album : il suffit
    // d'un mot marquant de son nom (4 lettres ou plus, pas un nombre ni un mot comme « photos »)
    const album = listeAlbums.find((a) => normaliser(a.nom).split(' ')
      .some((m) => m.length > 3 && !/^\d+$/.test(m) && !MOTS_ALBUM_IGNORES.has(m) && mots.includes(m)))
    const intention = MOTS_CLES.find(([, cles]) => contient(phrase, cles))?.[0]
    if (album && (!intention || intention === 'photos')) return { intention: 'photos', parametres: { album } }
    // Un prénom de la famille : « quand vient Léa », « Léa »
    const proche = famille.find((p) => mots.includes(normaliser(p.prenom)))
    if (proche && (!intention || intention === 'agenda')) return { intention: 'personne', parametres: { prenom: proche.prenom } }
    if (intention) return { intention, parametres: {} }
  }
  return { intention: 'inconnue', parametres: {} }
}
