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

const jourCourt = (d) => d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

export function horaire(rdv) {
  const debut = new Date(rdv.debut)
  const fin = rdv.fin ? new Date(rdv.fin) : null
  const plusieursJours = fin && valeurJour(fin) !== valeurJour(debut)
  if (rdv.journeeEntiere) return plusieursJours ? `Du ${jourCourt(debut)} au ${jourCourt(fin)}` : 'Toute la journée'
  if (plusieursJours) return `Du ${jourCourt(debut)} ${heureCourte(debut)} au ${jourCourt(fin)} ${heureCourte(fin)}`
  return fin ? `${heureCourte(debut)} – ${heureCourte(fin)}` : heureCourte(debut)
}

// Répétitions proposées (mêmes valeurs que server/agenda/recurrence.js)
export const RECURRENCES = [
  { valeur: 'aucune', libelle: 'Ne se répète pas' },
  { valeur: 'quotidienne', libelle: 'Tous les jours', unite: ['jour', 'jours'] },
  { valeur: 'hebdomadaire', libelle: 'Toutes les semaines', unite: ['semaine', 'semaines'] },
  { valeur: 'mensuelle', libelle: 'Tous les mois', unite: ['mois', 'mois'] },
  { valeur: 'annuelle', libelle: 'Tous les ans', unite: ['an', 'ans'] }
]

// « Toutes les 2 semaines, jusqu'au 3 nov. » (vide si le rendez-vous ne se répète pas)
export function texteRecurrence(rdv) {
  const r = RECURRENCES.find((x) => x.valeur === rdv.recurrence)
  if (!r || r.valeur === 'aucune') return ''
  let texte = r.libelle
  if (rdv.intervalle > 1) {
    const feminin = r.valeur === 'hebdomadaire'
    texte = `${feminin ? 'Toutes les' : 'Tous les'} ${rdv.intervalle} ${r.unite[1]}`
  }
  if (rdv.recurrenceFin) texte += `, jusqu'au ${new Date(rdv.recurrenceFin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
  return texte
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

// Titre affiché : un rendez-vous que l'on n'a pas le droit de voir reste visible, sans détails
export const titreRdv = (rdv) => (rdv.masque ? 'Rendez-vous privé' : rdv.titre)

// --- Vues semaine et mois ---

// Lundi de la semaine de `d`
export function debutSemaine(d) {
  const jour = debutDuJour(d)
  return ajouterJours(jour, -((jour.getDay() + 6) % 7))
}

// Jours affichés par une vue : la semaine, ou les semaines entières qui couvrent le mois
export function periode(vue, reference) {
  if (vue === 'semaine') {
    const debut = debutSemaine(reference)
    return { debut, fin: ajouterJours(debut, 7) }
  }
  const premier = new Date(reference.getFullYear(), reference.getMonth(), 1)
  const dernier = new Date(reference.getFullYear(), reference.getMonth() + 1, 0)
  return { debut: debutSemaine(premier), fin: ajouterJours(debutSemaine(dernier), 7) }
}

// Semaine ou mois suivant (sens = 1) ou précédent (sens = -1)
export function decaler(vue, reference, sens) {
  if (vue === 'semaine') return ajouterJours(reference, 7 * sens)
  return new Date(reference.getFullYear(), reference.getMonth() + sens, 1)
}

// `court` : version pour les petits écrans (« 28 sept. – 4 oct. »)
export function titrePeriode(vue, reference, court = false) {
  if (vue === 'semaine' && court) {
    const { debut } = periode('semaine', reference)
    const f = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    return `${f(debut)} – ${f(ajouterJours(debut, 6))}`
  }
  if (vue === 'mois') {
    const t = reference.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    return t.charAt(0).toUpperCase() + t.slice(1)
  }
  const { debut } = periode('semaine', reference)
  const fin = ajouterJours(debut, 6)
  const format = { day: 'numeric', month: 'long' }
  const memeMois = debut.getMonth() === fin.getMonth()
  const de = memeMois ? debut.getDate() : debut.toLocaleDateString('fr-FR', format)
  return `Semaine du ${de} au ${fin.toLocaleDateString('fr-FR', { ...format, year: 'numeric' })}`
}

export function jours(debut, fin) {
  const liste = []
  for (let d = debut; d < fin; d = ajouterJours(d, 1)) liste.push(d)
  return liste
}

// Rendez-vous qui occupent le jour `cle` (AAAA-MM-JJ)
export function duJour(liste, cle) {
  return liste.filter((rdv) => {
    const debut = valeurJour(new Date(rdv.debut))
    const fin = rdv.fin ? valeurJour(new Date(rdv.fin)) : debut
    return debut <= cle && cle <= fin
  })
}
