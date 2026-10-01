// Affichage des coordonnées d'une personne (téléphone, date de naissance, adresse)

// Âge en années révolues à partir d'une date « AAAA-MM-JJ »
export function age(date, auj = new Date()) {
  if (!date) return null
  const [a, m, j] = date.split('-').map(Number)
  const anniversairePasse = auj.getMonth() + 1 > m || (auj.getMonth() + 1 === m && auj.getDate() >= j)
  return auj.getFullYear() - a - (anniversairePasse ? 0 : 1)
}

// « 12 mars 1950 »
export function dateLongue(date) {
  if (!date) return ''
  return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// « 12 mars 1950 (75 ans) »
export function naissance(date) {
  if (!date) return ''
  return `${dateLongue(date)} (${ans(age(date))})`
}

// Lien d'appel : on garde le « + » et les chiffres
export const lienTelephone = (tel) => `tel:${tel.replace(/[^\d+]/g, '')}`

export const aDesCoordonnees = (p) => Boolean(p.telephone || p.dateNaissance || p.adresse)

export const ans = (n) => `${n} an${n > 1 ? 's' : ''}`

// Anniversaire aujourd'hui ? (né un 29 février : fêté le 28 les autres années, comme le serveur)
export function estAnniversaire(date, d = new Date()) {
  if (!date) return false
  const deux = (n) => String(n).padStart(2, '0')
  const jour = `${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
  const a = d.getFullYear()
  const bissextile = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
  return date.slice(5) === jour || (jour === '02-28' && !bissextile && date.slice(5) === '02-29')
}
