import { Router } from 'express'
import crypto from 'node:crypto'
import { count, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { utilisateurs } from '../db/schema.js'
import { ouvrirSession } from '../auth/sessions.js'
import { invitationValide, accepterInvitation } from './invitations.js'
import { urlApplication } from '../url.js'

// Connexion avec un compte Google (OpenID Connect, flux « code » avec PKCE).
// Activée seulement si GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET sont définis.
const router = Router()
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
export const googleActif = Boolean(CLIENT_ID && CLIENT_SECRET)

const COOKIE = 'tu_google'
const CHEMIN_COOKIE = '/api/auth/google'
const base64url = (buf) => Buffer.from(buf).toString('base64url')

const urlRetour = (req) => `${urlApplication(req)}/api/auth/google/retour`

function lireCookie(req) {
  for (const morceau of (req.get('cookie') || '').split(';')) {
    const [nom, ...valeur] = morceau.trim().split('=')
    if (nom === COOKIE) {
      try { return JSON.parse(Buffer.from(valeur.join('='), 'base64url').toString()) } catch { return null }
    }
  }
  return null
}

// Chemin interne uniquement, pour éviter toute redirection vers un autre site
const cheminSur = (suite) => (typeof suite === 'string' && /^\/(?!\/)/.test(suite) ? suite : '/')
const echec = (res, message, page = '/connexion') =>
  res.redirect(`${page}?erreur=${encodeURIComponent(message)}`)

router.use((req, res, next) => {
  if (!googleActif) return res.status(404).json({ erreur: 'Connexion Google non configurée' })
  next()
})

// 1. Envoie l'utilisateur chez Google. mode : connexion, initialiser ou invitation (avec jeton)
router.get('/demarrer', (req, res) => {
  const etat = {
    state: base64url(crypto.randomBytes(24)),
    verifier: base64url(crypto.randomBytes(32)),
    mode: ['initialiser', 'invitation'].includes(req.query.mode) ? req.query.mode : 'connexion',
    jeton: typeof req.query.jeton === 'string' ? req.query.jeton : null,
    suite: cheminSur(req.query.suite)
  }
  res.cookie(COOKIE, base64url(JSON.stringify(etat)), {
    httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 10 * 60 * 1000, path: CHEMIN_COOKIE
  })
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: urlRetour(req),
    response_type: 'code',
    scope: 'openid email profile',
    state: etat.state,
    code_challenge: base64url(crypto.createHash('sha256').update(etat.verifier).digest()),
    code_challenge_method: 'S256',
    prompt: 'select_account'
  })
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

// 2. Retour de Google : échange du code, puis connexion, création du premier admin ou invitation
router.get('/retour', async (req, res) => {
  const etat = lireCookie(req)
  res.clearCookie(COOKIE, { path: CHEMIN_COOKIE })
  const pageErreur = etat?.mode === 'invitation' && etat.jeton ? `/invitation/${etat.jeton}` : '/connexion'
  if (!etat || !req.query.state || req.query.state !== etat.state) {
    return echec(res, 'La connexion Google a expiré, recommencez.')
  }
  if (req.query.error || !req.query.code) return echec(res, 'Connexion Google annulée.', pageErreur)

  const reponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(req.query.code),
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: urlRetour(req),
      grant_type: 'authorization_code',
      code_verifier: etat.verifier
    })
  })
  const jetons = await reponse.json().catch(() => ({}))
  if (!reponse.ok || !jetons.id_token) {
    console.error('Échec de l\'échange du code Google', jetons.error)
    return echec(res, 'Google a refusé la connexion, recommencez.', pageErreur)
  }
  // Jeton reçu directement de Google en HTTPS : on vérifie ses champs sans vérifier sa signature
  const profil = JSON.parse(Buffer.from(jetons.id_token.split('.')[1], 'base64url').toString())
  const valide = ['accounts.google.com', 'https://accounts.google.com'].includes(profil.iss) &&
    profil.aud === CLIENT_ID && profil.exp * 1000 > Date.now() && profil.sub
  if (!valide) return echec(res, 'Réponse de Google invalide.', pageErreur)
  if (!profil.email_verified) return echec(res, 'L\'adresse email de ce compte Google n\'est pas vérifiée.', pageErreur)
  const email = profil.email.toLowerCase()

  // Compte déjà lié à Google, sinon compte existant avec le même email (on le lie alors à Google)
  let [utilisateur] = await db.select().from(utilisateurs).where(eq(utilisateurs.googleId, profil.sub))
  if (!utilisateur) {
    [utilisateur] = await db.select().from(utilisateurs).where(eq(utilisateurs.email, email))
    if (utilisateur && !utilisateur.googleId) {
      [utilisateur] = await db.update(utilisateurs).set({ googleId: profil.sub }).where(eq(utilisateurs.id, utilisateur.id)).returning()
    }
  }
  if (utilisateur?.desactiveLe) return echec(res, 'Ce compte est désactivé.', pageErreur)

  const nouveau = {
    prenom: profil.given_name || profil.name || email.split('@')[0],
    nom: profil.family_name || null,
    email,
    googleId: profil.sub
  }
  let suite = etat.suite

  if (etat.mode === 'initialiser' && !utilisateur) {
    utilisateur = await db.transaction(async (tx) => {
      await tx.execute(sql`lock table utilisateurs in exclusive mode`)
      const [{ n }] = await tx.select({ n: count() }).from(utilisateurs)
      if (n > 0) return null
      const [u] = await tx.insert(utilisateurs).values({ ...nouveau, estAdmin: true }).returning()
      return u
    })
    if (!utilisateur) return echec(res, 'L\'application est déjà initialisée.')
  } else if (etat.mode === 'invitation') {
    const ligne = etat.jeton && await invitationValide(etat.jeton)
    if (!ligne) return echec(res, 'Cette invitation n\'est plus valable. Demandez-en une nouvelle.')
    utilisateur = await accepterInvitation(ligne.invitation, utilisateur, utilisateur ? null : nouveau)
    if (!utilisateur) return echec(res, 'Cette invitation vient d\'être utilisée.')
    suite = `/cercles/${ligne.invitation.cercleId}`
  } else if (!utilisateur) {
    return echec(res, `Aucun compte Trait d'union n'est associé à ${email}. Demandez une invitation à un aidant.`)
  }

  await ouvrirSession(res, req, utilisateur.id, 'google')
  res.redirect(suite)
})

export default router
