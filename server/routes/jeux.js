import { Router } from 'express'
import { and, eq, inArray } from 'drizzle-orm'
import { exigerConnexion } from '../auth/sessions.js'
import { db } from '../db/index.js'
import { membres, utilisateurs } from '../db/schema.js'
import { aLesDroits } from '../auth/roles.js'
import { reglages } from '../jeux.js'
import { compterJeux } from '../statistiques.js'
import { chargerExterieurs } from '../arbre.js'

// Réglages des jeux de la personne connectée (choisis par ses aidants, voir routes/cercles.js)
const router = Router()
router.use(exigerConnexion)

// Les aidants et les proches (et les administrateurs) peuvent essayer les jeux d'une personne
// accompagnée de leur cercle : « ?pour=<identifiant du compte de la personne> ». Sans ce paramètre,
// la cible est la personne connectée. Les essais ne comptent pas dans les statistiques et ne
// changent rien (pas de « J'aime »).
export async function chargerCible(req, res, next) {
  const pour = req.query.pour
  if (!pour) {
    req.cible = req.utilisateur
    req.essai = false
    return next()
  }
  if (!/^[0-9a-f-]{36}$/i.test(String(pour))) return res.status(400).json({ erreur: 'Identifiant invalide' })
  const cercles = (await db.select({ id: membres.cercleId }).from(membres)
    .where(and(eq(membres.utilisateurId, pour), eq(membres.role, 'accompagne')))).map((m) => m.id)
  if (!cercles.length) return res.status(404).json({ erreur: 'Personne introuvable' })
  if (!req.utilisateur.estAdmin) {
    const miens = await db.select({ role: membres.role }).from(membres)
      .where(and(eq(membres.utilisateurId, req.utilisateur.id), inArray(membres.cercleId, cercles)))
    if (!miens.some((m) => aLesDroits(m.role, 'proche'))) return res.status(403).json({ erreur: 'Réservé aux aidants et aux proches' })
  }
  const [cible] = await db.select().from(utilisateurs).where(eq(utilisateurs.id, pour))
  if (!cible) return res.status(404).json({ erreur: 'Personne introuvable' })
  req.cible = cible
  req.essai = true
  next()
}

// Une partie commence (compteur des statistiques, sans rien retenir de ce qui est joué)
router.post('/partie', (req, res) => {
  if (req.session?.type === 'appareil') compterJeux(req.utilisateur.id)
  res.json({ ok: true })
})

// Personnes extérieures à la famille (fiches ajoutées par les aidants) de tous les cercles de la personne
router.get('/exterieurs', chargerCible, async (req, res) => {
  if (!reglages(req.cible.jeux).exterieurs) return res.json([])
  const cercles = (await db.select({ id: membres.cercleId }).from(membres)
    .where(and(eq(membres.utilisateurId, req.cible.id), eq(membres.role, 'accompagne')))).map((m) => m.id)
  res.json((await chargerExterieurs(cercles)).map(({ avatarChoix, photosJeu, ...p }) => ({ ...p, photosJeu: photosJeu.map((x) => x.url), groupe: 'exterieur' })))
})

router.get('/reglages', chargerCible, (req, res) => res.json(reglages(req.cible.jeux)))

export default router
