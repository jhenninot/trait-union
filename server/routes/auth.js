import { Router } from 'express'
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { utilisateurs, codesConnexion, membres, cercles } from '../db/schema.js'
import { hacherMotDePasse, verifierMotDePasse, empreinteFactice, empreinte, limiteur } from '../auth/securite.js'
import { ouvrirSession, fermerSession, profilPublic } from '../auth/sessions.js'
import * as valider from '../auth/validation.js'
import routesGoogle, { googleActif } from './google.js'
import { emailActif } from '../email/brevo.js'
import { presenterAvatar } from '../avatars.js'

const router = Router()
router.use('/google', routesGoogle)
const limiteConnexion = limiteur({ max: 10, fenetreMs: 15 * 60 * 1000 })
const limiteCode = limiteur({ max: 10, fenetreMs: 15 * 60 * 1000 })

export async function mesCercles(utilisateurId) {
  return db
    .select({ id: cercles.id, nom: cercles.nom, role: membres.role, membreId: membres.id })
    .from(membres)
    .innerJoin(cercles, eq(membres.cercleId, cercles.id))
    .where(eq(membres.utilisateurId, utilisateurId))
    .orderBy(cercles.nom)
}

// État de connexion : le front s'en sert au démarrage pour choisir l'écran à afficher.
router.get('/etat', async (req, res) => {
  const [{ n }] = await db.select({ n: count() }).from(utilisateurs)
  if (!req.utilisateur) return res.json({ initialise: n > 0, google: googleActif, utilisateur: null })
  res.json({
    initialise: true,
    google: googleActif,
    utilisateur: { ...profilPublic(req.utilisateur), ...await presenterAvatar(req.utilisateur) },
    typeSession: req.session.type,
    email: await emailActif(),
    cercles: await mesCercles(req.utilisateur.id)
  })
})

// Premier lancement : crée le compte administrateur, seulement si la base est vide.
router.post('/initialiser', async (req, res) => {
  const donnees = {
    prenom: valider.texte(req.body.prenom, 'prénom'),
    nom: valider.texte(req.body.nom, 'nom', { obligatoire: false }),
    email: valider.email(req.body.email),
    motDePasse: await hacherMotDePasse(valider.motDePasse(req.body.motDePasse)),
    estAdmin: true
  }
  const utilisateur = await db.transaction(async (tx) => {
    // Verrou pour éviter que deux premiers comptes soient créés en même temps
    await tx.execute(sql`lock table utilisateurs in exclusive mode`)
    const [{ n }] = await tx.select({ n: count() }).from(utilisateurs)
    if (n > 0) return null
    const [u] = await tx.insert(utilisateurs).values(donnees).returning()
    return u
  })
  if (!utilisateur) return res.status(409).json({ erreur: 'L\'application est déjà initialisée' })
  await ouvrirSession(res, req, utilisateur.id, 'mot_de_passe')
  res.status(201).json({ utilisateur: profilPublic(utilisateur) })
})

// Connexion email + mot de passe (aidants, proches, administrateurs)
router.post('/connexion', async (req, res) => {
  if (limiteConnexion.depasse(req.ip)) {
    return res.status(429).json({ erreur: 'Trop de tentatives, réessayez dans quelques minutes' })
  }
  const email = String(req.body.email || '').trim().toLowerCase()
  const [utilisateur] = email
    ? await db.select().from(utilisateurs).where(and(eq(utilisateurs.email, email), isNull(utilisateurs.desactiveLe)))
    : []
  const ok = await verifierMotDePasse(String(req.body.motDePasse || ''), utilisateur?.motDePasse || empreinteFactice)
  if (!utilisateur || !ok) return res.status(401).json({ erreur: 'Email ou mot de passe incorrect' })
  limiteConnexion.reinitialiser(req.ip)
  await ouvrirSession(res, req, utilisateur.id, 'mot_de_passe')
  res.json({ utilisateur: profilPublic(utilisateur) })
})

// Configuration de l'appareil d'une personne accompagnée avec le code donné par un aidant.
router.post('/appareil', async (req, res) => {
  if (limiteCode.depasse(req.ip)) {
    return res.status(429).json({ erreur: 'Trop de tentatives, réessayez dans quelques minutes' })
  }
  const code = String(req.body.code || '').replace(/\D/g, '')
  if (code.length !== 6) return res.status(400).json({ erreur: 'Le code comporte 6 chiffres' })
  const maintenant = new Date()
  // Consommation atomique du code : il ne sert qu'une fois
  const [utilise] = await db
    .update(codesConnexion)
    .set({ utiliseLe: maintenant })
    .where(and(eq(codesConnexion.codeHash, empreinte(code)), isNull(codesConnexion.utiliseLe), gt(codesConnexion.expireLe, maintenant)))
    .returning()
  if (!utilise) return res.status(401).json({ erreur: 'Ce code n\'est pas valable. Demandez-en un nouveau à votre aidant.' })
  const [utilisateur] = await db.select().from(utilisateurs)
    .where(and(eq(utilisateurs.id, utilise.utilisateurId), isNull(utilisateurs.desactiveLe)))
  if (!utilisateur) return res.status(401).json({ erreur: 'Ce compte est désactivé' })
  limiteCode.reinitialiser(req.ip)
  const libelle = valider.texte(req.body.libelle, 'nom de l\'appareil', { obligatoire: false, max: 80 })
  await ouvrirSession(res, req, utilisateur.id, 'appareil', libelle)
  res.json({ utilisateur: profilPublic(utilisateur) })
})

router.post('/deconnexion', async (req, res) => {
  await fermerSession(req, res)
  res.status(204).end()
})

export default router
