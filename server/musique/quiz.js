import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { chansons } from '../db/schema.js'
import { chansonsDeJeunesse } from './catalogue.js'
import { trouverExtrait, cleChanson } from './itunes.js'

const melanger = (liste) => {
  const l = [...liste]
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]]
  }
  return l
}

// Questions du quiz musical d'une personne accompagnée. Les chansons choisies par ses aidants (et
// celles qu'elle a aimées) passent en premier, puis des chansons de sa jeunesse ; celles qu'elle a
// moins aimées ne reviennent pas. Chaque question : un extrait, 2 ou 3 titres à choisir.
export async function construireQuiz(utilisateur, { niveau = 3, questions = 5 } = {}) {
  const lignes = await db.select().from(chansons).where(eq(chansons.utilisateurId, utilisateur.id))
  const moins = new Set(lignes.filter((l) => l.reaction === 'moins').map((l) => l.cle))
  const preferees = melanger(lignes
    .filter((l) => l.reaction !== 'moins' && (l.source === 'aidant' || l.reaction === 'aime'))
    .map((l) => ({ titre: l.titre, artiste: l.artiste, annee: null, preferee: true })))

  const naissance = utilisateur.dateNaissance ? Number(utilisateur.dateNaissance.slice(0, 4)) : null
  const catalogue = melanger(chansonsDeJeunesse(naissance))
    .filter((c) => !moins.has(cleChanson(c.titre, c.artiste)) && !preferees.some((p) => cleChanson(p.titre, p.artiste) === cleChanson(c.titre, c.artiste)))

  // Un peu plus de candidates que de questions : certains extraits peuvent manquer
  const demi = Math.ceil(questions / 2)
  const candidates = [...preferees.slice(0, demi + 1), ...catalogue.slice(0, questions + 3), ...preferees.slice(demi + 1)]
  const vues = new Set()
  const choisies = candidates.filter((c) => {
    const k = cleChanson(c.titre, c.artiste)
    if (vues.has(k)) return false
    vues.add(k)
    return true
  }).slice(0, questions + 4)
  const extraits = await Promise.all(choisies.map((c) => trouverExtrait(c.titre, c.artiste)))
  const trouvees = choisies.map((c, i) => ({ ...c, ...extraits[i] })).filter((c) => c.apercu).slice(0, questions)

  // Titres proposés en plus de la bonne réponse : d'autres chansons du même genre d'époque
  const autres = [...catalogue, ...preferees]
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
