import { and, eq, isNull, or } from 'drizzle-orm'
import { db } from '../db/index.js'
import { membres, utilisateurs, personnes } from '../db/schema.js'

// Qui voit quelle conversation, et qui peut écrire à qui en privé (choix de Julien, 2026-10-01) :
// - « Toute la famille » : tout le cercle, personnes accompagnées comprises, sauf les auxiliaires ;
// - « Les aidants » : les aidants seulement ;
// - « Cahier de liaison » : aidants et auxiliaires de vie ;
// - conversations privées à deux, entre membres du cercle, sauf auxiliaire ↔ proche. Une
//   personne accompagnée ne reçoit de message privé que de ceux que ses aidants autorisent
//   (réglage « prive ») ; les aidants ne lisent pas ses conversations privées.
// Il faut être membre du cercle : un administrateur qui n'en fait pas partie ne voit rien.

export const GROUPES = ['famille', 'aidants', 'liaison']
const ROLES_GROUPE = {
  famille: ['accompagne', 'aidant', 'proche'],
  aidants: ['aidant'],
  liaison: ['aidant', 'auxiliaire']
}
export const TITRES = { famille: 'Toute la famille', aidants: 'Les aidants', liaison: 'Cahier de liaison' }

// Réglages de la messagerie d'une personne accompagnée (page Personnes accompagnées)
export const REPONSES_DEFAUT = ['Je t\'embrasse', 'Merci', 'Oui', 'Non', 'Appelle-moi', 'Viens me voir']
export const REGLAGES_DEFAUT = { prive: 'tous', reponses: REPONSES_DEFAUT, lectureAuto: false, vocal: true }
export const reglages = (messagerie) => ({ ...REGLAGES_DEFAUT, ...messagerie })

export const voitGroupe = (type, role) => ROLES_GROUPE[type]?.includes(role) ?? false

// Membres du cercle qui ont un compte actif, et les membres décédés (`decede`) : leurs anciens
// messages restent signés de leur nom, mais ils ne font plus partie d'aucune conversation de
// groupe et on ne peut plus leur écrire
export async function membresCercle(cercleId) {
  return db.select({
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
  if (prive === 'aidants') return ['aidant', 'auxiliaire'].includes(autre.role)
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
  return liste.filter((m) => !m.decede && voitGroupe(conversation.type, m.role))
}

// Peut-on encore écrire dans cette conversation (privée : le réglage de l'aidé a pu changer) ?
export function peutEcrire(conversation, moi, liste) {
  if (!participants(conversation, liste).some((m) => m.utilisateurId === moi.utilisateurId)) return false
  if (conversation.type !== 'privee') return true
  const autreId = conversation.personneA === moi.utilisateurId ? conversation.personneB : conversation.personneA
  return peutEcrirePrive(moi, liste.find((m) => m.utilisateurId === autreId))
}

// Un aidant peut retirer n'importe quel message des conversations de groupe ; chacun peut retirer les siens
export const peutRetirer = (conversation, moi, message) =>
  message.auteurId === moi.utilisateurId || (conversation.type !== 'privee' && moi.role === 'aidant')
