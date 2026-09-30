import { pgTable, pgEnum, uuid, text, boolean, integer, timestamp, jsonb, uniqueIndex, index, unique } from 'drizzle-orm/pg-core'

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

// Qui peut voir un rendez-vous de l'agenda (choisi par la personne qui le crée,
// qui le voit toujours). Règles appliquées dans server/routes/agenda.js.
export const visibiliteRendezVous = pgEnum('visibilite_rendez_vous', [
  'tous', // tout le cercle
  'aidants', // aidants uniquement
  'accompagne', // personne accompagnée uniquement
  'accompagne_aidants' // personne accompagnée et aidants
])

// Répétition d'un rendez-vous : les occurrences sont calculées à la lecture
// (server/agenda/recurrence.js), seule la première est stockée.
export const recurrenceRendezVous = pgEnum('recurrence_rendez_vous', ['aucune', 'quotidienne', 'hebdomadaire', 'mensuelle', 'annuelle'])

// Rendez-vous de l'agenda d'un cercle. Il peut durer plusieurs jours (fin un autre
// jour) ; pour une journée entière, debut est minuit du premier jour et fin 23h59
// du dernier.
export const rendezVous = pgTable('rendez_vous', {
  ...commun,
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  creeParId: uuid('cree_par_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
  titre: text('titre').notNull(),
  lieu: text('lieu'),
  notes: text('notes'),
  debut: timestamp('debut', { withTimezone: true }).notNull(),
  fin: timestamp('fin', { withTimezone: true }),
  journeeEntiere: boolean('journee_entiere').notNull().default(false),
  visibilite: visibiliteRendezVous('visibilite').notNull().default('tous'),
  recurrence: recurrenceRendezVous('recurrence').notNull().default('aucune'),
  intervalle: integer('intervalle').notNull().default(1), // tous les N jours, semaines...
  recurrenceFin: timestamp('recurrence_fin', { withTimezone: true }) // dernière répétition possible (incluse)
}, (t) => [
  index('rendez_vous_cercle_debut_idx').on(t.cercleId, t.debut)
])

// Photos partagées dans un cercle. Les fichiers ne sont pas sur le serveur : ils sont chez
// l'hébergeur S3 configuré par l'administrateur (server/stockage/s3.js), sous
// cercles/<cercle>/photos/<photo>/<variante>.jpg. Une photo reste « envoi » tant que le
// navigateur n'a pas confirmé que ses fichiers sont arrivés.
export const statutPhoto = pgEnum('statut_photo', ['envoi', 'publiee'])

// Albums d'un cercle. Une photo est rangée dans un album au plus ; supprimer un album
// garde ses photos (elles passent dans « Sans album »).
export const albums = pgTable('albums', {
  ...commun,
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  creeParId: uuid('cree_par_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
  nom: text('nom').notNull()
}, (t) => [
  index('albums_cercle_idx').on(t.cercleId)
])

export const photos = pgTable('photos', {
  ...commun,
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  creeParId: uuid('cree_par_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
  albumId: uuid('album_id').references(() => albums.id, { onDelete: 'set null' }),
  legende: text('legende'),
  largeur: integer('largeur').notNull(), // de la version plein écran
  hauteur: integer('hauteur').notNull(),
  taille: integer('taille').notNull(), // octets, toutes versions comprises
  statut: statutPhoto('statut').notNull().default('envoi')
}, (t) => [
  index('photos_cercle_cree_idx').on(t.cercleId, t.creeLe),
  index('photos_album_idx').on(t.albumId)
])

// Dernière fois qu'une personne a regardé un album (album_id null : les photos sans album).
// Sert à montrer sur l'accueil de la personne accompagnée les albums qui ont des photos
// arrivées depuis. Suivi par compte : tous les appareils de la personne le partagent.
export const albumsVus = pgTable('albums_vus', {
  ...commun,
  utilisateurId: uuid('utilisateur_id').notNull().references(() => utilisateurs.id, { onDelete: 'cascade' }),
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  albumId: uuid('album_id').references(() => albums.id, { onDelete: 'cascade' }),
  vuLe: timestamp('vu_le', { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  unique('albums_vus_unique').on(t.utilisateurId, t.cercleId, t.albumId).nullsNotDistinct()
])
