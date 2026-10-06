import { ErreurSaisie } from './auth/validation.js'
import { gabarit } from './email/brevo.js'

// Signalement de bug par un utilisateur : validation du formulaire et des captures d'écran, puis
// mise en forme de l'email envoyé aux administrateurs (route POST /api/signalements).
// Le contenu saisi n'est jamais écrit dans le journal.

export const MAX_PIECES = 3
export const MAX_PIECE_OCTETS = 2 * 1024 * 1024
export const MAX_TOTAL_OCTETS = 3 * 1024 * 1024 // Brevo limite les pièces jointes à 4 Mo en tout
const MAX_TEXTE = 5000

// Types acceptés, reconnus à leurs premiers octets (on ne se fie pas au type annoncé)
const SIGNATURES = [
  { ext: 'png', test: (b) => b.length > 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG' },
  { ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', test: (b) => b.length > 6 && b.toString('ascii', 0, 4) === 'GIF8' },
  { ext: 'webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' }
]

const nettoyer = (v, max = MAX_TEXTE) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)

const nomSur = (nom, ext, i) => {
  const base = String(nom || '').split(/[\\/]/).pop().replace(/\.[^.]*$/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)
  return `${base || `capture-${i + 1}`}.${ext}`
}

// pieces : [{ nom, donnees }] où donnees est du base64 (éventuellement « data:…;base64, »)
function lirePieces(pieces) {
  if (pieces == null) return []
  if (!Array.isArray(pieces)) throw new ErreurSaisie('Capture d\'écran invalide')
  if (pieces.length > MAX_PIECES) throw new ErreurSaisie(`Au plus ${MAX_PIECES} captures d'écran`)
  let total = 0
  return pieces.map((p, i) => {
    const brut = String(p?.donnees || '').replace(/^data:[^;,]*;base64,/, '')
    if (!brut || !/^[A-Za-z0-9+/=\s]+$/.test(brut)) throw new ErreurSaisie('Capture d\'écran invalide')
    const contenu = Buffer.from(brut, 'base64')
    if (!contenu.length) throw new ErreurSaisie('Capture d\'écran invalide')
    if (contenu.length > MAX_PIECE_OCTETS) throw new ErreurSaisie(`Une capture dépasse ${MAX_PIECE_OCTETS / 1024 / 1024} Mo`)
    total += contenu.length
    if (total > MAX_TOTAL_OCTETS) throw new ErreurSaisie(`Les captures dépassent ${MAX_TOTAL_OCTETS / 1024 / 1024} Mo en tout`)
    const type = SIGNATURES.find((s) => s.test(contenu))
    if (!type) throw new ErreurSaisie('Seules les images (PNG, JPEG, GIF, WebP) sont acceptées')
    return { nom: nomSur(p?.nom, type.ext, i), contenu: contenu.toString('base64'), octets: contenu.length }
  })
}

const CHAMPS_CONTEXTE = { page: 'Écran', navigateur: 'Navigateur', fenetre: 'Taille de la fenêtre', connexion: 'Connexion', heure: 'Heure', actions: 'Dernières actions' }
function lireContexte(c) {
  if (!c || typeof c !== 'object') return null
  const out = {}
  for (const cle of Object.keys(CHAMPS_CONTEXTE)) {
    const v = nettoyer(c[cle], cle === 'actions' ? 1200 : 400)
    if (v) out[cle] = v
  }
  return Object.keys(out).length ? out : null
}

export function lireSignalement(corps = {}) {
  const description = nettoyer(corps.description)
  if (description.length < 5) throw new ErreurSaisie('Décrivez le problème en quelques mots')
  return {
    description,
    attendu: nettoyer(corps.attendu),
    contexte: lireContexte(corps.contexte),
    pieces: lirePieces(corps.pieces)
  }
}

const echapper = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const bloc = (titre, texte) => `<h2 style="margin:20px 0 6px;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:#6b6b78">${echapper(titre)}</h2>
<div style="background:#faf8f5;border:1px solid #ebe8e3;border-radius:8px;padding:12px 14px;line-height:1.5;white-space:pre-wrap">${echapper(texte)}</div>`

// Email pour les administrateurs : la personne est en « Répondre à ».
export function composerEmail({ signalement, auteur, cercles, reference, version }) {
  const qui = `${auteur.prenom}${auteur.nom ? ` ${auteur.nom}` : ''}`
  const sujet = `Signalement ${reference} : ${qui}`
  const { html: base, texte } = gabarit({
    titre: 'Signalement d\'un problème',
    paragraphes: [`Référence ${reference}`, `De : ${qui}${auteur.email ? ` (${auteur.email})` : ' (compte sans adresse email)'}`, ...(cercles.length ? [`Cercle(s) : ${cercles.join(', ')}`] : [])]
  })
  const lignes = [
    ['Version de l\'application', version],
    ...Object.entries(signalement.contexte ?? {}).map(([cle, v]) => [CHAMPS_CONTEXTE[cle], v])
  ]
  const details = [
    bloc('Description', signalement.description),
    signalement.attendu && bloc('Ce qui était attendu', signalement.attendu),
    bloc(`Captures d'écran (${signalement.pieces.length})`, signalement.pieces.length ? signalement.pieces.map((p) => `${p.nom} (${Math.max(1, Math.round(p.octets / 1024))} Ko)`).join('\n') : 'Aucune'),
    bloc('Informations techniques', lignes.map(([k, v]) => `${k} : ${v}`).join('\n'))
  ].filter(Boolean).join('\n')
  const html = base.replace('</div>\n<p style="color:#6b6b78;font-size:0.8rem', `${details}\n</div>\n<p style="color:#6b6b78;font-size:0.8rem`)
  const suite = [
    '', 'Description :', signalement.description,
    ...(signalement.attendu ? ['', 'Attendu :', signalement.attendu] : []),
    '', ...lignes.map(([k, v]) => `${k} : ${v}`)
  ].join('\n')
  return { sujet, html, texte: texte + suite }
}
