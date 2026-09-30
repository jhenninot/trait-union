import { reactive } from 'vue'

// Installation de l'application : PWA (navigateur) ou application Android (Capacitor).
export const APK_URL = 'https://github.com/jhenninot/trait-union/releases/download/android/trait-union.apk'

export const installation = reactive({
  invite: null, // événement beforeinstallprompt (Chrome, Edge, Android), gardé pour plus tard
  installee: false
})

// L'application Android ajoute ce marqueur à l'agent utilisateur (mobile/capacitor.config.json)
export const dansAppliAndroid = () => navigator.userAgent.includes('TraitUnionAndroid')
export const estIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const estAndroid = () => /Android/i.test(navigator.userAgent)
export const modeAutonome = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

export function preparerInstallation() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* pas de mode hors ligne, sans gravité */ })
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installation.invite = e
  })
  window.addEventListener('appinstalled', () => {
    installation.invite = null
    installation.installee = true
  })
}

export async function installer() {
  const invite = installation.invite
  if (!invite) return
  invite.prompt()
  const { outcome } = await invite.userChoice
  installation.invite = null
  if (outcome === 'accepted') installation.installee = true
}
