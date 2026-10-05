import { Router } from 'express'
import { exigerConnexion } from '../auth/sessions.js'
import { reglages } from '../jeux.js'

// Réglages des jeux de la personne connectée (choisis par ses aidants, voir routes/cercles.js)
const router = Router()
router.use(exigerConnexion)

router.get('/reglages', (req, res) => res.json(reglages(req.utilisateur.jeux)))

export default router
