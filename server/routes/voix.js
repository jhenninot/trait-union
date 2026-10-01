import { Router } from 'express'
import { exigerConnexion } from '../auth/sessions.js'
import { comprendre, repondre, INTENTIONS } from '../voix/assistant.js'
import { compterVoix } from '../statistiques.js'

// Assistant vocal de la personne accompagnée (voir server/voix/assistant.js)
const router = Router()
router.use(exigerConnexion)
// Chaque utilisation est comptée pour les statistiques (un nombre par jour et par cercle, sans contenu)
router.use((req, res, next) => {
  compterVoix(req.utilisateur.id)
  next()
})

// Ce que dit le bouton « Écouter » de l'accueil : date, heure et programme du jour
router.get('/journee', async (req, res) => {
  res.json(await repondre(req.utilisateur, 'journee'))
})

// Une réponse toute faite, pour un bouton de l'écran de choix. Corps : { intention }
router.post('/intention', async (req, res) => {
  const intention = INTENTIONS.includes(req.body.intention) ? req.body.intention : 'inconnue'
  res.json({ intention, ...(await repondre(req.utilisateur, intention)) })
})

// Ce que la personne a dit. Corps : { phrases: [...] } (propositions de la reconnaissance vocale)
router.post('/commande', async (req, res) => {
  const phrases = (Array.isArray(req.body.phrases) ? req.body.phrases : [req.body.phrases])
    .slice(0, 10).map((p) => String(p ?? '').slice(0, 500))
  const { intention, parametres } = await comprendre(req.utilisateur, phrases)
  res.json({ intention, ...(await repondre(req.utilisateur, intention, parametres)) })
})

export default router
