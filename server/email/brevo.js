import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { parametres } from '../db/schema.js'

// Envoi d'emails transactionnels avec l'API de Brevo (https://developers.brevo.com).
// La configuration (clé API, expéditeur) est saisie par un administrateur et
// stockée en base dans parametres, clé « email ».
const API = 'https://api.brevo.com/v3'
const CLE = 'email'

export class ErreurEmail extends Error {}

export async function lireConfiguration() {
  const [ligne] = await db.select().from(parametres).where(eq(parametres.cle, CLE))
  return { actif: false, cleApi: '', expediteurEmail: '', expediteurNom: 'Trait d\'union', ...ligne?.valeur }
}

export async function enregistrerConfiguration(valeur) {
  await db.insert(parametres).values({ cle: CLE, valeur })
    .onConflictDoUpdate({ target: parametres.cle, set: { valeur, modifieLe: new Date() } })
}

export async function emailActif() {
  const c = await lireConfiguration()
  return Boolean(c.actif && c.cleApi && c.expediteurEmail)
}

async function appelBrevo(cleApi, methode, chemin, corps) {
  let reponse
  try {
    reponse = await fetch(API + chemin, {
      method: methode,
      headers: { 'api-key': cleApi, accept: 'application/json', ...(corps && { 'content-type': 'application/json' }) },
      body: corps ? JSON.stringify(corps) : undefined,
      signal: AbortSignal.timeout(15000)
    })
  } catch {
    throw new ErreurEmail('Brevo est injoignable depuis le serveur')
  }
  const donnees = await reponse.json().catch(() => ({}))
  if (!reponse.ok) {
    const message = donnees.message || `erreur ${reponse.status}`
    if (reponse.status === 401 && /ip/i.test(message)) {
      throw new ErreurEmail(`Brevo refuse l'adresse IP du serveur : autorisez-la dans Brevo (Sécurité → IP autorisées). Détail : ${message}`)
    }
    if (reponse.status === 401) throw new ErreurEmail(`Clé API refusée par Brevo. Détail : ${message}`)
    throw new ErreurEmail(`Brevo a refusé la demande. Détail : ${message}`)
  }
  return donnees
}

// Vérifie une clé API et renvoie le compte Brevo et ses expéditeurs
export async function verifierCompte(cleApi) {
  const compte = await appelBrevo(cleApi, 'GET', '/account')
  const { senders = [] } = await appelBrevo(cleApi, 'GET', '/senders').catch(() => ({}))
  return {
    email: compte.email,
    entreprise: compte.companyName,
    expediteurs: senders.map((s) => ({ email: s.email, nom: s.name, actif: s.active }))
  }
}

// Envoie un email. `a` : { email, nom }. Lève ErreurEmail si l'envoi n'est pas configuré ou échoue.
// `piecesJointes` : [{ nom, contenu (base64) }] ; `repondreA` : { email, nom } (adresse de réponse).
export async function envoyerEmail({ a, sujet, html, texte, piecesJointes, repondreA }, config = null) {
  const c = config ?? await lireConfiguration()
  if (!config && !c.actif) throw new ErreurEmail('L\'envoi d\'emails n\'est pas activé')
  if (!c.cleApi || !c.expediteurEmail) throw new ErreurEmail('L\'envoi d\'emails n\'est pas configuré')
  return appelBrevo(c.cleApi, 'POST', '/smtp/email', {
    sender: { email: c.expediteurEmail, name: c.expediteurNom || 'Trait d\'union' },
    to: [a.nom ? { email: a.email, name: a.nom } : { email: a.email }],
    subject: sujet,
    htmlContent: html,
    textContent: texte,
    ...(repondreA && { replyTo: repondreA.nom ? { email: repondreA.email, name: repondreA.nom } : { email: repondreA.email } }),
    ...(piecesJointes?.length && { attachment: piecesJointes.map((p) => ({ name: p.nom, content: p.contenu })) })
  })
}

const echapper = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// Mise en page commune des emails : un titre, des paragraphes et éventuellement un bouton
export function gabarit({ titre, paragraphes, bouton }) {
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#faf8f5;font-family:system-ui,sans-serif;color:#2b2b2b">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#fff;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;color:#2f8f6b;font-weight:700">Trait d'union</p>
<h1 style="margin:0 0 16px;font-size:1.3rem;color:#23305a">${echapper(titre)}</h1>
${paragraphes.map((p) => `<p style="line-height:1.5">${echapper(p)}</p>`).join('\n')}
${bouton ? `<p style="margin:24px 0"><a href="${echapper(bouton.lien)}" style="background:#2f8f6b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${echapper(bouton.texte)}</a></p>
<p style="color:#6b6b78;font-size:0.85rem">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${echapper(bouton.lien)}</p>` : ''}
</div>
<p style="color:#6b6b78;font-size:0.8rem;text-align:center">Trait d'union · Le lien entre toi et les tiens</p>
</div></body></html>`
  const texte = [titre, '', ...paragraphes, ...(bouton ? ['', `${bouton.texte} : ${bouton.lien}`] : [])].join('\n')
  return { html, texte }
}
