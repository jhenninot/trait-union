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

export function motDePasse(valeur) {
  if (typeof valeur !== 'string' || valeur.length < 8) {
    throw new ErreurSaisie('Le mot de passe doit faire au moins 8 caractères')
  }
  if (valeur.length > 200) throw new ErreurSaisie('Le mot de passe est trop long')
  return valeur
}
