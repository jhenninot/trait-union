import { and, eq, ne, isNull, count } from 'drizzle-orm'
import { db } from './db/index.js'
import { utilisateurs, sessions, appareilsAlertes, codesConnexion, personnes } from './db/schema.js'
import { ErreurSaisie } from './auth/validation.js'

// Décès d'une personne qui a un compte (personne accompagnée, aidant, proche ou auxiliaire).
// Le compte n'est pas supprimé, pour pouvoir annuler une erreur : il est désactivé (plus de
// connexion, d'alertes, d'anniversaire, de messages), ses appareils sont déconnectés, et ses
// fiches de l'arbre généalogique passent en « décédé ». Partout, la personne apparaît comme une
// personne de l'arbre qui n'a pas de compte : visage grisé, « décédé », plus rien à lui envoyer.
// Ses photos, messages et rendez-vous restent.

async function verifier(compte, auteur) {
  if (compte.id === auteur.id) throw new ErreurSaisie('Vous ne pouvez pas indiquer votre propre décès')
  if (compte.estAdmin) {
    const [{ n }] = await db.select({ n: count() }).from(utilisateurs)
      .where(and(eq(utilisateurs.estAdmin, true), ne(utilisateurs.id, compte.id), isNull(utilisateurs.desactiveLe)))
    if (n === 0) throw new ErreurSaisie('C\'est le dernier administrateur : nommez d\'abord un autre administrateur')
  }
}

// `dateDeces` : « AAAA-MM-JJ » ou null (date inconnue). Rappeler la fonction change seulement la date.
export async function marquerDeces(utilisateurId, dateDeces, auteur) {
  const [compte] = await db.select().from(utilisateurs).where(eq(utilisateurs.id, utilisateurId))
  if (!compte) throw new ErreurSaisie('Compte introuvable')
  if (!compte.decede) await verifier(compte, auteur)
  await db.transaction(async (tx) => {
    await tx.update(utilisateurs)
      .set({ decede: true, dateDeces, desactiveLe: compte.desactiveLe ?? new Date() })
      .where(eq(utilisateurs.id, compte.id))
    await tx.update(personnes).set({ decede: true, dateDeces }).where(eq(personnes.utilisateurId, compte.id))
    if (compte.decede) return
    // Plus aucun appareil connecté ni alerte, et les codes de tablette en cours ne servent plus
    await tx.delete(appareilsAlertes).where(eq(appareilsAlertes.utilisateurId, compte.id))
    await tx.delete(sessions).where(eq(sessions.utilisateurId, compte.id))
    await tx.update(codesConnexion).set({ expireLe: new Date() })
      .where(and(eq(codesConnexion.utilisateurId, compte.id), isNull(codesConnexion.utiliseLe)))
  })
}

// Annule un décès indiqué par erreur : le compte redevient actif. Les appareils ayant été
// déconnectés, la personne se reconnecte (mot de passe, Google, ou nouveau code pour une tablette).
export async function annulerDeces(utilisateurId) {
  const [compte] = await db.select().from(utilisateurs).where(eq(utilisateurs.id, utilisateurId))
  if (!compte) throw new ErreurSaisie('Compte introuvable')
  if (!compte.decede) return
  await db.transaction(async (tx) => {
    await tx.update(utilisateurs).set({ decede: false, dateDeces: null, desactiveLe: null }).where(eq(utilisateurs.id, compte.id))
    await tx.update(personnes).set({ decede: false, dateDeces: null }).where(eq(personnes.utilisateurId, compte.id))
  })
}
