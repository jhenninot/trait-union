import { reactive } from 'vue'
import { api } from './api.js'
import { preparerPhoto } from './photos.js'
import { deposerFichier, publier } from './reessais.js'

// Messagerie : nombre de messages non lus (menus, accueil), temps réel et envoi des messages.
// Temps réel : une connexion Server-Sent Events (/api/messagerie/flux) par page ouverte ; le
// serveur y signale les nouveaux messages et les lectures, et les pages rechargent ce qu'elles
// affichent. Si la connexion ne tient pas (réseau, proxy), le nombre de non lus est relu toutes
// les minutes.
export const etatMessagerie = reactive({ nonLus: 0, parCercle: {}, connecte: false })

const ecouteurs = new Set()
let flux = null
let minuterie = null
let attente = null

export async function rafraichirNonLus() {
  try {
    const { total, cercles } = await api('GET', '/messagerie/non-lus')
    etatMessagerie.nonLus = total
    etatMessagerie.parCercle = cercles
  } catch { /* hors ligne : on garde l'ancien nombre */ }
}

// Plusieurs événements rapprochés ne font qu'une relecture
function rafraichirBientot() {
  clearTimeout(attente)
  attente = setTimeout(rafraichirNonLus, 400)
}

// Les pages ouvertes rechargent ce qu'elles affichent (type 'resynchro') : à la (re)connexion, au
// retour sur l'application, et toutes les quelques secondes tant que le temps réel ne tient pas
function resynchroniser() {
  rafraichirBientot()
  for (const f of ecouteurs) f('resynchro', {})
}

const SILENCE_MAX = 50_000 // sans le moindre battement du serveur, la connexion est considérée morte
const SONDAGE_SANS_FLUX = 6_000
let dernierSigne = 0
let surveillance = null
let sondage = null

function ouvrirFlux() {
  flux?.close()
  dernierSigne = Date.now()
  flux = new EventSource('/api/messagerie/flux')
  flux.onopen = () => {
    etatMessagerie.connecte = true
    dernierSigne = Date.now()
    resynchroniser() // ce qui est arrivé pendant la coupure
  }
  flux.onerror = () => (etatMessagerie.connecte = false)
  flux.addEventListener('battement', () => {
    dernierSigne = Date.now()
    etatMessagerie.connecte = true
  })
  for (const type of ['message', 'lu']) {
    flux.addEventListener(type, (e) => {
      dernierSigne = Date.now()
      let donnees = {}
      try { donnees = JSON.parse(e.data) } catch { /* événement illisible */ }
      rafraichirBientot()
      for (const f of ecouteurs) f(type, donnees)
    })
  }
}

// Retour sur l'application (tablette réveillée, onglet de nouveau visible, réseau revenu) : si le
// serveur est resté muet, on se reconnecte tout de suite, et dans tous les cas on relit
function auRetour() {
  if (document.visibilityState === 'hidden' || !flux) return
  if (Date.now() - dernierSigne > 25_000) ouvrirFlux()
  resynchroniser()
}

export function demarrerMessagerie() {
  arreterMessagerie()
  rafraichirNonLus()
  if ('EventSource' in window) {
    ouvrirFlux()
    surveillance = setInterval(() => {
      if (flux && Date.now() - dernierSigne > SILENCE_MAX) {
        etatMessagerie.connecte = false
        ouvrirFlux()
      }
    }, 10_000)
    document.addEventListener('visibilitychange', auRetour)
    window.addEventListener('online', auRetour)
    window.addEventListener('focus', auRetour)
  }
  minuterie = setInterval(() => !etatMessagerie.connecte && rafraichirNonLus(), 60_000)
  // Sans temps réel (proxy, réseau instable), les pages ouvertes se relisent toutes seules
  sondage = setInterval(() => !etatMessagerie.connecte && document.visibilityState !== 'hidden' && resynchroniser(), SONDAGE_SANS_FLUX)
}

export function arreterMessagerie() {
  flux?.close()
  flux = null
  clearInterval(minuterie)
  clearInterval(surveillance)
  clearInterval(sondage)
  document.removeEventListener('visibilitychange', auRetour)
  window.removeEventListener('online', auRetour)
  window.removeEventListener('focus', auRetour)
  etatMessagerie.connecte = false
  etatMessagerie.nonLus = 0
  etatMessagerie.parCercle = {}
}

// Appelle fn(type, donnees) à chaque événement ('message', 'lu' ou 'resynchro' : tout relire) ; renvoie de quoi arrêter
export function ecouterMessagerie(fn) {
  ecouteurs.add(fn)
  return () => ecouteurs.delete(fn)
}

// --- Envoi

export const envoyerTexte = (conversationId, texte, extra = {}) =>
  api('POST', `/messagerie/conversations/${conversationId}/messages`, { type: 'texte', texte, ...extra })

export const envoyerRapide = (conversationId, texte) =>
  api('POST', `/messagerie/conversations/${conversationId}/messages`, { type: 'rapide', texte })

const deposer = (lien, blob, type) => deposerFichier(lien, blob, type, 'fichiers')

// Photo : réduite par le navigateur (comme les photos du cercle), puis envoyée chez l'hébergeur
export async function envoyerPhotoMessage(conversationId, fichier, texte = '', extra = {}) {
  const p = await preparerPhoto(fichier)
  const { id, envois } = await api('POST', `/messagerie/conversations/${conversationId}/messages`, {
    type: 'photo', texte, largeur: p.largeur, hauteur: p.hauteur, tailles: { miniature: p.miniature.size, ecran: p.ecran.size }, ...extra
  })
  try {
    await Promise.all([deposer(envois.miniature, p.miniature, 'image/jpeg'), deposer(envois.ecran, p.ecran, 'image/jpeg')])
    return await publier(() => api('POST', `/messagerie/messages/${id}/publier`))
  } catch (e) {
    api('DELETE', `/messagerie/messages/${id}`).catch(() => {})
    throw e
  }
}

// Message vocal : { blob, duree (secondes), format } tel que rendu par l'enregistreur
export async function envoyerVocal(conversationId, { blob, duree, format }, extra = {}) {
  const { id, envoi } = await api('POST', `/messagerie/conversations/${conversationId}/messages`, { type: 'vocal', duree, taille: blob.size, format, ...extra })
  try {
    await deposer(envoi, blob, format)
    return await publier(() => api('POST', `/messagerie/messages/${id}/publier`))
  } catch (e) {
    api('DELETE', `/messagerie/messages/${id}`).catch(() => {})
    throw e
  }
}

// --- Enregistrement d'un message vocal (MediaRecorder : WebM ou Ogg sur Chrome et Android, MP4 sur Safari)

export const DUREE_VOCAL_MAX = 120
const FORMATS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

export const enregistrementPossible = () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder)

// Démarre l'enregistrement. Renvoie { arreter() → Promise<{ blob, duree, format }>, annuler(), debut }
export async function enregistrer({ surFin } = {}) {
  if (!enregistrementPossible()) throw new Error('Cet appareil ne permet pas d\'enregistrer un message vocal')
  let micro
  try {
    micro = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    throw new Error('Le micro n\'est pas autorisé pour Trait d\'union')
  }
  const choisi = FORMATS.find((f) => MediaRecorder.isTypeSupported?.(f))
  const enregistreur = new MediaRecorder(micro, choisi ? { mimeType: choisi, audioBitsPerSecond: 32000 } : undefined)
  const morceaux = []
  const debut = Date.now()
  enregistreur.ondataavailable = (e) => e.data.size && morceaux.push(e.data)
  const fini = new Promise((resolve) => {
    enregistreur.onstop = () => {
      micro.getTracks().forEach((t) => t.stop())
      // Le type sans ses paramètres (« audio/webm ») : c'est lui qui est signé pour l'envoi
      const format = (enregistreur.mimeType || choisi || 'audio/webm').split(';')[0]
      resolve({ blob: new Blob(morceaux, { type: format }), duree: Math.max(0.5, (Date.now() - debut) / 1000), format })
    }
  })
  enregistreur.start(1000)
  // Au bout de 2 minutes, l'enregistrement s'arrête tout seul
  const limite = setTimeout(() => { if (enregistreur.state !== 'inactive') { enregistreur.stop(); surFin?.() } }, DUREE_VOCAL_MAX * 1000)
  return {
    debut,
    arreter() {
      clearTimeout(limite)
      if (enregistreur.state !== 'inactive') enregistreur.stop()
      return fini
    },
    annuler() {
      clearTimeout(limite)
      if (enregistreur.state !== 'inactive') enregistreur.stop()
    }
  }
}

// --- Affichage

const debutDuJour = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const JOUR = 86_400_000
const ecart = (d) => Math.round((debutDuJour() - debutDuJour(new Date(d))) / JOUR)

export const heureMessage = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

// Séparateur du fil : « Aujourd'hui », « Hier », « Lundi 29 septembre »
export function jourMessage(d) {
  const n = ecart(d)
  if (n === 0) return 'Aujourd\'hui'
  if (n === 1) return 'Hier'
  const t = new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Date courte de la liste des conversations : « 15:42 », « Hier », « Lun. », « 12/09 »
export function quandCourt(d) {
  const n = ecart(d)
  if (n === 0) return heureMessage(d)
  if (n === 1) return 'Hier'
  if (n < 7) {
    const j = new Date(d).toLocaleDateString('fr-FR', { weekday: 'short' })
    return j.charAt(0).toUpperCase() + j.slice(1)
  }
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

// Pour la personne accompagnée : « aujourd'hui à 14h50 », « hier à 9h05 », « lundi 29 septembre »
export function quandLong(d) {
  const n = ecart(d)
  const h = new Date(d).toLocaleTimeString('fr-FR', { hour: 'numeric', minute: '2-digit' }).replace(':', 'h')
  if (n === 0) return `aujourd'hui à ${h}`
  if (n === 1) return `hier à ${h}`
  return new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export const duree = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

// « Vu par Jeanne », « Vu par Jeanne et Paul », « Vu par Jeanne, Paul et 3 autres »
export function texteVu(prenoms) {
  if (!prenoms?.length) return ''
  if (prenoms.length === 1) return `Vu par ${prenoms[0]}`
  if (prenoms.length === 2) return `Vu par ${prenoms[0]} et ${prenoms[1]}`
  return `Vu par ${prenoms[0]}, ${prenoms[1]} et ${prenoms.length - 2} autre${prenoms.length > 3 ? 's' : ''}`
}

// Texte d'un message découpé en morceaux de texte et liens cliquables (http et https seulement)
export function morceaux(texte) {
  const resultat = []
  const motif = /https?:\/\/[^\s<>"']+/gi
  let debut = 0
  for (const m of String(texte ?? '').matchAll(motif)) {
    const lien = m[0].replace(/[).,;:!?»]+$/, '')
    if (m.index > debut) resultat.push({ texte: texte.slice(debut, m.index) })
    resultat.push({ lien })
    debut = m.index + lien.length
  }
  if (debut < String(texte ?? '').length) resultat.push({ texte: texte.slice(debut) })
  return resultat
}

// Lien vers la messagerie pour écrire en privé à un membre du cercle (désigné par son appartenance au cercle) :
// la conversation s'ouvre d'elle-même. La personne accompagnée a sa propre page de messages.
export const lienMessage = (cercleId, membreId, deLaPersonneAccompagnee = false) => deLaPersonneAccompagnee
  ? { path: '/messages', query: { ecrireA: membreId, cercle: cercleId } }
  : { path: `/cercles/${cercleId}/messages`, query: { ecrireA: membreId } }
