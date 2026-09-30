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
app.use('/api', chargerSession)

app.get('/api/health', async (req, res) => {
  try {
    await db.execute(sql`select 1`)
    res.json({ status: 'ok', version, database: 'ok' })
  } catch {
    res.status(503).json({ status: 'erreur', version, database: 'injoignable' })
  }
})

app.use('/api/auth', routesAuth)
app.use('/api/cercles', routesCercles)
app.use('/api/invitations', routesInvitations)
app.use('/api/admin', routesAdmin)
app.use('/api', (req, res) => res.status(404).json({ erreur: 'Route inconnue' }))
app.use('/api', (err, req, res, next) => {
  if (err instanceof ErreurSaisie) return res.status(400).json({ erreur: err.message })
  if (err instanceof ErreurEmail) return res.status(502).json({ erreur: err.message })
  if (err instanceof ErreurStockage) return res.status(502).json({ erreur: err.message })
  if ((err.cause?.code ?? err.code) === '22P02') return res.status(404).json({ erreur: 'Introuvable' }) // UUID mal formé
  console.error(err)
  res.status(500).json({ erreur: 'Erreur interne' })
})

// Front Vue compilé
app.use(express.static(distDir))
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

await migrer()
console.log('Base de données à jour')

app.listen(port, () => {
  console.log(`Trait d'union (${version}) écoute sur le port ${port}`)
})
