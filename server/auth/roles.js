// Droits dans un cercle. Chaque utilisateur a un rôle par cercle (table membres) :
// il peut être aidant dans un cercle et proche dans un autre.
// Les droits sont cumulatifs : un aidant a tous les droits d'un proche, en plus
// de la gestion du cercle. Le superviseur technique a les mêmes droits qu'un aidant
// (seule la messagerie le distingue : server/messagerie/droits.js). La personne accompagnée a un espace à part.
const NIVEAUX = { proche: 1, aidant: 2, superviseur: 2 }

// Vrai si le rôle `role` donne au moins les droits de `requis` ('proche' ou 'aidant')
export function aLesDroits(role, requis) {
  return (NIVEAUX[role] ?? 0) >= NIVEAUX[requis]
}

// Le rôle le plus élevé des deux (pour ne jamais rétrograder quelqu'un)
export function roleLePlusHaut(a, b) {
  return (NIVEAUX[b] ?? 0) > (NIVEAUX[a] ?? 0) ? b : a
}
