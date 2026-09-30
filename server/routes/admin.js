import { Router } from 'express'
import { exigerAdmin } from '../auth/sessions.js'
import * as valider from '../auth/validation.js'
import { lireConfiguration, enregistrerConfiguration, verifierCompte, envoyerEmail, gabarit } from '../email/brevo.js'

const router = Router()
router.use(exigerAdmin)

// La clé API ne repart jamais vers le navigateur : seulement ses 4 derniers caractères
const configurationPublique = (c) => ({
  actif: c.actif,
  expediteurEmail: c.expediteurEmail,
  expediteurNom: c.expediteurNom,
  cleApi: c.cleApi ? `…${c.cleApi.slice(-4)}` : null
})

router.get('/email', async (req, res) => {
  res.json(configurationPublique(await lireConfiguration()))
})

// Vérifie la clé saisie (ou celle enregistrée) auprès de Brevo et liste les expéditeurs du compte
router.post('/email/verifier', async (req, res) => {
  const cleApi = valider.texte(req.body.cleApi, 'clé API', { obligatoire: false, max: 500 }) || (await lireConfiguration()).cleApi
  if (!cleApi) return res.status(400).json({ erreur: 'Saisissez la clé API Brevo' })
  res.json(await verifierCompte(cleApi))
})

// Enregistre la configuration. Une clé vide garde la clé déjà enregistrée.
router.put('/email', async (req, res) => {
  const actuelle = await lireConfiguration()
  const nouvelleCle = valider.texte(req.body.cleApi, 'clé API', { obligatoire: false, max: 500 })
  const config = {
    actif: Boolean(req.body.actif),
    cleApi: nouvelleCle || actuelle.cleApi,
    expediteurEmail: req.body.expediteurEmail ? valider.email(req.body.expediteurEmail) : '',
    expediteurNom: valider.texte(req.body.expediteurNom, 'nom de l\'expéditeur', { obligatoire: false, max: 70 }) || 'Trait d\'union'
  }
  if (config.actif && (!config.cleApi || !config.expediteurEmail)) {
    return res.status(400).json({ erreur: 'Pour activer l\'envoi, renseignez la clé API et l\'email de l\'expéditeur' })
  }
  if (nouvelleCle) await verifierCompte(nouvelleCle) // refuse une clé invalide avant de l'enregistrer
  await enregistrerConfiguration(config)
  res.json(configurationPublique(config))
})

// Envoie un email de test avec la configuration enregistrée (même désactivée)
router.post('/email/test', async (req, res) => {
  const destinataire = req.body.destinataire ? valider.email(req.body.destinataire) : req.utilisateur.email
  if (!destinataire) return res.status(400).json({ erreur: 'Indiquez une adresse de destination' })
  const { html, texte } = gabarit({
    titre: 'Email de test',
    paragraphes: [
      `Bonjour ${req.utilisateur.prenom},`,
      'Si vous lisez ce message, l\'envoi d\'emails de Trait d\'union via Brevo fonctionne.'
    ]
  })
  await envoyerEmail({ a: { email: destinataire }, sujet: 'Trait d\'union : email de test', html, texte }, await lireConfiguration())
  res.json({ destinataire })
})

export default router
