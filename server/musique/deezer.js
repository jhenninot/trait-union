import { normaliser, mots, parmi, attendre, MAUVAISES_VERSIONS } from './itunes.js'

// Extraits de 30 secondes via l'API publique de Deezer (recherche gratuite, sans clé). Les liens
// d'extraits expirent au bout de quelques heures : on ne les garde en mémoire qu'une heure. Les
// échecs ne sont jamais gardés. Même interface que itunes.js (voir sources.js).
const DUREE_CACHE = 60 * 60 * 1000
const DUREE_SANS_RESULTAT = 30 * 60 * 1000
const ESPACEMENT = 150 // ms entre deux appels (limite : environ 50 appels par 5 secondes)
const cache = new Map()

let file = Promise.resolve()
function appeler(chemin) {
  const tache = file.then(() => attendre(ESPACEMENT)).then(async () => {
    for (let essai = 0; essai < 3; essai++) {
      try {
        const reponse = await fetch(`https://api.deezer.com${chemin}`, { signal: AbortSignal.timeout(7000) })
        if (reponse.ok) {
          const json = await reponse.json()
          // Deezer répond « 200 » avec une erreur quand la limite d'appels est atteinte (code 4)
          if (!json.error) return json.data ?? []
          if (json.error.code !== 4 || essai === 2) throw new Error(`Deezer : ${json.error.message ?? json.error.code}`)
        } else if (![403, 429, 500, 502, 503].includes(reponse.status) || essai === 2) {
          throw new Error(`HTTP ${reponse.status}`)
        }
      } catch (e) {
        if (essai === 2) throw e
      }
      await attendre(1200 * (essai + 1))
    }
    return []
  })
  file = tache.catch(() => {})
  return tache
}

const lire = (cle) => { const c = cache.get(cle); return c && c.expire > Date.now() ? c : null }
function garder(cle, valeur, duree) {
  cache.set(cle, { valeur, expire: Date.now() + duree })
  if (cache.size > 3000) cache.delete(cache.keys().next().value)
}

const presenter = (t) => ({
  titre: (t.title_short || t.title).trim(),
  artiste: t.artist?.name ?? '',
  annee: null, // Deezer ne donne pas la date dans les recherches : celle du catalogue est gardée
  apercu: t.preview,
  pochette: t.album?.cover_big ?? t.album?.cover_medium ?? null
})
const utilisable = (t) => t.preview && (t.title_short || t.title) && !MAUVAISES_VERSIONS.test(normaliser(t.title))
const memeArtiste = (nom, artiste) => {
  const m = mots(artiste)
  const a = normaliser(nom)
  return !m.length || m.filter((x) => a.includes(x)).length / m.length >= 0.5
}

// Titres les plus écoutés d'un artiste : [{ titre, artiste, annee, apercu, pochette }]
export async function chansonsDeArtiste(artiste) {
  const cle = `artiste|${normaliser(artiste)}`
  const connu = lire(cle)
  if (connu) return connu.valeur
  try {
    const [trouve] = (await appeler(`/search/artist?q=${encodeURIComponent(artiste)}&limit=3`)).filter((a) => memeArtiste(a.name, artiste))
    const titres = trouve ? await appeler(`/artist/${trouve.id}/top?limit=50`) : []
    const vus = new Set()
    const valeur = []
    for (const t of titres) {
      if (!utilisable(t)) continue
      const p = presenter({ ...t, artist: t.artist ?? trouve })
      if (vus.has(normaliser(p.titre))) continue
      vus.add(normaliser(p.titre))
      valeur.push(p)
    }
    garder(cle, valeur, valeur.length ? DUREE_CACHE : DUREE_SANS_RESULTAT)
    return valeur
  } catch (e) {
    console.error('[Musique] Deezer :', e.message)
    return []
  }
}

// → { apercu, pochette } ou null
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
    const requete = encodeURIComponent(`artist:"${artiste}" track:"${titre}"`)
    const candidates = (await appeler(`/search?q=${requete}&limit=10`))
      .filter((t) => utilisable(t) && memeArtiste(t.artist?.name ?? '', artiste)).map(presenter)
    const r = parmi(candidates, titre)
    const valeur = r ? { apercu: r.apercu, pochette: r.pochette } : null
    garder(cle, valeur, valeur ? DUREE_CACHE : DUREE_SANS_RESULTAT)
    return valeur
  } catch (e) {
    console.error('[Musique] Deezer :', e.message)
    return null
  }
}

// Œuvre classique : le compositeur et les mots de la recherche figurent dans le titre ou l'album
export async function trouverClassique(compositeur, terme) {
  const cle = `classique|${normaliser(compositeur)}|${normaliser(terme)}`
  const connu = lire(cle)
  if (connu) return connu.valeur
  try {
    const resultats = await appeler(`/search?q=${encodeURIComponent(`${terme} ${compositeur}`)}&limit=25`)
    const motsTerme = mots(terme)
    const nom = normaliser(compositeur)
    const r = resultats.find((t) => {
      if (!t.preview) return false
      const texte = normaliser(`${t.title} ${t.album?.title ?? ''} ${t.artist?.name ?? ''}`)
      return texte.includes(nom) && (!motsTerme.length || motsTerme.filter((m) => texte.includes(m)).length / motsTerme.length >= 0.7)
    })
    const valeur = r ? { apercu: r.preview, pochette: r.album?.cover_big ?? null } : null
    garder(cle, valeur, valeur ? DUREE_CACHE : DUREE_SANS_RESULTAT)
    return valeur
  } catch (e) {
    console.error('[Musique] Deezer :', e.message)
    return null
  }
}
