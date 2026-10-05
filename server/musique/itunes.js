// Extraits de 30 secondes via l'API de recherche iTunes (gratuite, sans clé). Les réponses utiles
// sont gardées en mémoire quelques heures. L'API limite le nombre de recherches par minute : on
// cherche d'abord par artiste (une recherche sert à toutes ses chansons), les appels sont espacés,
// et un refus est retenté après une courte pause. Les échecs ne sont jamais gardés en mémoire.
const DUREE_CACHE = 12 * 3600 * 1000
const DUREE_SANS_RESULTAT = 30 * 60 * 1000
const ESPACEMENT = 250 // ms entre deux appels
const cache = new Map()

const normaliser = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const mots = (t) => normaliser(t).split(' ').filter((m) => m.length >= 3)
const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
const MAUVAISES_VERSIONS = /live|karaoke|instrumental|cover|tribute|remix/

// --- Appels espacés, avec une nouvelle tentative si l'API refuse (limite atteinte)
let file = Promise.resolve()
function appeler(url) {
  const tache = file.then(() => attendre(ESPACEMENT)).then(async () => {
    for (let essai = 0; essai < 3; essai++) {
      try {
        const reponse = await fetch(url, { signal: AbortSignal.timeout(7000) })
        if (reponse.ok) return (await reponse.json()).results ?? []
        if (![403, 429, 500, 502, 503].includes(reponse.status) || essai === 2) throw new Error(`HTTP ${reponse.status}`)
      } catch (e) {
        if (essai === 2) throw e
      }
      await attendre(1500 * (essai + 1))
    }
    return []
  })
  file = tache.catch(() => {})
  return tache
}

const recherche = (terme, extra = '', limite = 10) =>
  appeler(`https://itunes.apple.com/search?term=${encodeURIComponent(terme)}&country=fr&media=music&entity=song${extra}&limit=${limite}`)

const lire = (cle) => { const c = cache.get(cle); return c && c.expire > Date.now() ? c : null }
function garder(cle, valeur, duree) {
  cache.set(cle, { valeur, expire: Date.now() + duree })
  if (cache.size > 3000) cache.delete(cache.keys().next().value)
}

const presenter = (r, titre = r.trackName) => ({
  titre,
  artiste: r.artistName,
  annee: r.releaseDate ? Number(r.releaseDate.slice(0, 4)) : null,
  apercu: r.previewUrl,
  pochette: r.artworkUrl100 ? r.artworkUrl100.replace('100x100', '400x400') : null
})

// « La Mer (Remastered 2011) » → « La Mer »
const nettoyer = (titre) => titre.replace(/\s*[([][^)\]]*(remaster|version|mono|stereo|edit|bof)[^)\]]*[)\]]/gi, '').trim()

// Titres d'un artiste qui ont un extrait : [{ titre, artiste, annee, apercu, pochette }]
const enCours = new Map() // recherches d'artistes en cours, pour ne pas les lancer deux fois
export function chansonsDeArtiste(artiste) {
  const cle = `artiste|${normaliser(artiste)}`
  const connu = lire(cle)
  if (connu) return Promise.resolve(connu.valeur)
  if (!enCours.has(cle)) enCours.set(cle, chercherArtiste(artiste, cle).finally(() => enCours.delete(cle)))
  return enCours.get(cle)
}

async function chercherArtiste(artiste, cle) {
  try {
    const resultats = await recherche(artiste, '&attribute=artistTerm', 100)
    const motsArtiste = mots(artiste)
    const vus = new Set()
    const valeur = []
    for (const r of resultats) {
      if (!r.previewUrl || !r.trackName) continue
      const a = normaliser(r.artistName)
      if (motsArtiste.length && motsArtiste.filter((m) => a.includes(m)).length / motsArtiste.length < 0.5) continue
      if (MAUVAISES_VERSIONS.test(normaliser(r.trackName))) continue
      const titre = nettoyer(r.trackName)
      if (vus.has(normaliser(titre))) continue
      vus.add(normaliser(titre))
      valeur.push(presenter(r, titre))
    }
    garder(cle, valeur, valeur.length ? DUREE_CACHE : DUREE_SANS_RESULTAT)
    return valeur
  } catch (e) {
    console.error('[Musique]', e.message)
    return []
  }
}

// Chanson de la liste qui ressemble le plus au titre demandé (tous les mots, ou presque)
function parmi(liste, titre) {
  const motsTitre = mots(titre)
  const voulu = normaliser(titre)
  let choix = null
  let meilleurScore = 0
  for (const c of liste) {
    const t = normaliser(c.titre)
    const score = t === voulu ? 2 : motsTitre.length ? motsTitre.filter((m) => t.includes(m)).length / motsTitre.length : 0
    if (score >= 0.7 && score > meilleurScore) { meilleurScore = score; choix = c }
  }
  return choix
}

// → { apercu, pochette } ou null. D'abord dans la liste de l'artiste, sinon recherche du titre seul.
export async function trouverExtrait(titre, artiste) {
  const cle = `chanson|${normaliser(titre)}|${normaliser(artiste)}`
  const connu = lire(cle)
  if (connu) return connu.valeur
  const trouve = parmi(await chansonsDeArtiste(artiste), titre)
  if (trouve) {
    const valeur = { apercu: trouve.apercu, pochette: trouve.pochette }
    garder(cle, valeur, DUREE_CACHE)
    return valeur
  }
  try {
    const resultats = await recherche(`${titre} ${artiste}`)
    const motsArtiste = mots(artiste)
    const candidates = resultats
      .filter((r) => r.previewUrl && r.trackName && !MAUVAISES_VERSIONS.test(normaliser(r.trackName)))
      .filter((r) => !motsArtiste.length || motsArtiste.filter((m) => normaliser(r.artistName).includes(m)).length / motsArtiste.length >= 0.5)
      .map((r) => presenter(r))
    const r = parmi(candidates, titre)
    const valeur = r ? { apercu: r.apercu, pochette: r.pochette } : null
    garder(cle, valeur, valeur ? DUREE_CACHE : DUREE_SANS_RESULTAT)
    return valeur
  } catch (e) {
    console.error('[Musique]', e.message)
    return null
  }
}

export const cleChanson = (titre, artiste) => `${normaliser(titre)}|${normaliser(artiste)}`
