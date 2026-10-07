import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { eq, inArray, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { parametres, voixIa } from '../db/schema.js'
import { journaliser } from '../journal.js'

// Commande vocale en langage naturel (option par cercle). Quand les mots-clés de
// server/voix/assistant.js ne comprennent rien, la phrase dite est envoyée à un petit modèle
// de Mistral (hébergé dans l'UE) qui choisit UNE intention dans la liste existante. Il ne
// répond jamais à la personne : le texte lu vient toujours de repondre().
// Seule la phrase est envoyée (ni agenda, ni famille, ni identité). La clé API est celle du
// cercle, saisie par l'administrateur global ; elle est chiffrée en base (AES-256-GCM).
const API = 'https://api.mistral.ai/v1/chat/completions'
export const MODELE_DEFAUT = 'ministral-8b-latest'
export class ErreurVoixIa extends Error {}
const CLE_SECRET = 'secret_chiffrement'

// Secret de chiffrement : VOIX_SECRET dans le .env s'il existe (la clé ne se lit alors pas
// avec la seule base de données), sinon un secret tiré au hasard et gardé dans la base.
async function secret() {
  if (process.env.VOIX_SECRET) return createHash('sha256').update(process.env.VOIX_SECRET).digest()
  const [ligne] = await db.select().from(parametres).where(eq(parametres.cle, CLE_SECRET))
  if (ligne) return Buffer.from(ligne.valeur.secret, 'hex')
  const nouveau = randomBytes(32)
  await db.insert(parametres).values({ cle: CLE_SECRET, valeur: { secret: nouveau.toString('hex') } }).onConflictDoNothing()
  const [relue] = await db.select().from(parametres).where(eq(parametres.cle, CLE_SECRET))
  return Buffer.from(relue.valeur.secret, 'hex')
}

export async function chiffrer(clair) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', await secret(), iv)
  const donnees = Buffer.concat([c.update(clair, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), donnees].map((b) => b.toString('base64')).join('.')
}

export async function dechiffrer(texte) {
  const [iv, etiquette, donnees] = texte.split('.').map((s) => Buffer.from(s, 'base64'))
  const d = createDecipheriv('aes-256-gcm', await secret(), iv)
  d.setAuthTag(etiquette)
  return Buffer.concat([d.update(donnees), d.final()]).toString('utf8')
}

export const apercuCle = (cle) => `…${cle.slice(-4)}`

// Configuration d'un cercle, sans la clé : { actif, cle: '…abcd', modele } ou null
export async function configurationPublique(cercleId) {
  const [l] = await db.select().from(voixIa).where(eq(voixIa.cercleId, cercleId))
  if (!l) return null
  return { actif: l.actif, cle: apercuCle(await dechiffrer(l.cleChiffree)), modele: l.modele }
}

// Premier des cercles donnés où l'option est active : { cercleId, cle, modele } ou null
export async function configurationActive(cerclesIds) {
  if (!cerclesIds.length) return null
  const [l] = await db.select().from(voixIa).where(and(inArray(voixIa.cercleId, cerclesIds), eq(voixIa.actif, true)))
  if (!l) return null
  try {
    return { cercleId: l.cercleId, cle: await dechiffrer(l.cleChiffree), modele: l.modele }
  } catch {
    journaliser('erreur', 'serveur', 'voix', 'Clé API du cercle illisible (secret de chiffrement changé ?)')
    return null
  }
}

async function appelMistral(cle, modele, messages) {
  let reponse
  try {
    reponse = await fetch(API, {
      method: 'POST',
      headers: { authorization: `Bearer ${cle}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ model: modele, messages, temperature: 0, max_tokens: 80, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(8000)
    })
  } catch {
    throw new ErreurVoixIa('Mistral est injoignable depuis le serveur')
  }
  const donnees = await reponse.json().catch(() => ({}))
  if (!reponse.ok) {
    const detail = typeof donnees.message === 'string' ? donnees.message : donnees.detail?.[0]?.msg ?? ''
    if (reponse.status === 401) throw new ErreurVoixIa('Clé API refusée par Mistral')
    if (reponse.status === 429) throw new ErreurVoixIa('Limite d\'utilisation Mistral atteinte')
    throw new ErreurVoixIa(`Mistral a refusé la demande (erreur ${reponse.status}) ${detail}`.trim())
  }
  return donnees.choices?.[0]?.message?.content ?? ''
}

// Vérifie une clé avec un appel minuscule
export async function verifierCle(cle, modele = MODELE_DEFAUT) {
  await appelMistral(cle, modele, [{ role: 'user', content: 'Réponds {"ok":true} en JSON.' }])
}

const CONSIGNE = `Tu aides une personne âgée à utiliser une application par la voix. Elle a dit une phrase (parfois mal reconnue ou mal formulée). Choisis l'action qui correspond le mieux.
Actions possibles :
- journee : son programme d'aujourd'hui, comment se passe la journée
- demain : le programme de demain
- heure : l'heure qu'il est
- date : le jour ou la date d'aujourd'hui
- agenda : ses prochains rendez-vous
- photos : voir des photos ou un album ; "sujet" = le nom ou le thème de l'album s'il est cité
- famille : voir sa famille
- personne : quand elle verra ou aura rendez-vous avec quelqu'un ; "sujet" = le prénom
- qui : demande qui est une personne ; "sujet" = le prénom
- messages : lire ses messages, ce qu'on lui a écrit
- accueil : revenir à l'accueil
- merci : remercier, arrêter, dire que c'est fini
- inconnue : rien de ce qui précède, ou phrase incompréhensible
Réponds uniquement en JSON : {"intention":"...","sujet":"..."} (sujet vide s'il n'y en a pas).`

// Demande à Mistral l'intention de la phrase. Renvoie { intention, sujet } ou null si le
// modèle ne sait pas ou si l'appel a échoué (erreur journalisée, les mots-clés restent le repli).
export async function deviner(config, phrase, intentions) {
  try {
    const brut = await appelMistral(config.cle, config.modele, [
      { role: 'system', content: CONSIGNE },
      { role: 'user', content: String(phrase).slice(0, 300) }
    ])
    const r = JSON.parse(brut)
    if (!intentions.includes(r.intention) || r.intention === 'inconnue') return null
    return { intention: r.intention, sujet: typeof r.sujet === 'string' ? r.sujet.slice(0, 60) : '' }
  } catch (e) {
    journaliser('avertissement', 'serveur', 'voix', `Commande en langage naturel : ${e.message}`)
    return null
  }
}
