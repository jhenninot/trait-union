// Réglages des jeux d'une personne accompagnée (colonne utilisateurs.jeux), choisis par ses aidants.
// Sans réglage enregistré, tout est activé (sauf le quiz musical avec score, à activer aidé par aidé) : 3 propositions, 5 questions, sans les personnes décédées.
export const REGLAGES_DEFAUT = { actif: true, qui: true, age: true, musique: true, musiqueScore: false, quiScore: false, ageScore: false, ageDecennie: false, souvenirs: true, souvenirsScore: false, exterieurs: true, decedes: false, niveau: 3, questions: 5 }

export const reglages = (jeux) => ({ ...REGLAGES_DEFAUT, ...jeux })

// Corps de la requête → réglages valides
export function lireReglages(corps = {}) {
  const base = REGLAGES_DEFAUT
  return {
    actif: corps.actif !== false,
    qui: corps.qui !== false,
    age: corps.age !== false,
    musique: corps.musique !== false,
    musiqueScore: corps.musiqueScore === true,
    quiScore: corps.quiScore === true,
    ageScore: corps.ageScore === true,
    ageDecennie: corps.ageDecennie === true,
    souvenirs: corps.souvenirs !== false,
    souvenirsScore: corps.souvenirsScore === true,
    exterieurs: corps.exterieurs !== false,
    decedes: corps.decedes === true,
    niveau: [2, 3].includes(Number(corps.niveau)) ? Number(corps.niveau) : base.niveau,
    questions: [3, 5, 8, 10, 15, 20].includes(Number(corps.questions)) ? Number(corps.questions) : base.questions
  }
}
