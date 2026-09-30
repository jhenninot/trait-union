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

Les emails partent par l'[API de Brevo](https://developers.brevo.com) (offre gratuite : 300 emails par jour). Tout se règle dans l'application : un administrateur ouvre « Envoi d'emails (Brevo) » depuis l'accueil (`/admin/email`), où les étapes sont rappelées (compte Brevo, expéditeur validé, clé API `xkeysib-…`, IP publique de la box autorisée dans Brevo), vérifie la clé, choisit l'expéditeur, active l'envoi et envoie un email de test. La clé est stockée en base (table `parametres`) et n'est jamais renvoyée au navigateur. Une fois l'envoi activé, un aidant peut saisir l'adresse de la personne qu'il invite pour lui envoyer le lien par email ; le lien reste affiché pour être copié. Les liens des emails utilisent `APP_URL` si elle est définie.

## Déploiement (Docker / Dockge)

- À chaque push sur `main`, GitHub Actions construit l'image et la publie sur `ghcr.io/jhenninot/trait-union:latest` (workflow `.github/workflows/docker.yml`).
- `compose.yaml` est la pile à coller dans Dockge : l'application, sa base PostgreSQL (volume `db-data`, mot de passe `POSTGRES_PASSWORD` à mettre dans l'onglet `.env` de Dockge) et un Watchtower qui ne surveille que les conteneurs labellisés `com.centurylinklabs.watchtower.enable=true`, et les met à jour toutes les 5 minutes.
