import crypto from 'node:crypto'
import webpush from 'web-push'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { parametres, appareilsAlertes, utilisateurs } from '../db/schema.js'
import { ErreurSaisie } from '../auth/validation.js'
import { compter } from '../statistiques.js'

// Envoi des alertes sur les appareils où elles sont activées :
// - navigateurs et PWA par Web Push (norme du web, clés VAPID créées au premier démarrage et
//   gardées en base, clé « push » : rien à configurer) ;
// - application Android par Firebase Cloud Messaging (une WebView Android ne reçoit pas le
//   Web Push). Le compte de service Firebase est saisi par un administrateur (/admin/alertes)
//   et gardé en base, clé « firebase ».

export class ErreurAlertes extends Error {}

async function lireParametre(cle) {
  const [ligne] = await db.select().from(parametres).where(eq(parametres.cle, cle))
  return ligne?.valeur ?? null
}

async function ecrireParametre(cle, valeur) {
  await db.insert(parametres).values({ cle, valeur })
    .onConflictDoUpdate({ target: parametres.cle, set: { valeur, modifieLe: new Date() } })
}

// --- Web Push

let vapid = null
export async function clesVapid() {
  if (vapid) return vapid
  let cles = await lireParametre('push')
  if (!cles?.publicKey) {
    cles = webpush.generateVAPIDKeys()
    await ecrireParametre('push', cles)
    // Un autre démarrage a pu écrire en même temps : on relit la valeur gardée
    cles = await lireParametre('push')
  }
  vapid = cles
  return vapid
}

// Contact demandé par les services de notification (Google, Mozilla, Apple)
async function sujetVapid() {
  if (process.env.APP_URL?.startsWith('https://')) return process.env.APP_URL.replace(/\/$/, '')
  const [admin] = await db.select({ email: utilisateurs.email }).from(utilisateurs).where(eq(utilisateurs.estAdmin, true)).limit(1)
  return `mailto:${admin?.email || 'alertes@trait-union.fr'}`
}

async function envoyerWeb(appareil, alerte, options) {
  const cles = await clesVapid()
  try {
    await webpush.sendNotification(
      { endpoint: appareil.adresse, keys: appareil.cles },
      JSON.stringify(alerte),
      {
        vapidDetails: { subject: await sujetVapid(), publicKey: cles.publicKey, privateKey: cles.privateKey },
        TTL: options.duree,
        urgency: options.urgent ? 'high' : 'normal',
        timeout: 15000
      }
    )
    return 'ok'
  } catch (e) {
    // Abonnement expiré ou retiré par le navigateur
    if (e.statusCode === 404 || e.statusCode === 410) return 'perime'
    throw new ErreurAlertes(`Web Push : ${e.statusCode ?? ''} ${e.body || e.message}`.trim())
  }
}

// --- Firebase Cloud Messaging (application Android)

export async function lireFirebase() {
  return { actif: false, compte: null, ...await lireParametre('firebase') }
}

export async function enregistrerFirebase(config) {
  jetonGoogle = null
  await ecrireParametre('firebase', config)
}

export async function firebaseActif() {
  const c = await lireFirebase()
  return Boolean(c.actif && c.compte)
}

// Vérifie le fichier JSON du compte de service (téléchargé depuis la console Firebase)
export function lireCompteService(texte) {
  let compte
  try {
    compte = typeof texte === 'string' ? JSON.parse(texte) : texte
  } catch {
    throw new ErreurSaisie('Ce n\'est pas un fichier JSON valide')
  }
  if (compte?.type !== 'service_account' || !compte.project_id || !compte.client_email || !compte.private_key) {
    throw new ErreurSaisie('Ce fichier n\'est pas une clé de compte de service Firebase (type « service_account »)')
  }
  return { project_id: compte.project_id, client_email: compte.client_email, private_key: compte.private_key }
}

const base64url = (donnees) => Buffer.from(donnees).toString('base64url')

// Jeton d'accès OAuth 2 de Google, obtenu en signant un JWT avec la clé du compte de service
let jetonGoogle = null // { compte, jeton, expire }
async function jetonAcces(compte) {
  if (jetonGoogle?.compte === compte.client_email && jetonGoogle.expire > Date.now() + 60_000) return jetonGoogle.jeton
  const maintenant = Math.floor(Date.now() / 1000)
  const entete = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const contenu = base64url(JSON.stringify({
    iss: compte.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: maintenant,
    exp: maintenant + 3600
  }))
  let signature
  try {
    signature = crypto.createSign('RSA-SHA256').update(`${entete}.${contenu}`).sign(compte.private_key, 'base64url')
  } catch {
    throw new ErreurAlertes('La clé privée du compte de service est illisible')
  }
  let reponse
  try {
    reponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${entete}.${contenu}.${signature}` }),
      signal: AbortSignal.timeout(15000)
    })
  } catch {
    throw new ErreurAlertes('Google est injoignable depuis le serveur')
  }
  const donnees = await reponse.json().catch(() => ({}))
  if (!reponse.ok) throw new ErreurAlertes(`Google refuse le compte de service : ${donnees.error_description || donnees.error || reponse.status}`)
  jetonGoogle = { compte: compte.client_email, jeton: donnees.access_token, expire: Date.now() + donnees.expires_in * 1000 }
  return jetonGoogle.jeton
}

// Vérifie le compte de service auprès de Google (sans rien envoyer)
export async function verifierFirebase(compte) {
  jetonGoogle = null
  await jetonAcces(compte)
  return { projet: compte.project_id }
}

async function envoyerAndroid(appareil, alerte, options) {
  const { compte } = await lireFirebase()
  if (!compte) return 'ignore'
  const jeton = await jetonAcces(compte)
  // Message « data » seulement : l'application construit elle-même la notification
  // (canal, icône, page à ouvrir), qu'elle soit ouverte ou non
  const data = Object.fromEntries(Object.entries(alerte).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
  let reponse
  try {
    reponse = await fetch(`https://fcm.googleapis.com/v1/projects/${compte.project_id}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: { token: appareil.adresse, data, android: { priority: options.urgent ? 'HIGH' : 'NORMAL', ttl: `${options.duree}s` } } }),
      signal: AbortSignal.timeout(15000)
    })
  } catch {
    throw new ErreurAlertes('Firebase est injoignable depuis le serveur')
  }
  if (reponse.ok) return 'ok'
  const erreur = (await reponse.json().catch(() => ({}))).error ?? {}
  const code = erreur.details?.find((d) => d.errorCode)?.errorCode
  // Application désinstallée ou jeton remplacé
  if (code === 'UNREGISTERED' || (code === 'INVALID_ARGUMENT' && /registration token/i.test(erreur.message ?? ''))) return 'perime'
  throw new ErreurAlertes(`Firebase : ${erreur.message || reponse.status}`)
}

// --- Envoi

// Catégories d'alertes (préférences de chaque personne, utilisateurs.alertes)
export const CATEGORIES = ['rendezVous', 'photos', 'anniversaires', 'application', 'messages']

// Envoie une alerte à des personnes, sur tous leurs appareils, si elles ont gardé la catégorie.
// alerte : { categorie, titre, corps, url (chemin dans l'application), tag, image }
// options : { duree (secondes de validité si l'appareil est hors ligne), urgent }
export async function envoyerAlerte(utilisateurIds, alerte, options = {}) {
  if (!utilisateurIds.length) return { envoyes: 0 }
  const opts = { duree: 6 * 3600, urgent: false, ...options }
  const lignes = await db.select({ appareil: appareilsAlertes, alertes: utilisateurs.alertes })
    .from(appareilsAlertes)
    .innerJoin(utilisateurs, eq(appareilsAlertes.utilisateurId, utilisateurs.id))
    .where(inArray(appareilsAlertes.utilisateurId, [...new Set(utilisateurIds)]))
  return envoyerAux(lignes.filter((l) => !alerte.categorie || l.alertes?.[alerte.categorie] !== false).map((l) => l.appareil), alerte, opts)
}

// Envoie à une liste d'appareils ; retire ceux dont l'abonnement n'existe plus
export async function envoyerAux(appareils, alerte, options = { duree: 3600, urgent: true }) {
  const perimes = []
  const erreurs = []
  let envoyes = 0
  await Promise.all(appareils.map(async (a) => {
    try {
      const resultat = a.type === 'web' ? await envoyerWeb(a, alerte, options) : await envoyerAndroid(a, alerte, options)
      if (resultat === 'perime') perimes.push(a.id)
      if (resultat === 'ok') envoyes++
    } catch (e) {
      erreurs.push(e.message)
    }
  }))
  if (perimes.length) await db.delete(appareilsAlertes).where(inArray(appareilsAlertes.id, perimes))
  compter('alertes', null, envoyes) // statistiques : alertes reçues par jour
  if (erreurs.length) console.error('Alertes :', [...new Set(erreurs)].join(' ; '))
  return { envoyes, perimes: perimes.length, erreurs: [...new Set(erreurs)] }
}
