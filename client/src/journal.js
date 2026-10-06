// Envoie au journal de l'administrateur (Administration > Journal) les erreurs vues par le
// navigateur. Jamais le contenu d'un message ni d'une photo : un module, une phrase, un détail technique.
const recents = new Map()
let depart = 0
let envoyes = 0

// Fil d'Ariane : les dernières actions (page, bouton touché, événement de l'application Android),
// joint à chaque erreur pour comprendre ce qui la précède. Jamais le contenu d'un champ.
const actions = []
export function tracer(action) {
  actions.push(`${new Date().toISOString().slice(11, 19)} ${String(action).slice(0, 80)}`)
  if (actions.length > 10) actions.shift()
}

export const dernieresActions = () => actions.slice()

export function signaler(module, message, details) {
  try {
    const maintenant = Date.now()
    if (maintenant - depart > 60000) { depart = maintenant; envoyes = 0 }
    if (envoyes >= 5 || maintenant - (recents.get(message) ?? 0) < 10000) return
    recents.set(message, maintenant)
    envoyes++
    const contexte = `${details ? details + '\n' : ''}page ${location.pathname} · ${navigator.onLine ? 'en ligne' : 'hors ligne'} · ${navigator.userAgent}`
      + (actions.length ? `\nDernières actions :\n${actions.join('\n')}` : '')
    fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module, message: String(message).slice(0, 500), details: contexte.slice(0, 3000) }),
      keepalive: true
    }).catch(() => {})
  } catch { /* le journal ne doit jamais empêcher l'application de fonctionner */ }
}

// Erreurs non rattrapées (affichage, code inattendu)
export function surveillerErreurs(router) {
  window.addEventListener('error', (e) => {
    if (!e.message || e.message.startsWith('ResizeObserver')) return
    // Une image ou un script externe qui ne charge pas : e.target est l'élément
    if (e.message === 'Script error.' || !e.filename) {
      // « Script error. » : le navigateur cache le détail d'un script d'une autre origine ou injecté
      // (pont de l'application Android, extension, carte...). On donne ce qu'on sait.
      const pont = ['TraitUnionPartage', 'TraitUnionVoix', 'TraitUnionAlertes', 'TraitUnionEcran', 'TraitUnionAppli'].filter((n) => window[n]).length
      signaler('application', 'Erreur masquée par le navigateur (script d\'une autre origine ou injecté par l\'application Android)',
        `message d'origine : ${e.message}${e.filename ? ` · fichier ${e.filename}:${e.lineno}:${e.colno}` : ' · fichier inconnu'}`
        + ` · ${pont} pont(s) Android · ${e.error?.stack ? `pile : ${e.error.stack}` : 'pas de pile'}`)
      return
    }
    signaler('application', e.message, `${e.filename.split('/').pop()}:${e.lineno}:${e.colno}${e.error?.stack ? `\n${e.error.stack}` : ''}`)
  }, true)
  // Fil d'Ariane : pages, boutons touchés (leur libellé seulement) et événements de l'application Android
  router?.afterEach((to) => tracer(`page ${to.path}`))
  document.addEventListener('click', (e) => {
    const cible = e.target.closest?.('button, a, label')
    if (cible) tracer(`toucher « ${(cible.getAttribute('aria-label') || cible.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)} »`)
  }, true)
  for (const nom of ['tu-partage', 'tu-choix', 'tu-voix', 'tu-alertes']) {
    window.addEventListener(nom, (e) => tracer(`événement Android ${nom} ${JSON.stringify(e.detail ?? {}).slice(0, 60)}`), true)
  }
  window.addEventListener('unhandledrejection', (e) => {
    const raison = e.reason
    // Le serveur injoignable ou un refus attendu (401) ne sont pas des bugs
    if (raison?.status === 0 || raison?.status === 401) return
    signaler('application', raison?.message || String(raison), raison?.stack)
  })
}
