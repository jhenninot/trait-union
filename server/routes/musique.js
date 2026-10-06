import { Router } from 'express'
import { sql, and, eq, desc } from 'drizzle-orm'
import { exigerConnexion } from '../auth/sessions.js'
import { db } from '../db/index.js'
import { chansons, scoresQuiz, utilisateurs } from '../db/schema.js'
import { reglages } from '../jeux.js'
import { chargerCible } from './jeux.js'
import { construireQuiz } from '../musique/quiz.js'
import { cleChanson } from '../musique/sources.js'
import * as valider from '../auth/validation.js'

// Quiz musical de la personne accompagnée (voir server/musique/)
const router = Router()
router.use(exigerConnexion)

// Les questions d'une partie : un extrait de 30 secondes et des titres à choisir
router.get('/quiz', chargerCible, async (req, res) => {
  const r = reglages(req.cible.jeux)
  // Un essai par un aidant ou un proche se fait même si l'accès est coupé pour la personne
  if (!req.essai && (!r.actif || !(r.musique || r.musiqueScore))) return res.status(403).json({ erreur: 'Le quiz musical n\'est pas activé' })
  res.json({ questions: await construireQuiz(req.cible, r) })
})

// « J'aime » ou « J'aime moins » après une chanson. Corps : { titre, artiste, reaction: 'aime' | 'moins' | null }
router.post('/reaction', async (req, res) => {
  const titre = valider.texte(req.body.titre, 'titre', { max: 120 })
  const artiste = valider.texte(req.body.artiste, 'artiste', { max: 120 })
  const reaction = ['aime', 'moins'].includes(req.body.reaction) ? req.body.reaction : null
  await db.insert(chansons).values({ utilisateurId: req.utilisateur.id, titre, artiste, cle: cleChanson(titre, artiste), source: 'catalogue', reaction })
    .onConflictDoUpdate({ target: [chansons.utilisateurId, chansons.cle], set: { reaction, modifieLe: sql`now()` } })
  res.json({ ok: true })
})

// Classement d'une personne accompagnée : le meilleur score de chaque joueur (elle-même ou un membre
// de sa famille) pour les parties de ce nombre de questions, les trois premiers.
async function classement(aideId, questions, moiId) {
  const lignes = await db.select({ joueurId: scoresQuiz.joueurId, prenom: utilisateurs.prenom, points: sql`max(${scoresQuiz.points})`.mapWith(Number) })
    .from(scoresQuiz).innerJoin(utilisateurs, eq(utilisateurs.id, scoresQuiz.joueurId))
    .where(and(eq(scoresQuiz.aideId, aideId), eq(scoresQuiz.questions, questions)))
    .groupBy(scoresQuiz.joueurId, utilisateurs.prenom)
    .orderBy(desc(sql`max(${scoresQuiz.points})`)).limit(3)
  return lignes.map((l) => ({ prenom: l.prenom, points: l.points, moi: l.joueurId === moiId }))
}

// Fin d'une partie du quiz avec score. Corps : { points, questions }. Enregistre le score du joueur
// connecté et renvoie son meilleur score d'avant et le classement (« ?pour= » : un membre de la famille
// joue pour une personne accompagnée).
router.post('/scores', chargerCible, async (req, res) => {
  const r = reglages(req.cible.jeux)
  if (!req.essai && (!r.actif || !r.musiqueScore)) return res.status(403).json({ erreur: 'Le quiz avec score n\'est pas activé' })
  const questions = Number(req.body.questions)
  const points = Number(req.body.points)
  if (!Number.isInteger(questions) || questions < 1 || questions > 20) return res.status(400).json({ erreur: 'Nombre de questions invalide' })
  if (!Number.isInteger(points) || points < 0 || points > questions * 200) return res.status(400).json({ erreur: 'Score invalide' })
  const [avant] = await db.select({ meilleur: sql`coalesce(max(${scoresQuiz.points}), 0)`.mapWith(Number) }).from(scoresQuiz)
    .where(and(eq(scoresQuiz.aideId, req.cible.id), eq(scoresQuiz.joueurId, req.utilisateur.id), eq(scoresQuiz.questions, questions)))
  await db.insert(scoresQuiz).values({ aideId: req.cible.id, joueurId: req.utilisateur.id, points, questions })
  res.json({ meilleur: avant.meilleur, classement: await classement(req.cible.id, questions, req.utilisateur.id) })
})

export default router
