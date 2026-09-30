import { pgTable, pgEnum, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

// Colonnes communes : identifiant UUID (généré aussi bien côté serveur que
// côté mobile) et dates utiles à la future synchronisation hors ligne.
const commun = {
  id: uuid('id').primaryKey().defaultRandom(),
  creeLe: timestamp('cree_le', { withTimezone: true }).notNull().defaultNow(),
  modifieLe: timestamp('modifie_le', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}

// Un cercle réunit la personne accompagnée et ses proches.
export const cercles = pgTable('cercles', {
  ...commun,
  nom: text('nom').notNull()
})

export const roleMembre = pgEnum('role_membre', ['accompagne', 'aidant', 'proche'])

export const membres = pgTable('membres', {
  ...commun,
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  prenom: text('prenom').notNull(),
  nom: text('nom'),
  email: text('email'),
  role: roleMembre('role').notNull().default('proche')
}, (t) => [
  uniqueIndex('membres_cercle_email_idx').on(t.cercleId, t.email)
])
