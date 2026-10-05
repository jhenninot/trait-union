// Jeux de la personne accompagnée : choix des questions à partir de sa famille (« Ma famille »).
// Aucun score, aucune erreur : une mauvaise réponse devient une occasion de se souvenir.
import { age } from './coordonnees.js'

export const NB_QUESTIONS = 5

const melanger = (liste) => {
  const l = [...liste]
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]]
  }
  return l
}

// Les proches d'abord (enfants, petits-enfants, conjoint), les autres ensuite
const PROCHES = ['conjoint', 'enfants', 'petits-enfants']
const rang = (p) => (PROCHES.includes(p.groupe) ? 0 : 1)

// Personnes qu'on peut proposer : en vie, avec une photo, sans les auxiliaires
export function candidats(personnes, { age: avecAge = false } = {}) {
  return personnes.filter((p) => p.avatar && !p.decede && p.groupe !== 'aide' && p.prenom && (!avecAge || p.dateNaissance))
}

function tirer(liste, n) {
  const m = melanger(liste)
  return [...m.filter((p) => rang(p) === 0), ...m.filter((p) => rang(p) === 1)].slice(0, n)
}

// « Qui est-ce ? » : un prénom à retrouver parmi 3 (2 si peu de personnes)
export function questionsQui(personnes) {
  const pool = candidats(personnes)
  return tirer(pool, NB_QUESTIONS).map((p) => {
    const memeGenre = pool.filter((x) => x.id !== p.id && x.prenom !== p.prenom && (!p.genre || !x.genre || x.genre === p.genre))
    const autres = pool.filter((x) => x.id !== p.id && x.prenom !== p.prenom)
    const faux = []
    for (const x of [...melanger(memeGenre), ...melanger(autres)]) {
      if (faux.length < 2 && !faux.some((f) => f.prenom === x.prenom) && x.prenom !== p.prenom) faux.push(x)
    }
    const choix = melanger([p, ...faux]).map((x) => ({ texte: x.prenom, bonne: x.id === p.id }))
    return { personne: p, choix }
  })
}

// Tranches d'âge larges : un âge exact ferait échouer sans raison
export const TRANCHES = [
  { cle: 'bebe', texte: 'Un bébé', max: 2 },
  { cle: 'enfant', texte: 'Un enfant', max: 12 },
  { cle: 'ado', texte: 'Un adolescent', max: 19 },
  { cle: 'jeune', texte: 'Un jeune adulte', max: 39 },
  { cle: 'adulte', texte: 'Un adulte', max: 64 },
  { cle: 'senior', texte: 'Un senior', max: 200 }
]
const trancheDe = (a) => TRANCHES.find((t) => a <= t.max)

// « Quel âge ? » : la tranche d'âge à retrouver parmi 3 propositions
export function questionsAge(personnes) {
  return tirer(candidats(personnes, { age: true }), NB_QUESTIONS).map((p) => {
    const bonne = trancheDe(age(p.dateNaissance))
    const i = TRANCHES.indexOf(bonne)
    // Propositions éloignées les unes des autres pour que le choix reste net
    const faux = melanger(TRANCHES.filter((t, k) => t !== bonne && Math.abs(k - i) >= 1)).slice(0, 2)
    return { personne: p, choix: melanger([bonne, ...faux]).map((t) => ({ texte: t.texte, bonne: t === bonne })) }
  })
}
