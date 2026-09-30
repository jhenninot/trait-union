import { Router } from 'express'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invitations, cercles, membres, utilisateurs } from '../db/schema.js'
import { empreinte, hacherMotDePasse } from '../auth/securite.js'
import { ouvrirSession, profilPublic } from '../auth/sessions.js'
import * as valider from '../auth/validation.js'

const router = Router()

async function invitationValide(jeton) {
  const [ligne] = await db
    .select({ invitation: invitations, cercle: cercles })
    .from(invitations)
    .innerJoin(cercles, eq(invitations.cercleId, cercles.id))
    .where(and(eq(invitations.jetonHash, empreinte(jeton)), isNull(invitations.accepteeLe), gt(invitations.expireLe, new Date())))
  return ligne
}

router.get('/:jeton', async (req, res) => {
  const ligne = await invitationValide(req.params.jeton)
  if (!ligne) return res.status(404).json({ erreur: 'Cette invitation n\'est plus valable. Demandez-en une nouvelle.' })
  res.json({ cercle: ligne.cercle.nom, role: ligne.invitation.role })
})

// Accepte l'invitation : avec le compte connecté, ou en créant un compte
router.post('/:jeton/accepter', async (req, res) => {
  const ligne = await invitationValide(req.params.jeton)
  if (!ligne) return res.status(404).json({ erreur: 'Cette invitation n\'est plus valable. Demandez-en une nouvelle.' })
  const { invitation } = ligne

  let utilisateur = req.utilisateur
  let nouveau = null
  if (!utilisateur) {
    nouveau = {
      prenom: valider.texte(req.body.prenom, 'prénom'),
      nom: valider.texte(req.body.nom, 'nom', { obligatoire: false }),
      email: valider.email(req.body.email),
      motDePasse: await hacherMotDePasse(valider.motDePasse(req.body.motDePasse))
    }
    const [existant] = await db.select({ id: utilisateurs.id }).from(utilisateurs).where(eq(utilisateurs.email, nouveau.email))
    if (existant) return res.status(409).json({ erreur: 'Un compte existe déjà avec cet email : connectez-vous puis rouvrez le lien.' })
  } else if (req.session.type === 'appareil') {
    return res.status(403).json({ erreur: 'Cet appareil est réservé à une personne accompagnée' })
  }

  const resultat = await db.transaction(async (tx) => {
    // Marque l'invitation utilisée en premier : un seul acceptant possible
    const [prise] = await tx.update(invitations).set({ accepteeLe: new Date() })
      .where(and(eq(invitations.id, invitation.id), isNull(invitations.accepteeLe)))
      .returning()
    if (!prise) return null
    if (nouveau) [utilisateur] = await tx.insert(utilisateurs).values(nouveau).returning()
    await tx.update(invitations).set({ accepteeParId: utilisateur.id }).where(eq(invitations.id, invitation.id))
    const [dejaMembre] = await tx.select().from(membres)
      .where(and(eq(membres.cercleId, invitation.cercleId), eq(membres.utilisateurId, utilisateur.id)))
    if (!dejaMembre) {
      await tx.insert(membres).values({
        cercleId: invitation.cercleId,
        utilisateurId: utilisateur.id,
        prenom: utilisateur.prenom,
        nom: utilisateur.nom,
        email: utilisateur.email,
        role: invitation.role
      }).onConflictDoNothing()
    }
    return utilisateur
  })
  if (!resultat) return res.status(404).json({ erreur: 'Cette invitation vient d\'être utilisée.' })
  if (nouveau) await ouvrirSession(res, req, resultat.id, 'mot_de_passe')
  res.json({ utilisateur: profilPublic(resultat), cercleId: invitation.cercleId })
})

export default router
