import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { sessions, utilisateurs } from '../db/schema.js'
import { nouveauJeton, empreinte } from './securite.js'

export const NOM_COOKIE = 'tu_session'
const JOUR = 24 * 60 * 60 * 1000
// Durée (glissante) d'une session : un appareil configuré pour une personne
// accompagnée reste connecté un an, les autres comptes 30 jours.
const DUREES = { mot_de_passe: 30 * JOUR, google: 30 * JOUR, appareil: 365 * JOUR }

export async function ouvrirSession(res, req, utilisateurId, type, libelle = null) {
  const jeton = nouveauJeton()
  const expireLe = new Date(Date.now() + DUREES[type])
  await db.insert(sessions).values({ utilisateurId, jetonHash: empreinte(jeton), type, libelle, expireLe })
  res.cookie(NOM_COOKIE, jeton, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    expires: expireLe,
    path: '/'
  })
  return jeton
}

export async function fermerSession(req, res) {
  if (req.jeton) await db.delete(sessions).where(eq(sessions.jetonHash, empreinte(req.jeton)))
  res.clearCookie(NOM_COOKIE, { path: '/' })
}

function lireJeton(req) {
  const entete = req.get('authorization')
  if (entete?.startsWith('Bearer ')) return entete.slice(7)
  for (const morceau of (req.get('cookie') || '').split(';')) {
    const [nom, ...valeur] = morceau.trim().split('=')
    if (nom === NOM_COOKIE) return decodeURIComponent(valeur.join('='))
  }
  return null
}

// Charge req.utilisateur et req.session si un jeton valide est présent (cookie ou en-tête
// Authorization: Bearer pour la future appli mobile).
export async function chargerSession(req, res, next) {
  const jeton = lireJeton(req)
  if (!jeton) return next()
  const [ligne] = await db
    .select({ session: sessions, utilisateur: utilisateurs })
    .from(sessions)
    .innerJoin(utilisateurs, eq(sessions.utilisateurId, utilisateurs.id))
    .where(and(eq(sessions.jetonHash, empreinte(jeton)), gt(sessions.expireLe, new Date()), isNull(utilisateurs.desactiveLe)))
  if (ligne) {
    req.jeton = jeton
    req.session = ligne.session
    req.utilisateur = ligne.utilisateur
    // Prolonge la session au plus une fois par jour
    const nouvelleExpiration = Date.now() + DUREES[ligne.session.type]
    if (nouvelleExpiration - ligne.session.expireLe.getTime() > JOUR) {
      const expireLe = new Date(nouvelleExpiration)
      await db.update(sessions).set({ expireLe }).where(eq(sessions.id, ligne.session.id))
      res.cookie(NOM_COOKIE, jeton, { httpOnly: true, sameSite: 'lax', secure: req.secure, expires: expireLe, path: '/' })
    }
  }
  next()
}

export function exigerConnexion(req, res, next) {
  if (!req.utilisateur) return res.status(401).json({ erreur: 'Connexion requise' })
  next()
}

export function exigerAdmin(req, res, next) {
  if (!req.utilisateur) return res.status(401).json({ erreur: 'Connexion requise' })
  if (!req.utilisateur.estAdmin) return res.status(403).json({ erreur: 'Réservé aux administrateurs' })
  next()
}

// Ce que le front a le droit de voir d'un utilisateur
export const profilPublic = (u) => ({
  id: u.id,
  prenom: u.prenom,
  nom: u.nom,
  email: u.email,
  estAdmin: u.estAdmin,
  telephone: u.telephone,
  dateNaissance: u.dateNaissance,
  adresse: u.adresse
})
