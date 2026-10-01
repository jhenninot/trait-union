import { api } from './api.js'
import { dansAppliAndroid, estIOS, modeAutonome } from './installation.js'

// Alertes sur cet appareil :
// - navigateur ou PWA : Web Push (service worker public/sw.js) ;
// - application Android : Firebase Cloud Messaging, par l'objet window.TraitUnionAlertes
//   (mobile/android/.../MainActivity.java), qui répond par l'événement « tu-alertes ».
const natif = () => window.TraitUnionAlertes
// Alertes arrêtées volontairement sur cet appareil : on ne les réactive pas tout seul
const MEMOIRE_ARRET = 'tu_alertes_arret'
// Alertes activées au moins une fois dans l'application Android
const MEMOIRE_ANDROID = 'tu_alertes_android'

const lire = (cle) => { try { return localStorage.getItem(cle) } catch { return null } }
const ecrire = (cle, valeur) => {
  try { valeur == null ? localStorage.removeItem(cle) : localStorage.setItem(cle, valeur) } catch { /* stockage indisponible */ }
}

// 'android', 'web', ou la raison pour laquelle ce n'est pas possible :
// 'android-sans-firebase' (application construite sans Firebase), 'ios-installer' (iPhone : il
// faut d'abord l'ajouter à l'écran d'accueil), 'impossible' (navigateur trop ancien)
export function modeAlertes() {
  if (dansAppliAndroid()) return natif()?.disponible?.() ? 'android' : 'android-sans-firebase'
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'web'
  if (estIOS() && !modeAutonome()) return 'ios-installer'
  return 'impossible'
}

// Attend la réponse de l'application Android à une demande
function reponseNative(cle, demande) {
  return new Promise((resolve, reject) => {
    const minuterie = setTimeout(() => {
      window.removeEventListener('tu-alertes', ecoute)
      reject(new Error('L\'application Android ne répond pas'))
    }, 60_000)
    function ecoute(e) {
      if (!(cle in e.detail) && !e.detail.erreur) return
      clearTimeout(minuterie)
      window.removeEventListener('tu-alertes', ecoute)
      if (e.detail.erreur) reject(new Error(e.detail.erreur))
      else resolve(e.detail[cle])
    }
    window.addEventListener('tu-alertes', ecoute)
    demande()
  })
}

// Service worker prêt (il n'existe pas en développement : on ne l'attend pas indéfiniment)
async function enregistrementSW() {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('Le service worker n\'est pas installé : rechargez la page')
  return navigator.serviceWorker.ready
}

// 'accordee', 'refusee' ou 'a_demander'
export function autorisation() {
  const mode = modeAlertes()
  if (mode === 'android') return natif().autorisation()
  if (mode === 'web') return { granted: 'accordee', denied: 'refusee' }[Notification.permission] ?? 'a_demander'
  return 'refusee'
}

const enBase64 = (cle) => {
  const brut = atob(cle.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (cle.length % 4)) % 4))
  return Uint8Array.from(brut, (c) => c.charCodeAt(0))
}

// Abonnement Web Push de ce navigateur (créé si besoin, avec la clé du serveur)
async function abonnementWeb(clePublique, creer) {
  const reg = await enregistrementSW()
  let abonnement = await reg.pushManager.getSubscription()
  const cle = enBase64(clePublique)
  const memeCle = (a) => {
    const actuelle = a.options?.applicationServerKey
    return !actuelle || new Uint8Array(actuelle).every((o, i) => o === cle[i])
  }
  if (abonnement && !memeCle(abonnement)) {
    await abonnement.unsubscribe()
    abonnement = null
  }
  if (!abonnement && creer) abonnement = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cle })
  return abonnement
}

// Active les alertes sur cet appareil (demande l'autorisation si besoin). Renvoie l'appareil enregistré.
export async function activerAlertes(clePublique) {
  const mode = modeAlertes()
  let corps
  if (mode === 'android') {
    if (natif().autorisation() !== 'accordee') {
      const reponse = await reponseNative('autorisation', () => natif().demander())
      if (reponse !== 'accordee') throw new Error('Les notifications sont refusées pour Trait d\'union dans les réglages d\'Android')
    }
    corps = { type: 'android', jeton: await reponseNative('jeton', () => natif().jeton()) }
  } else if (mode === 'web') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('Les notifications sont bloquées pour ce site dans les réglages du navigateur')
    corps = { type: 'web', abonnement: (await abonnementWeb(clePublique, true)).toJSON() }
  } else {
    throw new Error('Cet appareil ne peut pas recevoir les alertes')
  }
  const appareil = await api('POST', '/alertes/appareils', corps)
  ecrire(MEMOIRE_ARRET, null)
  if (mode === 'android') ecrire(MEMOIRE_ANDROID, '1')
  return appareil
}

// Arrête les alertes sur cet appareil
export async function desactiverAlertes(appareilId) {
  ecrire(MEMOIRE_ARRET, '1')
  if (modeAlertes() === 'web') {
    const abonnement = await abonnementWeb('', false).catch(() => null)
    if (abonnement) {
      await api('POST', '/alertes/appareils/retirer', { adresse: abonnement.endpoint })
      await abonnement.unsubscribe().catch(() => {})
    }
  }
  if (appareilId) await api('POST', '/alertes/appareils/retirer', { id: appareilId })
}

// Alertes refusées ou arrêtées sur cet appareil (on ne les propose plus)
export const alertesArretees = () => Boolean(lire(MEMOIRE_ARRET))
export const refuserAlertes = () => ecrire(MEMOIRE_ARRET, '1')

// Au démarrage : si les alertes sont autorisées sur cet appareil, l'abonnement est renvoyé au
// serveur (il suit la session, et le jeton ou l'adresse peuvent changer). Rien n'est demandé.
export async function rafraichirAlertes() {
  try {
    if (lire(MEMOIRE_ARRET) || !['android', 'web'].includes(modeAlertes()) || autorisation() !== 'accordee') return
    const { clePublique } = await api('GET', '/alertes')
    if (modeAlertes() === 'android' && !lire(MEMOIRE_ANDROID)) return
    if (modeAlertes() === 'web' && !(await abonnementWeb(clePublique, false))) return
    await activerAlertes(clePublique)
  } catch {
    // Pas grave : la page « Mes alertes » permet de les réactiver
  }
}
