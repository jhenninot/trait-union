import { Router } from 'express'
import { exigerConnexion } from '../auth/sessions.js'
import { reglages } from '../jeux.js'
import { compterJeux } from '../statistiques.js'

// Réglages des jeux de la personne connectée (choisis par ses aidants, voir routes/cercles.js)
const router = Router()
router.use(exigerConnexion)

// Une partie commence (compteur des statistiques, sans rien retenir de ce qui est joué)
router.post('/partie', (req, res) => {
  if (req.session?.type === 'appareil') compterJeux(req.utilisateur.id)
  res.json({ ok: true })
})

router.get('/reglages', (req, res) => res.json(reglages(req.utilisateur.jeux)))

export default router
