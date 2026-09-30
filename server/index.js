import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { db, migrer } from './db/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')
const port = process.env.PORT || 3000
const version = process.env.APP_VERSION || 'dev'

const app = express()
app.use(express.json())

app.get('/api/health', async (req, res) => {
  try {
    await db.execute(sql`select 1`)
    res.json({ status: 'ok', version, database: 'ok' })
  } catch {
    res.status(503).json({ status: 'erreur', version, database: 'injoignable' })
  }
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
