import { Router } from 'express'
import { and, eq, isNull, count } from 'drizzle-orm'
import { db } from '../db/index.js'
import { cercles, membres, utilisateurs, invitations, codesConnexion, sessions, appareilsAlertes } from '../db/schema.js'
import { exigerConnexion, exigerAdmin } from '../auth/sessions.js'
import { nouveauJeton, nouveauCode, empreinte } from '../auth/securite.js'
import { mesCercles } from './auth.js'
import * as valider from '../auth/validation.js'
import { aLesDroits } from '../auth/roles.js'
import { emailActif, envoyerEmail, gabarit } from '../email/brevo.js'
import { urlApplication } from '../url.js'
import routesAgenda from './agenda.js'
import routesPhotos from './photos.js'
import routesAlbums from './albums.js'
import { liensAvatars, preparerEnvoi, changerAvatar } from '../avatars.js'
import { preferences, lirePreferences } from './alertes.js'

const router = Router()
router.use(exigerConnexion)

const MINUTE = 60 * 1000
const DUREE_INVITATION = 7 * 24 * 60 * MINUTE
const DUREE_CODE = 30 * MINUTE

// Charge le cercle et le rôle de l'utilisateur dedans. Un administrateur voit tous les cercles.
async function chargerCercle(req, res, next) {
  const [cercle] = await db.select().from(cercles).where(eq(cercles.id, req.params.cercleId))
  const [membre] = cercle
    ? await db.select().from(membres).where(and(eq(membres.cercleId, cercle.id), eq(membres.utilisateurId, req.utilisateur.id)))
    : []
  if (!cercle || (!membre && !req.utilisateur.estAdmin)) return res.status(404).json({ erreur: 'Cercle introuvable' })
  req.cercle = cercle
  req.role = membre?.role ?? null
  req.peutGerer = req.utilisateur.estAdmin || aLesDroits(req.role, 'aidant')
  next()
}

// Les auxiliaires de vie n'ont pas accès aux photos de la famille
function refuserAuxiliaires(req, res, next) {
  if (!req.peutGerer && req.role === 'auxiliaire') return res.status(403).json({ erreur: 'Les photos ne sont pas accessibles aux auxiliaires de vie' })
  next()
}

function exigerGestion(req, res, next) {
  if (!req.peutGerer) return res.status(403).json({ erreur: 'Réservé aux aidants du cercle' })
  next()
}

async function chargerAccompagne(req, res, next) {
  const [membre] = await db.select().from(membres)
    .where(and(eq(membres.id, req.params.membreId), eq(membres.cercleId, req.cercle.id)))
  if (!membre) return res.status(404).json({ erreur: 'Membre introuvable' })
  if (membre.role !== 'accompagne' || !membre.utilisateurId) {
    return res.status(400).json({ erreur: 'Réservé aux personnes accompagnées' })
  }
  req.membre = membre
  next()
}

router.get('/', async (req, res) => {
  if (!req.utilisateur.estAdmin) return res.json(await mesCercles(req.utilisateur.id))
  const miens = new Map((await mesCercles(req.utilisateur.id)).map((c) => [c.id, c]))
  const tous = await db.select({ id: cercles.id, nom: cercles.nom }).from(cercles).orderBy(cercles.nom)
  res.json(tous.map((c) => ({ ...c, role: miens.get(c.id)?.role ?? null, membreId: miens.get(c.id)?.membreId ?? null })))
})

// Ajoute l'utilisateur connecté au cercle comme aidant (ou promeut un proche en aidant)
async function ajouterCommeAidant(cercleId, u, tx = db) {
  await tx.insert(membres)
    .values({ cercleId, utilisateurId: u.id, prenom: u.prenom, nom: u.nom, email: u.email, role: 'aidant' })
    .onConflictDoUpdate({ target: [membres.cercleId, membres.utilisateurId], set: { role: 'aidant' } })
}

router.post('/', exigerAdmin, async (req, res) => {
  const nom = valider.texte(req.body.nom, 'nom du cercle')
  const cercle = await db.transaction(async (tx) => {
    const [c] = await tx.insert(cercles).values({ nom }).returning()
    if (req.body.rejoindre) await ajouterCommeAidant(c.id, req.utilisateur, tx)
    return c
  })
  res.status(201).json(cercle)
})

router.get('/:cercleId', chargerCercle, async (req, res) => {
  const liste = await db
    .select({ id: membres.id, prenom: membres.prenom, nom: membres.nom, email: membres.email, role: membres.role, utilisateurId: membres.utilisateurId, avatar: utilisateurs.avatar, alertes: utilisateurs.alertes, telephone: utilisateurs.telephone, dateNaissance: utilisateurs.dateNaissance, adresse: utilisateurs.adresse })
    .from(membres)
    .leftJoin(utilisateurs, eq(membres.utilisateurId, utilisateurs.id))
    .where(eq(membres.cercleId, req.cercle.id))
    .orderBy(membres.role, membres.prenom)
  // Nombre d'appareils connectés pour chaque personne accompagnée
  const appareils = await db
    .select({ utilisateurId: sessions.utilisateurId, n: count() })
    .from(sessions)
    .innerJoin(membres, eq(membres.utilisateurId, sessions.utilisateurId))
    .where(and(eq(membres.cercleId, req.cercle.id), eq(membres.role, 'accompagne'), eq(sessions.type, 'appareil')))
    .groupBy(sessions.utilisateurId)
  const parUtilisateur = new Map(appareils.map((a) => [a.utilisateurId, a.n]))
  // Appareils des personnes accompagnées qui reçoivent les alertes
  const avecAlertes = await db
    .select({ utilisateurId: appareilsAlertes.utilisateurId, n: count() })
    .from(appareilsAlertes)
    .innerJoin(membres, eq(membres.utilisateurId, appareilsAlertes.utilisateurId))
    .where(and(eq(membres.cercleId, req.cercle.id), eq(membres.role, 'accompagne')))
    .groupBy(appareilsAlertes.utilisateurId)
  const alertesParUtilisateur = new Map(avecAlertes.map((a) => [a.utilisateurId, a.n]))
  const lienAvatar = await liensAvatars()
  // Les auxiliaires de vie ne voient que le téléphone des membres
  const voitTout = req.peutGerer || req.role !== 'auxiliaire'
  res.json({
    ...req.cercle,
    monRole: req.role,
    peutGerer: req.peutGerer,
    membres: liste.map(({ utilisateurId, email, avatar, alertes, dateNaissance, adresse, ...m }) => ({
      ...m,
      dateNaissance: voitTout ? dateNaissance : undefined,
      adresse: voitTout ? adresse : undefined,
      moi: utilisateurId === req.utilisateur.id,
      avatar: lienAvatar(utilisateurId, avatar),
      // Les aidants choisissent l'avatar des personnes accompagnées
      avatarChoix: req.peutGerer && m.role === 'accompagne' ? avatar : undefined,
      email: req.peutGerer ? email : undefined,
      appareils: m.role === 'accompagne' ? (parUtilisateur.get(utilisateurId) ?? 0) : undefined,
      // Les aidants choisissent les alertes des personnes accompagnées
      alertes: req.peutGerer && m.role === 'accompagne' ? { ...preferences({ alertes }), appareils: alertesParUtilisateur.get(utilisateurId) ?? 0 } : undefined
    }))
  })
})

// Un administrateur qui n'est pas membre (ou seulement proche) devient aidant du cercle
router.post('/:cercleId/rejoindre', chargerCercle, exigerAdmin, async (req, res) => {
  if (aLesDroits(req.role, 'aidant') || req.role === 'accompagne') {
    return res.status(409).json({ erreur: 'Vous êtes déjà membre de ce cercle' })
  }
  await ajouterCommeAidant(req.cercle.id, req.utilisateur)
  res.status(204).end()
})

// Lien d'invitation (7 jours, usage unique) pour un aidant, un proche ou une auxiliaire de vie
router.post('/:cercleId/invitations', chargerCercle, exigerGestion, async (req, res) => {
  const role = req.body.role
  if (!['aidant', 'proche', 'auxiliaire'].includes(role)) return res.status(400).json({ erreur: 'Rôle invalide' })
  // Adresse facultative : si l'envoi d'emails est configuré, le lien part aussi par email
  const destinataire = req.body.email ? valider.email(req.body.email) : null
  if (destinataire && !(await emailActif())) return res.status(400).json({ erreur: 'L\'envoi d\'emails n\'est pas configuré' })
  const jeton = nouveauJeton()
  const expireLe = new Date(Date.now() + DUREE_INVITATION)
  await db.insert(invitations).values({ cercleId: req.cercle.id, role, creeParId: req.utilisateur.id, jetonHash: empreinte(jeton), expireLe })
  let emailEnvoye = null
  let erreurEmail = null
  if (destinataire) {
    const u = req.utilisateur
    const { html, texte } = gabarit({
      titre: `${u.prenom} vous invite à rejoindre « ${req.cercle.nom} »`,
      paragraphes: [
        'Bonjour,',
        `${[u.prenom, u.nom].filter(Boolean).join(' ')} vous invite à rejoindre le cercle « ${req.cercle.nom} » sur Trait d'union, ` +
          `en tant ${{ aidant: 'qu\'aidant', proche: 'que proche', auxiliaire: 'qu\'auxiliaire de vie' }[role]}.`,
        `Ce lien est personnel et ne sert qu'une fois. Il est valable jusqu'au ${expireLe.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long' })}.`
      ],
      bouton: { texte: 'Rejoindre le cercle', lien: `${urlApplication(req)}/invitation/${jeton}` }
    })
    try {
      await envoyerEmail({ a: { email: destinataire }, sujet: `Invitation à rejoindre « ${req.cercle.nom} » sur Trait d'union`, html, texte })
      emailEnvoye = destinataire
    } catch (e) {
      // L'invitation reste valable : le lien peut encore être copié à la main
      erreurEmail = e.message
    }
  }
  res.status(201).json({ jeton, role, expireLe, emailEnvoye, erreurEmail })
})

// Ajoute une personne accompagnée (sans email ni mot de passe)
router.post('/:cercleId/accompagnes', chargerCercle, exigerGestion, async (req, res) => {
  const prenom = valider.texte(req.body.prenom, 'prénom')
  const nom = valider.texte(req.body.nom, 'nom', { obligatoire: false })
  const membre = await db.transaction(async (tx) => {
    const [u] = await tx.insert(utilisateurs).values({ prenom, nom }).returning()
    const [m] = await tx.insert(membres).values({ cercleId: req.cercle.id, utilisateurId: u.id, prenom, nom, role: 'accompagne' }).returning()
    return m
  })
  res.status(201).json(membre)
})

// Code à 6 chiffres (30 minutes, usage unique) pour configurer l'appareil d'une personne accompagnée
router.post('/:cercleId/membres/:membreId/code', chargerCercle, exigerGestion, chargerAccompagne, async (req, res) => {
  const maintenant = new Date()
  // Les anciens codes non utilisés de cette personne ne servent plus
  await db.update(codesConnexion).set({ expireLe: maintenant })
    .where(and(eq(codesConnexion.utilisateurId, req.membre.utilisateurId), isNull(codesConnexion.utiliseLe)))
  const expireLe = new Date(maintenant.getTime() + DUREE_CODE)
  const code = await db.transaction(async (tx) => {
    // Évite de distribuer un code déjà actif pour une autre personne
    for (;;) {
      const candidat = nouveauCode()
      const [actif] = await tx.select({ id: codesConnexion.id }).from(codesConnexion)
        .where(and(eq(codesConnexion.codeHash, empreinte(candidat)), isNull(codesConnexion.utiliseLe)))
      if (actif) continue
      await tx.insert(codesConnexion).values({ utilisateurId: req.membre.utilisateurId, creeParId: req.utilisateur.id, codeHash: empreinte(candidat), expireLe })
      return candidat
    }
  })
  res.status(201).json({ code, expireLe })
})

// Déconnecte tous les appareils d'une personne accompagnée (tablette perdue, changée...)
router.post('/:cercleId/membres/:membreId/deconnecter', chargerCercle, exigerGestion, chargerAccompagne, async (req, res) => {
  await db.delete(sessions).where(and(eq(sessions.utilisateurId, req.membre.utilisateurId), eq(sessions.type, 'appareil')))
  res.status(204).end()
})

// Alertes reçues par une personne accompagnée (rappels de rendez-vous, nouvelles photos)
router.put('/:cercleId/membres/:membreId/alertes', chargerCercle, exigerGestion, chargerAccompagne, async (req, res) => {
  const alertes = lirePreferences(req.body)
  await db.update(utilisateurs).set({ alertes }).where(eq(utilisateurs.id, req.membre.utilisateurId))
  res.json(alertes)
})

// Téléphone, date de naissance et adresse d'une personne accompagnée, renseignés par un aidant
router.put('/:cercleId/membres/:membreId/coordonnees', chargerCercle, exigerGestion, chargerAccompagne, async (req, res) => {
  const coordonnees = valider.coordonnees(req.body)
  await db.update(utilisateurs).set(coordonnees).where(eq(utilisateurs.id, req.membre.utilisateurId))
  res.json(coordonnees)
})

// Avatar d'une personne accompagnée, choisi par un aidant (même fonctionnement que « Mon profil »)
async function chargerCompteAccompagne(req, res, next) {
  const [u] = await db.select().from(utilisateurs).where(eq(utilisateurs.id, req.membre.utilisateurId))
  if (!u) return res.status(404).json({ erreur: 'Membre introuvable' })
  req.compte = u
  next()
}

router.post('/:cercleId/membres/:membreId/avatar/envoi', chargerCercle, exigerGestion, chargerAccompagne, async (req, res) => {
  res.json(await preparerEnvoi(req.membre.utilisateurId, req.body.taille))
})

router.put('/:cercleId/membres/:membreId/avatar', chargerCercle, exigerGestion, chargerAccompagne, chargerCompteAccompagne, async (req, res) => {
  res.json(await changerAvatar(req.compte, req.body.avatar))
})

router.delete('/:cercleId/membres/:membreId', chargerCercle, exigerGestion, async (req, res) => {
  const [membre] = await db.delete(membres)
    .where(and(eq(membres.id, req.params.membreId), eq(membres.cercleId, req.cercle.id)))
    .returning()
  if (!membre) return res.status(404).json({ erreur: 'Membre introuvable' })
  // Une personne accompagnée n'a pas d'autre moyen de connexion : on supprime son compte
  if (membre.role === 'accompagne' && membre.utilisateurId) {
    const [{ n }] = await db.select({ n: count() }).from(membres).where(eq(membres.utilisateurId, membre.utilisateurId))
    if (n === 0) {
      const [u] = await db.delete(utilisateurs).where(eq(utilisateurs.id, membre.utilisateurId)).returning()
      // Sa photo de profil éventuelle est supprimée chez l'hébergeur
      if (u?.avatar) await changerAvatar(u, null).catch(() => {})
    }
  }
  res.status(204).end()
})

// Agenda du cercle (rendez-vous)
router.use('/:cercleId/rendez-vous', chargerCercle, routesAgenda)
router.use('/:cercleId/photos', chargerCercle, refuserAuxiliaires, routesPhotos)
router.use('/:cercleId/albums', chargerCercle, refuserAuxiliaires, routesAlbums)

export default router
