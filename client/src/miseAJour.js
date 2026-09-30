// Rechargement automatique quand une nouvelle version est déployée sur le serveur.
// L'application Android et la PWA restent ouvertes des jours entiers sans qu'on puisse
// les rafraîchir : on compare régulièrement la version du serveur (/api/health) à celle
// chargée au démarrage. Si elle a changé, on recharge au retour sur l'appli (elle était
// en arrière-plan : rien n'est en cours de saisie) ou au prochain changement de page.
import { session } from './session.js'

const INTERVALLE = 5 * 60_000
let versionChargee = null
let nouvelleVersion = false

async function versionServeur() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' })
    return (await r.json()).version ?? null
  } catch {
    return null // hors ligne : on réessaiera
  }
}

async function verifier() {
  const v = await versionServeur()
  if (!v) return
  if (!versionChargee) versionChargee = v
  else if (v !== versionChargee) nouvelleVersion = true
  // La tablette de la personne accompagnée reste allumée sur la même page : on recharge
  // tout de suite, sauf si une saisie est en cours
  const saisie = document.activeElement?.matches('input, textarea, select')
  if (nouvelleVersion && session.typeSession === 'appareil' && !saisie) window.location.reload()
}

export function surveillerMisesAJour(router) {
  verifier()
  setInterval(verifier, INTERVALLE)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return
    await verifier()
    if (nouvelleVersion) window.location.reload()
  })
  // Changement de page : chargement complet de la nouvelle page avec la nouvelle version
  router.beforeEach((to, from) => {
    if (nouvelleVersion && from.matched.length) {
      window.location.assign(to.fullPath)
      return false
    }
  })
}

// Appelle `fn` quand l'utilisateur revient sur l'appli (écran rallumé, appli rouverte)
export function auRetour(fn) {
  const ecouteur = () => document.visibilityState === 'visible' && fn()
  document.addEventListener('visibilitychange', ecouteur)
  return () => document.removeEventListener('visibilitychange', ecouteur)
}
