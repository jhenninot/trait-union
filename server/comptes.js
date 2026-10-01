import { and, eq, ne, sql, inArray, isNull, count, max } from 'drizzle-orm'
import { db } from './db/index.js'
import { utilisateurs, membres, cercles, sessions, personnes, photos, rendezVous } from './db/schema.js'
import { ErreurSaisie } from './auth/validation.js'
import { changerAvatar, liensAvatars } from './avatars.js'

// Gestion des comptes par l'administrateur : liste de tous les utilisateurs et suppression.

// Cercles de chaque compte, avec « dernierAidant » quand personne d'autre n'y est aidant
async function cerclesDesComptes(ids) {
  if (!ids.length) return new Map()
  const lignes = await db.select({ utilisateurId: membres.utilisateurId, cercleId: cercles.id, nom: cercles.nom, role: membres.role })
    .from(membres).innerJoin(cercles, eq(membres.cercleId, cercles.id))
    .where(inArray(membres.utilisateurId, ids))
    .orderBy(cercles.nom)
  const aidants = await db.select({ cercleId: membres.cercleId, n: count() }).from(membres)
    .where(eq(membres.role, 'aidant')).groupBy(membres.cercleId)
  const nbAidants = new Map(aidants.map((a) => [a.cercleId, a.n]))
  const parCompte = new Map()
  for (const l of lignes) {
    if (!parCompte.has(l.utilisateurId)) parCompte.set(l.utilisateurId, [])
    parCompte.get(l.utilisateurId).push({
      id: l.cercleId,
      nom: l.nom,
      role: l.role,
      dernierAidant: l.role === 'aidant' && nbAidants.get(l.cercleId) === 1
    })
  }
  return parCompte
}

// Liste réduite : pas de coordonnées, seulement de quoi reconnaître le compte
export async function listerComptes() {
  const comptes = await db.select({
    id: utilisateurs.id,
    prenom: utilisateurs.prenom,
    nom: utilisateurs.nom,
    email: utilisateurs.email,
    estAdmin: utilisateurs.estAdmin,
    avatar: utilisateurs.avatar,
    creeLe: utilisateurs.creeLe,
    desactiveLe: utilisateurs.desactiveLe
  }).from(utilisateurs).orderBy(sql`lower(${utilisateurs.prenom})`, sql`lower(coalesce(${utilisateurs.nom}, ''))`)
  // Dernière activité : une session est prolongée au plus une fois par jour (précision : le jour)
  const activites = await db.select({ utilisateurId: sessions.utilisateurId, le: max(sessions.modifieLe) })
    .from(sessions).groupBy(sessions.utilisateurId)
  const activite = new Map(activites.map((a) => [a.utilisateurId, a.le]))
  const cerclesDe = await cerclesDesComptes(comptes.map((c) => c.id))
  const lienAvatar = await liensAvatars()
  return comptes.map((c) => ({
    ...c,
    avatar: lienAvatar(c.id, c.avatar),
    accompagne: !c.email,
    derniereActivite: activite.get(c.id) ?? null,
    cercles: cerclesDe.get(c.id) ?? []
  }))
}

// Refuse ce qui ne doit pas se faire : se supprimer soi-même, supprimer le dernier administrateur
async function verifierSuppression(compte, admin) {
  if (compte.id === admin.id) throw new ErreurSaisie('Vous ne pouvez pas supprimer votre propre compte')
  if (compte.estAdmin) {
    const [{ n }] = await db.select({ n: count() }).from(utilisateurs)
      .where(and(eq(utilisateurs.estAdmin, true), ne(utilisateurs.id, compte.id), isNull(utilisateurs.desactiveLe)))
    if (n === 0) throw new ErreurSaisie('C\'est le dernier administrateur : il ne peut pas être supprimé')
  }
}

async function lireCompte(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [u] = await db.select().from(utilisateurs).where(eq(utilisateurs.id, id))
  return u ?? null
}

// Ce que la suppression va toucher, pour l'avertissement affiché avant de confirmer
export async function apercuSuppression(id, admin) {
  const compte = await lireCompte(id)
  if (!compte) return null
  let refus = null
  try { await verifierSuppression(compte, admin) } catch (e) { refus = e.message }
  const cerclesDe = await cerclesDesComptes([id])
  const [[fiches], [photosCreees], [rdvCrees], [rdvPourLui]] = await Promise.all([
    db.select({ n: count() }).from(personnes).where(eq(personnes.utilisateurId, id)),
    db.select({ n: count() }).from(photos).where(eq(photos.creeParId, id)),
    db.select({ n: count() }).from(rendezVous).where(eq(rendezVous.creeParId, id)),
    db.select({ n: count() }).from(rendezVous).where(eq(rendezVous.accompagneId, id))
  ])
  return {
    id,
    prenom: compte.prenom,
    nom: compte.nom,
    refus,
    cercles: cerclesDe.get(id) ?? [],
    fichesArbre: fiches.n,
    photos: photosCreees.n,
    rendezVous: rdvCrees.n,
    rendezVousPourLui: rdvPourLui.n
  }
}

// Supprime le compte. Restent dans les cercles : ses photos et les rendez-vous qu'il a créés
// (sans auteur), et sa fiche dans l'arbre généalogique, qui devient une personne sans compte
// avec les prénom, nom et coordonnées du compte. Partent : ses sessions, appareils d'alertes,
// codes de connexion, son appartenance aux cercles, les rendez-vous réservés à lui seul
// (personne accompagnée) et sa photo de profil chez l'hébergeur.
export async function supprimerCompte(id, admin) {
  const compte = await lireCompte(id)
  if (!compte) return false
  await verifierSuppression(compte, admin)
  await db.transaction(async (tx) => {
    const fiches = await tx.select().from(personnes).where(eq(personnes.utilisateurId, id))
    for (const p of fiches) {
      await tx.update(personnes).set({
        utilisateurId: null,
        prenom: compte.prenom,
        nom: compte.nom ?? p.nom,
        telephone: compte.telephone ?? p.telephone,
        dateNaissance: compte.dateNaissance ?? p.dateNaissance,
        adresse: compte.adresse ?? p.adresse,
        // Un modèle d'avatar se recopie ; une photo de profil est supprimée avec le compte
        avatar: compte.avatar?.startsWith('modele:') ? compte.avatar : p.avatar
      }).where(eq(personnes.id, p.id))
    }
    await tx.delete(membres).where(eq(membres.utilisateurId, id))
    await tx.delete(utilisateurs).where(eq(utilisateurs.id, id))
  })
  if (compte.avatar?.startsWith('photo:')) {
    await changerAvatar(compte, null).catch((e) => console.error('Suppression de la photo de profil :', e.message))
  }
  return true
}
