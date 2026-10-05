import { Router } from 'express'
import { journaliser } from '../journal.js'

const router = Router()

// Erreurs remontées par le navigateur (envoi de photo qui échoue, erreur d'affichage...).
// Au plus 20 par minute et par adresse : le journal ne doit pas pouvoir être inondé.
const essais = new Map()
setInterval(() => essais.clear(), 60 * 1000).unref()

router.post('/', (req, res) => {
  const n = (essais.get(req.ip) ?? 0) + 1
  essais.set(req.ip, n)
  if (n <= 20) {
    const { module, message, details, niveau } = req.body ?? {}
    if (typeof message === 'string' && message.trim()) {
      journaliser(niveau === 'avertissement' ? 'avertissement' : 'erreur', 'navigateur',
        typeof module === 'string' ? module : 'application', message,
        { details: typeof details === 'string' ? details : undefined, utilisateurId: req.utilisateur?.id })
    }
  }
  res.status(204).end()
})

export default router
