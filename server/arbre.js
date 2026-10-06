import { and, eq, inArray } from 'drizzle-orm'
import { db } from './db/index.js'
import { personnes, relations, utilisateurs, membres } from './db/schema.js'
import { liensAvatars, copierPhotoFiche } from './avatars.js'
import { photosDe } from './photosJeu.js'
import { ageTexte } from './anniversaires.js'

// Arbre généalogique d'un cercle : chargement, liens de parenté calculés à partir des seules
// relations « parent » et « conjoint », et phrases lues à la personne accompagnée.

// Personnes de l'arbre avec, pour celles qui ont un compte, les informations du compte
// (prénom, nom, coordonnées, avatar), et leur rôle dans le cercle.
export async function chargerArbre(cercleId) {
  const [lignes, rels] = await Promise.all([
    db.select({
      p: personnes,
      u: { prenom: utilisateurs.prenom, nom: utilisateurs.nom, telephone: utilisateurs.telephone, dateNaissance: utilisateurs.dateNaissance, adresse: utilisateurs.adresse, avatar: utilisateurs.avatar, decede: utilisateurs.decede, dateDeces: utilisateurs.dateDeces },
      membreId: membres.id,
      role: membres.role
    })
      .from(personnes)
      .leftJoin(utilisateurs, eq(personnes.utilisateurId, utilisateurs.id))
      .leftJoin(membres, and(eq(membres.cercleId, personnes.cercleId), eq(membres.utilisateurId, personnes.utilisateurId)))
      .where(and(eq(personnes.cercleId, cercleId), eq(personnes.exterieur, false))),
    db.select().from(relations).where(eq(relations.cercleId, cercleId))
  ])
  const lienAvatar = await liensAvatars()
  const photos = await photosDe({
    utilisateurIds: lignes.map(({ p }) => p.utilisateurId).filter(Boolean),
    personneIds: lignes.filter(({ p }) => !p.utilisateurId).map(({ p }) => p.id)
  })
  const liste = lignes.map(({ p, u, membreId, role }) => {
    const compte = Boolean(p.utilisateurId && u?.prenom)
    return {
      ...p,
      compte,
      membreId: compte ? membreId : null,
      role: compte ? role : null,
      prenom: compte ? u.prenom : p.prenom,
      nom: compte ? u.nom : p.nom,
      telephone: compte ? u.telephone : p.telephone,
      dateNaissance: compte ? u.dateNaissance : p.dateNaissance,
      adresse: compte ? u.adresse : p.adresse,
      // Un membre décédé garde son compte (désactivé) : le décès est indiqué sur le compte
      decede: compte ? u.decede : p.decede,
      dateDeces: compte ? u.dateDeces : p.dateDeces,
      avatarChoix: compte ? u.avatar : p.avatar,
      avatar: compte && u.avatar ? lienAvatar(p.utilisateurId, u.avatar) : lienAvatar(p.id, p.avatar),
      photosJeu: photos.get(compte ? `u:${p.utilisateurId}` : `p:${p.id}`) ?? []
    }
  })
  return graphe(liste, rels)
}

// Personnes extérieures à la famille d'un ou plusieurs cercles (fiches pour les jeux seulement)
export async function chargerExterieurs(cercleIds) {
  if (!cercleIds.length) return []
  const [lignes, lienAvatar] = await Promise.all([
    db.select().from(personnes).where(and(inArray(personnes.cercleId, cercleIds), eq(personnes.exterieur, true))).orderBy(personnes.creeLe),
    liensAvatars()
  ])
  const photos = await photosDe({ personneIds: lignes.map((p) => p.id) })
  return lignes.map((p) => ({
    id: p.id, cercleId: p.cercleId, prenom: p.prenom, nom: p.nom, genre: p.genre, dateNaissance: p.dateNaissance,
    avatar: lienAvatar(p.id, p.avatar), avatarChoix: p.avatar, photosJeu: photos.get(`p:${p.id}`) ?? []
  }))
}

export function graphe(liste, rels) {
  const parId = new Map(liste.map((p) => [p.id, p]))
  const parents = new Map()
  const enfants = new Map()
  const conjoints = new Map()
  const ajouter = (m, cle, v) => { if (!m.has(cle)) m.set(cle, []); m.get(cle).push(v) }
  for (const r of rels) {
    if (!parId.has(r.personneA) || !parId.has(r.personneB)) continue
    if (r.type === 'parent') {
      ajouter(parents, r.personneB, r.personneA)
      ajouter(enfants, r.personneA, r.personneB)
    } else {
      ajouter(conjoints, r.personneA, { id: r.personneB, separes: r.separes })
      ajouter(conjoints, r.personneB, { id: r.personneA, separes: r.separes })
    }
  }
  return {
    personnes: liste,
    relations: rels,
    parId,
    parents: (id) => parents.get(id) ?? [],
    enfants: (id) => enfants.get(id) ?? [],
    conjoints: (id) => conjoints.get(id) ?? []
  }
}

// Ancêtres d'une personne (elle comprise) avec leur distance : Map id → nombre de générations
export function ancetres(g, id) {
  const dist = new Map([[id, 0]])
  const file = [id]
  while (file.length) {
    const x = file.shift()
    for (const p of g.parents(x)) {
      if (dist.has(p)) continue
      dist.set(p, dist.get(x) + 1)
      file.push(p)
    }
  }
  return dist
}

// Lien du sang entre `ego` et `x` : { a, b } = générations à remonter depuis ego et depuis x
// jusqu'au plus proche ancêtre commun (a = 0, b = 1 : x est un enfant d'ego). null sinon.
function sang(g, ego, x) {
  const A = ancetres(g, ego)
  const B = ancetres(g, x)
  let meilleur = null
  for (const [c, a] of A) {
    if (!B.has(c)) continue
    const b = B.get(c)
    if (!meilleur || a + b < meilleur.a + meilleur.b) meilleur = { a, b }
  }
  return meilleur
}

const g3 = (genre, homme, femme, neutre) => genre === 'homme' ? homme : genre === 'femme' ? femme : neutre
const arriere = (n, mot) => `${'Arrière-'.repeat(n)}${n ? mot.charAt(0).toLowerCase() + mot.slice(1) : mot}`

function libelleSang({ a, b }, genre) {
  if (a === 0) {
    if (b === 1) return g3(genre, 'Fils', 'Fille', 'Enfant')
    return arriere(b - 2, g3(genre, 'Petit-fils', 'Petite-fille', 'Petit-enfant'))
  }
  if (b === 0) {
    if (a === 1) return g3(genre, 'Père', 'Mère', 'Parent')
    return arriere(a - 2, g3(genre, 'Grand-père', 'Grand-mère', 'Grand-parent'))
  }
  if (a === 1 && b === 1) return g3(genre, 'Frère', 'Sœur', 'Frère ou sœur')
  if (a === 1 && b === 2) return g3(genre, 'Neveu', 'Nièce', 'Neveu ou nièce')
  if (a === 1 && b === 3) return g3(genre, 'Petit-neveu', 'Petite-nièce', 'Petit-neveu ou petite-nièce')
  if (a === 2 && b === 1) return g3(genre, 'Oncle', 'Tante', 'Oncle ou tante')
  if (a === 3 && b === 1) return g3(genre, 'Grand-oncle', 'Grand-tante', 'Grand-oncle ou grand-tante')
  if (a === 2 && b === 2) return g3(genre, 'Cousin', 'Cousine', 'Cousin ou cousine')
  if (a >= 2 && b >= 2) return g3(genre, 'Cousin éloigné', 'Cousine éloignée', 'Cousin éloigné')
  return 'De la famille'
}

function groupeSang({ a, b }) {
  if (a === 0) return b === 1 ? 'enfants' : b === 2 ? 'petitsEnfants' : 'arrierePetitsEnfants'
  if (b === 0) return 'parents'
  if (a === 1 && b === 1) return 'fratrie'
  return 'famille'
}

// Parenté de `x` vue depuis `ego` (deux identifiants de personnes de l'arbre) :
// { lien: « Arrière-petit-fils », groupe, generation (> 0 : plus jeune) } ou null (sans lien connu).
export function parente(g, ego, x) {
  if (ego === x) return { lien: 'Moi', groupe: 'moi', generation: 0 }
  const px = g.parId.get(x)
  if (!px) return null
  const genre = px.genre
  // Conjoint
  const couple = g.conjoints(ego).find((c) => c.id === x)
  if (couple) {
    return {
      lien: couple.separes ? g3(genre, 'Ex-mari', 'Ex-femme', 'Ex-conjoint') : g3(genre, 'Mari', 'Femme', 'Conjoint'),
      groupe: 'conjoint',
      generation: 0
    }
  }
  // Famille par le sang
  const s = sang(g, ego, x)
  if (s) return { lien: libelleSang(s, genre), groupe: groupeSang(s), generation: s.b - s.a }
  // Conjoint d'un membre de la famille (gendre, belle-sœur, « Femme de Julien »)
  const proches = g.conjoints(x)
    .map((c) => ({ ...c, s: sang(g, ego, c.id) }))
    .filter((c) => c.s)
    .sort((m, n) => (m.s.a + m.s.b) - (n.s.a + n.s.b))
  if (proches.length) {
    const { id, separes, s: r } = proches[0]
    const generation = r.b - r.a
    if (!separes) {
      if (r.a === 0 && r.b === 1) return { lien: g3(genre, 'Gendre', 'Belle-fille', 'Gendre ou belle-fille'), groupe: 'allies', generation }
      if (r.a === 1 && r.b === 0) return { lien: g3(genre, 'Beau-père', 'Belle-mère', 'Beau-parent'), groupe: 'allies', generation }
      if (r.a === 1 && r.b === 1) return { lien: g3(genre, 'Beau-frère', 'Belle-sœur', 'Beau-frère ou belle-sœur'), groupe: 'allies', generation }
      // Le mari d'une tante est un oncle
      if (r.b === 1 && r.a >= 2) return { lien: libelleSang(r, genre), groupe: 'famille', generation }
    }
    const qui = g.parId.get(id).prenom
    const mot = separes ? g3(genre, 'Ex-mari', 'Ex-femme', 'Ex-conjoint') : g3(genre, 'Mari', 'Femme', 'Conjoint')
    return { lien: `${mot} de ${qui}`, groupe: 'allies', generation }
  }
  // Famille du conjoint (beaux-parents, beaux-frères, enfants du conjoint)
  for (const c of g.conjoints(ego)) {
    const r = sang(g, c.id, x)
    if (!r) continue
    const generation = r.b - r.a
    if (r.a === 1 && r.b === 0) return { lien: g3(genre, 'Beau-père', 'Belle-mère', 'Beau-parent'), groupe: 'allies', generation }
    if (r.a === 1 && r.b === 1) return { lien: g3(genre, 'Beau-frère', 'Belle-sœur', 'Beau-frère ou belle-sœur'), groupe: 'allies', generation }
    if (r.a === 0 && r.b === 1) return { lien: g3(genre, 'Beau-fils', 'Belle-fille', 'Bel-enfant'), groupe: 'allies', generation }
    // Les neveux, oncles et cousins du conjoint sont aussi appelés ainsi
    if (r.a >= 1 && r.b >= 1) return { lien: libelleSang(r, genre), groupe: 'famille', generation }
    return { lien: `De la famille de ${g.parId.get(c.id).prenom}`, groupe: 'allies', generation }
  }
  return null
}

const minuscule = (t) => t.charAt(0).toLowerCase() + t.slice(1)
export const listeParlee = (elements) => elements.length <= 1
  ? elements.join('')
  : `${elements.slice(0, -1).join(', ')} et ${elements.at(-1)}`

// « Mon arrière-petit-fils », « Ma fille », « La femme de Julien »
export function lienPossessif(lien, genre) {
  if (!lien) return null
  if (lien.startsWith('De la famille')) return lien
  if (/ de /.test(lien)) return `${genre === 'homme' ? 'Le' : genre === 'femme' ? 'La' : 'Le'} ${minuscule(lien)}`
  // « Mon arrière-petite-fille », « Mon ex-femme » : « mon » devant une voyelle
  return `${genre === 'femme' && !/^[AEIOUÉ]/.test(lien) ? 'Ma' : 'Mon'} ${minuscule(lien)}`
}

// « Le fils de Julien et Marie » (pour les petits-enfants, neveux… : aide à situer la personne)
export function filiation(g, x) {
  const prenoms = g.parents(x).map((id) => g.parId.get(id)?.prenom).filter(Boolean)
  if (!prenoms.length) return null
  const genre = g.parId.get(x).genre
  return `${g3(genre, 'Le fils', 'La fille', 'L\'enfant')} de ${listeParlee(prenoms)}`
}

const annee = (date) => date?.slice(0, 4)

// Phrase lue à la personne accompagnée : « Léo est votre arrière-petit-fils. C'est le fils de
// Julien et Marie. Il a 4 ans. Il adore les dinosaures. »
export function phrase(g, ego, x, maintenant = new Date()) {
  const p = g.parId.get(x)
  const r = parente(g, ego, x)
  const il = g3(p.genre, 'Il', 'Elle', 'Cette personne')
  const morceaux = []
  if (r && r.groupe !== 'moi') {
    morceaux.push(/ de /.test(r.lien)
      ? `${p.prenom} est ${minuscule(lienPossessif(r.lien, p.genre))}.`
      : r.lien === 'De la famille'
      ? `${p.prenom} fait partie de votre famille.`
      : `${p.prenom} est votre ${minuscule(r.lien)}.`)
  }
  const fil = r && r.generation >= 2 && r.groupe !== 'allies' ? filiation(g, x) : null
  if (fil) morceaux.push(`C'est ${minuscule(fil)}.`)
  if (p.decede) {
    morceaux.push(`${il} ${g3(p.genre, 'est décédé', 'est décédée', 'est décédée')}${p.dateDeces ? ` en ${annee(p.dateDeces)}` : ''}.`)
  } else if (p.dateNaissance) {
    morceaux.push(`${il} a ${ageTexte(p.dateNaissance, maintenant)}.`)
  }
  if (p.aSavoir) morceaux.push(p.aSavoir)
  return morceaux.join(' ') || p.prenom
}

// Personne de l'arbre rattachée à un compte dans un cercle
export async function personneDuCompte(cercleId, utilisateurId) {
  const [p] = await db.select({ id: personnes.id }).from(personnes)
    .where(and(eq(personnes.cercleId, cercleId), eq(personnes.utilisateurId, utilisateurId)))
  return p?.id ?? null
}

// Rattache un compte à une fiche de l'arbre (invitation acceptée). Les coordonnées saisies sur
// la fiche complètent celles du compte, sans les écraser.
export async function rattacherCompte(tx, personneId, utilisateur) {
  const [p] = await tx.select().from(personnes).where(eq(personnes.id, personneId))
  if (!p || p.utilisateurId) return
  const [deja] = await tx.select({ id: personnes.id }).from(personnes)
    .where(and(eq(personnes.cercleId, p.cercleId), eq(personnes.utilisateurId, utilisateur.id)))
  if (deja) return
  await tx.update(personnes).set({ utilisateurId: utilisateur.id }).where(eq(personnes.id, p.id))
  const [u] = await tx.select().from(utilisateurs).where(eq(utilisateurs.id, utilisateur.id))
  const complement = {}
  for (const champ of ['telephone', 'dateNaissance', 'adresse']) {
    if (!u[champ] && p[champ]) complement[champ] = p[champ]
  }
  // Un modèle d'avatar se recopie ; une photo est copiée chez le compte (la fiche garde la sienne)
  if (!u.avatar && p.avatar?.startsWith('modele:')) complement.avatar = p.avatar
  else if (!u.avatar && p.avatar?.startsWith('photo:')) {
    const photo = await copierPhotoFiche(p.id, u.id, p.avatar)
    if (photo) complement.avatar = photo
  }
  if (Object.keys(complement).length) await tx.update(utilisateurs).set(complement).where(eq(utilisateurs.id, u.id))
}

// Liens calculés des membres d'un cercle vus depuis une personne accompagnée :
// Map utilisateurId → lien (pour « Famille et aidants » et l'assistant vocal)
export async function liensDesMembres(cercleId, egoUtilisateurId = null) {
  const g = await chargerArbre(cercleId)
  if (!g.personnes.length) return { g, liens: new Map(), ego: null }
  const egoP = egoUtilisateurId
    ? g.personnes.find((p) => p.utilisateurId === egoUtilisateurId)
    : g.personnes.find((p) => p.role === 'accompagne' && !p.decede) ?? g.personnes.find((p) => p.role === 'accompagne')
  const liens = new Map()
  if (egoP) {
    for (const p of g.personnes) {
      if (!p.utilisateurId) continue
      const r = parente(g, egoP.id, p.id)
      if (r && r.groupe !== 'moi') liens.set(p.utilisateurId, r.lien)
    }
  }
  return { g, liens, ego: egoP?.id ?? null }
}

export async function cerclesAvecArbre(ids) {
  if (!ids.length) return new Set()
  const l = await db.selectDistinct({ c: personnes.cercleId }).from(personnes).where(inArray(personnes.cercleId, ids))
  return new Set(l.map((x) => x.c))
}
