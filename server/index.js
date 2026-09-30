import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')
const port = process.env.PORT || 3000
const version = process.env.APP_VERSION || 'dev'

const app = express()
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version })
})

// Front Vue compilé
app.use(express.static(distDir))
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

app.listen(port, () => {
  console.log(`Trait d'union (${version}) écoute sur le port ${port}`)
})
