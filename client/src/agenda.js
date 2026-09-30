// Outils partagés par les pages Agenda (aidants, proches) et « Mon agenda » (tablette).
import { api } from './api.js'

// Niveaux de visibilité d'un rendez-vous (mêmes valeurs que server/routes/agenda.js).
// `aide` est le prénom de la personne accompagnée quand le cercle n'en a qu'une.
export function visibilites(aide) {
  const qui = aide || 'Personne accompagnée'
  return [
    { valeur: 'tous', libelle: 'Visible par tous', court: 'Tous' },
    { valeur: 'aidants', libelle: 'Aidants uniquement', court: 'Aidants' },
    { valeur: 'accompagne', libelle: `${qui} uniquement`, court: qui },
    { valeur: 'accompagne_aidants', libelle: `${qui} et aidants`, court: `${qui} + aidants` }
  ]
}

const deux = (n) => String(n).padStart(2, '0')

// Date locale au format des champs <input type="date"> et <input type="time">
export const valeurJour = (d) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
export const valeurHeure = (d) => `${deux(d.getHours())}:${deux(d.getMinutes())}`

// Combine un jour (AAAA-MM-JJ) et une heure (HH:MM) locaux en date
export function combiner(jour, heure = '00:00') {
  const [a, m, j] = jour.split('-').map(Number)
  const [h, min] = heure.split(':').map(Number)
  return new Date(a, m - 1, j, h, min)
}

export function debutDuJour(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function ajouterJours(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// « Aujourd'hui », « Demain » ou « jeudi 2 octobre »
export function nomDuJour(d) {
  const jour = debutDuJour(new Date(d))
  const aujourdhui = debutDuJour()
  const ecart = Math.round((jour - aujourdhui) / 86_400_000)
  if (ecart === 0) return 'Aujourd\'hui'
  if (ecart === 1) return 'Demain'
  if (ecart === -1) return 'Hier'
  const options = { weekday: 'long', day: 'numeric', month: 'long' }
  if (jour.getFullYear() !== aujourdhui.getFullYear()) options.year = 'numeric'
  const texte = jour.toLocaleDateString('fr-FR', options)
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

export const heureCourte = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')

export function horaire(rdv) {
  if (rdv.journeeEntiere) return 'Toute la journée'
  return rdv.fin ? `${heureCourte(rdv.debut)} – ${heureCourte(rdv.fin)}` : heureCourte(rdv.debut)
}

// Regroupe des rendez-vous triés par jour : [{ cle, titre, rendezVous: [...] }]
export function parJour(liste) {
  const groupes = []
  for (const rdv of liste) {
    const cle = valeurJour(new Date(rdv.debut))
    let groupe = groupes.at(-1)
    if (groupe?.cle !== cle) groupes.push((groupe = { cle, titre: nomDuJour(rdv.debut), rendezVous: [] }))
    groupe.rendezVous.push(rdv)
  }
  return groupes
}

// Rendez-vous visibles par la personne accompagnée, tous cercles confondus (tablette)
export async function rendezVousAccompagne(cercles, depuis, jusqua) {
  const params = new URLSearchParams({ depuis: depuis.toISOString() })
  if (jusqua) params.set('jusqua', jusqua.toISOString())
  const listes = await Promise.all(cercles.map((c) =>
    api('GET', `/cercles/${c.id}/rendez-vous?${params}`)
      .then((l) => l.map((rdv) => ({ ...rdv, cercleId: c.id })))
      .catch(() => [])
  ))
  return listes.flat().sort((a, b) => new Date(a.debut) - new Date(b.debut))
}
