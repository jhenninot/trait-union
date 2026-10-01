import { Router } from 'express'
import { exigerAdmin } from '../auth/sessions.js'
import * as valider from '../auth/validation.js'
import { lireConfiguration, enregistrerConfiguration, verifierCompte, envoyerEmail, gabarit } from '../email/brevo.js'
import * as stockage from '../stockage/s3.js'
import { urlApplication } from '../url.js'
import * as alertes from '../alertes/envoi.js'

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

// --- Stockage des photos (S3)

// La clé secrète ne repart jamais vers le navigateur
const stockagePublic = (c) => ({
  actif: c.actif,
  endpoint: c.endpoint,
  region: c.region,
  bucket: c.bucket,
  cleAcces: c.cleAcces,
  cleSecrete: c.cleSecrete ? `…${c.cleSecrete.slice(-4)}` : null,
  origine: c.origine ?? null
})

// Saisie du formulaire ; une clé secrète vide garde celle déjà enregistrée
async function lireSaisieStockage(body) {
  const actuelle = await stockage.lireConfiguration()
  const endpoint = valider.texte(body.endpoint, 'adresse', { max: 300 }).replace(/\/$/, '')
  if (!/^https:\/\/[^\s/]+/.test(endpoint)) throw new valider.ErreurSaisie('L\'adresse doit commencer par https://')
  return {
    ...actuelle,
    actif: Boolean(body.actif),
    endpoint,
    region: valider.texte(body.region, 'région', { max: 60 }),
    bucket: valider.texte(body.bucket, 'conteneur', { max: 63 }),
    cleAcces: valider.texte(body.cleAcces, 'clé d\'accès', { max: 200 }),
    cleSecrete: valider.texte(body.cleSecrete, 'clé secrète', { obligatoire: false, max: 200 }) || actuelle.cleSecrete
  }
}

router.get('/stockage', async (req, res) => {
  res.json(stockagePublic(await stockage.lireConfiguration()))
})

// Vérifie la configuration saisie (accès, écriture, suppression) et autorise l'adresse de
// l'application à envoyer des photos (CORS). Rien n'est enregistré.
router.post('/stockage/verifier', async (req, res) => {
  res.json(await stockage.verifierStockage(await lireSaisieStockage(req.body), urlApplication(req)))
})

// Enregistre la configuration. Pour l'activer, elle doit passer la vérification.
router.put('/stockage', async (req, res) => {
  const config = await lireSaisieStockage(req.body)
  if (config.actif) Object.assign(config, await stockage.verifierStockage(config, urlApplication(req)))
  await stockage.enregistrerConfiguration(config)
  res.json(stockagePublic(config))
})

// --- Alertes : Firebase Cloud Messaging pour l'application Android
// (le Web Push des navigateurs et des PWA fonctionne sans configuration)

// La clé privée ne repart jamais vers le navigateur
const firebasePublic = (c) => ({
  actif: c.actif,
  projet: c.compte?.project_id ?? null,
  compte: c.compte?.client_email ?? null
})

router.get('/alertes', async (req, res) => {
  res.json(firebasePublic(await alertes.lireFirebase()))
})

// Corps : { actif, compteService } (contenu du fichier JSON ; vide = garder celui enregistré)
async function lireSaisieFirebase(body) {
  const actuelle = await alertes.lireFirebase()
  const compte = body.compteService ? alertes.lireCompteService(body.compteService) : actuelle.compte
  if (body.actif && !compte) throw new valider.ErreurSaisie('Collez le fichier JSON du compte de service Firebase')
  return { actif: Boolean(body.actif), compte }
}

router.post('/alertes/verifier', async (req, res) => {
  const { compte } = await lireSaisieFirebase({ ...req.body, actif: true })
  res.json(await alertes.verifierFirebase(compte))
})

router.put('/alertes', async (req, res) => {
  const config = await lireSaisieFirebase(req.body)
  if (config.actif) await alertes.verifierFirebase(config.compte)
  await alertes.enregistrerFirebase(config)
  res.json(firebasePublic(config))
})

export default router
