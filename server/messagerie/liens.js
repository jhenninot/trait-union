import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import net from 'node:net'
import zlib from 'node:zlib'

// Aperçu des liens collés dans un message, comme WhatsApp : le serveur lit la page (titre,
// description, image, nom du site, balises Open Graph) juste après l'envoi.
//
// Sécurité : c'est le serveur qui va chercher la page, donc un lien ne doit jamais lui faire
// interroger le réseau local (box, Proxmox, Home Assistant…) ni lui-même. Chaque connexion,
// redirections comprises, passe par `lookupSur` qui refuse les adresses privées, et se fait sur
// l'adresse vérifiée (pas de seconde résolution DNS). Ports 80 et 443 seulement, temps et taille
// limités.

const DELAI = 6000
const REDIRECTIONS = 3
const MAX_PAGE = 1_000_000
const MAX_IMAGE = 2_000_000
const AGENT = 'Mozilla/5.0 (compatible; TraitUnion/1.0; apercu de lien)'
const TYPES_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const interdites = new net.BlockList()
for (const [adresse, prefixe] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) interdites.addSubnet(adresse, prefixe, 'ipv4')
for (const [adresse, prefixe] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32]]) {
  interdites.addSubnet(adresse, prefixe, 'ipv6')
}

export function adresseInterdite(ip) {
  if (net.isIPv4(ip)) return interdites.check(ip, 'ipv4')
  if (!net.isIPv6(ip)) return true
  // IPv4 écrite en IPv6 (::ffff:192.168.1.1)
  const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1]
  return v4 ? interdites.check(v4, 'ipv4') : interdites.check(ip, 'ipv6')
}

function lookupSur(hote, options, rappel) {
  dns.lookup(hote, { all: true }, (erreur, adresses) => {
    if (erreur) return rappel(erreur)
    const sures = adresses.filter((a) => !adresseInterdite(a.address))
    if (!sures.length || sures.length !== adresses.length) return rappel(new Error('Adresse interdite'))
    if (options?.all) return rappel(null, sures)
    rappel(null, sures[0].address, sures[0].family)
  })
}

export function urlAutorisee(texte) {
  let url
  try {
    url = new URL(texte)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
  if (url.port && !['80', '443'].includes(url.port)) return null
  // Une adresse IP écrite telle quelle est vérifiée ici ; un nom l'est à la connexion
  const hote = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(hote) && adresseInterdite(hote)) return null
  if (hote === 'localhost' || hote.endsWith('.localhost') || hote.endsWith('.local') || hote.endsWith('.lan') || hote.endsWith('.internal')) return null
  return url
}

// GET limité : { statut, type, corps (Buffer), url (après redirections) }
function telecharger(adresse, { max, accept }, reste = REDIRECTIONS) {
  return new Promise((resolve, reject) => {
    const url = urlAutorisee(adresse)
    if (!url) return reject(new Error('Lien refusé'))
    const module = url.protocol === 'https:' ? https : http
    const requete = module.get(url, {
      lookup: lookupSur,
      timeout: DELAI,
      headers: { 'User-Agent': AGENT, Accept: accept, 'Accept-Language': 'fr-FR,fr;q=0.9', 'Accept-Encoding': 'gzip, deflate, br' }
    }, (reponse) => {
      const { statusCode: statut, headers } = reponse
      if (statut >= 300 && statut < 400 && headers.location) {
        reponse.resume()
        if (!reste) return reject(new Error('Trop de redirections'))
        return resolve(telecharger(new URL(headers.location, url).href, { max, accept }, reste - 1))
      }
      if (statut !== 200) {
        reponse.resume()
        return reject(new Error(`Réponse ${statut}`))
      }
      const codage = String(headers['content-encoding'] ?? '').toLowerCase()
      const flux = codage === 'gzip' ? reponse.pipe(zlib.createGunzip())
        : codage === 'deflate' ? reponse.pipe(zlib.createInflate())
          : codage === 'br' ? reponse.pipe(zlib.createBrotliDecompress())
            : reponse
      const morceaux = []
      let taille = 0
      flux.on('data', (m) => {
        taille += m.length
        if (taille > max) {
          // Une page trop longue : on garde le début (les balises meta sont dans <head>)
          morceaux.push(m)
          requete.destroy()
          flux.emit('end')
          return
        }
        morceaux.push(m)
      })
      flux.on('end', () => resolve({ statut, type: String(headers['content-type'] ?? ''), corps: Buffer.concat(morceaux).subarray(0, max), url: url.href }))
      flux.on('error', reject)
    })
    requete.on('timeout', () => requete.destroy(new Error('Délai dépassé')))
    requete.on('error', reject)
  })
}

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', icirc: 'î', rsquo: '’', lsquo: '‘', hellip: '…', laquo: '«', raquo: '»', ndash: '–', mdash: '—' }
const decoder = (t) => t
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (e, n) => ENTITES[n.toLowerCase()] ?? e)
const propre = (t, max) => {
  const s = decoder(String(t ?? '')).replace(/\s+/g, ' ').trim()
  return s ? (s.length > max ? `${s.slice(0, max - 1)}…` : s) : null
}

function texteDe(page) {
  const charset = page.type.match(/charset=([\w-]+)/i)?.[1]
    ?? page.corps.subarray(0, 4000).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1]
    ?? 'utf-8'
  try {
    return new TextDecoder(charset.toLowerCase()).decode(page.corps)
  } catch {
    return new TextDecoder('utf-8').decode(page.corps)
  }
}

export function lireBalises(html, urlPage) {
  const meta = {}
  for (const balise of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = (nom) => balise.match(new RegExp(`\\b${nom}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
    const cle = attr('property') ?? attr('name')
    const contenu = attr('content')
    if (!cle || !contenu) continue
    const k = (cle[2] ?? cle[3] ?? cle[4]).toLowerCase()
    if (!(k in meta)) meta[k] = contenu[2] ?? contenu[3] ?? contenu[4]
  }
  const titrePage = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  let image = meta['og:image:secure_url'] ?? meta['og:image'] ?? meta['twitter:image'] ?? meta['twitter:image:src'] ?? null
  if (image) {
    try {
      image = new URL(decoder(image), urlPage).href
    } catch {
      image = null
    }
  }
  return {
    titre: propre(meta['og:title'] ?? meta['twitter:title'] ?? titrePage, 200),
    description: propre(meta['og:description'] ?? meta['twitter:description'] ?? meta.description, 300),
    site: propre(meta['og:site_name'], 80) ?? new URL(urlPage).hostname.replace(/^www\./, ''),
    image: image && urlAutorisee(image) ? image : null
  }
}

// Premier lien http(s) d'un texte, sans la ponctuation qui le suit
export function premierLien(texte) {
  const brut = String(texte ?? '').match(/https?:\/\/[^\s<>"']+/i)?.[0]
  return brut ? brut.replace(/[).,;:!?»]+$/, '') : null
}

// Aperçu d'un lien : { url, titre, description, site, image (adresse d'origine) } ou null
export async function apercuDe(lien) {
  const url = urlAutorisee(lien)
  if (!url) return null
  try {
    const page = await telecharger(url.href, { max: MAX_PAGE, accept: 'text/html,application/xhtml+xml' })
    if (!/html/i.test(page.type)) return null
    const b = lireBalises(texteDe(page), page.url)
    if (!b.titre && !b.description && !b.image) return null
    return { url: url.href, ...b }
  } catch {
    return null
  }
}

// Image de l'aperçu, relayée par le serveur (le site ne voit pas qui lit le message). Petit cache
// en mémoire : une image est demandée par chaque personne qui ouvre la conversation.
const cache = new Map() // url → { type, corps, le }
const CACHE_MAX = 60
const CACHE_DUREE = 6 * 3600_000
export async function imageDe(url) {
  const deja = cache.get(url)
  if (deja && Date.now() - deja.le < CACHE_DUREE) return deja
  const r = await telecharger(url, { max: MAX_IMAGE, accept: 'image/webp,image/jpeg,image/png,image/gif' })
  const type = r.type.split(';')[0].trim().toLowerCase()
  if (!TYPES_IMAGE.includes(type) || r.corps.length >= MAX_IMAGE) throw new Error('Image refusée')
  const image = { type, corps: r.corps, le: Date.now() }
  cache.set(url, image)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
  return image
}
