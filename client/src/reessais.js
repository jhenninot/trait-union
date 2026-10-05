// Nouvelles tentatives automatiques avec délai croissant (1 s, 3 s, 6 s) pour les envois
// de fichiers : une coupure brève du réseau ou de l'hébergeur ne doit pas faire échouer une photo.
const DELAIS = [1000, 3000, 6000]
const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

// `rejouable(erreur)` : faux pour une erreur définitive (refus, fichier invalide)
export async function avecReessais(action, rejouable = () => true) {
  for (let essai = 0; ; essai++) {
    try {
      return await action()
    } catch (e) {
      if (essai >= DELAIS.length || !rejouable(e)) throw e
      await attendre(DELAIS[essai])
    }
  }
}

// Erreur de connexion ou de l'hébergeur, à retenter ; un refus (403, 400...) est définitif
export const erreurPassagere = (e) => e.passagere || e.status === 0 || e.status >= 500

// Dépôt d'un fichier chez l'hébergeur avec réessais ; `nom` : « photos » ou « fichiers »
export function deposerFichier(lien, blob, type, nom = 'photos') {
  return avecReessais(async () => {
    let reponse
    try {
      reponse = await fetch(lien, { method: 'PUT', body: blob, headers: { 'Content-Type': type } })
    } catch {
      throw Object.assign(new Error(`L'hébergeur des ${nom} ne répond pas (connexion, ou autorisation CORS à refaire dans l'administration)`), { passagere: true })
    }
    if (!reponse.ok) throw Object.assign(new Error(`L'hébergeur des ${nom} a refusé l'envoi (erreur ${reponse.status})`), { passagere: reponse.status >= 500 || reponse.status === 429 })
    return reponse
  }, erreurPassagere)
}

// Appel de publication : réessayé si le serveur n'a pas pu joindre l'hébergeur ou ne voit pas encore le fichier
export const publier = (appel) => avecReessais(appel, (e) => erreurPassagere(e) || e.status === 400)
