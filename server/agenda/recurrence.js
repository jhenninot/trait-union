// Calcul des occurrences d'un rendez-vous qui se répète. Les dates sont manipulées
// dans le fuseau du serveur (TZ=Europe/Paris dans compose.yaml) pour que « tous les
// jours à 9h » reste à 9h après un changement d'heure.

export const RECURRENCES = ['aucune', 'quotidienne', 'hebdomadaire', 'mensuelle', 'annuelle']
const MAX_OCCURRENCES = 1000
const JOUR = 86_400_000

const joursDansMois = (annee, mois) => new Date(annee, mois + 1, 0).getDate()

// n-ième répétition à partir de `debut`, ou null si elle n'existe pas
// (ex. « tous les mois le 31 » en avril)
function decaler(debut, recurrence, n) {
  const d = new Date(debut)
  if (recurrence === 'quotidienne') d.setDate(d.getDate() + n)
  else if (recurrence === 'hebdomadaire') d.setDate(d.getDate() + 7 * n)
  else {
    const mois = recurrence === 'mensuelle' ? n : 12 * n
    d.setDate(1)
    d.setMonth(d.getMonth() + mois)
    if (debut.getDate() > joursDansMois(d.getFullYear(), d.getMonth())) return null
    d.setDate(debut.getDate())
  }
  return d
}

// Nombre de répétitions qu'on peut sauter sans risque pour arriver vers `date`
function premierIndice(debut, recurrence, intervalle, date) {
  const ecart = date - debut
  if (ecart <= 0) return 0
  const pas = { quotidienne: JOUR, hebdomadaire: 7 * JOUR, mensuelle: 31 * JOUR, annuelle: 366 * JOUR }[recurrence]
  return Math.max(0, Math.floor(ecart / (pas * intervalle)) - 1)
}

// Occurrences de `rdv` qui touchent [depuis, jusqua[ (bornes facultatives).
// Chaque occurrence garde les champs du rendez-vous, avec ses propres debut et fin.
export function occurrences(rdv, depuis, jusqua) {
  if (rdv.recurrence === 'aucune') return [{ ...rdv, occurrence: 0 }]
  const duree = rdv.fin ? rdv.fin - rdv.debut : 0
  const liste = []
  const debutRecherche = depuis ? new Date(depuis.getTime() - duree) : rdv.debut
  let i = premierIndice(rdv.debut, rdv.recurrence, rdv.intervalle, debutRecherche)
  for (; liste.length < MAX_OCCURRENCES; i++) {
    const debut = decaler(rdv.debut, rdv.recurrence, i * rdv.intervalle)
    if (!debut) continue
    if (rdv.recurrenceFin && debut > rdv.recurrenceFin) break
    if (jusqua && debut >= jusqua) break
    if (rdv.exclusions?.includes(i)) continue // date supprimée ou modifiée à part
    // La fin se décale de la même façon (garde l'heure après un changement d'heure)
    const fin = rdv.fin ? (decaler(rdv.fin, rdv.recurrence, i * rdv.intervalle) ?? new Date(debut.getTime() + duree)) : null
    if (!depuis || (fin ?? debut) >= depuis) liste.push({ ...rdv, debut, fin, occurrence: i })
    // Sans borne de fin, on s'arrête à un an de répétitions
    if (!jusqua && !rdv.recurrenceFin && debut - (depuis ?? rdv.debut) > 366 * JOUR) break
  }
  return liste
}

// Début et fin de la répétition numéro `i` (null si elle n'existe pas)
export function occurrenceNumero(rdv, i) {
  if (rdv.recurrence === 'aucune') return i === 0 ? { debut: rdv.debut, fin: rdv.fin } : null
  const debut = decaler(rdv.debut, rdv.recurrence, i * rdv.intervalle)
  if (!debut) return null
  const duree = rdv.fin ? rdv.fin - rdv.debut : 0
  const fin = rdv.fin ? (decaler(rdv.fin, rdv.recurrence, i * rdv.intervalle) ?? new Date(debut.getTime() + duree)) : null
  return { debut, fin }
}
