// Extraits de 30 secondes via l'API de recherche iTunes (gratuite, sans clé). Les réponses sont
// gardées en mémoire quelques heures ; sans connexion ou sans résultat, la chanson est simplement
// écartée du quiz.
const DUREE_CACHE = 12 * 3600 * 1000
const DUREE_ECHEC = 10 * 60 * 1000
const cache = new Map()

const normaliser = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const mots = (t) => normaliser(t).split(' ').filter((m) => m.length >= 3)

// Résultat qui ressemble le plus à la chanson demandée (nom de l'artiste et titre)
function meilleur(resultats, titre, artiste) {
  const motsArtiste = mots(artiste)
  const motsTitre = mots(titre)
  let choix = null
  let meilleurScore = 0
  for (const r of resultats) {
    if (!r.previewUrl) continue
    const a = normaliser(r.artistName)
    const t = normaliser(r.trackName)
    const scoreArtiste = motsArtiste.length ? motsArtiste.filter((m) => a.includes(m)).length / motsArtiste.length : 0.5
    const scoreTitre = motsTitre.length ? motsTitre.filter((m) => t.includes(m)).length / motsTitre.length : 0.5
    if (scoreArtiste < 0.5 || scoreTitre < 0.6) continue
    // Évite les versions « live », « karaoké » et « instrumental »
    const penalite = /live|karaoke|instrumental|cover|tribute|remix/.test(t) ? 0.5 : 0
    const score = scoreArtiste + scoreTitre - penalite
    if (score > meilleurScore) { meilleurScore = score; choix = r }
  }
  return choix
}

// → { apercu, pochette } ou null
export async function trouverExtrait(titre, artiste) {
  const cle = `${normaliser(titre)}|${normaliser(artiste)}`
  const connu = cache.get(cle)
  if (connu && connu.expire > Date.now()) return connu.valeur
  let valeur = null
  let echec = false
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(`${titre} ${artiste}`)}&country=fr&media=music&entity=song&limit=10`
    const reponse = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
    const { results = [] } = await reponse.json()
    const r = meilleur(results, titre, artiste)
    if (r) valeur = { apercu: r.previewUrl, pochette: r.artworkUrl100 ? r.artworkUrl100.replace('100x100', '400x400') : null }
  } catch (e) {
    echec = true
    console.error('[Musique]', e.message)
  }
  cache.set(cle, { valeur, expire: Date.now() + (valeur ? DUREE_CACHE : DUREE_ECHEC) })
  if (cache.size > 2000) cache.delete(cache.keys().next().value)
  return echec ? null : valeur
}

export const cleChanson = (titre, artiste) => `${normaliser(titre)}|${normaliser(artiste)}`
