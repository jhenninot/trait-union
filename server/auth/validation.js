// Petites vérifications des données envoyées par le front.
export class ErreurSaisie extends Error {}

export function texte(valeur, champ, { obligatoire = true, max = 200 } = {}) {
  const v = typeof valeur === 'string' ? valeur.trim() : ''
  if (!v) {
    if (obligatoire) throw new ErreurSaisie(`Le champ « ${champ} » est obligatoire`)
    return null
  }
  if (v.length > max) throw new ErreurSaisie(`Le champ « ${champ} » est trop long`)
  return v
}

export function email(valeur) {
  const v = texte(valeur, 'email', { max: 254 }).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new ErreurSaisie('Adresse email invalide')
  return v
}

// Numéro de téléphone facultatif : chiffres, espaces, points, tirets, parenthèses et « + » initial
export function telephone(valeur) {
  const v = texte(valeur, 'téléphone', { obligatoire: false, max: 30 })
  if (v === null) return null
  const chiffres = v.replace(/\D/g, '')
  if (!/^\+?[\d\s.\-()]+$/.test(v) || chiffres.length < 4 || chiffres.length > 15) {
    throw new ErreurSaisie('Numéro de téléphone invalide')
  }
  return v
}

// Date de naissance facultative au format « AAAA-MM-JJ », entre 1900 et aujourd'hui
// (l'arbre généalogique accepte des ancêtres plus anciens : `min`)
export function dateNaissance(valeur, { champ = 'date de naissance', min = '1900-01-01' } = {}) {
  const v = texte(valeur, champ, { obligatoire: false, max: 10 })
  if (v === null) return null
  const d = new Date(`${v}T00:00:00Z`)
  const invalide = `${champ.charAt(0).toUpperCase()}${champ.slice(1)} invalide`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(d) || d.toISOString().slice(0, 10) !== v) {
    throw new ErreurSaisie(invalide)
  }
  if (v < min || d > new Date()) throw new ErreurSaisie(invalide)
  return v
}

// Téléphone, date de naissance et adresse d'un profil (tous facultatifs)
export function coordonnees(corps) {
  return {
    telephone: telephone(corps.telephone),
    dateNaissance: dateNaissance(corps.dateNaissance),
    adresse: texte(corps.adresse, 'adresse', { obligatoire: false, max: 300 })
  }
}

// Règles du mot de passe : aussi affichées dans le front (client/src/motDePasse.js)
export function motDePasse(valeur) {
  if (typeof valeur !== 'string' || valeur.length < 10) {
    throw new ErreurSaisie('Le mot de passe doit faire au moins 10 caractères')
  }
  if (!/\p{N}/u.test(valeur)) throw new ErreurSaisie('Le mot de passe doit contenir au moins un chiffre')
  if (!/[^\p{L}\p{N}]/u.test(valeur)) {
    throw new ErreurSaisie('Le mot de passe doit contenir au moins un caractère spécial (ex. ! ? @ # - _)')
  }
  if (valeur.length > 200) throw new ErreurSaisie('Le mot de passe est trop long')
  return valeur
}
