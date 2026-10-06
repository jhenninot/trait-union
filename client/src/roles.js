// Même règle que server/auth/roles.js : un aidant a tous les droits d'un proche.
// Une auxiliaire de vie n'a pas les droits d'un proche (ni photos ni agenda familial).
const NIVEAUX = { proche: 1, aidant: 2, superviseur: 2 }

export function aLesDroits(role, requis) {
  return (NIVEAUX[role] ?? 0) >= NIVEAUX[requis]
}

export const libellesRoles = { accompagne: 'Personne accompagnée', aidant: 'Aidant', proche: 'Proche', auxiliaire: 'Auxiliaire de vie', superviseur: 'Superviseur technique' }

// Auxiliaire de vie sans droits d'aidant dans ce cercle (pas d'accès aux photos)
export const estAuxiliaire = (role) => role === 'auxiliaire'
