import { api } from './api.js'
import { session } from './session.js'

// Sur l'appareil d'une personne accompagnée : chaque écran ouvert est signalé au serveur, pour que
// ses aidants voient si elle se sert de l'application (server/utilisation.js). Un retour sur
// l'application (écran rallumé, appli rouverte) compte aussi, au plus une fois tous les quarts d'heure.
const ECRANS = { '/': 'accueil', '/photos': 'photos', '/agenda': 'agenda', '/famille': 'famille', '/mon-arbre': 'arbre', '/messages': 'messages' }
const QUART_D_HEURE = 15 * 60 * 1000

let ecranCourant = null
let dernierEnvoi = 0

function signaler(ecran) {
  if (!ecran || session.typeSession !== 'appareil') return
  dernierEnvoi = Date.now()
  api('POST', '/profil/utilisation', { ecran }).catch(() => {})
}

export function suivreUtilisation(router) {
  router.afterEach((to, from, echec) => {
    if (echec) return
    ecranCourant = ECRANS[to.path] ?? null
    signaler(ecranCourant)
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - dernierEnvoi > QUART_D_HEURE) signaler(ecranCourant)
  })
}

// --- Pour les aidants : état d'utilisation d'une personne accompagnée

const JOUR = 86_400_000
const debutDuJour = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const heure = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')

// « aujourd'hui à 9h12 », « hier à 18h40 », « mardi 29 septembre »
export function quandPassage(valeur) {
  const d = new Date(valeur)
  const jours = Math.round((debutDuJour() - debutDuJour(d)) / JOUR)
  if (jours === 0) return `aujourd'hui à ${heure(d)}`
  if (jours === 1) return `hier à ${heure(d)}`
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// niveau : ok (venu aujourd'hui ou hier), attention (2 à 6 jours), alerte (une semaine ou plus,
// ou jamais), aucun (pas d'appareil relié)
export function etatUtilisation(u, appareils) {
  if (!appareils && !u?.dernierPassage) return { niveau: 'aucun', texte: 'Pas encore d\'appareil relié' }
  if (!u?.dernierPassage) return { niveau: 'alerte', texte: 'N\'a pas encore utilisé l\'application' }
  const jours = Math.round((debutDuJour() - debutDuJour(new Date(u.dernierPassage))) / JOUR)
  if (jours <= 1) return { niveau: 'ok', texte: `A utilisé l'application ${quandPassage(u.dernierPassage)}`, jours }
  return { niveau: jours < 7 ? 'attention' : 'alerte', texte: `Pas d'utilisation depuis ${jours} jours`, jours }
}

export const LIBELLES_ECRANS = {
  accueil: { nom: 'Accueil', icone: 'accueil' },
  photos: { nom: 'Photos', icone: 'photo' },
  agenda: { nom: 'Agenda', icone: 'agenda' },
  famille: { nom: 'Ma famille', icone: 'famille' },
  arbre: { nom: 'Mon arbre', icone: 'arbre' },
  messages: { nom: 'Mes messages', icone: 'message' },
  voix: { nom: 'Voix', icone: 'micro' }
}
