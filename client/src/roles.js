// Même règle que server/auth/roles.js : un aidant a tous les droits d'un proche.
const NIVEAUX = { proche: 1, aidant: 2 }

export function aLesDroits(role, requis) {
  return (NIVEAUX[role] ?? 0) >= NIVEAUX[requis]
}

export const libellesRoles = { accompagne: 'Personne accompagnée', aidant: 'Aidant', proche: 'Proche' }
