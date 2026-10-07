import { Router } from 'express'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invitations, cercles, membres, utilisateurs, personnes } from '../db/schema.js'
import { empreinte, hacherMotDePasse } from '../auth/securite.js'
import { ouvrirSession, profilPublic } from '../auth/sessions.js'
import * as valider from '../auth/validation.js'
import { roleLePlusHaut } from '../auth/roles.js'
import { rattacherCompte } from '../arbre.js'
import { envoyerAlerte } from '../alertes/envoi.js'

const router = Router()

export async function invitationValide(jeton) {
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
  // Invitation envoyée depuis l'arbre : on propose le prénom et le nom de la fiche
  const [fiche] = ligne.invitation.personneId
    ? await db.select({ prenom: personnes.prenom, nom: personnes.nom }).from(personnes).where(eq(personnes.id, ligne.invitation.personneId))
    : []
  res.json({ cercle: ligne.cercle.nom, role: ligne.invitation.role, email: ligne.invitation.email, prenom: fiche?.prenom ?? null, nom: fiche?.nom ?? null })
})

// Rattache l'utilisateur (existant, ou à créer à partir de `nouveau`) au cercle de l'invitation.
// Renvoie l'utilisateur, ou null si l'invitation vient d'être utilisée par quelqu'un d'autre.
export async function accepterInvitation(invitation, utilisateur, nouveau = null) {
  const resultat = await rattacher(invitation, utilisateur, nouveau)
  if (resultat) prevenirAuteur(invitation, resultat).catch((e) => console.error('Alerte d\'inscription :', e.message))
  return resultat
}

// Alerte l'auteur de l'invitation quand la personne invitée l'a acceptée
async function prevenirAuteur(invitation, invite) {
  if (!invitation.creeParId || invitation.creeParId === invite.id) return
  const [cercle] = await db.select({ nom: cercles.nom }).from(cercles).where(eq(cercles.id, invitation.cercleId))
  const qui = [invite.prenom, invite.nom].filter(Boolean).join(' ')
  await envoyerAlerte([invitation.creeParId], {
    categorie: 'invitations',
    titre: 'Invitation acceptée',
    corps: `${qui} a rejoint le cercle ${cercle?.nom ?? ''} suite à votre invitation.`.replace('  ', ' '),
    url: '/',
    tag: `invitation-${invitation.id}`
  })
}

function rattacher(invitation, utilisateur, nouveau) {
  return db.transaction(async (tx) => {
    // Marque l'invitation utilisée en premier : un seul acceptant possible
    const [prise] = await tx.update(invitations).set({ accepteeLe: new Date() })
      .where(and(eq(invitations.id, invitation.id), isNull(invitations.accepteeLe)))
      .returning()
    if (!prise) return null
    if (nouveau) [utilisateur] = await tx.insert(utilisateurs).values(nouveau).returning()
    await tx.update(invitations).set({ accepteeParId: utilisateur.id }).where(eq(invitations.id, invitation.id))
    const [dejaMembre] = await tx.select().from(membres)
      .where(and(eq(membres.cercleId, invitation.cercleId), eq(membres.utilisateurId, utilisateur.id)))
    if (dejaMembre) {
      // Déjà membre : on garde le rôle le plus élevé (un proche invité comme aidant est promu)
      const role = roleLePlusHaut(dejaMembre.role, invitation.role)
      if (role !== dejaMembre.role && dejaMembre.role !== 'accompagne') {
        await tx.update(membres).set({ role }).where(eq(membres.id, dejaMembre.id))
      }
    } else {
      await tx.insert(membres).values({
        cercleId: invitation.cercleId,
        utilisateurId: utilisateur.id,
        prenom: utilisateur.prenom,
        nom: utilisateur.nom,
        email: utilisateur.email,
        role: invitation.role
      }).onConflictDoNothing()
    }
    // Invitation envoyée depuis une fiche de l'arbre généalogique : la fiche devient la sienne
    if (invitation.personneId) await rattacherCompte(tx, invitation.personneId, utilisateur)
    return utilisateur
  })
}

// Accepte l'invitation : avec le compte connecté, ou en créant un compte
router.post('/:jeton/accepter', async (req, res) => {
  const ligne = await invitationValide(req.params.jeton)
  if (!ligne) return res.status(404).json({ erreur: 'Cette invitation n\'est plus valable. Demandez-en une nouvelle.' })
  const { invitation } = ligne

  let nouveau = null
  if (!req.utilisateur) {
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

  const resultat = await accepterInvitation(invitation, req.utilisateur, nouveau)
  if (!resultat) return res.status(404).json({ erreur: 'Cette invitation vient d\'être utilisée.' })
  if (nouveau) await ouvrirSession(res, req, resultat.id, 'mot_de_passe')
  res.json({ utilisateur: profilPublic(resultat), cercleId: invitation.cercleId })
})

export default router
