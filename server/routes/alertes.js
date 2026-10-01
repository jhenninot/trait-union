import { Router } from 'express'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { appareilsAlertes, utilisateurs } from '../db/schema.js'
import { exigerConnexion } from '../auth/sessions.js'
import { ErreurSaisie } from '../auth/validation.js'
import { CATEGORIES, clesVapid, firebaseActif, envoyerAux } from '../alertes/envoi.js'

// « Mes alertes » : catégories choisies par la personne connectée et appareils qui les reçoivent
const router = Router()
router.use(exigerConnexion)

// Nom lisible de l'appareil, d'après son navigateur
export function libelleAppareil(agent = '', type = 'web') {
  const systeme = /iPhone/.test(agent) ? 'iPhone' : /iPad/.test(agent) ? 'iPad' : /Android/.test(agent) ? 'Android'
    : /Windows/.test(agent) ? 'Windows' : /Mac OS/.test(agent) ? 'Mac' : /Linux/.test(agent) ? 'Linux' : 'Appareil'
  if (type === 'android') return `Application ${systeme === 'Android' ? 'Android' : 'mobile'}`
  const navigateur = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /SamsungBrowser/.test(agent) ? 'Samsung Internet'
    : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'navigateur'
  return `${systeme} · ${navigateur}`
}

// Préférences complètes (catégories absentes = activées)
export const preferences = (u) => Object.fromEntries(CATEGORIES.map((c) => [c, u.alertes?.[c] !== false]))

export function lirePreferences(body) {
  return Object.fromEntries(CATEGORIES.map((c) => [c, body?.[c] !== false]))
}

const presenterAppareil = (req) => (a) => ({
  id: a.id,
  type: a.type,
  libelle: a.libelle,
  creeLe: a.creeLe,
  ceAppareil: a.sessionId === req.session.id
})

router.get('/', async (req, res) => {
  const appareils = await db.select().from(appareilsAlertes)
    .where(eq(appareilsAlertes.utilisateurId, req.utilisateur.id))
    .orderBy(appareilsAlertes.creeLe)
  res.json({
    preferences: preferences(req.utilisateur),
    clePublique: (await clesVapid()).publicKey,
    android: await firebaseActif(),
    appareils: appareils.map(presenterAppareil(req))
  })
})

router.put('/preferences', async (req, res) => {
  const alertes = lirePreferences(req.body)
  await db.update(utilisateurs).set({ alertes }).where(eq(utilisateurs.id, req.utilisateur.id))
  res.json(alertes)
})

// Active les alertes sur cet appareil.
// Corps : { type: 'web', abonnement: { endpoint, keys: { p256dh, auth } } } ou { type: 'android', jeton }
router.post('/appareils', async (req, res) => {
  const { type } = req.body
  let adresse
  let cles = null
  if (type === 'web') {
    const { endpoint, keys } = req.body.abonnement ?? {}
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 2000) throw new ErreurSaisie('Abonnement invalide')
    if (typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') throw new ErreurSaisie('Abonnement invalide')
    adresse = endpoint
    cles = { p256dh: keys.p256dh, auth: keys.auth }
  } else if (type === 'android') {
    adresse = req.body.jeton
    if (typeof adresse !== 'string' || adresse.length < 20 || adresse.length > 4096) throw new ErreurSaisie('Jeton invalide')
  } else {
    throw new ErreurSaisie('Type d\'appareil invalide')
  }
  // Le même appareil peut changer de compte : il suit la session qui l'enregistre
  const valeurs = { utilisateurId: req.utilisateur.id, sessionId: req.session.id, type, cles, libelle: libelleAppareil(req.get('user-agent'), type) }
  const [appareil] = await db.insert(appareilsAlertes).values({ ...valeurs, adresse })
    .onConflictDoUpdate({ target: appareilsAlertes.adresse, set: valeurs })
    .returning()
  // Un seul abonnement par session : un ancien (navigateur réinstallé, jeton renouvelé) est remplacé
  const anciens = await db.select({ id: appareilsAlertes.id }).from(appareilsAlertes)
    .where(and(eq(appareilsAlertes.sessionId, req.session.id), eq(appareilsAlertes.type, type)))
  const aRetirer = anciens.map((a) => a.id).filter((id) => id !== appareil.id)
  if (aRetirer.length) await db.delete(appareilsAlertes).where(inArray(appareilsAlertes.id, aRetirer))
  res.status(201).json(presenterAppareil(req)(appareil))
})

// Arrête les alertes sur un de ses appareils (par son id, ou par son adresse pour celui-ci)
router.post('/appareils/retirer', async (req, res) => {
  const condition = req.body.id ? eq(appareilsAlertes.id, String(req.body.id)) : eq(appareilsAlertes.adresse, String(req.body.adresse ?? ''))
  await db.delete(appareilsAlertes).where(and(condition, eq(appareilsAlertes.utilisateurId, req.utilisateur.id)))
  res.status(204).end()
})

// Alerte d'essai sur tous ses appareils (ou sur un seul : { id })
router.post('/essai', async (req, res) => {
  const conditions = [eq(appareilsAlertes.utilisateurId, req.utilisateur.id)]
  if (req.body.id) conditions.push(eq(appareilsAlertes.id, String(req.body.id)))
  const appareils = await db.select().from(appareilsAlertes).where(and(...conditions))
  if (!appareils.length) return res.status(400).json({ erreur: 'Les alertes ne sont activées sur aucun appareil' })
  const resultat = await envoyerAux(appareils, {
    titre: 'Alerte d\'essai',
    corps: `Bonjour ${req.utilisateur.prenom}, les alertes de Trait d'union arrivent bien sur cet appareil.`,
    url: req.session.type === 'appareil' ? '/' : '/alertes',
    tag: 'essai'
  })
  if (!resultat.envoyes) return res.status(502).json({ erreur: resultat.erreurs[0] ?? 'L\'alerte n\'a pu être envoyée sur aucun appareil' })
  res.json(resultat)
})

export default router
