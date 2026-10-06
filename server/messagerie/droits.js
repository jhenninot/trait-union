import { and, eq, isNull, or } from 'drizzle-orm'
import { aLesDroits } from '../auth/roles.js'
import { db } from '../db/index.js'
import { membres, utilisateurs, personnes } from '../db/schema.js'

// Qui voit quelle conversation, et qui peut écrire à qui en privé (choix de Julien, 2026-10-01) :
// - « Toute la famille » : tout le cercle, personnes accompagnées comprises, sauf les auxiliaires ;
// - « Les aidants » : les aidants seulement (le superviseur technique, qui a les droits d'un
//   aidant ailleurs, n'a accès ni à celle-ci ni au cahier de liaison : Julien, 2026-10-06) ;
// - « Cahier de liaison » : aidants et auxiliaires de vie (pas le superviseur technique) ;
// - conversations privées à deux, entre membres du cercle, sauf auxiliaire ↔ proche. Une
//   personne accompagnée ne reçoit de message privé que de ceux que ses aidants autorisent
//   (réglage « prive ») ; les aidants ne lisent pas ses conversations privées ;
// - groupes créés par les aidants (Julien, 2026-10-01) : un nom et des membres choisis parmi le
//   cercle, sans y réunir auxiliaires et proches (même règle que pour les privées). Les aidants
//   membres du groupe le renomment, changent ses membres ou le suppriment.
// Il faut être membre du cercle : un administrateur qui n'en fait pas partie ne voit rien.

export const GROUPES = ['famille', 'aidants', 'liaison']
const ROLES_GROUPE = {
  famille: ['accompagne', 'aidant', 'superviseur', 'proche'],
  aidants: ['aidant'],
  liaison: ['aidant', 'auxiliaire']
}
export const TITRES = { famille: 'Toute la famille', aidants: 'Les aidants', liaison: 'Cahier de liaison' }

// Réglages de la messagerie d'une personne accompagnée (page Personnes accompagnées)
export const REPONSES_DEFAUT = ['Je t\'embrasse', 'Merci', 'Oui', 'Non', 'Appelle-moi', 'Viens me voir']
export const REGLAGES_DEFAUT = { prive: 'tous', reponses: REPONSES_DEFAUT, lectureAuto: false, vocal: true }
export const reglages = (messagerie) => ({ ...REGLAGES_DEFAUT, ...messagerie })

// Membres possibles d'un groupe créé : refus (message) ou null
export function compositionInvalide(ids, liste) {
  const choisis = ids.map((id) => liste.find((m) => m.utilisateurId === id))
  if (choisis.some((m) => !m || m.decede)) return 'Une des personnes choisies ne fait pas partie du cercle'
  if (choisis.length < 2) return 'Choisissez au moins une autre personne'
  const roles = choisis.map((m) => m.role)
  if (roles.includes('auxiliaire') && roles.includes('proche')) return 'Une auxiliaire de vie ne peut pas être dans un groupe avec des proches'
  return null
}

export const voitGroupe = (type, role) => ROLES_GROUPE[type]?.includes(role) ?? false

// Membres du cercle qui ont un compte actif, et les membres décédés (`decede`) : leurs anciens
// messages restent signés de leur nom, mais ils ne font plus partie d'aucune conversation de
// groupe et on ne peut plus leur écrire
export async function membresCercle(cercleId) {
  return db.select({
    membreId: membres.id,
    utilisateurId: membres.utilisateurId,
    role: membres.role,
    lien: membres.lien,
    membreDepuis: membres.creeLe,
    prenom: utilisateurs.prenom,
    nom: utilisateurs.nom,
    avatar: utilisateurs.avatar,
    messagerie: utilisateurs.messagerie,
    decede: utilisateurs.decede,
    genre: personnes.genre // pour accorder « décédé » / « décédée »
  })
    .from(membres)
    .innerJoin(utilisateurs, eq(membres.utilisateurId, utilisateurs.id))
    .leftJoin(personnes, and(eq(personnes.cercleId, membres.cercleId), eq(personnes.utilisateurId, membres.utilisateurId)))
    .where(and(eq(membres.cercleId, cercleId), or(isNull(utilisateurs.desactiveLe), eq(utilisateurs.decede, true))))
}

// Une personne accompagnée accepte-t-elle un message privé de `autre` ?
function accepte(accompagne, autre) {
  const { prive } = reglages(accompagne.messagerie)
  if (prive === 'personne') return false
  if (prive === 'aidants') return ['aidant', 'superviseur', 'auxiliaire'].includes(autre.role)
  return true
}

// `moi` et `autre` : membres du même cercle (voir membresCercle)
export function peutEcrirePrive(moi, autre) {
  if (!moi || !autre || moi.utilisateurId === autre.utilisateurId || moi.decede || autre.decede) return false
  const roles = [moi.role, autre.role]
  if (roles.includes('auxiliaire') && roles.includes('proche')) return false
  if (moi.role === 'accompagne' && !accepte(moi, autre)) return false
  if (autre.role === 'accompagne' && !accepte(autre, moi)) return false
  return true
}

// Membres qui ont accès à une conversation (une conversation privée avec une personne décédée
// reste lisible par l'autre, mais plus personne n'y écrit : voir peutEcrirePrive)
export function participants(conversation, liste) {
  if (conversation.type === 'privee') {
    return liste.filter((m) => m.utilisateurId === conversation.personneA || m.utilisateurId === conversation.personneB)
  }
  if (conversation.type === 'groupe') {
    const ids = conversation.membresGroupe ?? []
    return liste.filter((m) => !m.decede && ids.includes(m.utilisateurId))
  }
  return liste.filter((m) => !m.decede && voitGroupe(conversation.type, m.role))
}

// Renommer un groupe créé, changer ses membres ou le supprimer : les aidants qui en font partie
export const peutGererGroupe = (conversation, moi, liste) =>
  conversation.type === 'groupe' && aLesDroits(moi.role, 'aidant') && participants(conversation, liste).some((m) => m.utilisateurId === moi.utilisateurId)

// Peut-on encore écrire dans cette conversation (privée : le réglage de l'aidé a pu changer) ?
export function peutEcrire(conversation, moi, liste) {
  if (!participants(conversation, liste).some((m) => m.utilisateurId === moi.utilisateurId)) return false
  if (conversation.type !== 'privee') return true
  const autreId = conversation.personneA === moi.utilisateurId ? conversation.personneB : conversation.personneA
  return peutEcrirePrive(moi, liste.find((m) => m.utilisateurId === autreId))
}

// Un aidant peut retirer n'importe quel message des conversations de groupe ; chacun peut retirer les siens
export const peutRetirer = (conversation, moi, message) =>
  message.auteurId === moi.utilisateurId || (conversation.type !== 'privee' && aLesDroits(moi.role, 'aidant'))
