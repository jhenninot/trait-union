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

## Déploiement (Docker / Dockge)

- À chaque push sur `main`, GitHub Actions construit l'image et la publie sur `ghcr.io/jhenninot/trait-union:latest` (workflow `.github/workflows/docker.yml`).
- `compose.yaml` est la pile à coller dans Dockge : l'application, sa base PostgreSQL (volume `db-data`, mot de passe `POSTGRES_PASSWORD` à mettre dans l'onglet `.env` de Dockge) et un Watchtower qui ne surveille que les conteneurs labellisés `com.centurylinklabs.watchtower.enable=true`, et les met à jour toutes les 5 minutes.
