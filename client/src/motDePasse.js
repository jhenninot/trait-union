// Règles du mot de passe, vérifiées aussi par le serveur (server/auth/validation.js)
export const reglesMotDePasse = [
  { texte: '10 caractères minimum', ok: (v) => v.length >= 10 },
  { texte: 'au moins un chiffre', ok: (v) => /\p{N}/u.test(v) },
  { texte: 'au moins un caractère spécial (! ? @ # - _ …)', ok: (v) => /[^\p{L}\p{N}]/u.test(v) }
]

export const motDePasseValide = (v) => reglesMotDePasse.every((r) => r.ok(v))
