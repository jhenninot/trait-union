import { pgTable, pgEnum, uuid, text, boolean, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'

// Colonnes communes : identifiant UUID (généré aussi bien côté serveur que
// côté mobile) et dates utiles à la future synchronisation hors ligne.
const commun = {
  id: uuid('id').primaryKey().defaultRandom(),
  creeLe: timestamp('cree_le', { withTimezone: true }).notNull().defaultNow(),
  modifieLe: timestamp('modifie_le', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}

// Un compte qui peut se connecter. Aidants, proches et administrateurs ont un
// email et un mot de passe ; une personne accompagnée n'en a pas : elle se
// connecte sur un appareil configuré avec un code donné par un aidant.
export const utilisateurs = pgTable('utilisateurs', {
  ...commun,
  prenom: text('prenom').notNull(),
  nom: text('nom'),
  email: text('email').unique(), // toujours en minuscules
  motDePasse: text('mot_de_passe'), // empreinte scrypt, jamais le mot de passe en clair
  googleId: text('google_id').unique(), // identifiant « sub » du compte Google lié
  estAdmin: boolean('est_admin').notNull().default(false),
  desactiveLe: timestamp('desactive_le', { withTimezone: true })
})

// Un cercle réunit la personne accompagnée et ses proches.
export const cercles = pgTable('cercles', {
  ...commun,
  nom: text('nom').notNull()
})

export const roleMembre = pgEnum('role_membre', ['accompagne', 'aidant', 'proche'])

export const membres = pgTable('membres', {
  ...commun,
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  utilisateurId: uuid('utilisateur_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
  prenom: text('prenom').notNull(),
  nom: text('nom'),
  email: text('email'),
  role: roleMembre('role').notNull().default('proche')
}, (t) => [
  uniqueIndex('membres_cercle_email_idx').on(t.cercleId, t.email),
  uniqueIndex('membres_cercle_utilisateur_idx').on(t.cercleId, t.utilisateurId)
])

export const typeSession = pgEnum('type_session', ['mot_de_passe', 'google', 'appareil'])

// Sessions ouvertes. Seule l'empreinte SHA-256 du jeton est stockée.
export const sessions = pgTable('sessions', {
  ...commun,
  utilisateurId: uuid('utilisateur_id').notNull().references(() => utilisateurs.id, { onDelete: 'cascade' }),
  jetonHash: text('jeton_hash').notNull().unique(),
  type: typeSession('type').notNull(),
  libelle: text('libelle'), // ex. « Tablette de la chambre »
  expireLe: timestamp('expire_le', { withTimezone: true }).notNull()
}, (t) => [
  index('sessions_utilisateur_idx').on(t.utilisateurId)
])

// Codes à usage unique qu'un aidant génère pour configurer l'appareil
// d'une personne accompagnée.
export const codesConnexion = pgTable('codes_connexion', {
  ...commun,
  utilisateurId: uuid('utilisateur_id').notNull().references(() => utilisateurs.id, { onDelete: 'cascade' }),
  creeParId: uuid('cree_par_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
  codeHash: text('code_hash').notNull(), // un code court peut revenir plus tard : pas d'unicité
  expireLe: timestamp('expire_le', { withTimezone: true }).notNull(),
  utiliseLe: timestamp('utilise_le', { withTimezone: true })
}, (t) => [
  index('codes_connexion_code_idx').on(t.codeHash)
])

// Liens d'invitation pour rejoindre un cercle comme aidant ou proche.
export const invitations = pgTable('invitations', {
  ...commun,
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  role: roleMembre('role').notNull(),
  creeParId: uuid('cree_par_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
  jetonHash: text('jeton_hash').notNull().unique(),
  expireLe: timestamp('expire_le', { withTimezone: true }).notNull(),
  accepteeLe: timestamp('acceptee_le', { withTimezone: true }),
  accepteeParId: uuid('acceptee_par_id').references(() => utilisateurs.id, { onDelete: 'set null' })
})

// Réglages de l'application modifiables par un administrateur (clé → valeur JSON),
// par exemple la configuration de l'envoi d'emails (clé « email »).
export const parametres = pgTable('parametres', {
  ...commun,
  cle: text('cle').notNull().unique(),
  valeur: jsonb('valeur').notNull()
})
