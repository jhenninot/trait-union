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

export const estAnniversaire = (date, d = new Date()) => Boolean(date) && joursFetes(d).includes(date.slice(5))

// Âge en années révolues
export function age(date, d = new Date()) {
  const [a, m, j] = date.split('-').map(Number)
  const passe = d.getMonth() + 1 > m || (d.getMonth() + 1 === m && d.getDate() >= j)
  return d.getFullYear() - a - (passe ? 0 : 1)
}
