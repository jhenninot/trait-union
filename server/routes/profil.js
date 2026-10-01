import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { utilisateurs, membres } from '../db/schema.js'
import { exigerConnexion, profilPublic } from '../auth/sessions.js'
import * as valider from '../auth/validation.js'
import { presenterAvatar, preparerEnvoi, changerAvatar } from '../avatars.js'
import { noterUtilisation } from '../utilisation.js'

// « Mon profil » : prénom, nom, coordonnées et avatar de la personne connectée
const router = Router()
router.use(exigerConnexion)

router.get('/', async (req, res) => {
  res.json({ ...profilPublic(req.utilisateur), ...await presenterAvatar(req.utilisateur) })
})

// Écran ouvert sur l'appareil d'une personne accompagnée (suivi d'utilisation montré à ses aidants).
// Corps : { ecran: accueil | photos | agenda | famille | arbre }
router.post('/utilisation', (req, res) => {
  noterUtilisation(req, String(req.body.ecran ?? ''))
  res.status(204).end()
})

router.patch('/', async (req, res) => {
  const modifs = {
    prenom: valider.texte(req.body.prenom, 'prénom'),
    nom: valider.texte(req.body.nom, 'nom', { obligatoire: false })
  }
  // Les coordonnées ne sont modifiées que si la requête les contient
  const coordonnees = valider.coordonnees(req.body)
  for (const champ of Object.keys(coordonnees)) {
    if (champ in req.body) modifs[champ] = coordonnees[champ]
  }
  await db.transaction(async (tx) => {
    await tx.update(utilisateurs).set(modifs).where(eq(utilisateurs.id, req.utilisateur.id))
    // Les cercles gardent une copie du nom affichée à la famille
    await tx.update(membres).set({ prenom: modifs.prenom, nom: modifs.nom }).where(eq(membres.utilisateurId, req.utilisateur.id))
  })
  const u = { ...req.utilisateur, ...modifs }
  res.json({ ...profilPublic(u), ...await presenterAvatar(u) })
})

// Lien d'envoi d'une nouvelle photo de profil. Corps : { taille } en octets
router.post('/avatar/envoi', async (req, res) => {
  res.json(await preparerEnvoi(req.utilisateur.id, req.body.taille))
})

// Corps : { avatar: 'modele:<id>' | 'photo:<jeton>' | null }
router.put('/avatar', async (req, res) => {
  res.json(await changerAvatar(req.utilisateur, req.body.avatar))
})

export default router
