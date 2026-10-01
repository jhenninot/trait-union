// Application Android : la dernière APK publiée par GitHub Actions (release « android ») et la
// version installée sur chaque appareil (l'APK ajoute « TraitUnionAndroid/<numéro> » à l'agent
// utilisateur, mobile/capacitor.config.json réécrit par .github/workflows/android.yml).
export const DEPOT = 'jhenninot/trait-union'
export const APK_URL = `https://github.com/${DEPOT}/releases/download/android/trait-union.apk`

// null : pas l'application Android ; 0 : application installée avant le numéro de version
export function versionApk(agent = '') {
  const m = /TraitUnionAndroid(?:\/(\d+))?/.exec(agent)
  if (!m) return null
  return m[1] ? Number(m[1]) : 0
}

// Dernière APK publiée, gardée une heure (l'API de GitHub limite les appels sans compte)
const DUREE_CACHE = 3600_000
let cache = null // { lu, info }

export async function derniereApk({ forcer = false } = {}) {
  if (!forcer && cache && Date.now() - cache.lu < DUREE_CACHE) return cache.info
  let info = cache?.info ?? null
  try {
    const r = await fetch(`https://api.github.com/repos/${DEPOT}/releases/tags/android`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'trait-union' },
      signal: AbortSignal.timeout(10_000)
    })
    if (r.ok) {
      const release = await r.json()
      // Titre « Application Android (version 0.1.42) » : 42 est le versionCode de l'APK
      const m = /(\d+)\)?\s*$/.exec(release.name ?? '')
      info = m ? { version: Number(m[1]), nom: release.name.replace(/^.*\(version (.*)\).*$/, '$1'), publieeLe: release.published_at } : null
    }
  } catch {
    // GitHub injoignable : on garde la valeur précédente
  }
  cache = { lu: Date.now(), info }
  return info
}

// Sans attendre GitHub (le planificateur des alertes rafraîchit la valeur toutes les heures)
export function derniereApkConnue() {
  if (!cache) derniereApk().catch(() => {})
  return cache?.info ?? null
}
