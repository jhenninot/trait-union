# Trait d'union

> Le lien entre toi et les tiens.

Application pour les personnes atteintes d'Alzheimer ou de maladies apparentées, leurs aidants et leur famille, pensée pour garder le lien, y compris avec les proches qui vivent en EHPAD.

## Développement

```bash
npm install
npm start      # serveur Express sur http://localhost:3000 (sert dist/)
npm run dev    # front Vue en rechargement à chaud (proxy /api vers le port 3000)
npm run build  # compile le front dans dist/
```

## Déploiement (Docker / Dockge)

- À chaque push sur `main`, GitHub Actions construit l'image et la publie sur `ghcr.io/jhenninot/trait-union:latest` (workflow `.github/workflows/docker.yml`).
- `compose.yaml` est la pile à coller dans Dockge : l'application et un Watchtower qui ne surveille que les conteneurs labellisés `com.centurylinklabs.watchtower.enable=true`, et les met à jour toutes les 5 minutes.
