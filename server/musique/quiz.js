import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { chansons } from '../db/schema.js'
import { chansonsDeJeunesse } from './catalogue.js'
import { STYLES } from './styles.js'
import { trouverExtrait, chansonsDeArtiste, cleChanson } from './itunes.js'

const melanger = (liste) => {
  const l = [...liste]
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]]
  }
  return l
}

// Une chanson par artiste à tour de rôle, pour varier les artistes
function entrelacer(listes) {
  const reste = listes.map(melanger)
  const sortie = []
  for (let i = 0; reste.some((l) => i < l.length); i++) for (const l of reste) if (i < l.length) sortie.push(l[i])
  return sortie
}

// Questions du quiz musical d'une personne accompagnée : environ la moitié vient des préférences
// choisies par ses aidants (chansons, artistes, styles) et des chansons qu'elle a aimées, le reste
// de chansons de sa jeunesse, le tout mélangé. Celles qu'elle a moins aimées ne reviennent pas. Chaque question : un
// extrait, 2 ou 3 titres à choisir.
export async function construireQuiz(utilisateur, { niveau = 3, questions = 5 } = {}) {
  const lignes = await db.select().from(chansons).where(eq(chansons.utilisateurId, utilisateur.id))
  const moins = new Set(lignes.filter((l) => l.type === 'chanson' && l.reaction === 'moins').map((l) => l.cle))
  const preferees = melanger(lignes
    .filter((l) => l.type === 'chanson' && l.reaction !== 'moins' && (l.source === 'aidant' || l.reaction === 'aime'))
    .map((l) => ({ titre: l.titre, artiste: l.artiste, annee: null, preferee: true })))

  // Artistes choisis, et deux artistes au hasard pour chaque style choisi
  const artistes = [...new Set([
    ...lignes.filter((l) => l.type === 'artiste').map((l) => l.artiste),
    ...lignes.filter((l) => l.type === 'style').flatMap((l) => melanger(STYLES[l.style] ?? []).slice(0, 2))
  ])]
  const deArtistes = entrelacer(await Promise.all(artistes.map(chansonsDeArtiste)))
    .filter((c) => !moins.has(cleChanson(c.titre, c.artiste)))
    .map((c) => ({ ...c, preferee: true }))

  const naissance = utilisateur.dateNaissance ? Number(utilisateur.dateNaissance.slice(0, 4)) : null
  const catalogue = melanger(chansonsDeJeunesse(naissance))
    .filter((c) => !moins.has(cleChanson(c.titre, c.artiste)))

  // Candidates dans l'ordre voulu (la moitié de préférences, le reste de la jeunesse), puis le reste
  // en réserve. On cherche leurs extraits par petits groupes jusqu'à en avoir assez : certains
  // peuvent manquer (absents du catalogue, limite de l'API).
  const prefs = [...preferees, ...deArtistes]
  const demi = Math.ceil(questions / 2)
  const vues = new Set()
  const candidates = [...prefs.slice(0, demi), ...catalogue.slice(0, questions - Math.min(prefs.length, demi) + 2), ...prefs.slice(demi), ...catalogue.slice(questions + 2)]
    .filter((c) => {
      const k = cleChanson(c.titre, c.artiste)
      if (vues.has(k)) return false
      vues.add(k)
      return true
    })
  const trouvees = []
  for (let i = 0; i < candidates.length && trouvees.length < questions; ) {
    const groupe = candidates.slice(i, i + Math.max(3, questions - trouvees.length + 1))
    i += groupe.length
    // Les chansons venues de la recherche d'un artiste ont déjà leur extrait
    const extraits = await Promise.all(groupe.map((c) => (c.apercu ? c : trouverExtrait(c.titre, c.artiste))))
    groupe.forEach((c, k) => { if (extraits[k]?.apercu && trouvees.length < questions) trouvees.push({ ...c, ...extraits[k] }) })
  }
  // Préférences et chansons de la jeunesse sont mélangées : les préférées ne passent pas toujours en premier
  melanger(trouvees).forEach((c, k) => { trouvees[k] = c })

  // Titres proposés en plus de la bonne réponse : d'autres chansons du même genre d'époque
  const autres = [...catalogue, ...prefs]
  return trouvees.map((c) => {
    const faux = []
    for (const a of melanger(autres)) {
      if (faux.length >= niveau - 1) break
      if (cleChanson(a.titre, '') !== cleChanson(c.titre, '') && !faux.includes(a.titre)) faux.push(a.titre)
    }
    return {
      titre: c.titre, artiste: c.artiste, annee: c.annee, apercu: c.apercu, pochette: c.pochette ?? null, preferee: Boolean(c.preferee),
      choix: melanger([{ texte: c.titre, bonne: true }, ...faux.map((texte) => ({ texte, bonne: false }))])
    }
  })
}
