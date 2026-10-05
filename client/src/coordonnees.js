// Affichage des coordonnées d'une personne (téléphone, date de naissance, adresse)

// Âge en années révolues à partir d'une date « AAAA-MM-JJ »
export function age(date, auj = new Date()) {
  if (!date) return null
  const [a, m, j] = date.split('-').map(Number)
  const anniversairePasse = auj.getMonth() + 1 > m || (auj.getMonth() + 1 === m && auj.getDate() >= j)
  return auj.getFullYear() - a - (anniversairePasse ? 0 : 1)
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

// « 12 mars 1950 »
export function dateLongue(date) {
  if (!date) return ''
  return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// « 12 mars 1950 (75 ans) »
export function naissance(date) {
  if (!date) return ''
  return `${dateLongue(date)} (${ageTexte(date)})`
}

// Lien d'appel : on garde le « + » et les chiffres
export const lienTelephone = (tel) => `tel:${tel.replace(/[^\d+]/g, '')}`

// Lien SMS : ouvre l'application de messages avec le numéro (sans effet sur une tablette sans carte SIM)
export const lienSms = (tel) => `sms:${tel.replace(/[^\d+]/g, '')}`

// Numéro international sans « + », comme l'attend WhatsApp : 06 12… → 336 12…, +32 4… → 324…
export function numeroInternational(tel) {
  const n = tel.replace(/[^\d+]/g, '')
  if (n.startsWith('+')) return n.slice(1)
  if (n.startsWith('00')) return n.slice(2)
  if (/^0\d{9}$/.test(n)) return `33${n.slice(1)}` // numéro français à 10 chiffres
  return n
}

// Lien WhatsApp : ouvre la conversation dans l'application (ou WhatsApp Web)
export const lienWhatsApp = (tel) => `https://wa.me/${numeroInternational(tel)}`

// Message d'invitation prérempli pour WhatsApp / SMS ; sans numéro, l'application propose de choisir le destinataire
export const lienWhatsAppMessage = (tel, texte) =>
  `https://wa.me/${tel ? numeroInternational(tel) : ''}?text=${encodeURIComponent(texte)}`
export const lienSmsMessage = (tel, texte) => {
  const sep = /iPhone|iPad|iPod/.test(navigator.userAgent) ? '&' : '?'
  return `sms:${tel ? tel.replace(/[^\d+]/g, '') : ''}${sep}body=${encodeURIComponent(texte)}`
}

export const aDesCoordonnees = (p) => Boolean(p.telephone || p.dateNaissance || p.adresse)

export const ans = (n) => `${n} an${n > 1 ? 's' : ''}`

// Anniversaire aujourd'hui ? (né un 29 février : fêté le 28 les autres années, comme le serveur)
export function estAnniversaire(date, d = new Date()) {
  if (!date || Number(date.slice(0, 4)) >= d.getFullYear()) return false // pas de « 0 an » le jour de la naissance
  const deux = (n) => String(n).padStart(2, '0')
  const jour = `${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
  const a = d.getFullYear()
  const bissextile = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
  return date.slice(5) === jour || (jour === '02-28' && !bissextile && date.slice(5) === '02-29')
}

// Liens proposés avec la personne accompagnée ; tout autre lien se saisit en texte libre
export const LIENS = ['Fils', 'Fille', 'Gendre', 'Belle-fille', 'Petit-fils', 'Petite-fille']

// « décédé » ou « décédée » selon le genre renseigné dans l'arbre généalogique (« décédé(e) » sinon)
export function motDecede(genre, majuscule = false) {
  const mot = genre === 'homme' ? 'décédé' : genre === 'femme' ? 'décédée' : 'décédé(e)'
  return majuscule ? `D${mot.slice(1)}` : mot
}

// « Décédé le 12 mars 2026 », ou « Décédée » sans date
export const mentionDeces = (p) => `${motDecede(p.genre, true)}${p.dateDeces ? ` le ${dateLongue(p.dateDeces)}` : ''}`
