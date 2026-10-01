import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { db, migrer } from './db/index.js'
import { chargerSession } from './auth/sessions.js'
import { ErreurSaisie } from './auth/validation.js'
import routesAuth from './routes/auth.js'
import routesCercles from './routes/cercles.js'
import routesInvitations from './routes/invitations.js'
import routesAdmin from './routes/admin.js'
import routesVoix from './routes/voix.js'
import routesProfil from './routes/profil.js'
import routesAlertes from './routes/alertes.js'
import routesPresentation from './routes/presentation.js'
import { ErreurAlertes } from './alertes/envoi.js'
import { demarrerAlertes } from './alertes/planificateur.js'
import { derniereApk, versionApk, APK_URL } from './application.js'
import { ErreurEmail } from './email/brevo.js'
import { ErreurStockage } from './stockage/s3.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')
const port = process.env.PORT || 3000
const version = process.env.APP_VERSION || 'dev'

const app = express()
// Derrière Nginx Proxy Manager (réseau local) : req.secure et req.ip viennent des en-têtes X-Forwarded-*
app.set('trust proxy', 'loopback, linklocal, uniquelocal')
app.use(express.json())
// Application privée : jamais indexée par les moteurs de recherche (voir aussi robots.txt)
app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow')
  next()
})
app.use('/api', chargerSession)

app.get('/api/health', async (req, res) => {
  try {
    await db.execute(sql`select 1`)
    res.json({ status: 'ok', version, database: 'ok' })
  } catch {
    res.status(503).json({ status: 'erreur', version, database: 'injoignable' })
  }
})

// Application Android : dernière version publiée et version de l'appareil qui demande
app.get('/api/application', async (req, res) => {
  res.json({ derniere: await derniereApk(), installee: versionApk(req.get('user-agent')), url: APK_URL })
})
// Adresse courte à taper dans Chrome pour télécharger l'APK (ex. maison.fr/apk)
app.get('/apk', (req, res) => res.redirect(APK_URL))

app.use('/api/auth', routesAuth)
app.use('/api/cercles', routesCercles)
app.use('/api/invitations', routesInvitations)
app.use('/api/admin', routesAdmin)
app.use('/api/voix', routesVoix)
app.use('/api/profil', routesProfil)
app.use('/api/alertes', routesAlertes)
app.use('/api/presentation', routesPresentation)
app.use('/api', (req, res) => res.status(404).json({ erreur: 'Route inconnue' }))
app.use('/api', (err, req, res, next) => {
  if (err instanceof ErreurSaisie) return res.status(400).json({ erreur: err.message })
  if (err instanceof ErreurEmail) return res.status(502).json({ erreur: err.message })
  if (err instanceof ErreurStockage) return res.status(502).json({ erreur: err.message })
  if (err instanceof ErreurAlertes) return res.status(502).json({ erreur: err.message })
  if ((err.cause?.code ?? err.code) === '22P02') return res.status(404).json({ erreur: 'Introuvable' }) // UUID mal formé
  console.error(err)
  res.status(500).json({ erreur: 'Erreur interne' })
})

// Front Vue compilé
app.use(express.static(distDir))
// Partage vers la PWA : normalement reçu par le service worker (client/public/sw.js)
app.post('/partage-recu', (req, res) => res.redirect(303, '/recevoir'))
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

await migrer()
console.log('Base de données à jour')
// Rappels de rendez-vous et alertes « nouvelles photos »
demarrerAlertes()

app.listen(port, () => {
  console.log(`Trait d'union (${version}) écoute sur le port ${port}`)
})
