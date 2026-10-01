import { api } from './api.js'

// Sondage de dates façon Doodle, publié dans « Toute la famille » (server/messagerie/sondages.js)

export const REPONSES = [
  { valeur: 'oui', libelle: 'Oui', icone: 'coche' },
  { valeur: 'peut_etre', libelle: 'Peut-être', icone: 'question' },
  { valeur: 'non', libelle: 'Non', icone: 'fermer' }
]
export const MOMENTS = [
  { valeur: 'journee', libelle: 'Journée' },
  { valeur: 'midi', libelle: 'Le midi' },
  { valeur: 'soir', libelle: 'Le soir' },
  { valeur: 'heure', libelle: 'Heure précise' }
]

const versDate = (iso) => {
  const [a, m, j] = iso.split('-').map(Number)
  return new Date(a, m - 1, j)
}
export const versIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1)

// « Samedi 17 octobre »
export const jourLong = (iso) => majuscule(versDate(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))
// « Sam. 17 oct. »
export const jourCourt = (iso) => majuscule(versDate(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }))

// « à midi », « le soir », « à 14h30 », « toute la journée »
export function momentTexte(s) {
  if (s.moment === 'midi') return 'à midi'
  if (s.moment === 'soir') return 'le soir'
  if (s.moment === 'heure' && s.heure) return `à ${s.heure.replace(':', 'h')}`
  return 'toute la journée'
}

// Horaires proposés pour le rendez-vous, selon le moment du sondage
export function horairesParDefaut(s) {
  if (s.moment === 'midi') return { debut: '12:00', fin: '16:00', journee: false }
  if (s.moment === 'soir') return { debut: '19:00', fin: '23:00', journee: false }
  if (s.moment === 'heure' && s.heure) {
    const [h, m] = s.heure.split(':').map(Number)
    return { debut: s.heure, fin: `${String(Math.min(h + 3, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`, journee: false }
  }
  return { debut: '', fin: '', journee: true }
}

export const avantLe = (iso) => `Réponses attendues avant le ${jourLong(iso).toLowerCase()}`

export const lancerSondage = (conversationId, donnees) => api('POST', `/messagerie/conversations/${conversationId}/sondages`, donnees)
export const lireSondage = (id) => api('GET', `/messagerie/sondages/${id}`)
export const modifierSondage = (id, donnees) => api('PUT', `/messagerie/sondages/${id}`, donnees)
export const repondreSondage = (id, reponses, { commentaire = '', pour = null } = {}) =>
  api('PUT', `/messagerie/sondages/${id}/reponses`, { reponses, commentaire, ...(pour ? { pour } : {}) })
export const relancerSondage = (id) => api('POST', `/messagerie/sondages/${id}/relancer`)
export const retenirDate = (id, donnees) => api('POST', `/messagerie/sondages/${id}/retenir`, donnees)
export const rouvrirSondage = (id) => api('POST', `/messagerie/sondages/${id}/rouvrir`)
export const listeSondages = (cercleId) => api('GET', `/messagerie/cercles/${cercleId}/sondages`)
export const supprimerSondage = (id, { agenda = false } = {}) => api('DELETE', `/messagerie/sondages/${id}${agenda ? '?agenda=1' : ''}`)
