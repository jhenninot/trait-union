import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { parametres } from '../db/schema.js'

// Stockage des photos chez un hébergeur compatible S3 (par défaut OVHcloud Object Storage,
// Paris 3-AZ). Le serveur ne reçoit jamais les fichiers : il signe des liens temporaires
// (signature AWS v4, faite ici sans dépendance) avec lesquels le navigateur envoie et
// affiche les photos directement chez l'hébergeur.
// La configuration est saisie par un administrateur et stockée dans parametres, clé « stockage ».
const CLE = 'stockage'

export class ErreurStockage extends Error {}

export const configurationParDefaut = {
  actif: false,
  endpoint: 'https://s3.eu-west-par.io.cloud.ovh.net',
  region: 'eu-west-par',
  bucket: '',
  cleAcces: '',
  cleSecrete: ''
}

export async function lireConfiguration() {
  const [ligne] = await db.select().from(parametres).where(eq(parametres.cle, CLE))
  return { ...configurationParDefaut, ...ligne?.valeur }
}

export async function enregistrerConfiguration(valeur) {
  await db.insert(parametres).values({ cle: CLE, valeur })
    .onConflictDoUpdate({ target: parametres.cle, set: { valeur, modifieLe: new Date() } })
}

export const configurationComplete = (c) => Boolean(c.endpoint && c.region && c.bucket && c.cleAcces && c.cleSecrete)

// Configuration active, ou null si le partage de photos n'est pas activé
export async function stockageActif() {
  const c = await lireConfiguration()
  return c.actif && configurationComplete(c) ? c : null
}

// --- Signature AWS v4 (https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html)

const sha256 = (donnees) => crypto.createHash('sha256').update(donnees).digest('hex')
const hmac = (cle, donnees) => crypto.createHmac('sha256', cle).update(donnees).digest()
// Encodage URI imposé par AWS (RFC 3986 strict)
const encoder = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

function horodatage(date) {
  const amzDate = date.toISOString().replace(/[-:]|\.\d{3}/g, '')
  return { amzDate, jour: amzDate.slice(0, 8) }
}

// Adresse « path-style » : https://endpoint/bucket/cle
function adresse(c, cle = '') {
  const base = new URL(c.endpoint)
  const chemin = `${base.pathname.replace(/\/$/, '')}/${encoder(c.bucket)}${cle ? '/' + cle.split('/').map(encoder).join('/') : ''}`
  return { hote: base.host, origine: base.origin, chemin }
}

function signature(c, { methode, chemin, query, entetes, empreinteCorps, amzDate, jour }) {
  const noms = Object.keys(entetes).map((n) => n.toLowerCase()).sort()
  const valeurs = Object.fromEntries(Object.entries(entetes).map(([n, v]) => [n.toLowerCase(), String(v).trim()]))
  const signes = noms.join(';')
  if ('X-Amz-SignedHeaders' in query) query['X-Amz-SignedHeaders'] = signes
  const qs = Object.keys(query).map((k) => [encoder(k), encoder(query[k])]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`).join('&')
  const canonique = [methode, chemin, qs, noms.map((n) => `${n}:${valeurs[n]}\n`).join(''), signes, empreinteCorps].join('\n')
  const portee = `${jour}/${c.region}/s3/aws4_request`
  const aSigner = ['AWS4-HMAC-SHA256', amzDate, portee, sha256(canonique)].join('\n')
  let cle = hmac('AWS4' + c.cleSecrete, jour)
  for (const partie of [c.region, 's3', 'aws4_request']) cle = hmac(cle, partie)
  return { signature: crypto.createHmac('sha256', cle).update(aSigner).digest('hex'), signes, qs, portee }
}

// Lien signé valable `duree` secondes, utilisable directement par le navigateur.
// `entetes` : en-têtes que la requête devra porter à l'identique (ex. content-type, content-length).
// `date` permet d'arrondir l'heure de signature pour que le lien reste identique un moment
// (le navigateur garde alors l'image en cache).
export function lienSigne(c, methode, cle, { duree = 3600, entetes = {}, query = {}, date = new Date() } = {}) {
  const { hote, origine, chemin } = adresse(c, cle)
  const { amzDate, jour } = horodatage(date)
  const q = {
    ...query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${c.cleAcces}/${jour}/${c.region}/s3/aws4_request`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(duree),
    'X-Amz-SignedHeaders': ''
  }
  const s = signature(c, { methode, chemin, query: q, entetes: { host: hote, ...entetes }, empreinteCorps: 'UNSIGNED-PAYLOAD', amzDate, jour })
  return `${origine}${chemin}?${s.qs}&X-Amz-Signature=${s.signature}`
}

// Requête signée faite par le serveur lui-même (vérification, suppression, CORS)
async function requete(c, methode, cle, { query = {}, corps = '', entetes = {} } = {}) {
  const { hote, origine, chemin } = adresse(c, cle)
  const { amzDate, jour } = horodatage(new Date())
  const empreinteCorps = sha256(corps)
  const tous = { host: hote, 'x-amz-date': amzDate, 'x-amz-content-sha256': empreinteCorps, ...entetes }
  const s = signature(c, { methode, chemin, query, entetes: tous, empreinteCorps, amzDate, jour })
  const { host, ...aEnvoyer } = tous
  // Réessais avec délai croissant : une connexion réutilisée coupée par l'hébergeur ou une
  // coupure brève ne doivent pas faire échouer l'envoi d'une photo.
  const DELAIS = [400, 1200, 3000]
  let derniereErreur
  for (let essai = 0; essai <= DELAIS.length; essai++) {
    if (essai > 0) await new Promise((r) => setTimeout(r, DELAIS[essai - 1]))
    try {
      const reponse = await fetch(`${origine}${chemin}${s.qs ? '?' + s.qs : ''}`, {
        method: methode,
        headers: {
          ...aEnvoyer,
          authorization: `AWS4-HMAC-SHA256 Credential=${c.cleAcces}/${s.portee}, SignedHeaders=${s.signes}, Signature=${s.signature}`
        },
        body: corps || undefined,
        signal: AbortSignal.timeout(15000)
      })
      if ((reponse.status >= 500 || reponse.status === 429) && essai < DELAIS.length) {
        await reponse.arrayBuffer().catch(() => {})
        continue
      }
      return reponse
    } catch (e) {
      derniereErreur = e
      console.error(`Stockage ${methode} ${hote} (essai ${essai + 1}) :`, e.cause?.code || e.name, e.message)
    }
  }
  throw new ErreurStockage(`Le stockage (${hote}) est injoignable depuis le serveur`)
}

async function detailErreur(reponse) {
  const texte = await reponse.text().catch(() => '')
  const code = texte.match(/<Code>([^<]+)<\/Code>/)?.[1]
  const message = texte.match(/<Message>([^<]+)<\/Message>/)?.[1]
  return [code, message].filter(Boolean).join(' : ') || `erreur ${reponse.status}`
}

async function verifierReponse(reponse, action) {
  if (reponse.ok) return
  const detail = await detailErreur(reponse)
  if (reponse.status === 403) throw new ErreurStockage(`Accès refusé pour ${action} : vérifiez les clés et les droits de l'utilisateur S3. Détail : ${detail}`)
  if (reponse.status === 404) throw new ErreurStockage(`Conteneur introuvable pour ${action} : vérifiez son nom, l'adresse et la région. Détail : ${detail}`)
  throw new ErreurStockage(`Le stockage a refusé ${action}. Détail : ${detail}`)
}

// Vrai si l'objet existe ; renvoie sa taille
export async function infoObjet(c, cle) {
  let reponse = await requete(c, 'HEAD', cle)
  // L'objet vient d'être déposé : on laisse un instant à l'hébergeur pour le rendre visible
  for (const delai of [500, 1500]) {
    if (reponse.status !== 404) break
    await new Promise((r) => setTimeout(r, delai))
    reponse = await requete(c, 'HEAD', cle)
  }
  if (reponse.status === 404) return null
  await verifierReponse(reponse, 'la lecture d\'une photo')
  return { taille: Number(reponse.headers.get('content-length')) }
}

export async function supprimerObjet(c, cle) {
  const reponse = await requete(c, 'DELETE', cle)
  if (reponse.status !== 404) await verifierReponse(reponse, 'la suppression d\'une photo')
}

// Autorise le navigateur à envoyer et lire les photos depuis l'adresse de l'application
async function configurerCors(c, origines) {
  const corps = '<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration><CORSRule>' +
    origines.map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`).join('') +
    '<AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod><AllowedMethod>HEAD</AllowedMethod>' +
    '<AllowedHeader>*</AllowedHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule></CORSConfiguration>'
  const md5 = crypto.createHash('md5').update(corps).digest('base64')
  const reponse = await requete(c, 'PUT', '', { query: { cors: '' }, corps, entetes: { 'content-md5': md5, 'content-type': 'application/xml' } })
  await verifierReponse(reponse, 'la configuration CORS')
}

// Vérifie de bout en bout une configuration : accès au conteneur, écriture et suppression
// d'un fichier de test, puis règle CORS pour l'adresse de l'application.
export async function verifierStockage(c, origineApplication) {
  if (!configurationComplete(c)) throw new ErreurStockage('Renseignez l\'adresse, la région, le conteneur et les deux clés')
  await verifierReponse(await requete(c, 'HEAD', ''), 'l\'accès au conteneur')
  const test = `test/trait-union-${Date.now()}.txt`
  await verifierReponse(await requete(c, 'PUT', test, { corps: 'test', entetes: { 'content-type': 'text/plain' } }), 'l\'écriture d\'un fichier de test')
  await supprimerObjet(c, test)
  await configurerCors(c, [origineApplication])
  return { origine: origineApplication }
}
