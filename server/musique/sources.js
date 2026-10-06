import * as deezer from './deezer.js'
import * as itunes from './itunes.js'

// Sources d'extraits : Deezer d'abord, iTunes en secours (si Deezer n'a pas la chanson ou ne répond
// pas). Le reste du quiz n'utilise que ce fichier.
export { cleChanson, normaliser } from './itunes.js'

// Titres d'un artiste qui ont un extrait : ceux de Deezer, complétés par iTunes s'il y en a peu
export async function chansonsDeArtiste(artiste) {
  const liste = await deezer.chansonsDeArtiste(artiste)
  if (liste.length >= 8) return liste
  const vus = new Set(liste.map((c) => itunes.normaliser(c.titre)))
  return [...liste, ...(await itunes.chansonsDeArtiste(artiste)).filter((c) => !vus.has(itunes.normaliser(c.titre)))]
}

// → { apercu, pochette } ou null. Options pour une œuvre classique : { classique, terme }
export async function trouverExtrait(titre, artiste, options = {}) {
  const trouve = options.classique
    ? await deezer.trouverClassique(artiste, options.terme ?? titre)
    : await deezer.trouverExtrait(titre, artiste)
  return trouve ?? itunes.trouverExtrait(titre, artiste, options)
}
