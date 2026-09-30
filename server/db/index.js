import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import * as schema from './schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (!process.env.DATABASE_URL) {
  throw new Error('La variable DATABASE_URL est obligatoire (ex. postgres://user:mdp@hote:5432/base)')
}

export const db = drizzle(process.env.DATABASE_URL, { schema })

// Applique au démarrage les migrations générées par drizzle-kit dans drizzle/
export async function migrer() {
  await migrate(db, { migrationsFolder: path.join(__dirname, '..', '..', 'drizzle') })
}
