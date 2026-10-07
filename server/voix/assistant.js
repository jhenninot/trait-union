import { and, eq, or, ne, lt, gte, isNull, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { membres, rendezVous, albums, utilisateurs } from '../db/schema.js'
import { occurrences } from '../agenda/recurrence.js'
import { mesCercles } from '../routes/auth.js'
import { filtreNiveaux } from '../routes/agenda.js'
import { estAnniversaire, age, ageTexte } from '../anniversaires.js'
import { chargerArbre, phrase as phraseArbre } from '../arbre.js'
import { messagesAccompagne } from '../routes/messagerie.js'
import { configurationActive, deviner } from './ia.js'

// Assistant vocal de la personne accompagnée, sans IA : on cherche des mots-clés dans ce
// qu'elle a dit (reconnaissance vocale du téléphone ou du navigateur) et on répond par une
// phrase à lire à voix haute, éventuellement avec une page à ouvrir ou des choix à proposer.
//
// Tout est ici plutôt que dans le front pour qu'une skill Alexa puisse s'en servir plus tard :
// Alexa reconnaît elle-même l'intention (JourneeIntent, HeureIntent…) et n'aura qu'à appeler
// repondre(utilisateur, intention, parametres) pour obtenir la phrase à dire.

export const INTENTIONS = ['journee', 'demain', 'heure', 'date', 'agenda', 'photos', 'famille', 'personne', 'qui', 'age', 'naissance', 'deces', 'anniversaire', 'lien', 'classement', 'telephone', 'adresse', 'appeler', 'jour', 'rdv', 'visites', 'messages', 'accueil', 'merci', 'inconnue']

const JOURS_AGENDA = 60

// Minuscules, sans accents ni ponctuation : « Qu'est-ce que j'ai aujourd'hui ? » → « qu est ce que j ai aujourd hui »
export const normaliser = (texte) => String(texte ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const contient = (phrase, mots) => mots.some((m) => ` ${phrase} `.includes(` ${m}`))
// (une espace finale dans un mot-clé impose un mot entier : la phrase est entourée d'espaces)

// Mots-clés de chaque intention, du plus précis au plus général : la première qui correspond gagne.
// Les débuts de mots suffisent (« photo » trouve « photos »).
const JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

// Un mot-clé qui finit par une espace doit être un mot entier (la phrase est entourée d'espaces) :
// « mon age » ne doit pas trouver « mon agenda ».
const MOTS_CLES = [
  // Questions sur les personnes : avant « date » (« la date de naissance de Léa ») et « agenda » (« quand est mort… »)
  ['deces', ['mort ', 'morte ', 'decede ', 'decedee ', 'deces ', 'disparu ']],
  ['naissance', ['naissance', 'est ne ', 'est nee ', 'je suis ne ', 'ne quand', 'nee quand']],
  ['age', ['quel age ', 'l age ', 'age de ', 'son age ', 'mon age ']],
  ['anniversaire', ['anniversaire']],
  ['classement', ['plus jeune', 'plus age ', 'plus vieux', 'plus de petits enfants', 'plus d enfants', 'doyen']],
  ['visites', ['qui vient', 'qui passe', 'qui doit venir', 'visite']],
  ['rdv', ['a quelle heure', 'quelle heure est le ', 'quelle heure est la ', 'quelle heure est mon ', 'quelle heure est ma ', 'quand est le ', 'quand est la ', 'quand ai je ']],
  ['heure', ['quelle heure', 'l heure', 'heure est']],
  ['jour', ['apres demain', ...JOURS_SEMAINE.map((j) => `${j} `)]],
  ['demain', ['demain']],
  ['date', ['quel jour', 'quelle date', 'la date', 'on est quel', 'sommes nous', 'quel mois', 'quelle annee', 'on est le']],
  ['appeler', ['appelle ', 'appeler ', 'appel ', 'coup de fil', 'telephone a ']],
  ['adresse', ['ou habite', 'habite ', 'adresse']],
  ['telephone', ['numero', 'telephone', 'portable']],
  ['journee', ['aujourd hui', 'ma journee', 'la journee', 'programme', 'qu est ce que je fais', 'je fais quoi', 'prevu', 'faire quoi']],
  ['messages', ['message', 'courrier', 'qui m a ecrit', 'm a ecrit', 'a ecrit', 'lis mes', 'nouvelles de']],
  ['photos', ['photo', 'image', 'album', 'souvenir']],
  ['agenda', ['agenda', 'rendez vous', 'rdv', 'calendrier', 'semaine', 'quand']],
  ['famille', ['famille', 'enfant', 'fils', 'fille', 'petit', 'proche', 'qui sont', 'mari', 'femme', 'frere', 'soeur']],
  ['accueil', ['accueil', 'retour', 'maison', 'debut']],
  // En dernier : « merci, montre les photos » doit ouvrir les photos
  ['merci', ['merci', 'c est bon', 'rien', 'stop', 'arrete', 'tais toi', 'au revoir']]
]

// Ce que la personne voit : sa famille, son agenda (mêmes règles que « Mon agenda »,
// sans les rendez-vous privés) et ses albums. Seuls les cercles où elle est accompagnée comptent.
async function donneesPersonne(utilisateur, jours = JOURS_AGENDA) {
  const ids = (await mesCercles(utilisateur.id)).filter((c) => c.role === 'accompagne').map((c) => c.id)
  if (!ids.length) return { famille: [], agenda: [], albums: [], arbres: [] }
  const maintenant = new Date()
  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
  const fin = new Date(debut.getTime() + jours * 86_400_000)
  const [famille, lignes, listeAlbums] = await Promise.all([
    db.select({ prenom: membres.prenom, nom: membres.nom, role: membres.role, utilisateurId: membres.utilisateurId, dateNaissance: utilisateurs.dateNaissance, decede: utilisateurs.decede, dateDeces: utilisateurs.dateDeces, telephone: utilisateurs.telephone, adresse: utilisateurs.adresse })
      .from(membres).leftJoin(utilisateurs, eq(membres.utilisateurId, utilisateurs.id)).where(inArray(membres.cercleId, ids)),
    db.select().from(rendezVous).where(and(
      inArray(rendezVous.cercleId, ids),
      or(filtreNiveaux({ utilisateurId: utilisateur.id, role: 'accompagne', peutGerer: false }), eq(rendezVous.creeParId, utilisateur.id)),
      lt(rendezVous.debut, fin),
      or(
        and(eq(rendezVous.recurrence, 'aucune'), or(gte(rendezVous.debut, debut), gte(rendezVous.fin, debut))),
        and(ne(rendezVous.recurrence, 'aucune'), or(isNull(rendezVous.recurrenceFin), gte(rendezVous.recurrenceFin, debut)))
      )
    )),
    db.select({ id: albums.id, nom: albums.nom }).from(albums).where(inArray(albums.cercleId, ids))
  ])
  // Arbre généalogique : la phrase qui présente chaque personne (« Léo est votre arrière-petit-fils… »)
  // et les personnes sans compte (jeunes enfants…) que la personne accompagnée peut voir
  const autres = []
  const phrases = new Map()
  const genres = new Map()
  const arbres = []
  for (const id of ids) {
    const g = await chargerArbre(id)
    const moi = g.personnes.find((p) => p.utilisateurId === utilisateur.id)
    if (!moi) continue
    arbres.push({ g, moi })
    for (const p of g.personnes) {
      if (p.id === moi.id || !p.visibleAide) continue
      const texte = phraseArbre(g, moi.id, p.id)
      if (p.utilisateurId) { phrases.set(p.utilisateurId, texte); genres.set(p.utilisateurId, p.genre) }
      else autres.push({ prenom: p.prenom, nom: p.nom, role: null, utilisateurId: null, personneId: p.id, dateNaissance: p.dateNaissance, decede: p.decede, dateDeces: p.dateDeces, genre: p.genre, telephone: p.telephone, adresse: p.adresse, phrase: texte })
    }
  }
  return {
    // Les autres personnes accompagnées du cercle (un conjoint, par exemple) font partie de la famille
    famille: [
      ...famille.filter((m) => m.utilisateurId !== utilisateur.id).map((m) => ({ ...m, phrase: phrases.get(m.utilisateurId) ?? null, genre: genres.get(m.utilisateurId) ?? null })),
      ...autres
    ],
    agenda: lignes.flatMap((r) => occurrences(r, debut, fin)).sort((a, b) => a.debut - b.debut),
    albums: listeAlbums,
    arbres
  }
}

// --- Phrases (écrites pour être lues : pas d'abréviations ni de symboles)

const heureParlee = (d) => {
  const h = d.getHours()
  const m = d.getMinutes()
  if (h === 12 && m === 0) return 'midi'
  if (h === 0 && m === 0) return 'minuit'
  return `${h} heure${h > 1 ? 's' : ''}${m ? ` ${m}` : ''}`
}
const dateParlee = (d) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const memeJour = (a, b) => a.toDateString() === b.toDateString()

function quandParle(rdv, { avecJour = true } = {}) {
  const aujourdhui = new Date()
  const demain = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate() + 1)
  const jour = memeJour(rdv.debut, aujourdhui) ? 'aujourd\'hui' : memeJour(rdv.debut, demain) ? 'demain' : dateParlee(rdv.debut)
  const heure = rdv.journeeEntiere ? '' : `à ${heureParlee(rdv.debut)}`
  return [avecJour ? jour : '', heure].filter(Boolean).join(' ')
}

const listeParlee = (elements) => elements.length <= 1
  ? elements.join('')
  : `${elements.slice(0, -1).join(', ')} et ${elements.at(-1)}`

// `apres` : ne garde que ce qui n'est pas encore terminé (programme d'aujourd'hui)
function programme(agenda, jour, libelle, apres = null) {
  const tous = agenda.filter((r) => r.debut <= new Date(jour.getTime() + 86_400_000 - 1) && (r.fin ?? r.debut) >= jour)
  const duJour = apres ? tous.filter((r) => (r.fin ?? r.debut) > apres) : tous
  if (!duJour.length) return tous.length ? `Plus rien n'est prévu ${libelle}.` : `Rien n'est prévu ${libelle}.`
  const elements = duJour.slice(0, 5).map((r) => `${r.journeeEntiere || r.debut < jour ? '' : `à ${heureParlee(r.debut)}, `}${r.titre}`)
  const suite = duJour.length > 5 ? ` Et ${duJour.length - 5} autres choses.` : ''
  return `${libelle.charAt(0).toUpperCase()}${libelle.slice(1)}, vous avez : ${listeParlee(elements)}.${suite}`
}

// « C'est votre anniversaire : 85 ans aujourd'hui ! C'est aussi l'anniversaire de Claire, 25 ans. »
function anniversaires(utilisateur, famille, jour) {
  const phrases = []
  if (estAnniversaire(utilisateur.dateNaissance, jour)) {
    phrases.push(`Joyeux anniversaire ! Vous avez ${age(utilisateur.dateNaissance, jour)} ans aujourd'hui.`)
  }
  const vus = new Set()
  const fetes = famille.filter((m) => {
    const cle = m.utilisateurId ?? m.personneId
    if (m.decede || !estAnniversaire(m.dateNaissance, jour) || vus.has(cle)) return false
    vus.add(cle)
    return true
  }).map((m) => {
    const n = age(m.dateNaissance, jour)
    return `${m.prenom}, ${n} an${n > 1 ? 's' : ''}`
  })
  if (fetes.length) phrases.push(`C'est ${phrases.length ? 'aussi ' : ''}l'anniversaire de ${listeParlee(fetes)}.`)
  return phrases.join(' ')
}

const MOIS_PARLE = { day: 'numeric', month: 'long', year: 'numeric' }
// « 1er mars 1950 » à partir de « AAAA-MM-JJ »
const dateComplete = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', MOIS_PARLE).replace(/^1 /, '1er ')
const accord = (genre, homme, femme) => genre === 'femme' ? femme : homme

const trouverPersonne = (famille, prenom) => {
  const cle = normaliser(prenom)
  return famille.find((m) => normaliser(m.prenom) === cle)
}

// Réponses aux questions sur une personne de la famille (âge, naissance, décès) ou sur la personne elle-même
function reponsePersonne(intention, utilisateur, p) {
  const maintenant = new Date()
  if (!p) { // la personne elle-même
    if (!utilisateur.dateNaissance) return { texte: 'Je ne connais pas votre date de naissance. Vos proches peuvent la renseigner dans votre profil.' }
    const n = ageTexte(utilisateur.dateNaissance, maintenant)
    return { texte: intention === 'naissance'
      ? `Votre date de naissance est le ${dateComplete(utilisateur.dateNaissance)}. Vous avez ${n}.`
      : `Vous avez ${n}.` }
  }
  const nom = p.prenom
  if (p.decede) {
    const mort = p.dateDeces ? ` le ${dateComplete(p.dateDeces)}` : ''
    const a = p.dateNaissance && p.dateDeces ? `, à ${ageTexte(p.dateNaissance, new Date(`${p.dateDeces}T12:00:00`))}` : ''
    if (intention === 'naissance' && p.dateNaissance) {
      return { texte: `${nom} ${accord(p.genre, 'est né', 'est née')} le ${dateComplete(p.dateNaissance)} et ${accord(p.genre, 'est décédé', 'est décédée')}${mort}${a}.`, lien: '/famille' }
    }
    return { texte: `${nom} ${accord(p.genre, 'est décédé', 'est décédée')}${mort}${a}.`, lien: '/famille' }
  }
  if (intention === 'deces') return { texte: `${nom} est en vie.`, lien: '/famille' }
  if (!p.dateNaissance) return { texte: `Je ne connais pas la date de naissance de ${nom}.`, lien: '/famille' }
  const n = ageTexte(p.dateNaissance, maintenant)
  return { texte: intention === 'naissance'
    ? `${nom} ${accord(p.genre, 'est né', 'est née')} le ${dateComplete(p.dateNaissance)}. ${accord(p.genre, 'Il', 'Elle')} a ${n}.`
    : `${nom} a ${n}.`, lien: '/famille' }
}

const bissextile = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
const jourMoisParle = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }).replace(/^1 /, '1er ')
const premiereMajuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1)

// Prochain anniversaire d'une date de naissance « AAAA-MM-JJ » : date, jours à attendre, âge atteint
// (les nés un 29 février sont fêtés le 28 les autres années)
function prochainAnniversaire(date, maintenant) {
  const [a, m, j] = date.split('-').map(Number)
  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
  const cible = (annee) => new Date(annee, m - 1, m === 2 && j === 29 && !bissextile(annee) ? 28 : j)
  let c = cible(debut.getFullYear())
  if (c < debut) c = cible(debut.getFullYear() + 1)
  return { date: c, jours: Math.round((c - debut) / 86_400_000), age: c.getFullYear() - a }
}

function reponseAnniversaire(utilisateur, p) {
  if (p?.decede) return reponsePersonne('naissance', utilisateur, p)
  const date = p ? p.dateNaissance : utilisateur.dateNaissance
  if (!date) return { texte: p ? `Je ne connais pas la date de naissance de ${p.prenom}.` : 'Je ne connais pas votre date de naissance.', lien: p ? '/famille' : undefined }
  const { date: d, jours, age: n } = prochainAnniversaire(date, new Date())
  const quand = jours === 0 ? 'aujourd\'hui' : jours === 1 ? 'demain' : `le ${jourMoisParle(d)}, dans ${jours} jours`
  if (!p) return { texte: jours === 0 ? `C'est aujourd'hui votre anniversaire : vous avez ${n} ans !` : `Votre anniversaire est ${quand}. Vous aurez ${n} ans.` }
  const il = accord(p.genre, 'il', 'elle')
  return { texte: jours === 0 ? `C'est aujourd'hui l'anniversaire de ${p.prenom} : ${il} a ${n} ans !` : `L'anniversaire de ${p.prenom} est ${quand}. ${premiereMajuscule(il)} aura ${n} ans.`, lien: '/famille' }
}

// « Qui fête son anniversaire ce mois-ci ? » : vous et les membres de la famille en vie
function anniversairesDuMois(utilisateur, famille) {
  const maintenant = new Date()
  const mois = maintenant.getMonth() + 1
  const nomMois = maintenant.toLocaleDateString('fr-FR', { month: 'long' })
  const vus = new Set()
  const fetes = []
  const ajouter = (nom, date) => fetes.push({ nom, jour: Number(date.slice(8, 10)) })
  if (utilisateur.dateNaissance && Number(utilisateur.dateNaissance.slice(5, 7)) === mois) ajouter('vous', utilisateur.dateNaissance)
  for (const m of famille) {
    const cle = m.utilisateurId ?? m.personneId ?? m.prenom
    if (m.decede || !m.dateNaissance || vus.has(cle) || Number(m.dateNaissance.slice(5, 7)) !== mois) continue
    vus.add(cle)
    ajouter(m.prenom, m.dateNaissance)
  }
  if (!fetes.length) return { texte: `Personne ne fête son anniversaire en ${nomMois}.`, lien: '/famille' }
  fetes.sort((a, b) => a.jour - b.jour)
  return { texte: `En ${nomMois}, on fête l'anniversaire de ${listeParlee(fetes.map((f) => `${f.nom} le ${f.jour === 1 ? '1er' : f.jour}`))}.`, lien: '/famille' }
}

// --- Liens de parenté (arbre généalogique) : « Combien ai-je de petits-enfants ? », « Qui est le mari de Claire ? »
const uniques = (liste) => [...new Map(liste.map((p) => [p.id, p])).values()]
const personnesDe = (g, ids) => ids.map((i) => g.parId.get(i)).filter(Boolean)
const enfantsDe = (g, id) => personnesDe(g, g.enfants(id))
const parentsDe = (g, id) => personnesDe(g, g.parents(id))
const petitsEnfantsDe = (g, id) => uniques(enfantsDe(g, id).flatMap((e) => enfantsDe(g, e.id)))
const arrierePetitsEnfantsDe = (g, id) => uniques(petitsEnfantsDe(g, id).flatMap((e) => enfantsDe(g, e.id)))
const conjointsDe = (g, id) => personnesDe(g, g.conjoints(id).filter((c) => !c.separes).map((c) => c.id))
const fratrieDe = (g, id) => uniques(parentsDe(g, id).flatMap((p) => enfantsDe(g, p.id))).filter((p) => p.id !== id)
const genre = (liste, g) => liste.filter((p) => p.genre === g)

// de(g, id) : personnes ; mots : façons de la dire (mots entiers, phrase normalisée) ; du plus précis au plus général
const RELATIONS = {
  arriere_petits_enfants: { sing: 'arrière-petit-enfant', plur: 'arrière-petits-enfants', art: 'L\'', de: arrierePetitsEnfantsDe, mots: ['arriere petits enfants ', 'arriere petit enfant ', 'arriere petit fils ', 'arriere petits fils ', 'arriere petite fille ', 'arriere petites filles '] },
  petits_fils: { sing: 'petit-fils', plur: 'petits-fils', art: 'Le ', de: (g, id) => genre(petitsEnfantsDe(g, id), 'homme'), mots: ['petit fils ', 'petits fils '] },
  petites_filles: { sing: 'petite-fille', plur: 'petites-filles', art: 'La ', de: (g, id) => genre(petitsEnfantsDe(g, id), 'femme'), mots: ['petite fille ', 'petites filles '] },
  petits_enfants: { sing: 'petit-enfant', plur: 'petits-enfants', art: 'Le ', de: petitsEnfantsDe, mots: ['petits enfants ', 'petit enfant '] },
  freres_soeurs: { sing: 'frère ou sœur', plur: 'frères et sœurs', art: 'Le ', de: fratrieDe, mots: ['freres et soeurs ', 'frere et soeur ', 'freres soeurs '] },
  frere: { sing: 'frère', plur: 'frères', art: 'Le ', de: (g, id) => genre(fratrieDe(g, id), 'homme'), mots: ['frere ', 'freres '] },
  soeur: { sing: 'sœur', plur: 'sœurs', art: 'La ', de: (g, id) => genre(fratrieDe(g, id), 'femme'), mots: ['soeur ', 'soeurs '] },
  mari: { sing: 'mari', plur: 'maris', art: 'Le ', de: (g, id) => genre(conjointsDe(g, id), 'homme'), mots: ['mon mari ', 'le mari de ', 'son mari ', 'mon epoux ', 'l epoux de '] },
  epouse: { sing: 'épouse', plur: 'épouses', art: 'L\'', de: (g, id) => genre(conjointsDe(g, id), 'femme'), mots: ['ma femme ', 'la femme de ', 'sa femme ', 'mon epouse ', 'l epouse de '] },
  conjoint: { sing: 'conjoint', plur: 'conjoints', art: 'Le ', de: conjointsDe, mots: ['conjoint ', 'conjointe ', 'compagnon ', 'compagne '] },
  mere: { sing: 'mère', plur: 'mères', art: 'La ', de: (g, id) => genre(parentsDe(g, id), 'femme'), mots: ['mere '] },
  pere: { sing: 'père', plur: 'pères', art: 'Le ', de: (g, id) => genre(parentsDe(g, id), 'homme'), mots: ['pere '] },
  parents: { sing: 'parent', plur: 'parents', art: 'Le ', de: parentsDe, mots: ['parents ', 'parent '] },
  filles: { sing: 'fille', plur: 'filles', art: 'La ', de: (g, id) => genre(enfantsDe(g, id), 'femme'), mots: ['fille ', 'filles '] },
  fils: { sing: 'fils', plur: 'fils', art: 'Le ', de: (g, id) => genre(enfantsDe(g, id), 'homme'), mots: ['fils '] },
  enfants: { sing: 'enfant', plur: 'enfants', art: 'L\'', de: enfantsDe, mots: ['enfants ', 'enfant '] }
}
const QUESTIONS_LIEN = ['combien', 's appelle', 's appellent', 'qui est', 'qui sont', 'nom de', 'noms de', 'comment']

// Clé de la relation dont parle la phrase (« combien ai-je d'enfants », « qui est le mari de Claire »), sinon null
function detecterLien(phrase) {
  if (!contient(phrase, QUESTIONS_LIEN)) return null
  return Object.entries(RELATIONS).find(([, r]) => contient(phrase, r.mots))?.[0] ?? null
}

const visibleAide = (p, moi) => p.visibleAide !== false || p.id === moi.id
function trouverDansArbres(arbres, prenom) {
  const cle = normaliser(prenom)
  for (const { g, moi } of arbres) {
    const p = g.personnes.find((x) => normaliser(x.prenom) === cle && visibleAide(x, moi))
    if (p) return { g, moi, p }
  }
  return null
}

function reponseLien(arbres, parametres) {
  const rel = RELATIONS[parametres.relation]
  if (!rel || !arbres.length) return { texte: 'Je ne trouve pas votre famille dans l\'arbre. Voici votre famille.', lien: '/famille' }
  let g, id, nom
  if (parametres.prenom) {
    const t = trouverDansArbres(arbres, parametres.prenom)
    if (!t) return { texte: 'Je ne connais pas cette personne. Voici votre famille.', lien: '/famille' }
    ;({ g } = t); id = t.p.id; nom = t.p.prenom
  } else {
    id = arbres[0].moi.id; g = arbres[0].g
  }
  const moi = arbres.find((a) => a.g === g).moi
  const liste = rel.de(g, id).filter((p) => visibleAide(p, moi))
  if (!liste.length) return { texte: `Je ne vois pas de ${rel.sing} ${nom ? `pour ${nom}` : 'dans votre arbre'}.`, lien: '/famille' }
  const n = liste.length
  if (parametres.combien) {
    const morts = liste.filter((p) => p.decede).length
    const dont = morts ? `, dont ${morts === 1 ? 'un décédé' : `${morts} décédés`}` : ''
    return { texte: `${nom ?? 'Vous'} ${nom ? 'a' : 'avez'} ${n} ${n > 1 ? rel.plur : rel.sing}${dont}.`, lien: '/famille' }
  }
  const sujet = nom ? (n === 1 ? `${rel.art}${rel.sing} de ${nom}` : `Les ${rel.plur} de ${nom}`) : (n === 1 ? `Votre ${rel.sing}` : `Vos ${rel.plur}`)
  return { texte: `${sujet} ${n === 1 ? 's\'appelle' : 's\'appellent'} ${listeParlee(liste.map((p) => p.prenom))}.`, lien: '/famille' }
}

// « Qui est le plus jeune de la famille ? », « Qui a le plus de petits-enfants ? »
function reponseClassement(arbres, critere) {
  const gens = arbres.flatMap(({ g, moi }) => g.personnes.filter((p) => visibleAide(p, moi) && !p.decede).map((p) => ({ g, p })))
  if (!gens.length) return { texte: 'Je ne trouve pas votre famille dans l\'arbre.', lien: '/famille' }
  if (critere === 'jeune' || critere === 'age') {
    const avecDate = gens.filter(({ p }) => p.dateNaissance)
    if (!avecDate.length) return { texte: 'Je ne connais pas assez de dates de naissance.', lien: '/famille' }
    const ordre = avecDate.sort((a, b) => (critere === 'jeune' ? b.p.dateNaissance.localeCompare(a.p.dateNaissance) : a.p.dateNaissance.localeCompare(b.p.dateNaissance)))
    const { p } = ordre[0]
    return { texte: `${critere === 'jeune' ? 'Le plus jeune' : 'Le plus âgé'} de la famille est ${p.prenom}, ${ageTexte(p.dateNaissance)}.`, lien: '/famille' }
  }
  const compte = ({ g, p }) => (critere === 'enfants' ? enfantsDe(g, p.id) : petitsEnfantsDe(g, p.id)).length
  const max = Math.max(...gens.map(compte))
  const mot = critere === 'enfants' ? 'enfant' : 'petit-enfant'
  if (!max) return { texte: `Personne n'a de ${mot} dans l'arbre.`, lien: '/famille' }
  const tetes = uniques(gens.filter((x) => compte(x) === max).map((x) => x.p)).map((p) => p.prenom)
  return { texte: `${tetes.length > 1 ? 'Ce sont' : 'C\'est'} ${listeParlee(tetes)}, avec ${max} ${mot}${max > 1 ? 's' : ''}${tetes.length > 1 ? ' chacun' : ''}.`, lien: '/famille' }
}

// Numéro lu à voix haute : « 06 12 34 56 78 »
function numeroParle(tel) {
  const chiffres = tel.replace(/\D/g, '')
  return /^0\d{9}$/.test(chiffres) ? chiffres.match(/\d{2}/g).join(' ') : tel
}

// Jour de la semaine ou « après-demain » cité dans la phrase normalisée : { decalage, apresDemain }
function jourCite(phrase) {
  if (contient(phrase, ['apres demain'])) return { decalage: 2, apresDemain: true }
  const index = JOURS_SEMAINE.findIndex((j) => contient(phrase, [`${j} `]))
  if (index < 0) return null
  const auj = new Date().getDay()
  let decalage = (index - auj + 7) % 7
  if (decalage === 0 && contient(phrase, ['prochain'])) decalage = 7
  return { decalage }
}

const MOTS_VIDES = new Set(['quelle', 'heure', 'quand', 'avec', 'dans', 'pour', 'prochain', 'rendez', 'vous', 'chez', 'mon', 'mes', 'vais', 'aller', 'est'])
// Mots utiles pour retrouver un rendez-vous (« à quelle heure est le médecin » → « medecin »)
const motsRdv = (phrase) => phrase.split(' ').filter((m) => m.length >= 4 && !MOTS_VIDES.has(m))

const phraseMessage = (m) => m.type === 'photo' ? `${m.auteur.prenom} vous a envoyé une photo${m.texte ? ` : ${m.texte}` : ''}.`
  : m.type === 'vocal' ? `${m.auteur.prenom} vous a envoyé un message vocal.`
    : m.type === 'sondage' ? `${m.auteur.prenom} cherche une date pour : ${m.texte}. Dites-lui quels jours vous pouvez venir dans vos messages.`
      : `${m.auteur.prenom} vous a écrit : ${m.texte}`

const MOTS_ALBUM_IGNORES = new Set(['photo', 'photos', 'album', 'albums', 'souvenirs', 'famille', 'avec', 'chez', 'dans'])

const CHOIX = [
  { libelle: 'Ma journée', icone: 'soleil', intention: 'journee' },
  { libelle: 'Mes photos', icone: 'photo', lien: '/photos' },
  { libelle: 'Ma famille', icone: 'famille', lien: '/famille' },
  { libelle: 'Mes messages', icone: 'message', lien: '/messages' },
  { libelle: 'Mon agenda', icone: 'agenda', lien: '/agenda' }
]

// Réponse à une intention : { texte (à lire), lien (page à ouvrir, facultatif), choix (facultatif) }
export async function repondre(utilisateur, intention, parametres = {}) {
  const maintenant = new Date()
  const aujourdhui = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
  switch (intention) {
    case 'heure':
      return { texte: `Il est ${heureParlee(maintenant)}.` }
    case 'date':
      return { texte: `Nous sommes ${dateParlee(maintenant)} ${maintenant.getFullYear()}.` }
    case 'journee': {
      const { agenda, famille } = await donneesPersonne(utilisateur, 1)
      const h = maintenant.getHours()
      const moment = h < 6 || h >= 22 ? 'la nuit' : h < 12 ? 'le matin' : h < 18 ? 'l\'après-midi' : 'le soir'
      const fete = anniversaires(utilisateur, famille, maintenant)
      return {
        texte: `Bonjour ${utilisateur.prenom}. Nous sommes ${dateParlee(maintenant)}, il est ${heureParlee(maintenant)}, c'est ${moment}. ${fete ? `${fete} ` : ''}${programme(agenda, aujourdhui, 'aujourd\'hui', maintenant)}`,
        lien: '/'
      }
    }
    case 'demain': {
      const { agenda } = await donneesPersonne(utilisateur, 2)
      return { texte: programme(agenda, new Date(aujourdhui.getTime() + 86_400_000), 'demain'), lien: '/agenda' }
    }
    case 'agenda': {
      const { agenda } = await donneesPersonne(utilisateur)
      const prochains = agenda.filter((r) => (r.fin ?? r.debut) >= maintenant).slice(0, 3)
      if (!prochains.length) return { texte: 'Rien n\'est prévu pour le moment. Voici votre agenda.', lien: '/agenda' }
      return { texte: `Voici votre agenda. Prochainement : ${listeParlee(prochains.map((r) => `${r.titre}, ${quandParle(r)}`))}.`, lien: '/agenda' }
    }
    case 'personne': {
      const { agenda } = await donneesPersonne(utilisateur)
      const prenom = parametres.prenom
      const avec = agenda.filter((r) => (r.fin ?? r.debut) >= maintenant && normaliser(r.titre).split(' ').includes(normaliser(prenom)))
      if (!avec.length) return { texte: `Je ne vois pas de rendez-vous avec ${prenom} pour l'instant. Voici votre famille.`, lien: '/famille' }
      return { texte: `${avec[0].titre}, ${quandParle(avec[0])}.`, lien: '/agenda' }
    }
    case 'photos': {
      if (parametres.prenom) return { texte: `Je n'ai pas d'album au nom de ${parametres.prenom}. Voici vos photos.`, lien: '/photos' }
      if (parametres.album) return { texte: `Voici l'album ${parametres.album.nom}.`, lien: `/photos?album=${parametres.album.id}` }
      return { texte: 'Voici vos photos.', lien: '/photos' }
    }
    case 'famille':
      return { texte: 'Voici votre famille.', lien: '/famille' }
    case 'qui': {
      const { famille } = await donneesPersonne(utilisateur, 0)
      const cle = normaliser(parametres.prenom)
      const p = famille.find((m) => normaliser(m.prenom) === cle && m.phrase) ?? famille.find((m) => normaliser(m.prenom) === cle)
      if (!p) return { texte: 'Je ne connais pas cette personne. Voici votre famille.', lien: '/famille' }
      return { texte: p.phrase ?? (p.decede ? `${p.prenom} est décédé.` : `${p.prenom} fait partie de votre entourage.`), lien: '/famille' }
    }
    case 'age':
    case 'naissance':
    case 'deces': {
      if (parametres.inconnu) return { texte: 'Je ne connais pas cette personne. Voici votre famille.', lien: '/famille' }
      if (!parametres.prenom) {
        if (intention === 'deces') return { texte: 'De qui voulez-vous parler ? Voici votre famille.', lien: '/famille' }
        return reponsePersonne(intention, utilisateur, null)
      }
      const { famille } = await donneesPersonne(utilisateur, 0)
      const p = trouverPersonne(famille, parametres.prenom)
      return p ? reponsePersonne(intention, utilisateur, p) : { texte: 'Je ne connais pas cette personne. Voici votre famille.', lien: '/famille' }
    }
    case 'anniversaire': {
      const { famille } = await donneesPersonne(utilisateur, 0)
      if (parametres.mois) return anniversairesDuMois(utilisateur, famille)
      if (parametres.inconnu) return { texte: 'Je ne connais pas cette personne. Voici votre famille.', lien: '/famille' }
      return reponseAnniversaire(utilisateur, parametres.prenom ? trouverPersonne(famille, parametres.prenom) : null)
    }
    case 'lien': {
      if (parametres.inconnu) return { texte: 'Je ne connais pas cette personne. Voici votre famille.', lien: '/famille' }
      return reponseLien((await donneesPersonne(utilisateur, 0)).arbres, parametres)
    }
    case 'classement':
      return reponseClassement((await donneesPersonne(utilisateur, 0)).arbres, parametres.critere)
    case 'telephone':
    case 'adresse':
    case 'appeler': {
      const { famille } = await donneesPersonne(utilisateur, 0)
      const p = parametres.prenom ? trouverPersonne(famille, parametres.prenom) : null
      if (!p) return { texte: 'Je ne connais pas cette personne. Voici votre famille.', lien: '/famille' }
      if (intention === 'adresse') {
        return p.adresse ? { texte: `${p.prenom} habite ${p.adresse.replace(/\s*\n\s*/g, ', ')}.`, lien: '/famille' } : { texte: `Je ne connais pas l'adresse de ${p.prenom}.`, lien: '/famille' }
      }
      if (!p.telephone) return { texte: `Je n'ai pas de numéro de téléphone pour ${p.prenom}.`, lien: '/famille' }
      if (intention === 'telephone') return { texte: `Le numéro de ${p.prenom} est le ${numeroParle(p.telephone)}.`, lien: '/famille' }
      // Ouvre l'appel : la personne n'a plus qu'à appuyer sur « appeler » (comme le bouton de la fiche)
      return { texte: `J'appelle ${p.prenom}.`, lien: `tel:${p.telephone.replace(/[^\d+]/g, '')}` }
    }
    case 'jour': {
      const { agenda } = await donneesPersonne(utilisateur)
      const decalage = Number(parametres.decalage) || 0
      const jour = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate() + decalage)
      const libelle = decalage === 0 ? 'aujourd\'hui' : decalage === 1 ? 'demain' : parametres.apresDemain ? 'après-demain' : jour.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/ 1 /, ' 1er ')
      return { texte: programme(agenda, jour, libelle), lien: '/agenda' }
    }
    case 'rdv': {
      const { agenda } = await donneesPersonne(utilisateur)
      const mots = (parametres.mots ?? []).map(normaliser).filter(Boolean)
      const rdv = mots.length ? agenda.find((r) => (r.fin ?? r.debut) >= maintenant && mots.some((m) => normaliser(r.titre).includes(m))) : null
      if (!rdv) return { texte: 'Je ne trouve pas ce rendez-vous. Voici votre agenda.', lien: '/agenda' }
      return { texte: `${rdv.titre}, ${quandParle(rdv)}.`, lien: '/agenda' }
    }
    case 'visites': {
      const { agenda, famille } = await donneesPersonne(utilisateur)
      const semaine = new Date(aujourdhui.getTime() + 7 * 86_400_000)
      const prenoms = famille.map((p) => normaliser(p.prenom))
      const avec = agenda.filter((r) => r.debut < semaine && (r.fin ?? r.debut) >= maintenant && normaliser(r.titre).split(' ').some((m) => prenoms.includes(m)))
      if (!avec.length) return { texte: 'Je ne vois pas de visite prévue dans les sept prochains jours.', lien: '/agenda' }
      return { texte: `Prochainement : ${listeParlee(avec.slice(0, 4).map((r) => `${r.titre}, ${quandParle(r)}`))}.`, lien: '/agenda' }
    }
    case 'messages': {
      // Les nouveaux messages écrits (au plus trois), sinon le dernier reçu
      const { messages } = await messagesAccompagne(utilisateur)
      const nouveaux = messages.filter((m) => m.nouveau)
      if (parametres.prenom) { // « Paul m'a-t-il écrit ? », « lis le dernier message de Marie »
        const cle = normaliser(parametres.prenom)
        const dernier = messages.find((m) => normaliser(m.auteur.prenom) === cle)
        return dernier
          ? { texte: phraseMessage(dernier), lien: '/messages' }
          : { texte: `${parametres.prenom} ne vous a pas écrit ces derniers jours.`, lien: '/messages' }
      }
      const aLire = (nouveaux.length ? nouveaux : messages.slice(0, 1)).slice(0, 3)
      if (!aLire.length) return { texte: 'Vous n\'avez pas de message pour le moment. Voici vos messages.', lien: '/messages' }
      const phrases = aLire.map(phraseMessage)
      const debut = nouveaux.length
        ? `Vous avez ${nouveaux.length === 1 ? 'un nouveau message' : `${nouveaux.length} nouveaux messages`}. `
        : 'Pas de nouveau message. Le dernier : '
      return { texte: `${debut}${phrases.join(' ')}`, lien: '/messages' }
    }
    case 'accueil':
      return { texte: 'Je vous ramène à l\'accueil.', lien: '/' }
    case 'merci':
      return { texte: 'D\'accord. Je reste là si vous avez besoin.' }
    default:
      return { texte: 'Je n\'ai pas bien compris. Que voulez-vous faire ?', choix: CHOIX }
  }
}

// Trouve l'intention dans ce qu'a dit la personne. `phrases` : les propositions de la
// reconnaissance vocale, de la plus probable à la moins probable.
export async function comprendre(utilisateur, phrases) {
  const normalisees = phrases.map(normaliser).filter(Boolean)
  if (!normalisees.length) return { intention: 'inconnue', parametres: {} }
  const brute = phrases.find((p) => normaliser(p)) // phrase d'origine (avec accents) pour le modèle
  const { famille, albums: listeAlbums } = await donneesPersonne(utilisateur, 0)
  for (const phrase of normalisees) {
    const mots = phrase.split(' ')
    // Un album cité (« les photos de Noël » pour l'album « Noël 2025 ») ouvre cet album : il suffit
    // d'un mot marquant de son nom (4 lettres ou plus, pas un nombre ni un mot comme « photos »)
    const album = listeAlbums.find((a) => normaliser(a.nom).split(' ')
      .some((m) => m.length > 3 && !/^\d+$/.test(m) && !MOTS_ALBUM_IGNORES.has(m) && mots.includes(m)))
    const intention = MOTS_CLES.find(([, cles]) => contient(phrase, cles))?.[0]
    if (album && (!intention || intention === 'photos')) return { intention: 'photos', parametres: { album } }
    // Un prénom de la famille : « quand vient Léa », « Léa »
    const proche = famille.find((p) => mots.includes(normaliser(p.prenom)))
    // « mon », « ma », « mes » : la personne parle d'elle-même
    const moi = contient(phrase, ['mon ', 'ma ', 'mes ', 'ai je', 'j ai', 'suis je', 'je suis', 'moi', `${normaliser(utilisateur.prenom)} `])
    // « Combien ai-je de petits-enfants ? », « Comment s'appelle ma fille ? », « Qui est le mari de Claire ? »
    const relation = detecterLien(phrase)
    if (relation) {
      const combien = contient(phrase, ['combien'])
      return { intention: 'lien', parametres: moi || !proche ? (moi ? { relation, combien } : { relation, combien, inconnu: true }) : { relation, combien, prenom: proche.prenom } }
    }
    // « Qui est Léo ? », « C'est qui Léo ? » : la phrase de l'arbre généalogique
    if (proche && contient(phrase, ['qui est', 'c est qui', 'qui c est', 'parle moi de'])) return { intention: 'qui', parametres: { prenom: proche.prenom } }
    // Questions sur une personne : « quel âge a Léa ? », « quand est mort Robert ? », « appelle Léa »
    if (['age', 'naissance', 'anniversaire', 'telephone', 'adresse', 'appeler', 'deces'].includes(intention)) {
      if (intention === 'anniversaire' && contient(phrase, ['ce mois'])) return { intention, parametres: { mois: true } }
      if (proche) return { intention, parametres: { prenom: proche.prenom } }
      // Sans prénom connu : « mon âge », « ma date de naissance » parlent de la personne ; sinon c'est quelqu'un qu'on ne connaît pas
      if (['age', 'naissance', 'anniversaire'].includes(intention)) return { intention, parametres: moi ? {} : { inconnu: true } }
      return { intention, parametres: intention === 'deces' ? {} : { inconnu: true } }
    }
    if (intention === 'classement') {
      const critere = contient(phrase, ['plus jeune']) ? 'jeune' : contient(phrase, ['plus age ', 'plus vieux', 'doyen']) ? 'age' : contient(phrase, ['plus de petits enfants']) ? 'petits_enfants' : 'enfants'
      return { intention, parametres: { critere } }
    }
    if (intention === 'jour') return { intention, parametres: jourCite(phrase) ?? { decalage: 0 } }
    if (intention === 'rdv') return { intention, parametres: { mots: motsRdv(phrase) } }
    if (proche && (intention === 'messages' || intention === 'photos')) return { intention, parametres: { prenom: proche.prenom } }
    // Mots-clés vagues (« quand », « famille », un prénom seul) : si le cercle a l'option langage
    // naturel, le modèle tranche d'abord ; sinon (ou s'il ne sait pas) on garde la réponse des mots-clés
    if (proche && (!intention || intention === 'agenda')) {
      return (await langageNaturel(utilisateur, brute, famille, listeAlbums)) ?? { intention: 'personne', parametres: { prenom: proche.prenom } }
    }
    if (intention && ['agenda', 'famille', 'accueil'].includes(intention)) {
      return (await langageNaturel(utilisateur, brute, famille, listeAlbums)) ?? { intention, parametres: {} }
    }
    if (intention) return { intention, parametres: {} }
  }
  return (await langageNaturel(utilisateur, brute, famille, listeAlbums)) ?? { intention: 'inconnue', parametres: {} }
}

// Option « langage naturel » du cercle (server/voix/ia.js) : quand aucun mot-clé ne correspond,
// un petit modèle choisit l'intention. Seule la phrase part chez Mistral ; le prénom ou l'album
// qu'il renvoie est revérifié ici contre les données de la personne.
async function langageNaturel(utilisateur, phrase, famille, listeAlbums) {
  const ids = (await mesCercles(utilisateur.id)).filter((c) => c.role === 'accompagne').map((c) => c.id)
  const config = await configurationActive(ids)
  if (!config) return null
  const choix = await deviner(config, phrase, INTENTIONS)
  if (!choix) return null
  const { intention } = choix
  const sujet = normaliser(choix.sujet)
  const mots = sujet.split(' ').filter(Boolean)
  const proche = famille.find((p) => mots.includes(normaliser(p.prenom)))
  const albumCite = () => listeAlbums.find((a) => normaliser(a.nom).split(' ').some((m) => m.length > 3 && !/^\d+$/.test(m) && !MOTS_ALBUM_IGNORES.has(m) && mots.includes(m)))
  if (['qui', 'personne', 'age', 'naissance', 'anniversaire', 'telephone', 'adresse', 'appeler', 'deces'].includes(intention)) {
    if (intention === 'anniversaire' && mots.includes('mois')) return { intention, parametres: { mois: true } }
    if (proche) return { intention, parametres: { prenom: proche.prenom } }
    // Sans prénom : « mon âge », « ma date de naissance » parlent de la personne elle-même
    if (['age', 'naissance', 'anniversaire'].includes(intention)) return { intention, parametres: mots.length ? { inconnu: true } : {} }
    return { intention: 'famille', parametres: {} }
  }
  if (intention === 'lien') {
    const relation = choix.relation in RELATIONS ? choix.relation : null
    if (!relation) return { intention: 'famille', parametres: {} }
    const parametres = { relation, combien: choix.combien }
    if (proche) parametres.prenom = proche.prenom
    else if (mots.length) parametres.inconnu = true
    return { intention, parametres }
  }
  if (intention === 'classement') {
    const critere = { jeune: 'jeune', age: 'age', petits_enfants: 'petits_enfants', enfants: 'enfants' }[sujet.replace(/ /g, '_')]
    return critere ? { intention, parametres: { critere } } : { intention: 'famille', parametres: {} }
  }
  if (intention === 'jour') return { intention, parametres: jourCite(`${sujet} `) ?? { decalage: 0 } }
  if (intention === 'rdv') return { intention, parametres: { mots: motsRdv(sujet) } }
  if (intention === 'photos') {
    const album = albumCite()
    return { intention, parametres: album ? { album } : proche ? { prenom: proche.prenom } : {} }
  }
  if (intention === 'messages') return { intention, parametres: proche ? { prenom: proche.prenom } : {} }
  return { intention, parametres: {} }
}
