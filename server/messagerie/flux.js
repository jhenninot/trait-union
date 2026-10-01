// Temps réel par Server-Sent Events : chaque page ouverte garde une connexion /api/flux, sur
// laquelle le serveur signale ce qui change (nouveau message, message lu ou retiré). La page
// recharge alors ce qu'elle affiche ; les envois restent de simples requêtes POST.
// Derrière Nginx Proxy Manager, l'en-tête X-Accel-Buffering: no suffit (aucun réglage à faire), et
// un commentaire toutes les 25 secondes évite que la connexion soit coupée faute d'activité.
const BATTEMENT = 25_000
const connexions = new Map() // utilisateurId → Set de réponses ouvertes

export function ouvrirFlux(req, res) {
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.flushHeaders()
  // Après une coupure, le navigateur se reconnecte tout seul au bout de 5 secondes
  res.write('retry: 5000\n\n')
  const id = req.utilisateur.id
  if (!connexions.has(id)) connexions.set(id, new Set())
  connexions.get(id).add(res)
  const battement = setInterval(() => res.write(': ok\n\n'), BATTEMENT)
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
