import { format } from 'node:util'
import { sql } from 'drizzle-orm'
import { db } from './db/index.js'

// Journal pour l'administrateur (Administration > Journal) : erreurs du serveur et du navigateur,
// gardées en base JOURS_CONSERVATION jours puis effacées. Les textes sont nettoyés avant d'être
// écrits : pas de mot de passe, de jeton, de clé, de lien signé ni d'adresse email complète, et
// jamais le contenu d'un message.

export const JOURS_CONSERVATION = 30
const MAX_LIGNES = 20000
export const NIVEAUX = ['info', 'avertissement', 'erreur']
export const SOURCES = ['serveur', 'navigateur']

const sortie = { error: console.error.bind(console), warn: console.warn.bind(console), log: console.log.bind(console) }

export function nettoyer(texte, max = 1000) {
  return String(texte ?? '')
    .replace(/(https?:\/\/[^\s?"')]+)\?[^\s"')]*/g, '$1?…') // liens signés : paramètres retirés
    .replace(/\b(Bearer|Basic)\s+[\w.~+/=-]+/gi, '$1 …')
    .replace(/\b(mot[_ ]?de[_ ]?passe|password|passwd|jeton|token|secret|cle[_ ]?(?:api|secrete|acces)?|api[-_ ]?key|authorization|cookie|code)\b(["']?\s*[:=]\s*["']?)[^\s,;"'}]+/gi, '$1$2…')
    .replace(/[\w.+-]+@([\w-]+\.[\w.-]+)/g, '***@$1')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '…')
    .slice(0, max)
}

// Anti-déluge : au plus 300 lignes par minute, le reste est compté puis ignoré
let minute = 0
let compte = 0
let ignorees = 0

export function journaliser(niveau, source, module, message, { details, utilisateurId } = {}) {
  const sortieConsole = niveau === 'erreur' ? sortie.error : niveau === 'avertissement' ? sortie.warn : sortie.log
  sortieConsole(`[${module}] ${nettoyer(message, 500)}`, ...(details ? [nettoyer(details, 4000)] : []))
  const maintenant = Math.floor(Date.now() / 60000)
  if (maintenant !== minute) {
    if (ignorees) sortie.warn(`[Journal] ${ignorees} ligne(s) ignorée(s) (trop d'événements en une minute)`)
    minute = maintenant
    compte = 0
    ignorees = 0
  }
  if (++compte > 300) { ignorees++; return }
  return db.execute(sql`
    insert into journal (niveau, source, module, message, details, utilisateur_id)
    values (${NIVEAUX.includes(niveau) ? niveau : 'erreur'}, ${SOURCES.includes(source) ? source : 'serveur'},
      ${nettoyer(module, 40).toLowerCase() || 'serveur'}, ${nettoyer(message, 500)},
      ${details ? nettoyer(details, 4000) : null}, ${utilisateurId ?? null})
  `).catch((e) => sortie.error('[Journal] Écriture impossible :', e.message))
}

// Module d'après le chemin d'une route : /api/cercles/<id>/photos → « photos »
const MODULES_ROUTES = { photos: 'photos', albums: 'photos', messagerie: 'messagerie', agenda: 'agenda', alertes: 'alertes', auth: 'connexion', voix: 'voix', profil: 'profil', arbre: 'arbre', admin: 'administration', invitations: 'invitations' }
export function moduleDeRoute(chemin) {
  for (const segment of chemin.split('/')) if (MODULES_ROUTES[segment]) return MODULES_ROUTES[segment]
  return 'serveur'
}
export const cheminSansId = (chemin) => chemin.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')

// Erreur d'une requête, avec la route concernée
export function journaliserRequete(niveau, req, err) {
  const chemin = cheminSansId(req.originalUrl.split('?')[0])
  return journaliser(niveau, 'serveur', moduleDeRoute(chemin), `${req.method} ${chemin} : ${err.message}`, {
    details: err.stack, utilisateurId: req.utilisateur?.id
  })
}

// Tout ce que le code existant écrit avec console.error / console.warn va aussi au journal.
// Le préfixe « [Module] » ou « Module ... : » donne le module.
export function installerJournal() {
  const capter = (niveau) => (...args) => {
    const texte = format(...args)
    if (texte.startsWith('[Journal]')) return sortie[niveau === 'erreur' ? 'error' : 'warn'](...args)
    const m = texte.match(/^\[([^\]]+)\]\s*/)
    const module = m ? m[1] : (texte.match(/^([^:(]{2,30}?)\s*(?:\(|:)/)?.[1] ?? 'serveur')
    const reste = m ? texte.slice(m[0].length) : texte
    const [premiere, ...suite] = reste.split('\n')
    journaliser(niveau, 'serveur', module, premiere, { details: suite.length ? suite.join('\n') : undefined })
  }
  console.error = capter('erreur')
  console.warn = capter('avertissement')
}

// Purge : au-delà de la durée de conservation ou des MAX_LIGNES dernières lignes
export async function purgerJournal() {
  await db.execute(sql`delete from journal where cree_le < now() - make_interval(days => ${JOURS_CONSERVATION})`)
  await db.execute(sql`delete from journal where id in (select id from journal order by cree_le desc offset ${MAX_LIGNES})`)
}

export function demarrerJournal() {
  const purge = () => purgerJournal().catch((e) => sortie.error('[Journal] Purge :', e.message))
  purge()
  setInterval(purge, 60 * 60 * 1000).unref()
}
