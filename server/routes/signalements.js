import { Router } from 'express'
import { eq, and, isNotNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { utilisateurs, cercles, membres } from '../db/schema.js'
import { emailActif, envoyerEmail } from '../email/brevo.js'
import { journaliser } from '../journal.js'
import { lireSignalement, composerEmail } from '../signalement.js'

const router = Router()

// Signalement de bug (formulaire « Signaler un problème » du menu et de l'aide) : un email avec
// les captures d'écran part à tous les administrateurs, l'adresse de la personne en « Répondre à ».
// Au plus 10 signalements par heure et par personne. Le contenu n'est jamais mis au journal,
// seulement la référence (Administration > Journal, module « signalement »).
const essais = new Map()
setInterval(() => essais.clear(), 60 * 60 * 1000).unref()

router.post('/', async (req, res) => {
  if (!req.utilisateur) return res.status(401).json({ erreur: 'Connexion requise' })
  const n = (essais.get(req.utilisateur.id) ?? 0) + 1
  essais.set(req.utilisateur.id, n)
  if (n > 10) return res.status(429).json({ erreur: 'Trop de signalements pour le moment, réessayez dans une heure' })

  const signalement = lireSignalement(req.body)
  if (!(await emailActif())) {
    return res.status(503).json({ erreur: 'L\'envoi des signalements n\'est pas disponible : prévenez directement l\'administrateur' })
  }
  const admins = await db.select({ email: utilisateurs.email, prenom: utilisateurs.prenom })
    .from(utilisateurs).where(and(eq(utilisateurs.estAdmin, true), isNotNull(utilisateurs.email)))
  if (!admins.length) return res.status(503).json({ erreur: 'Aucun administrateur ne peut recevoir le signalement' })

  const lesCercles = await db.select({ nom: cercles.nom }).from(membres)
    .innerJoin(cercles, eq(cercles.id, membres.cercleId)).where(eq(membres.utilisateurId, req.utilisateur.id))
  const reference = `BUG-${Date.now().toString(36).toUpperCase()}`
  const { sujet, html, texte } = composerEmail({
    signalement, auteur: req.utilisateur, cercles: lesCercles.map((c) => c.nom), reference,
    version: process.env.APP_VERSION || 'dev'
  })
  const resultats = await Promise.allSettled(admins.map((a) => envoyerEmail({
    a: { email: a.email, nom: a.prenom }, sujet, html, texte, piecesJointes: signalement.pieces,
    repondreA: req.utilisateur.email ? { email: req.utilisateur.email, nom: req.utilisateur.prenom } : undefined
  })))
  const envoyes = resultats.filter((r) => r.status === 'fulfilled').length
  resultats.filter((r) => r.status === 'rejected').forEach((r) => console.error('[Signalement] Envoi impossible :', r.reason?.message))
  if (!envoyes) return res.status(502).json({ erreur: 'Le signalement n\'a pas pu être envoyé, réessayez plus tard' })
  journaliser('info', 'serveur', 'signalement', `Signalement ${reference} envoyé à ${envoyes} administrateur(s), ${signalement.pieces.length} capture(s)`, { utilisateurId: req.utilisateur.id })
  res.status(201).json({ reference })
})

export default router
