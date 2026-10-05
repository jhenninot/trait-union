// Envoie au journal de l'administrateur (Administration > Journal) les erreurs vues par le
// navigateur. Jamais le contenu d'un message ni d'une photo : un module, une phrase, un détail technique.
const recents = new Map()
let depart = 0
let envoyes = 0

export function signaler(module, message, details) {
  try {
    const maintenant = Date.now()
    if (maintenant - depart > 60000) { depart = maintenant; envoyes = 0 }
    if (envoyes >= 5 || maintenant - (recents.get(message) ?? 0) < 10000) return
    recents.set(message, maintenant)
    envoyes++
    const contexte = `${details ? details + '\n' : ''}page ${location.pathname} · ${navigator.onLine ? 'en ligne' : 'hors ligne'} · ${navigator.userAgent}`
    fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module, message: String(message).slice(0, 500), details: contexte.slice(0, 3000) }),
      keepalive: true
    }).catch(() => {})
  } catch { /* le journal ne doit jamais empêcher l'application de fonctionner */ }
}

// Erreurs non rattrapées (affichage, code inattendu)
export function surveillerErreurs() {
  window.addEventListener('error', (e) => {
    if (!e.message || e.message.startsWith('ResizeObserver')) return
    signaler('application', e.message, e.filename ? `${e.filename.split('/').pop()}:${e.lineno}` : '')
  })
  window.addEventListener('unhandledrejection', (e) => {
    const raison = e.reason
    // Le serveur injoignable ou un refus attendu (401) ne sont pas des bugs
    if (raison?.status === 0 || raison?.status === 401) return
    signaler('application', raison?.message || String(raison), raison?.stack)
  })
}
