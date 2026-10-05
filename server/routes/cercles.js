import { Router } from 'express'
import { and, eq, isNull, count, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { cercles, membres, utilisateurs, invitations, codesConnexion, sessions, appareilsAlertes, personnes } from '../db/schema.js'
import { exigerConnexion, exigerAdmin } from '../auth/sessions.js'
import { nouveauJeton, nouveauCode, empreinte } from '../auth/securite.js'
import { mesCercles } from './auth.js'
import * as valider from '../auth/validation.js'
import { aLesDroits } from '../auth/roles.js'
import { emailActif, envoyerEmail, gabarit } from '../email/brevo.js'
import { urlApplication } from '../url.js'
import routesAgenda from './agenda.js'
import routesPhotos from './photos.js'
import routesAlbums, { nonVuesPar } from './albums.js'
import routesArbre from './arbre.js'
import { liensDesMembres } from '../arbre.js'
import { liensAvatars, preparerEnvoi, changerAvatar } from '../avatars.js'
import { preferences, lirePreferences } from './alertes.js'
import { derniereApkConnue } from '../application.js'
import { resumeUtilisation } from '../utilisation.js'
import { reglages as reglagesMessagerie, REPONSES_DEFAUT } from '../messagerie/droits.js'
import { supprimerFichiersDe } from '../messagerie/conservation.js'
import { marquerDeces, annulerDeces } from '../deces.js'

const router = Router()
router.use(exigerConnexion)

const MINUTE = 60 * 1000
const DUREE_INVITATION = 7 * 24 * 60 * MINUTE
const DUREE_CODE = 30 * MINUTE

// Charge le cercle et le rôle de l'utilisateur dedans. Un administrateur voit tous les cercles.
async function chargerCercle(req, res, next) {
  const [cercle] = await db.select().from(cercles).where(eq(cercles.id, req.params.cercleId))
  const [membre] = cercle
    ? await db.select().from(membres).where(and(eq(membres.cercleId, cercle.id), eq(membres.utilisateurId, req.utilisateur.id)))
    : []
  if (!cercle || (!membre && !req.utilisateur.estAdmin)) return res.status(404).json({ erreur: 'Cercle introuvable' })
  req.cercle = cercle
  req.role = membre?.role ?? null
  req.peutGerer = req.utilisateur.estAdmin || aLesDroits(req.role, 'aidant')
  next()
}

// Les auxiliaires de vie n'ont pas accès aux photos de la famille
function refuserAuxiliaires(req, res, next) {
  if (!req.peutGerer && req.role === 'auxiliaire') return res.status(403).json({ erreur: 'Les photos ne sont pas accessibles aux auxiliaires de vie' })
  next()
}

function exigerGestion(req, res, next) {
  if (!req.peutGerer) return res.status(403).json({ erreur: 'Réservé aux aidants du cercle' })
  next()
}

async function chargerAccompagne(req, res, next) {
  const [membre] = await db.select().from(membres)
    .where(and(eq(membres.id, req.params.membreId), eq(membres.cercleId, req.cercle.id)))
  if (!membre) return res.status(404).json({ erreur: 'Membre introuvable' })
  if (membre.role !== 'accompagne' || !membre.utilisateurId) {
    return res.status(400).json({ erreur: 'Réservé aux personnes accompagnées' })
  }
  req.membre = membre
  next()
}

router.get('/', async (req, res) => {
  if (!req.utilisateur.estAdmin) return res.json(await mesCercles(req.utilisateur.id))
  const miens = new Map((await mesCercles(req.utilisateur.id)).map((c) => [c.id, c]))
  const tous = await db.select({ id: cercles.id, nom: cercles.nom }).from(cercles).orderBy(cercles.nom)
  res.json(tous.map((c) => ({ ...c, role: miens.get(c.id)?.role ?? null, membreId: miens.get(c.id)?.membreId ?? null })))
})

// Ajoute l'utilisateur connecté au cercle comme aidant (ou promeut un proche en aidant)
async function ajouterCommeAidant(cercleId, u, tx = db) {
  await tx.insert(membres)
    .values({ cercleId, utilisateurId: u.id, prenom: u.prenom, nom: u.nom, email: u.email, role: 'aidant' })
    .onConflictDoUpdate({ target: [membres.cercleId, membres.utilisateurId], set: { role: 'aidant' } })
}

router.post('/', exigerAdmin, async (req, res) => {
  const nom = valider.texte(req.body.nom, 'nom du cercle')
  const cercle = await db.transaction(async (tx) => {
    const [c] = await tx.insert(cercles).values({ nom }).returning()
    if (req.body.rejoindre) await ajouterCommeAidant(c.id, req.utilisateur, tx)
    return c
  })
  res.status(201).json(cercle)
})

router.get('/:cercleId', chargerCercle, async (req, res) => {
  const liste = await db
    .select({ id: membres.id, prenom: membres.prenom, nom: membres.nom, email: membres.email, role: membres.role, lien: membres.lien, utilisateurId: membres.utilisateurId, avatar: utilisateurs.avatar, alertes: utilisateurs.alertes, messagerie: utilisateurs.messagerie, telephone: utilisateurs.telephone, dateNaissance: utilisateurs.dateNaissance, adresse: utilisateurs.adresse, decede: utilisateurs.decede, dateDeces: utilisateurs.dateDeces })
    .from(membres)
    .leftJoin(utilisateurs, eq(membres.utilisateurId, utilisateurs.id))
    .where(eq(membres.cercleId, req.cercle.id))
    .orderBy(membres.role, membres.prenom)
  // Nombre d'appareils connectés pour chaque personne accompagnée
  // et, parmi eux, ceux qui ont une ancienne version de l'application Android
  const apk = derniereApkConnue()
  const appareils = await db
    .select({
      utilisateurId: sessions.utilisateurId,
      n: count(),
      anciens: apk ? sql`count(*) filter (where ${sessions.versionApk} < ${apk.version})`.mapWith(Number) : sql`0`.mapWith(Number)
    })
    .from(sessions)
    .innerJoin(membres, eq(membres.utilisateurId, sessions.utilisateurId))
    .where(and(eq(membres.cercleId, req.cercle.id), eq(membres.role, 'accompagne'), eq(sessions.type, 'appareil')))
    .groupBy(sessions.utilisateurId)
  const parUtilisateur = new Map(appareils.map((a) => [a.utilisateurId, a]))
  // Appareils des personnes accompagnées qui reçoivent les alertes
  const avecAlertes = await db
    .select({ utilisateurId: appareilsAlertes.utilisateurId, n: count() })
    .from(appareilsAlertes)
    .innerJoin(membres, eq(membres.utilisateurId, appareilsAlertes.utilisateurId))
    .where(and(eq(membres.cercleId, req.cercle.id), eq(membres.role, 'accompagne')))
    .groupBy(appareilsAlertes.utilisateurId)
  const alertesParUtilisateur = new Map(avecAlertes.map((a) => [a.utilisateurId, a.n]))
  const lienAvatar = await liensAvatars()
  // Lien avec la personne accompagnée calculé par l'arbre généalogique, quand le membre y est
  // placé (vu depuis la personne connectée si elle est accompagnée) ; sinon le lien saisi
  const { g, liens } = await liensDesMembres(req.cercle.id, req.role === 'accompagne' ? req.utilisateur.id : null)
  const ficheDe = new Map(g.personnes.filter((p) => p.utilisateurId).map((p) => [p.utilisateurId, p]))
  // Les auxiliaires de vie ne voient que le téléphone des membres
  const voitTout = req.peutGerer || req.role !== 'auxiliaire'
  res.json({
    ...req.cercle,
    monRole: req.role,
    peutGerer: req.peutGerer,
    membres: liste.map(({ utilisateurId, email, avatar, alertes, messagerie, dateNaissance, adresse, ...m }) => ({
      ...m,
      lien: liens.get(utilisateurId) ?? m.lien,
      lienCalcule: liens.has(utilisateurId),
      personneId: voitTout ? ficheDe.get(utilisateurId)?.id ?? null : undefined,
      // Pour accorder « décédé » / « décédée » (le genre est renseigné dans l'arbre)
      genre: ficheDe.get(utilisateurId)?.genre ?? null,
      decede: Boolean(m.decede),
      dateDeces: m.decede ? m.dateDeces : null,
      dateNaissance: voitTout ? dateNaissance : undefined,
      adresse: voitTout ? adresse : undefined,
      moi: utilisateurId === req.utilisateur.id,
      // Sert à choisir la personne accompagnée concernée par un rendez-vous (agenda)
      utilisateurId: m.role === 'accompagne' ? utilisateurId : undefined,
      avatar: lienAvatar(utilisateurId, avatar),
      // Les aidants choisissent l'avatar des personnes accompagnées
      avatarChoix: req.peutGerer && m.role === 'accompagne' ? avatar : undefined,
      email: req.peutGerer ? email : undefined,
      appareils: m.role === 'accompagne' ? (parUtilisateur.get(utilisateurId)?.n ?? 0) : undefined,
      appareilsAMettreAJour: m.role === 'accompagne' && req.peutGerer ? (parUtilisateur.get(utilisateurId)?.anciens ?? 0) : undefined,
      // Les aidants choisissent les alertes des personnes accompagnées
      alertes: req.peutGerer && m.role === 'accompagne' ? { ...preferences({ alertes }), appareils: alertesParUtilisateur.get(utilisateurId) ?? 0 } : undefined,
      // Les aidants règlent la messagerie des personnes accompagnées
      messagerie: req.peutGerer && m.role === 'accompagne' ? reglagesMessagerie(messagerie) : undefined
    }))
  })
})

// Utilisation de l'application par les personnes accompagnées du cercle (réservé aux aidants) :
// dernier passage, jours d'utilisation, frise des 30 derniers jours, écrans ouverts, photos pas vues
router.get('/:cercleId/utilisation', chargerCercle, exigerGestion, async (req, res) => {
  const liste = await db.select({ utilisateurId: membres.utilisateurId }).from(membres)
    .where(and(eq(membres.cercleId, req.cercle.id), eq(membres.role, 'accompagne')))
  const ids = liste.map((m) => m.utilisateurId).filter(Boolean)
  const resume = await resumeUtilisation(ids)
  res.json(await Promise.all(ids.map(async (utilisateurId) => {
    const nonVues = await nonVuesPar(req.cercle.id, utilisateurId)
    return { utilisateurId, ...resume.get(utilisateurId), photosNonVues: nonVues.reduce((n, c) => n + c.nombre, 0) }
  })))
})

// Un administrateur qui n'est pas membre (ou seulement proche) devient aidant du cercle
router.post('/:cercleId/rejoindre', chargerCercle, exigerAdmin, async (req, res) => {
  if (aLesDroits(req.role, 'aidant') || req.role === 'accompagne') {
    return res.status(409).json({ erreur: 'Vous êtes déjà membre de ce cercle' })
  }
  await ajouterCommeAidant(req.cercle.id, req.utilisateur)
  res.status(204).end()
})

// Envoie le lien d'invitation par email quand une adresse est connue ; l'invitation reste valable en cas d'échec
async function envoyerInvitationEmail(req, { destinataire, role, jeton, expireLe }) {
  let emailEnvoye = null
  let erreurEmail = null
  if (destinataire) {
    const u = req.utilisateur
    const { html, texte } = gabarit({
      titre: `${u.prenom} vous invite à rejoindre « ${req.cercle.nom} »`,
      paragraphes: [
        'Bonjour,',
        `${[u.prenom, u.nom].filter(Boolean).join(' ')} vous invite à rejoindre le cercle « ${req.cercle.nom} » sur Trait d'union, ` +
          `en tant ${{ aidant: 'qu\'aidant', proche: 'que proche', auxiliaire: 'qu\'auxiliaire de vie' }[role]}.`,
        `Ce lien est personnel et ne sert qu'une fois. Il est valable jusqu'au ${expireLe.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long' })}.`
      ],
      bouton: { texte: 'Rejoindre le cercle', lien: `${urlApplication(req)}/invitation/${jeton}` }
    })
    try {
      await envoyerEmail({ a: { email: destinataire }, sujet: `Invitation à rejoindre « ${req.cercle.nom} » sur Trait d'union`, html, texte })
      emailEnvoye = destinataire
    } catch (e) {
      // L'invitation reste valable : le lien peut encore être copié à la main
      erreurEmail = e.message
    }
  }
  return { emailEnvoye, erreurEmail }
}

// Lien d'invitation (7 jours, usage unique) pour un aidant, un proche ou une auxiliaire de vie
router.post('/:cercleId/invitations', chargerCercle, exigerGestion, async (req, res) => {
  const role = req.body.role
  if (!['aidant', 'proche', 'auxiliaire'].includes(role)) return res.status(400).json({ erreur: 'Rôle invalide' })
  // Adresse facultative : si l'envoi d'emails est configuré, le lien part aussi par email
  const destinataire = req.body.email ? valider.email(req.body.email) : null
  // Invitation envoyée depuis une fiche de l'arbre généalogique : le compte y sera rattaché
  let personneId = null
  if (req.body.personneId) {
    const [p] = await db.select().from(personnes).where(and(eq(personnes.id, req.body.personneId), eq(personnes.cercleId, req.cercle.id)))
    if (!p || p.utilisateurId) return res.status(400).json({ erreur: 'Cette personne a déjà un compte' })
    personneId = p.id
  }
  if (destinataire && !(await emailActif())) return res.status(400).json({ erreur: 'L\'envoi d\'emails n\'est pas configuré' })
  const jeton = nouveauJeton()
  const expireLe = new Date(Date.now() + DUREE_INVITATION)
  await db.insert(invitations).values({ cercleId: req.cercle.id, role, email: destinataire, personneId, creeParId: req.utilisateur.id, jetonHash: empreinte(jeton), expireLe })
  const { emailEnvoye, erreurEmail } = await envoyerInvitationEmail(req, { destinataire, role, jeton, expireLe })
  res.status(201).json({ jeton, role, expireLe, emailEnvoye, erreurEmail })
})

// Suivi des invitations du cercle : en attente, acceptées (avec le compte créé) et expirées
router.get('/:cercleId/invitations', chargerCercle, exigerGestion, async (req, res) => {
  const liste = await db
    .select({
      id: invitations.id, role: invitations.role, email: invitations.email, creeLe: invitations.creeLe, expireLe: invitations.expireLe,
      accepteeLe: invitations.accepteeLe, accepteePar: utilisateurs.prenom, accepteeParNom: utilisateurs.nom,
      creePar: sql`(select prenom from utilisateurs where id = ${invitations.creeParId})`.mapWith(String),
      personne: personnes.prenom
    })
    .from(invitations)
    .leftJoin(utilisateurs, eq(utilisateurs.id, invitations.accepteeParId))
    .leftJoin(personnes, eq(personnes.id, invitations.personneId))
    .where(eq(invitations.cercleId, req.cercle.id))
    .orderBy(sql`${invitations.creeLe} desc`)
    .limit(100)
  const maintenant = Date.now()
  res.json(liste.map(({ accepteeParNom, ...i }) => ({
    ...i,
    accepteePar: i.accepteePar ? [i.accepteePar, accepteeParNom].filter(Boolean).join(' ') : null,
    statut: i.accepteeLe ? 'acceptee' : new Date(i.expireLe).getTime() < maintenant ? 'expiree' : 'attendue'
  })))
})

// Relance : un nouveau lien remplace l'ancien (le lien d'origine n'est pas conservé, seulement son empreinte)
router.post('/:cercleId/invitations/:id/relancer', chargerCercle, exigerGestion, async (req, res) => {
  const [inv] = await db.select().from(invitations).where(and(eq(invitations.id, req.params.id), eq(invitations.cercleId, req.cercle.id)))
  if (!inv) return res.status(404).json({ erreur: 'Invitation introuvable' })
  if (inv.accepteeLe) return res.status(400).json({ erreur: 'Cette invitation a déjà été acceptée' })
  const destinataire = req.body.email ? valider.email(req.body.email) : inv.email
  if (destinataire && !(await emailActif())) return res.status(400).json({ erreur: 'L\'envoi d\'emails n\'est pas configuré' })
  const jeton = nouveauJeton()
  const expireLe = new Date(Date.now() + DUREE_INVITATION)
  await db.update(invitations).set({ jetonHash: empreinte(jeton), expireLe, email: destinataire }).where(eq(invitations.id, inv.id))
  const { emailEnvoye, erreurEmail } = await envoyerInvitationEmail(req, { destinataire, role: inv.role, jeton, expireLe })
  res.json({ jeton, role: inv.role, expireLe, emailEnvoye, erreurEmail })
})

// Annule une invitation pas encore acceptée : son lien ne fonctionne plus
router.delete('/:cercleId/invitations/:id', chargerCercle, exigerGestion, async (req, res) => {
  const [inv] = await db.delete(invitations)
    .where(and(eq(invitations.id, req.params.id), eq(invitations.cercleId, req.cercle.id), isNull(invitations.accepteeLe)))
    .returning({ id: invitations.id })
  if (!inv) return res.status(404).json({ erreur: 'Invitation introuvable ou déjà acceptée' })
  res.status(204).end()
})

// Ajoute une personne accompagnée (sans email ni mot de passe)
router.post('/:cercleId/accompagnes', chargerCercle, exigerGestion, async (req, res) => {
  const prenom = valider.texte(req.body.prenom, 'prénom')
  const nom = valider.texte(req.body.nom, 'nom', { obligatoire: false })
  const membre = await db.transaction(async (tx) => {
    const [u] = await tx.insert(utilisateurs).values({ prenom, nom }).returning()
    const [m] = await tx.insert(membres).values({ cercleId: req.cercle.id, utilisateurId: u.id, prenom, nom, role: 'accompagne' }).returning()
    return m
  })
  res.status(201).json(membre)
})

// Code à 6 chiffres (30 minutes, usage unique) pour configurer l'appareil d'une personne accompagnée
router.post('/:cercleId/membres/:membreId/code', chargerCercle, exigerGestion, chargerAccompagne, async (req, res) => {
  const [u] = await db.select({ decede: utilisateurs.decede }).from(utilisateurs).where(eq(utilisateurs.id, req.membre.utilisateurId))
  if (u?.decede) return res.status(400).json({ erreur: `${req.membre.prenom} est indiqué comme décédé : annulez d'abord le décès` })
  const maintenant = new Date()
  // Les anciens codes non utilisés de cette personne ne servent plus
  await db.update(codesConnexion).set({ expireLe: maintenant })
    .where(and(eq(codesConnexion.utilisateurId, req.membre.utilisateurId), isNull(codesConnexion.utiliseLe)))
  const expireLe = new Date(maintenant.getTime() + DUREE_CODE)
  const code = await db.transaction(async (tx) => {
    // Évite de distribuer un code déjà actif pour une autre personne
    for (;;) {
      const candidat = nouveauCode()
      const [actif] = await tx.select({ id: codesConnexion.id }).from(codesConnexion)
        .where(and(eq(codesConnexion.codeHash, empreinte(candidat)), isNull(codesConnexion.utiliseLe)))
      if (actif) continue
      await tx.insert(codesConnexion).values({ utilisateurId: req.membre.utilisateurId, creeParId: req.utilisateur.id, codeHash: empreinte(candidat), expireLe })
      return candidat
    }
  })
  res.status(201).json({ code, expireLe })
})

// Envoie par email à la personne accompagnée les liens de l'application et de l'APK, avec la marche à suivre
router.post('/:cercleId/membres/:membreId/envoi-application', chargerCercle, exigerGestion, chargerAccompagne, async (req, res) => {
  const destinataire = valider.email(req.body.email)
  if (!(await emailActif())) return res.status(400).json({ erreur: 'L\'envoi d\'emails n\'est pas configuré' })
  const base = urlApplication(req)
  const u = req.utilisateur
  const { html, texte } = gabarit({
    titre: `${u.prenom} vous envoie l'application Trait d'union`,
    paragraphes: [
      `Bonjour ${req.membre.prenom},`,
      `${[u.prenom, u.nom].filter(Boolean).join(' ')} vous propose d'installer Trait d'union sur votre tablette ou votre téléphone, pour retrouver vos proches, vos photos et vos rendez-vous.`,
      'Sur une tablette ou un téléphone Android (conseillé) :',
      `1. Ouvrez ce message sur l'appareil et touchez le lien d'installation : ${base}/apk`,
      '2. Le fichier « trait-union.apk » se télécharge. Ouvrez-le. Si Android le demande, autorisez l\'installation depuis cette source (Chrome ou le navigateur utilisé).',
      '3. Touchez « Installer », puis « Ouvrir ».',
      `4. Si l'application demande l'adresse du serveur, saisissez : ${base}`,
      '5. Touchez « Le configurer avec un code » et saisissez le code à 6 chiffres que votre proche vous donnera (par téléphone ou en personne).',
      `Sur iPhone, iPad ou ordinateur : ouvrez ${base}/appareil dans le navigateur (Safari sur iPhone et iPad), puis ajoutez la page à l'écran d'accueil (bouton Partager, puis « Sur l'écran d'accueil »).`
    ],
    bouton: { texte: 'Installer l\'application Android', lien: `${base}/apk` }
  })
  try {
    await envoyerEmail({ a: { email: destinataire }, sujet: 'Installer l\'application Trait d\'union', html, texte })
  } catch (e) {
    return res.status(502).json({ erreur: e.message })
  }
  res.json({ envoyeA: destinataire })
})

// Déconnecte tous les appareils d'une personne accompagnée (tablette perdue, changée...)
router.post('/:cercleId/membres/:membreId/deconnecter', chargerCercle, exigerGestion, chargerAccompagne, async (req, res) => {
  await db.delete(sessions).where(and(eq(sessions.utilisateurId, req.membre.utilisateurId), eq(sessions.type, 'appareil')))
  res.status(204).end()
})

// Alertes reçues par une personne accompagnée (rappels de rendez-vous, nouvelles photos)
router.put('/:cercleId/membres/:membreId/alertes', chargerCercle, exigerGestion, chargerAccompagne, async (req, res) => {
  const alertes = lirePreferences(req.body)
  await db.update(utilisateurs).set({ alertes }).where(eq(utilisateurs.id, req.membre.utilisateurId))
  res.json(alertes)
})

// Messagerie d'une personne accompagnée : qui peut lui écrire en privé, réponses toutes faites,
// lecture à voix haute des nouveaux messages, photos et messages vocaux.
// Corps : { prive: 'tous' | 'aidants' | 'personne', reponses: [...], lectureAuto, vocal }
router.put('/:cercleId/membres/:membreId/messagerie', chargerCercle, exigerGestion, chargerAccompagne, async (req, res) => {
  const prive = ['tous', 'aidants', 'personne'].includes(req.body.prive) ? req.body.prive : 'tous'
  const reponses = Array.isArray(req.body.reponses)
    ? [...new Set(req.body.reponses.map((r) => valider.texte(r, 'réponse', { obligatoire: false, max: 40 })).filter(Boolean))].slice(0, 12)
    : REPONSES_DEFAUT
  const messagerie = { prive, reponses, lectureAuto: Boolean(req.body.lectureAuto), vocal: req.body.vocal !== false }
  await db.update(utilisateurs).set({ messagerie }).where(eq(utilisateurs.id, req.membre.utilisateurId))
  res.json(reglagesMessagerie(messagerie))
})

// Décès d'un membre (n'importe quel rôle), indiqué par un aidant : { dateDeces } (facultative).
// Le compte est désactivé mais gardé ; DELETE annule en cas d'erreur (server/deces.js).
async function chargerMembreAvecCompte(req, res, next) {
  const [membre] = await db.select().from(membres)
    .where(and(eq(membres.id, req.params.membreId), eq(membres.cercleId, req.cercle.id)))
  if (!membre?.utilisateurId) return res.status(404).json({ erreur: 'Membre introuvable' })
  req.membre = membre
  next()
}

router.put('/:cercleId/membres/:membreId/deces', chargerCercle, exigerGestion, chargerMembreAvecCompte, async (req, res) => {
  const dateDeces = valider.dateNaissance(req.body.dateDeces, { champ: 'date du décès', min: '1900-01-01' })
  await marquerDeces(req.membre.utilisateurId, dateDeces, req.utilisateur)
  res.json({ decede: true, dateDeces })
})

router.delete('/:cercleId/membres/:membreId/deces', chargerCercle, exigerGestion, chargerMembreAvecCompte, async (req, res) => {
  await annulerDeces(req.membre.utilisateurId)
  res.json({ decede: false, dateDeces: null })
})

// Lien d'un membre avec la personne accompagnée (fils, petite-fille...) : chacun règle le sien,
// les aidants celui de tous. Corps : { lien } (null pour l'effacer)
router.put('/:cercleId/membres/:membreId/lien', chargerCercle, async (req, res) => {
  const [membre] = await db.select().from(membres)
    .where(and(eq(membres.id, req.params.membreId), eq(membres.cercleId, req.cercle.id)))
  if (!membre) return res.status(404).json({ erreur: 'Membre introuvable' })
  if (!req.peutGerer && membre.utilisateurId !== req.utilisateur.id) return res.status(403).json({ erreur: 'Réservé aux aidants du cercle' })
  if (membre.role === 'accompagne') return res.status(400).json({ erreur: 'Pas de lien pour une personne accompagnée' })
  const lien = valider.texte(req.body.lien, 'lien', { obligatoire: false, max: 60 })
  await db.update(membres).set({ lien }).where(eq(membres.id, membre.id))
  res.json({ lien })
})

// Téléphone, date de naissance et adresse d'une personne accompagnée, renseignés par un aidant
router.put('/:cercleId/membres/:membreId/coordonnees', chargerCercle, exigerGestion, chargerAccompagne, async (req, res) => {
  const coordonnees = valider.coordonnees(req.body)
  await db.update(utilisateurs).set(coordonnees).where(eq(utilisateurs.id, req.membre.utilisateurId))
  res.json(coordonnees)
})

// Avatar d'une personne accompagnée, choisi par un aidant (même fonctionnement que « Mon profil »)
async function chargerCompteAccompagne(req, res, next) {
  const [u] = await db.select().from(utilisateurs).where(eq(utilisateurs.id, req.membre.utilisateurId))
  if (!u) return res.status(404).json({ erreur: 'Membre introuvable' })
  req.compte = u
  next()
}

router.post('/:cercleId/membres/:membreId/avatar/envoi', chargerCercle, exigerGestion, chargerAccompagne, async (req, res) => {
  res.json(await preparerEnvoi(req.membre.utilisateurId, req.body.taille))
})

router.put('/:cercleId/membres/:membreId/avatar', chargerCercle, exigerGestion, chargerAccompagne, chargerCompteAccompagne, async (req, res) => {
  res.json(await changerAvatar(req.compte, req.body.avatar))
})

router.delete('/:cercleId/membres/:membreId', chargerCercle, exigerGestion, async (req, res) => {
  const [membre] = await db.delete(membres)
    .where(and(eq(membres.id, req.params.membreId), eq(membres.cercleId, req.cercle.id)))
    .returning()
  if (!membre) return res.status(404).json({ erreur: 'Membre introuvable' })
  // Une personne accompagnée n'a pas d'autre moyen de connexion : on supprime son compte
  if (membre.role === 'accompagne' && membre.utilisateurId) {
    const [{ n }] = await db.select({ n: count() }).from(membres).where(eq(membres.utilisateurId, membre.utilisateurId))
    if (n === 0) {
      await supprimerFichiersDe(membre.utilisateurId).catch(() => {})
      const [u] = await db.delete(utilisateurs).where(eq(utilisateurs.id, membre.utilisateurId)).returning()
      // Sa photo de profil éventuelle est supprimée chez l'hébergeur
      if (u?.avatar) await changerAvatar(u, null).catch(() => {})
    }
  }
  res.status(204).end()
})

// Agenda du cercle (rendez-vous)
router.use('/:cercleId/rendez-vous', chargerCercle, routesAgenda)
router.use('/:cercleId/photos', chargerCercle, refuserAuxiliaires, routesPhotos)
router.use('/:cercleId/albums', chargerCercle, refuserAuxiliaires, routesAlbums)
router.use('/:cercleId/arbre', chargerCercle, routesArbre)

export default router
