import { Router } from 'express'
import { sql } from 'drizzle-orm'
import { exigerConnexion } from '../auth/sessions.js'
import { db } from '../db/index.js'
import { chansons } from '../db/schema.js'
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

export default router
