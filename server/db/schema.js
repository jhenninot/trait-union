import { sql } from 'drizzle-orm'
import { pgTable, pgEnum, uuid, text, boolean, integer, doublePrecision, timestamp, date, jsonb, uniqueIndex, index, unique } from 'drizzle-orm/pg-core'

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
  // Avatar : « modele:<id> » (image fournie avec l'application, client/public/avatars/)
  // ou « photo:<jeton> » (photo stockée chez l'hébergeur S3, voir server/avatars.js)
  avatar: text('avatar'),
  // Coordonnées facultatives, affichées à la famille (« Famille et aidants », « Ma famille »).
  // Les auxiliaires de vie ne voient que le téléphone.
  telephone: text('telephone'),
  dateNaissance: date('date_naissance'), // « AAAA-MM-JJ », sans fuseau horaire
  adresse: text('adresse'),
  // Catégories d'alertes reçues sur les appareils où elles sont activées (server/alertes/)
  alertes: jsonb('alertes').$type().notNull().default({ rendezVous: true, photos: true, anniversaires: true }),
  // Messagerie d'une personne accompagnée, réglée par ses aidants (server/messagerie/droits.js) :
  // { prive: 'tous' | 'aidants' | 'personne', reponses: [...], lectureAuto, vocal }
  messagerie: jsonb('messagerie').$type(),
  // Jeux d'une personne accompagnée, réglés par ses aidants (server/jeux.js) :
  // { actif, qui, age, musique, decedes, niveau: 2 | 3, questions: 3 | 5 | 8 | 10 | 15 | 20 }
  jeux: jsonb('jeux').$type(),
  // Compte qui ne peut plus se connecter ni recevoir d'alertes (posé aussi au décès)
  desactiveLe: timestamp('desactive_le', { withTimezone: true }),
  // Personne décédée (server/deces.js) : son compte est désactivé mais gardé, pour pouvoir
  // annuler en cas d'erreur ; elle apparaît partout comme une personne de l'arbre sans compte
  decede: boolean('decede').notNull().default(false),
  dateDeces: date('date_deces')
})

// Un cercle réunit la personne accompagnée et ses proches.
export const cercles = pgTable('cercles', {
  ...commun,
  nom: text('nom').notNull()
})

// auxiliaire : auxiliaire de vie (professionnel) ; ne voit ni les photos ni l'agenda familial,
// seulement les rendez-vous ouverts aux auxiliaires (server/routes/agenda.js).
export const roleMembre = pgEnum('role_membre', ['accompagne', 'aidant', 'proche', 'auxiliaire'])

export const membres = pgTable('membres', {
  ...commun,
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  utilisateurId: uuid('utilisateur_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
  prenom: text('prenom').notNull(),
  nom: text('nom'),
  email: text('email'),
  role: roleMembre('role').notNull().default('proche'),
  // Lien avec la personne accompagnée : « Fils », « Fille », « Petit-fils », « Petite-fille »
  // ou un texte libre (« Voisine », « Neveu »...). Propre au cercle.
  lien: text('lien')
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
  // Version de l'application Android utilisée (null : navigateur ; 0 : APK sans numéro de version)
  versionApk: integer('version_apk'),
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

// Arbre généalogique d'un cercle : les personnes de la famille, avec ou sans compte
// (un jeune enfant, un conjoint qui n'utilise pas l'appli, un défunt). Quand la personne a un
// compte (utilisateur_id), ses prénom, nom, coordonnées et avatar sont ceux du compte ; les
// colonnes ci-dessous ne servent qu'en l'absence de compte (ou en secours).
export const genrePersonne = pgEnum('genre_personne', ['homme', 'femme'])

export const personnes = pgTable('personnes', {
  ...commun,
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  utilisateurId: uuid('utilisateur_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
  prenom: text('prenom').notNull(),
  nom: text('nom'),
  genre: genrePersonne('genre'), // null : ne pas préciser (« enfant » plutôt que « fils » ou « fille »)
  dateNaissance: date('date_naissance'),
  decede: boolean('decede').notNull().default(false),
  dateDeces: date('date_deces'),
  telephone: text('telephone'),
  adresse: text('adresse'),
  // Même format que utilisateurs.avatar ; une photo est rangée sous avatars/<id de la personne>/
  avatar: text('avatar'),
  // Quelques mots pour aider la personne accompagnée à se souvenir (affichés sur sa fiche, lus à voix haute)
  aSavoir: text('a_savoir'),
  // Montrée dans « Ma famille » des personnes accompagnées (défunts compris, au choix des aidants)
  visibleAide: boolean('visible_aide').notNull().default(true),
  // Personne extérieure à la famille (voisin, ami, personnalité...) : seulement une photo, un prénom et une
  // date de naissance pour les jeux. Hors arbre, « Ma famille », anniversaires et assistant vocal.
  exterieur: boolean('exterieur').notNull().default(false),
  creeParId: uuid('cree_par_id').references(() => utilisateurs.id, { onDelete: 'set null' })
}, (t) => [
  index('personnes_cercle_idx').on(t.cercleId),
  uniqueIndex('personnes_cercle_utilisateur_idx').on(t.cercleId, t.utilisateurId)
])

// Photos supplémentaires d'une personne de l'arbre, pour varier les jeux (la photo de contact reste
// personnes.avatar ou utilisateurs.avatar). Objet chez l'hébergeur : avatars/<personne>/<jeton>.jpg
export const photosJeu = pgTable('photos_jeu', {
  ...commun,
  personneId: uuid('personne_id').notNull().references(() => personnes.id, { onDelete: 'cascade' }),
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  jeton: text('jeton').notNull()
}, (t) => [
  index('photos_jeu_cercle_idx').on(t.cercleId, t.personneId)
])

// Liens de l'arbre : « parent » (personne_a est un parent de personne_b) ou « conjoint »
// (en couple, `fin` renseignée pour un couple séparé). Tous les autres liens (grands-parents,
// frères et sœurs, gendres, neveux…) se déduisent de ces deux-là (server/arbre.js).
export const typeRelation = pgEnum('type_relation', ['parent', 'conjoint'])

export const relations = pgTable('relations', {
  ...commun,
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  type: typeRelation('type').notNull(),
  personneA: uuid('personne_a').notNull().references(() => personnes.id, { onDelete: 'cascade' }),
  personneB: uuid('personne_b').notNull().references(() => personnes.id, { onDelete: 'cascade' }),
  separes: boolean('separes').notNull().default(false)
}, (t) => [
  index('relations_cercle_idx').on(t.cercleId),
  unique('relations_unique').on(t.type, t.personneA, t.personneB)
])

// Liens d'invitation pour rejoindre un cercle comme aidant ou proche.
export const invitations = pgTable('invitations', {
  ...commun,
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  role: roleMembre('role').notNull(),
  // Adresse à laquelle le lien a été envoyé : proposée (modifiable) sur la page d'invitation
  email: text('email'),
  // Fiche de l'arbre généalogique à rattacher au compte qui accepte l'invitation
  personneId: uuid('personne_id').references(() => personnes.id, { onDelete: 'set null' }),
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
  // Pour les niveaux « accompagne » et « accompagne_aidants » d'un cercle qui a plusieurs
  // personnes accompagnées : la seule qui le voit (null : toutes celles du cercle)
  accompagneId: uuid('accompagne_id').references(() => utilisateurs.id, { onDelete: 'cascade' }),
  recurrence: recurrenceRendezVous('recurrence').notNull().default('aucune'),
  intervalle: integer('intervalle').notNull().default(1), // tous les N jours, semaines...
  recurrenceFin: timestamp('recurrence_fin', { withTimezone: true }), // dernière répétition possible (incluse)
  // Visible aussi par les auxiliaires de vie, en plus du niveau ci-dessus
  auxiliaires: boolean('auxiliaires').notNull().default(false),
  // Numéros des répétitions supprimées ou détachées de la série (« cette date seulement »)
  exclusions: jsonb('exclusions').$type().notNull().default([]),
  // Dernière personne à l'avoir modifié (affiché « Modifié par … » si ce n'est pas l'auteur)
  modifieParId: uuid('modifie_par_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
  // Alerte envoyée N minutes avant le début (null : pas d'alerte). Pour une journée entière,
  // l'heure de référence est 9 h le premier jour (0 = le matin même, 1440 = la veille).
  rappel: integer('rappel')
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
  // Date de prise de vue (EXIF de l'original, sinon date du fichier) ; null : inconnue, on prend cree_le
  priseLe: timestamp('prise_le', { withTimezone: true }),
  // Lieu de prise de vue (GPS de l'EXIF de l'original, que la réduction des images efface) ; visible de tout le cercle
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  statut: statutPhoto('statut').notNull().default('envoi'),
  // Alerte « nouvelles photos » envoyée (null : pas encore, voir server/alertes/planificateur.js)
  alerteLe: timestamp('alerte_le', { withTimezone: true })
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

// Appareils qui reçoivent les alertes : navigateur ou PWA (Web Push, adresse = endpoint)
// ou application Android (Firebase Cloud Messaging, adresse = jeton FCM). Rattachés à la
// session : se déconnecter ou déconnecter un appareil arrête ses alertes.
export const typeAppareil = pgEnum('type_appareil', ['web', 'android'])

export const appareilsAlertes = pgTable('appareils_alertes', {
  ...commun,
  utilisateurId: uuid('utilisateur_id').notNull().references(() => utilisateurs.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
  type: typeAppareil('type').notNull(),
  adresse: text('adresse').notNull().unique(),
  cles: jsonb('cles'), // Web Push : { p256dh, auth }
  libelle: text('libelle') // ex. « Android · Chrome »
}, (t) => [
  index('appareils_alertes_utilisateur_idx').on(t.utilisateurId)
])

// Rappels de rendez-vous déjà envoyés (une ligne par répétition et heure prévue : si le
// rendez-vous est déplacé, l'alerte repart pour la nouvelle heure)
export const rappelsEnvoyes = pgTable('rappels_envoyes', {
  ...commun,
  rendezVousId: uuid('rendez_vous_id').notNull().references(() => rendezVous.id, { onDelete: 'cascade' }),
  occurrence: integer('occurrence').notNull(),
  prevuLe: timestamp('prevu_le', { withTimezone: true }).notNull()
}, (t) => [
  unique('rappels_envoyes_unique').on(t.rendezVousId, t.occurrence, t.prevuLe)
])

// Alertes d'anniversaire déjà envoyées : une par personne fêtée et par an (un compte, ou une
// personne de l'arbre généalogique qui n'a pas de compte)
export const anniversairesEnvoyes = pgTable('anniversaires_envoyes', {
  ...commun,
  utilisateurId: uuid('utilisateur_id').references(() => utilisateurs.id, { onDelete: 'cascade' }),
  personneId: uuid('personne_id').references(() => personnes.id, { onDelete: 'cascade' }),
  annee: integer('annee').notNull()
}, (t) => [
  unique('anniversaires_envoyes_unique').on(t.utilisateurId, t.annee),
  unique('anniversaires_envoyes_personne_unique').on(t.personneId, t.annee)
])

// Chansons du quiz musical d'une personne accompagnée : celles choisies par ses aidants (source
// « aidant ») et celles qu'elle a aimées ou moins aimées en jouant (reaction « aime » ou « moins »).
export const chansons = pgTable('chansons', {
  ...commun,
  utilisateurId: uuid('utilisateur_id').notNull().references(() => utilisateurs.id, { onDelete: 'cascade' }),
  titre: text('titre').notNull(),
  artiste: text('artiste').notNull(),
  cle: text('cle').notNull(), // titre et artiste normalisés (sans accents ni majuscules), pour éviter les doublons
  source: text('source').notNull().default('catalogue'),
  // 'chanson' (titre + artiste), 'artiste' (tous ses titres, titre vide) ou 'style' (style choisi dans
  // server/musique/styles.js, titre et artiste vides)
  type: text('type').notNull().default('chanson'),
  style: text('style'),
  reaction: text('reaction'),
  creeParId: uuid('cree_par_id').references(() => utilisateurs.id, { onDelete: 'set null' })
}, (t) => [
  unique('chansons_unique').on(t.utilisateurId, t.cle)
])

// Scores du « Quiz musical avec score » : une ligne par partie terminée. aideId est la personne
// accompagnée dont c'est le quiz, joueurId celui qui a joué (elle-même ou un membre de la famille).
// Le classement compare les parties ayant le même nombre de questions.
export const scoresQuiz = pgTable('scores_quiz', {
  ...commun,
  aideId: uuid('aide_id').notNull().references(() => utilisateurs.id, { onDelete: 'cascade' }),
  joueurId: uuid('joueur_id').notNull().references(() => utilisateurs.id, { onDelete: 'cascade' }),
  points: integer('points').notNull(),
  questions: integer('questions').notNull()
}, (t) => [
  index('scores_quiz_aide').on(t.aideId, t.questions)
])

// Compteurs d'utilisation par jour, pour les statistiques de l'administration
// (server/statistiques.js) : un nombre par canal, par jour et par cercle, jamais de contenu.
// Canaux : « voix » (commandes vocales), « alertes » (alertes reçues par un appareil),
// « presentation » (visites de la page de présentation, cercle null).
export const compteurs = pgTable('compteurs', {
  ...commun,
  jour: date('jour').notNull(), // AAAA-MM-JJ (heure de Paris)
  canal: text('canal').notNull(),
  cercleId: uuid('cercle_id').references(() => cercles.id, { onDelete: 'cascade' }),
  nombre: integer('nombre').notNull().default(0)
}, (t) => [
  unique('compteurs_unique').on(t.jour, t.canal, t.cercleId).nullsNotDistinct()
])

// Utilisation de l'application par chaque personne accompagnée, jour par jour (montrée à ses
// aidants, server/utilisation.js) : des nombres de visites par écran, jamais ce qui a été vu ou dit.
// ecrans : { accueil, photos, agenda, famille, arbre, voix } → nombre de fois dans la journée.
export const utilisationJour = pgTable('utilisation_jour', {
  ...commun,
  utilisateurId: uuid('utilisateur_id').notNull().references(() => utilisateurs.id, { onDelete: 'cascade' }),
  jour: date('jour').notNull(), // AAAA-MM-JJ (heure de Paris)
  ecrans: jsonb('ecrans').$type().notNull().default({}),
  // Dernière utilisation ce jour-là (la date de modification change aussi quand rien n'est compté)
  derniereLe: timestamp('derniere_le', { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  unique('utilisation_jour_unique').on(t.utilisateurId, t.jour)
])

// Messagerie d'un cercle (server/messagerie/). Chaque cercle a d'office trois conversations de groupe :
// « famille » (tout le cercle sauf les auxiliaires), « aidants » (aidants seulement) et « liaison »
// (cahier de liaison des aidants et auxiliaires) ; plus des conversations « privee » à deux
// (personne_a < personne_b) ; plus des « groupe » créés par les aidants, avec un nom (titre) et la
// liste de leurs membres (membres_groupe). Qui y a accès : server/messagerie/droits.js.
const AUCUN = sql.raw("'00000000-0000-0000-0000-000000000000'")
export const typeConversation = pgEnum('type_conversation', ['famille', 'aidants', 'liaison', 'privee', 'groupe'])

export const conversations = pgTable('conversations', {
  ...commun,
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  type: typeConversation('type').notNull(),
  personneA: uuid('personne_a').references(() => utilisateurs.id, { onDelete: 'cascade' }),
  personneB: uuid('personne_b').references(() => utilisateurs.id, { onDelete: 'cascade' }),
  dernierMessageLe: timestamp('dernier_message_le', { withTimezone: true }),
  // Groupes créés par les aidants : nom, identifiants des membres (comptes du cercle), créateur
  titre: text('titre'),
  membresGroupe: jsonb('membres_groupe').$type().notNull().default([]),
  creeParId: uuid('cree_par_id').references(() => utilisateurs.id, { onDelete: 'set null' })
}, (t) => [
  // Une seule conversation de chaque groupe d'office et une seule privée par paire ; autant de
  // groupes créés qu'on veut (les valeurs citées évitent d'employer « groupe », ajouté dans la même migration)
  uniqueIndex('conversations_unique').on(t.cercleId, t.type, sql`coalesce(${t.personneA}, ${AUCUN}::uuid)`, sql`coalesce(${t.personneB}, ${AUCUN}::uuid)`)
    .where(sql`${t.type} in ('famille', 'aidants', 'liaison', 'privee')`)
])

// texte : message écrit ; rapide : réponse toute faite (« Je t'embrasse ») ; photo et vocal : fichier
// chez l'hébergeur S3 (cercles/<cercle>/messages/<message>/...), envoyé directement par le navigateur.
// sondage : sondage de dates (fichier : { sondageId }, texte : son titre), voir la table sondages
export const typeMessage = pgEnum('type_message', ['texte', 'rapide', 'photo', 'vocal', 'sondage'])

export const messages = pgTable('messages', {
  ...commun,
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  // Supprimer un compte supprime ses messages (et leurs fichiers, server/comptes.js)
  auteurId: uuid('auteur_id').notNull().references(() => utilisateurs.id, { onDelete: 'cascade' }),
  type: typeMessage('type').notNull().default('texte'),
  texte: text('texte'),
  // Cahier de liaison : personne accompagnée concernée par la note (null : tout le monde)
  accompagneId: uuid('accompagne_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
  // Photo : { largeur, hauteur } ; vocal : { duree (secondes), mime, extension }
  fichier: jsonb('fichier'),
  // Faux tant que le navigateur n'a pas confirmé l'arrivée du fichier chez l'hébergeur
  publie: boolean('publie').notNull().default(true),
  // Message retiré par son auteur ou par un aidant : le texte et le fichier sont effacés
  retireLe: timestamp('retire_le', { withTimezone: true }),
  retireParId: uuid('retire_par_id').references(() => utilisateurs.id, { onDelete: 'set null' })
}, (t) => [
  index('messages_conversation_cree_idx').on(t.conversationId, t.creeLe),
  index('messages_cercle_cree_idx').on(t.cercleId, t.creeLe)
])

// Où chacun en est de sa lecture d'une conversation (accusés de lecture, messages non lus) et
// conversation mise en sourdine (pas d'alerte)
export const lectures = pgTable('lectures', {
  ...commun,
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  utilisateurId: uuid('utilisateur_id').notNull().references(() => utilisateurs.id, { onDelete: 'cascade' }),
  luJusquA: timestamp('lu_jusqu_a', { withTimezone: true }),
  muet: boolean('muet').notNull().default(false)
}, (t) => [
  unique('lectures_unique').on(t.conversationId, t.utilisateurId)
])

// Réactions par émoji sous un message, comme sur WhatsApp : une seule par personne et par message
// (en choisir une autre remplace la précédente, retoucher la même la retire).
export const reactionsMessage = pgTable('reactions_message', {
  ...commun,
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  utilisateurId: uuid('utilisateur_id').notNull().references(() => utilisateurs.id, { onDelete: 'cascade' }),
  emoji: text('emoji').notNull()
}, (t) => [
  unique('reactions_message_unique').on(t.messageId, t.utilisateurId)
])

// Sondage de dates façon Doodle (server/messagerie/sondages.js), publié comme un message de
// « Toute la famille ». Dates proposées : AAAA-MM-JJ, triées ; moment : journée entière, midi,
// soir ou heure précise (heure « HH:MM »). À la clôture, la date retenue crée un rendez-vous.
export const momentSondage = pgEnum('moment_sondage', ['journee', 'midi', 'soir', 'heure'])

export const sondages = pgTable('sondages', {
  ...commun,
  cercleId: uuid('cercle_id').notNull().references(() => cercles.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  // Supprimer le message (ou le compte de son auteur) supprime le sondage
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  creeParId: uuid('cree_par_id').notNull().references(() => utilisateurs.id, { onDelete: 'cascade' }),
  titre: text('titre').notNull(),
  lieu: text('lieu'),
  moment: momentSondage('moment').notNull().default('journee'),
  heure: text('heure'),
  dates: jsonb('dates').$type().notNull().default([]),
  dateLimite: date('date_limite'),
  // Date retenue (AAAA-MM-JJ) et rendez-vous créé : le sondage est clos
  dateRetenue: date('date_retenue'),
  rendezVousId: uuid('rendez_vous_id').references(() => rendezVous.id, { onDelete: 'set null' }),
  closParId: uuid('clos_par_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
  // Relances : bouton « Relancer » (dernière fois) et alerte automatique la veille de la date limite
  relanceLe: timestamp('relance_le', { withTimezone: true }),
  relanceAutoLe: timestamp('relance_auto_le', { withTimezone: true })
}, (t) => [
  uniqueIndex('sondages_message_unique').on(t.messageId)
])

// Réponses d'une personne : { 'AAAA-MM-JJ': 'oui' | 'peut_etre' | 'non' }. Un aidant peut répondre
// à la place d'une personne accompagnée (repondu_par_id : l'aidant).
export const sondageReponses = pgTable('sondage_reponses', {
  ...commun,
  sondageId: uuid('sondage_id').notNull().references(() => sondages.id, { onDelete: 'cascade' }),
  utilisateurId: uuid('utilisateur_id').notNull().references(() => utilisateurs.id, { onDelete: 'cascade' }),
  reponses: jsonb('reponses').$type().notNull().default({}),
  commentaire: text('commentaire'),
  reponduParId: uuid('repondu_par_id').references(() => utilisateurs.id, { onDelete: 'set null' })
}, (t) => [
  unique('sondage_reponses_unique').on(t.sondageId, t.utilisateurId)
])

// Journal d'événements pour l'administrateur (server/journal.js) : erreurs du serveur et du
// navigateur, jamais de mot de passe, de jeton ni de contenu de message. Purgé automatiquement.
// niveau : 'info' | 'avertissement' | 'erreur' ; source : 'serveur' | 'navigateur'.
export const journal = pgTable('journal', {
  id: uuid('id').primaryKey().defaultRandom(),
  creeLe: timestamp('cree_le', { withTimezone: true }).notNull().defaultNow(),
  niveau: text('niveau').notNull(),
  source: text('source').notNull(),
  module: text('module').notNull(),
  message: text('message').notNull(),
  details: text('details'),
  utilisateurId: uuid('utilisateur_id').references(() => utilisateurs.id, { onDelete: 'set null' })
}, (t) => [
  index('journal_cree_le_idx').on(t.creeLe)
])
