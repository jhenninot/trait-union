// Temps réel par Server-Sent Events : chaque page ouverte garde une connexion /api/flux, sur
// laquelle le serveur signale ce qui change (nouveau message, message lu ou retiré). La page
// recharge alors ce qu'elle affiche ; les envois restent de simples requêtes POST.
// Derrière Nginx Proxy Manager, l'en-tête X-Accel-Buffering: no suffit (aucun réglage à faire), et
// un battement toutes les 20 secondes évite que la connexion soit coupée faute d'activité ; c'est un
// vrai événement (pas un commentaire) pour que la page détecte une connexion morte (réseau coupé,
// mise en veille de la tablette, proxy qui retient les données) et se reconnecte.
const BATTEMENT = 20_000
const connexions = new Map() // utilisateurId → Set de réponses ouvertes

export function ouvrirFlux(req, res) {
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.flushHeaders()
  res.socket?.setNoDelay(true)
  // Après une coupure, le navigateur se reconnecte tout seul au bout de 5 secondes. Le remplissage
  // force les proxys qui regroupent les petites données à laisser passer la suite.
  res.write(`retry: 5000\n: ${' '.repeat(2048)}\n\n`)
  const id = req.utilisateur.id
  if (!connexions.has(id)) connexions.set(id, new Set())
  connexions.get(id).add(res)
  const battement = setInterval(() => res.write('event: battement\ndata: {}\n\n'), BATTEMENT)
  req.on('close', () => {
    clearInterval(battement)
    connexions.get(id)?.delete(res)
    if (!connexions.get(id)?.size) connexions.delete(id)
  })
}

// Envoie un événement à toutes les pages ouvertes de ces personnes
export function signaler(utilisateurIds, evenement, donnees = {}) {
  const texte = `event: ${evenement}\ndata: ${JSON.stringify(donnees)}\n\n`
  for (const id of new Set(utilisateurIds)) {
    for (const res of connexions.get(id) ?? []) res.write(texte)
  }
}

export const enLigne = (utilisateurId) => connexions.has(utilisateurId)
