import { Router } from 'express'
import { sql, and, eq, desc, inArray } from 'drizzle-orm'
import { exigerConnexion } from '../auth/sessions.js'
import { db } from '../db/index.js'
import { membres, utilisateurs, scoresQuiz } from '../db/schema.js'
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

// Jeux avec score : clé du jeu → réglage qui l'active
const JEUX_SCORE = { musique: 'musiqueScore', qui: 'quiScore', age: 'ageScore' }

// Classement d'une personne accompagnée : le meilleur score de chaque joueur (elle-même ou un membre
// de sa famille) à un jeu, pour les parties de ce nombre de questions, les trois premiers.
async function classement(aideId, jeu, questions, moiId) {
  const lignes = await db.select({ joueurId: scoresQuiz.joueurId, prenom: utilisateurs.prenom, points: sql`max(${scoresQuiz.points})`.mapWith(Number) })
    .from(scoresQuiz).innerJoin(utilisateurs, eq(utilisateurs.id, scoresQuiz.joueurId))
    .where(and(eq(scoresQuiz.aideId, aideId), eq(scoresQuiz.jeu, jeu), eq(scoresQuiz.questions, questions)))
    .groupBy(scoresQuiz.joueurId, utilisateurs.prenom)
    .orderBy(desc(sql`max(${scoresQuiz.points})`)).limit(3)
  return lignes.map((l) => ({ prenom: l.prenom, points: l.points, moi: l.joueurId === moiId }))
}

// Fin d'une partie d'un jeu avec score. Corps : { jeu: 'musique' | 'qui' | 'age', points, questions }.
// Enregistre le score du joueur connecté et renvoie son meilleur score d'avant et le classement
// (« ?pour= » : un membre de la famille joue pour une personne accompagnée).
router.post('/scores', chargerCible, async (req, res) => {
  const r = reglages(req.cible.jeux)
  const jeu = String(req.body.jeu ?? 'musique')
  if (!JEUX_SCORE[jeu]) return res.status(400).json({ erreur: 'Jeu inconnu' })
  if (!req.essai && (!r.actif || !r[JEUX_SCORE[jeu]])) return res.status(403).json({ erreur: 'Ce jeu avec score n\'est pas activé' })
  const questions = Number(req.body.questions)
  const points = Number(req.body.points)
  if (!Number.isInteger(questions) || questions < 1 || questions > 20) return res.status(400).json({ erreur: 'Nombre de questions invalide' })
  if (!Number.isInteger(points) || points < 0 || points > questions * 200) return res.status(400).json({ erreur: 'Score invalide' })
  const [avant] = await db.select({ meilleur: sql`coalesce(max(${scoresQuiz.points}), 0)`.mapWith(Number) }).from(scoresQuiz)
    .where(and(eq(scoresQuiz.aideId, req.cible.id), eq(scoresQuiz.joueurId, req.utilisateur.id), eq(scoresQuiz.jeu, jeu), eq(scoresQuiz.questions, questions)))
  await db.insert(scoresQuiz).values({ aideId: req.cible.id, joueurId: req.utilisateur.id, jeu, points, questions })
  res.json({ meilleur: avant.meilleur, classement: await classement(req.cible.id, jeu, questions, req.utilisateur.id) })
})

router.get('/reglages', chargerCible, (req, res) => res.json(reglages(req.cible.jeux)))

export default router
