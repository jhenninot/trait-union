// Anniversaires à partir des dates de naissance « AAAA-MM-JJ » (utilisateurs.date_naissance),
// à l'heure locale du serveur (TZ). Les personnes nées un 29 février sont fêtées le 28 les
// autres années.
const deux = (n) => String(n).padStart(2, '0')
const bissextile = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0

// Jours fêtés à cette date, au format « MM-JJ »
export function joursFetes(d = new Date()) {
  const jour = `${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
  return jour === '02-28' && !bissextile(d.getFullYear()) ? [jour, '02-29'] : [jour]
}

// Le jour même de la naissance ne compte pas (pas de « 0 an »)
export const estAnniversaire = (date, d = new Date()) => Boolean(date) && Number(date.slice(0, 4)) < d.getFullYear() && joursFetes(d).includes(date.slice(5))

// Âge en années révolues
export function age(date, d = new Date()) {
  const [a, m, j] = date.split('-').map(Number)
  const passe = d.getMonth() + 1 > m || (d.getMonth() + 1 === m && d.getDate() >= j)
  return d.getFullYear() - a - (passe ? 0 : 1)
}

// Âge lisible : « 4 ans », et pour un bébé « 3 mois », « 2 semaines », « 5 jours »
export function ageTexte(date, auj = new Date()) {
  if (!date) return ''
  const [a, m, j] = date.split('-').map(Number)
  const n = age(date, auj)
  if (n >= 1) return `${n} an${n > 1 ? 's' : ''}`
  const mois = (auj.getFullYear() - a) * 12 + auj.getMonth() + 1 - m - (auj.getDate() < j ? 1 : 0)
  if (mois >= 1) return `${mois} mois`
  const jours = Math.max(0, Math.round((Date.UTC(auj.getFullYear(), auj.getMonth(), auj.getDate()) - Date.UTC(a, m - 1, j)) / 86400000))
  if (jours >= 7) { const s = Math.floor(jours / 7); return `${s} semaine${s > 1 ? 's' : ''}` }
  return jours ? `${jours} jour${jours > 1 ? 's' : ''}` : 'moins d\'un jour'
}
