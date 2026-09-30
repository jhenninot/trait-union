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

## Envoi d'emails (Brevo, facultatif)

Les emails partent par l'[API de Brevo](https://developers.brevo.com) (offre gratuite : 300 emails par jour). Tout se règle dans l'application : un administrateur ouvre « Envoi d'emails » dans la partie Administration du menu (`/admin/email`), où les étapes sont rappelées (compte Brevo, expéditeur validé, clé API `xkeysib-…`, IP publique de la box autorisée dans Brevo), vérifie la clé, choisit l'expéditeur, active l'envoi et envoie un email de test. La clé est stockée en base (table `parametres`) et n'est jamais renvoyée au navigateur. Une fois l'envoi activé, un aidant peut saisir l'adresse de la personne qu'il invite pour lui envoyer le lien par email ; le lien reste affiché pour être copié. Les liens des emails utilisent `APP_URL` si elle est définie.

## Application mobile

### PWA (tous les appareils)

L'application web est installable : manifeste `client/public/manifest.webmanifest`, icônes dans `client/public/icones/`, service worker `client/public/sw.js`. Le service worker ne met jamais en cache les données (`/api`) ; il garde seulement les fichiers compilés et une page « Pas de connexion » affichée hors ligne. Après une modification de `sw.js`, changer sa constante `VERSION`. La page **Application mobile** du menu (`/application`) propose l'installation (bouton sur Chrome et Edge, explication pour Safari) et le lien de l'APK. L'installation d'une PWA exige HTTPS (Nginx Proxy Manager).

### Application Android (APK)

Le dossier `mobile/` contient un projet [Capacitor](https://capacitorjs.com) : une page de démarrage locale (`mobile/www/index.html`) demande l'adresse du serveur au premier lancement, vérifie qu'elle répond sur `/api/health`, la mémorise, puis ouvre l'application web de ce serveur. Rien n'est à recompiler quand l'application web évolue : l'APK n'est à reconstruire que si `mobile/` change. Le lien « Changer de serveur » de la page Application mobile ramène à cet écran.

- À chaque push sur `main` qui touche `mobile/`, le workflow `.github/workflows/android.yml` construit l'APK et la publie dans la release `android` : lien permanent https://github.com/jhenninot/trait-union/releases/download/android/trait-union.apk (aussi en artefact du workflow). On peut le relancer à la main depuis l'onglet Actions.
- Facultatif : une variable de dépôt `APP_URL` (Settings > Secrets and variables > Actions > Variables) pré-remplit l'adresse du serveur au premier lancement.
- Signature : sans configuration, l'APK est signée avec la clé de test du dépôt (`mobile/android/app/debug.keystore`, publique) ; les nouvelles versions s'installent par-dessus les anciennes. Avant une diffusion plus large, créer une clé privée (`keytool -genkeypair -keystore trait-union.keystore -alias trait-union -keyalg RSA -keysize 2048 -validity 10000`) et ajouter les secrets `ANDROID_KEYSTORE_BASE64` (`base64 -w0 trait-union.keystore`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` et `ANDROID_KEY_PASSWORD` : le workflow construit alors une version release signée avec cette clé (il faudra désinstaller une fois la version de test).
- La connexion avec Google ne fonctionne pas dans l'application Android (Google refuse les vues web intégrées) : utiliser email et mot de passe, ou la PWA.
- En local : `cd mobile && npm install && npm run apk` (Android SDK et Java 21 nécessaires). `npm run icones` régénère les icônes et l'écran de démarrage depuis `mobile/assets/`.

## Déploiement (Docker / Dockge)

- À chaque push sur `main`, GitHub Actions construit l'image et la publie sur `ghcr.io/jhenninot/trait-union:latest` (workflow `.github/workflows/docker.yml`).
- `compose.yaml` est la pile à coller dans Dockge : l'application, sa base PostgreSQL (volume `db-data`, mot de passe `POSTGRES_PASSWORD` à mettre dans l'onglet `.env` de Dockge) et un Watchtower qui ne surveille que les conteneurs labellisés `com.centurylinklabs.watchtower.enable=true`, et les met à jour toutes les 5 minutes.
