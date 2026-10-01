// Affichage des coordonnées d'une personne (téléphone, date de naissance, adresse)

// Âge en années révolues à partir d'une date « AAAA-MM-JJ »
export function age(date) {
  if (!date) return null
  const [a, m, j] = date.split('-').map(Number)
  const auj = new Date()
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
  const n = age(date)
  return `${dateLongue(date)} (${n} an${n > 1 ? 's' : ''})`
}

// Lien d'appel : on garde le « + » et les chiffres
export const lienTelephone = (tel) => `tel:${tel.replace(/[^\d+]/g, '')}`

export const aDesCoordonnees = (p) => Boolean(p.telephone || p.dateNaissance || p.adresse)
