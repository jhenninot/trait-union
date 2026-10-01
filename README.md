# Trait d'union

> Le lien entre toi et les tiens.

Application pour les personnes atteintes d'Alzheimer ou de maladies apparentées, leurs aidants et leur famille, pensée pour garder le lien, y compris avec les proches qui vivent en EHPAD.

## Développement

Il faut un PostgreSQL accessible et la variable `DATABASE_URL` (voir `.env.example`).

```bash
npm install
npm start      # serveur Express sur http://localhost:3000 (sert dist/, applique les migrations)
npm run dev    # front Vue en rechargement à chaud (proxy /api vers le port 3000)
npm run build  # compile le front dans dist/
npm run db:generate  # génère une migration SQL dans drizzle/ après modification de server/db/schema.js
```

## Base de données

PostgreSQL, via l'ORM [Drizzle](https://orm.drizzle.team). Le schéma est décrit dans `server/db/schema.js` ; les migrations générées dans `drizzle/` sont appliquées automatiquement au démarrage du serveur. Chaque table a un identifiant UUID et des dates `cree_le` / `modifie_le`, en prévision de la synchronisation avec une future appli mobile (SQLite en local).

## Comptes et connexion

Un même compte peut appartenir à plusieurs cercles, avec un rôle par cercle (par exemple aidant dans l'un et proche dans l'autre). Les droits sont cumulatifs : un aidant a tous les droits d'un proche, plus la gestion du cercle (`server/auth/roles.js`). Une nouvelle invitation ne rétrograde jamais : un proche invité comme aidant est promu, un aidant invité comme proche reste aidant.

- **Premier lancement** : l'application propose de créer le compte administrateur (seulement tant qu'aucun compte n'existe).
- **Administrateur** : crée les cercles et voit tous les cercles ; il peut en faire partie comme aidant (case cochée à la création, ou bouton « Rejoindre comme aidant » sur le cercle).
- **Aidant** (rôle dans un cercle) : invite des aidants et des proches par lien (7 jours, usage unique), ajoute les personnes accompagnées, configure leurs appareils, retire des membres.
- **Proche** (rôle dans un cercle) : accède au cercle pour échanger ; ne gère pas les membres.
- **Personne accompagnée** : pas d'email ni de mot de passe. Un aidant génère un code à 6 chiffres (30 minutes, usage unique) à saisir sur l'appareil (page `/appareil`) ; l'appareil reste ensuite connecté un an (durée prolongée à chaque utilisation) et n'affiche qu'un écran d'accueil simple. L'aidant peut déconnecter ses appareils à tout moment.

Aidants, proches et administrateurs se connectent par email et mot de passe (10 caractères minimum, dont au moins un chiffre et un caractère spécial ; empreinte scrypt). Les sessions sont stockées en base (seule l'empreinte du jeton), transmises par cookie `httpOnly` ou par en-tête `Authorization: Bearer` pour la future appli mobile. Aucun secret supplémentaire n'est nécessaire dans le `.env`.

### Connexion avec Google (facultatif)

Le bouton « Se connecter avec Google » n'apparaît que si `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont définis. Google ne crée pas de compte à lui seul : il connecte un compte existant (même email, lié automatiquement), crée le compte administrateur au premier lancement, ou crée le compte d'une personne qui ouvre un lien d'invitation.

1. Sur [console.cloud.google.com](https://console.cloud.google.com), créer un projet, puis dans « API et services » configurer l'écran de consentement OAuth (type Externe, champs d'application `openid`, `email`, `profile`, politique de confidentialité `https://<votre domaine>/confidentialite`) et le publier.
2. « Identifiants » → « Créer des identifiants » → « ID client OAuth » → type « Application Web ».
3. URI de redirection autorisée : `https://<votre domaine>/api/auth/google/retour` (Google impose HTTPS, sauf pour `http://localhost`).
4. Dans l'onglet `.env` de Dockge : `APP_URL=https://<votre domaine>`, `GOOGLE_CLIENT_ID=...`, `GOOGLE_CLIENT_SECRET=...`, puis redéployer la pile.

### Décès d'un membre

Un aidant peut indiquer le décès de n'importe quel membre (personne accompagnée, aidant, proche, auxiliaire) depuis « Famille et aidants » (icône fleur, date facultative), ou en cochant « Personne décédée » sur sa fiche de l'arbre généalogique. Le compte n'est pas supprimé : il est désactivé (`utilisateurs.decede`, `date_deces`, `desactive_le`), ses sessions, appareils d'alertes et codes de tablette sont supprimés, et la personne apparaît partout comme une personne de l'arbre sans compte : visage grisé et « décédé » dans la famille, l'arbre, les messages et l'agenda, plus de connexion, d'alertes, d'anniversaire ni de messages. Ses photos, messages, rendez-vous et sa fiche de l'arbre restent. En cas d'erreur, « Annuler le décès » (ou décocher la case dans l'arbre) réactive le compte ; la personne doit se reconnecter. Logique dans `server/deces.js` ; on ne peut pas indiquer son propre décès ni celui du dernier administrateur.

## Envoi d'emails (Brevo, facultatif)

Les emails partent par l'[API de Brevo](https://developers.brevo.com) (offre gratuite : 300 emails par jour). Tout se règle dans l'application : un administrateur ouvre « Envoi d'emails » dans la partie Administration du menu (`/admin/email`), où les étapes sont rappelées (compte Brevo, expéditeur validé, clé API `xkeysib-…`, IP publique de la box autorisée dans Brevo), vérifie la clé, choisit l'expéditeur, active l'envoi et envoie un email de test. La clé est stockée en base (table `parametres`) et n'est jamais renvoyée au navigateur. Une fois l'envoi activé, un aidant peut saisir l'adresse de la personne qu'il invite pour lui envoyer le lien par email ; le lien reste affiché pour être copié. Les liens des emails utilisent `APP_URL` si elle est définie.

## Photos (stockage S3, facultatif)

Les photos d'un cercle (page **Photos** des aidants et proches, **Mes photos** sur la tablette) ne sont pas stockées sur le serveur de l'application. Le navigateur réduit chaque photo en deux JPEG (miniature de 400 px, version plein écran de 2 048 px, environ 500 Ko), puis les dépose directement chez un hébergeur compatible S3 avec des liens temporaires signés par le serveur (signature AWS v4 faite à la main dans `server/stockage/s3.js`, sans dépendance). Le serveur ne garde que les tables `photos` (cercle, album, auteur, légende, dimensions) et `albums`. Une photo est rangée dans un album au plus ; supprimer un album garde ses photos, sans album. Sur la tablette, « Mes photos » propose d'abord les albums (s'il y en a), puis la visionneuse. Les fichiers sont rangés sous `cercles/<cercle>/photos/<photo>/{miniature,ecran}.jpg` ; les liens d'affichage durent 12 h.

Un administrateur configure l'hébergeur dans « Stockage des photos » (`/admin/photos`) : adresse, région, conteneur, clé d'accès et clé secrète (stockées en base, table `parametres`, clé secrète jamais renvoyée au navigateur). Hébergeur conseillé : OVHcloud Object Storage, classe Standard, Paris 3-AZ (`https://s3.eu-west-par.io.cloud.ovh.net`, région `eu-west-par`), conteneur privé. Le bouton « Vérifier » teste l'accès, l'écriture et la suppression, puis règle le CORS du conteneur pour l'adresse de l'application (`APP_URL`, sinon l'adresse de la page) : à refaire si cette adresse change.

## Page de présentation

Une page publique présente l'application (`client/src/vues/Presentation.vue`), à une adresse secrète `/decouvrir/<clé>`. Un administrateur l'active dans « Page de présentation » (`/admin/presentation`) : lien à copier, nouvelle adresse (l'ancien lien cesse aussitôt de fonctionner), bouton « Me contacter » facultatif (email, WhatsApp ou lien https ; désactivé, le contact n'est pas envoyé au navigateur ; activé, le lien est codé en base64 et décodé au clic) et compteur de visites (une par onglet, jamais l'aperçu `?apercu=1`, rien n'est enregistré sur le visiteur). Réglages en base (table `parametres`, clé `presentation`) ; l'API publique `GET /api/presentation/:cle` répond 404 tant que la page est désactivée ou la clé inconnue. Tout le site est exclu des moteurs de recherche (`robots.txt`, balise `meta robots`, en-tête `X-Robots-Tag`).

## Alertes

Chaque rendez-vous peut avoir une alerte (colonne `rendez_vous.rappel`, en minutes avant le début ; pour une journée entière, avant 9 h le premier jour). Quand quelqu'un publie des photos, une alerte « nouvelles photos » part 2 minutes après sa dernière photo (une seule pour tout un envoi). La tâche de fond `server/alertes/planificateur.js` tourne chaque minute ; les destinataires suivent les règles de l'agenda (visibilité, auxiliaires) et des photos (pas les auxiliaires), et leurs préférences (`utilisateurs.alertes`, page **Mes alertes** `/alertes` ; pour une personne accompagnée, réglées par les aidants dans **Tablettes**).

- Navigateurs et PWA : Web Push (`web-push`), clés VAPID créées en base au premier démarrage (`parametres`, clé `push`), affichage dans `client/public/sw.js`. Sur iPhone, seulement une fois la PWA ajoutée à l'écran d'accueil.
- Application Android : Firebase Cloud Messaging (une WebView ne reçoit pas le Web Push). Il faut un projet Firebase avec une application Android `fr.traitunion.app` : son `google-services.json` va dans le secret de dépôt `GOOGLE_SERVICES_JSON` (lu par le workflow Android ; sans lui l'APK marche mais sans alertes), et la clé du compte de service se colle dans **Administration, Alertes** (`/admin/alertes`). Code natif : `AlertesService.java` et l'objet `window.TraitUnionAlertes` de `MainActivity.java`.
- Les appareils (`appareils_alertes`) sont rattachés à la session : se déconnecter arrête leurs alertes.

## Messagerie

Chaque cercle a d'office trois conversations : « Toute la famille » (personnes accompagnées comprises, pas les auxiliaires de vie), « Les aidants » et le « Cahier de liaison » (aidants et auxiliaires), plus des conversations privées à deux. Une auxiliaire peut écrire en privé aux aidants et aux personnes accompagnées, pas aux proches ; les aidants ne lisent pas les conversations privées d'une personne accompagnée. Code : `server/messagerie/` (droits, temps réel, fichiers, alertes, conservation) et `server/routes/messagerie.js` ; tables `conversations`, `messages`, `lectures`.

- Messages texte, réponses toutes faites, photos avec commentaire et messages vocaux (deux minutes au plus). Photos et vocaux sont rangés chez l'hébergeur S3 configuré pour les photos, envoyés en deux temps (lien signé, puis publication). Une photo d'une conversation peut être ajoutée aux photos du cercle, dans l'album choisi.
- Aperçu des liens, comme WhatsApp : quand un message contient un lien, le serveur lit la page (titre, description, image, nom du site) juste après l'envoi et l'ajoute sous le message ; l'image est relayée par le serveur. Le réseau local est interdit (adresses privées refusées à chaque redirection, ports 80 et 443 seulement, temps et taille limités). Code : `server/messagerie/liens.js`.
- Sondage de dates façon Doodle : dans « Toute la famille », un aidant ou un proche propose des jours (moment : journée, midi, soir ou heure précise ; lieu et date limite facultatifs). Une carte s'affiche dans le fil ; chacun répond Oui, Peut-être ou Non pour chaque jour, la personne accompagnée aussi sur un seul écran à gros boutons (« Choisir mes jours »), et un aidant peut répondre à sa place (« répondu par… »). Son auteur et les aidants voient le tableau des réponses, relancent ceux qui n'ont pas répondu (bouton « Relancer », et alerte automatique la veille de la date limite) et retiennent une date : un rendez-vous visible de tous est créé dans l'agenda et un message prévient la famille. Un sondage clos peut être rouvert (« Rouvrir le sondage ») : le rendez-vous est retiré de l'agenda et la famille est prévenue. Code : `server/messagerie/sondages.js` ; tables `sondages`, `sondage_reponses`.
- Temps réel par Server-Sent Events (`/api/messagerie/flux`, en-tête `X-Accel-Buffering: no`, rien à régler dans Nginx Proxy Manager) ; accusés de lecture (« Vu par… ») ; alerte « Nouveaux messages ».
- Personne accompagnée (« Mes messages ») : la liste de ses conversations avec une pastille de non-lus, puis le fil en grand (avatar et prénom de chaque auteur, bouton « Écouter »), un gros bouton « Écrire » (champ de texte visible d'emblée, réponses toutes faites, message vocal, photo) et « Effacer » sur ses propres messages. Commande vocale « Lis mes messages ».
- Réglages par personne accompagnée (page Personnes accompagnées) : qui peut lui écrire en privé, ses réponses toutes faites, lecture à voix haute automatique, vocal et photo. Un aidant peut retirer un message d'un groupe.
- Durée de conservation réglée par l'administrateur (**Administration, Messagerie**, `/admin/messagerie`) : les messages plus anciens sont effacés chaque heure avec leurs fichiers.
- Application Android : permission micro (`RECORD_AUDIO`) et canal de notification « Nouveaux messages » ; l'APK est à reconstruire pour les messages vocaux.

## Application mobile

### PWA (tous les appareils)

L'application web est installable : manifeste `client/public/manifest.webmanifest`, icônes dans `client/public/icones/`, service worker `client/public/sw.js`. Le service worker ne met jamais en cache les données (`/api`) ; il garde seulement les fichiers compilés et une page « Pas de connexion » affichée hors ligne. Après une modification de `sw.js`, changer sa constante `VERSION`. La page **Application mobile** du menu (`/application`) propose l'installation (bouton sur Chrome et Edge, explication pour Safari) et le lien de l'APK. L'installation d'une PWA exige HTTPS (Nginx Proxy Manager).

### Application Android (APK)

Le dossier `mobile/` contient un projet [Capacitor](https://capacitorjs.com) : une page de démarrage locale (`mobile/www/index.html`) demande l'adresse du serveur au premier lancement, vérifie qu'elle répond sur `/api/health`, la mémorise, puis ouvre l'application web de ce serveur. Rien n'est à recompiler quand l'application web évolue : l'APK n'est à reconstruire que si `mobile/` change. Le lien « Changer de serveur » de la page Application mobile ramène à cet écran.

- À chaque push sur `main` qui touche `mobile/`, le workflow `.github/workflows/android.yml` construit l'APK et la publie dans la release `android` : lien permanent https://github.com/jhenninot/trait-union/releases/download/android/trait-union.apk (aussi en artefact du workflow). On peut le relancer à la main depuis l'onglet Actions.
- Facultatif : une variable de dépôt `APP_URL` (Settings > Secrets and variables > Actions > Variables) pré-remplit l'adresse du serveur au premier lancement.
- Signature : l'APK est signée avec la clé privée de Julien, fournie au workflow par les secrets du dépôt `ANDROID_KEYSTORE_BASE64` (fichier `.keystore` en base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` et `ANDROID_KEY_PASSWORD`. Sans ces secrets, le workflow échoue. La clé ne doit jamais être perdue ni changée : Android refuse une mise à jour signée avec une autre clé (il faudrait désinstaller l'application).
- La connexion avec Google ne fonctionne pas dans l'application Android (Google refuse les vues web intégrées) : utiliser email et mot de passe, ou la PWA.
- Partage de photos : l'APK et la PWA installée apparaissent dans le menu « Partager » d'Android (Galerie, WhatsApp…) ; les photos reçues arrivent sur la page `/recevoir`. Le bouton « Partager » des visionneuses ouvre le menu de partage d'Android (APK), le partage web (navigateur) ou télécharge la photo (ordinateur). Voir `client/src/partage.js`. Il faut réinstaller l'APK une fois pour en profiter.
- Mises à jour : la CI inscrit le numéro de build dans l'agent utilisateur (`TraitUnionAndroid/42`). Le serveur lit la dernière release `android` sur GitHub (`/api/application`, cache d'une heure, `server/application.js`) : les aidants qui ont une version plus ancienne voient un bandeau, la page Application mobile explique la mise à jour, la page Personnes accompagnées signale les appareils à mettre à jour, et une alerte « Nouvelle version de l'application » part sur leurs téléphones (catégorie `application`). L'adresse courte `/apk` du serveur redirige vers l'APK, pratique à taper dans Chrome.
- En local : `cd mobile && npm install && npm run apk` (Android SDK et Java 21 nécessaires ; APK de debug signée avec la clé de debug locale). `npm run icones` régénère les icônes et l'écran de démarrage depuis `mobile/assets/`.

## Déploiement (Docker / Dockge)

- À chaque push sur `main`, GitHub Actions construit l'image et la publie sur `ghcr.io/jhenninot/trait-union:latest` (workflow `.github/workflows/docker.yml`).
- `compose.yaml` est la pile à coller dans Dockge : l'application, sa base PostgreSQL (volume `db-data`, mot de passe `POSTGRES_PASSWORD` à mettre dans l'onglet `.env` de Dockge) et un Watchtower qui ne surveille que les conteneurs labellisés `com.centurylinklabs.watchtower.enable=true`, et les met à jour toutes les 5 minutes.
