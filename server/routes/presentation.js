import { Router } from 'express'
import { limiteur } from '../auth/securite.js'
import { compter } from '../statistiques.js'
import { lireConfiguration, enregistrerConfiguration, lienContact, cleValide } from '../presentation/config.js'

// Page de présentation publique, à l'adresse secrète réglée par l'administrateur
const router = Router()
const limite = limiteur({ max: 60, fenetreMs: 10 * 60 * 1000 })

// 404 si la page est désactivée ou la clé inconnue (rien ne révèle son existence). Le lien de
// contact est encodé en base64 pour ne pas apparaître en clair aux robots collecteurs d'adresses.
router.get('/:cle', async (req, res) => {
  if (limite.depasse(req.ip)) return res.status(429).json({ erreur: 'Trop de tentatives, réessayez plus tard' })
  const config = await lireConfiguration()
  if (!cleValide(config, req.params.cle)) return res.status(404).json({ erreur: 'Page introuvable' })
  // Visite comptée seulement quand la page le demande (une fois par onglet, jamais pour l'aperçu
  // ouvert depuis l'administration) ; rien n'est enregistré sur le visiteur
  if (req.query.compter === '1') {
    await enregistrerConfiguration({ ...config, visites: (config.visites || 0) + 1, derniereVisite: new Date() })
      .catch((err) => console.error('[Présentation] Compteur :', err.message))
    compter('presentation') // visites par jour (statistiques)
  }
  const lien = config.afficherContact ? lienContact(config.typeContact, config.contact) : null
  res.set('Cache-Control', 'no-store')
  res.json({ contact: lien ? Buffer.from(lien).toString('base64') : null, typeContact: config.typeContact })
})

export default router
