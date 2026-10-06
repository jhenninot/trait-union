// Arbre généalogique : dates affichées, groupes de « Ma famille » et disposition de l'arbre
import { ageTexte } from './coordonnees.js'

// « 85 ans », « 1938 – 2015 », « Décédée »
export function dates(p) {
  if (p.decede) {
    const n = p.dateNaissance?.slice(0, 4)
    const d = p.dateDeces?.slice(0, 4)
    if (n || d) return `${n ?? '?'} – ${d ?? '?'}`
    return p.genre === 'homme' ? 'Décédé' : 'Décédée'
  }
  return p.dateNaissance ? ageTexte(p.dateNaissance) : ''
}

// Groupes de « Ma famille » (personne accompagnée) et de la vue en liste, dans l'ordre
export const GROUPES = [
  ['conjoint', 'Mon conjoint', 'Conjoint'],
  ['parents', 'Mes parents', 'Parents et grands-parents'],
  ['fratrie', 'Mes frères et sœurs', 'Frères et sœurs'],
  ['enfants', 'Mes enfants', 'Enfants'],
  ['petitsEnfants', 'Mes petits-enfants', 'Petits-enfants'],
  ['arrierePetitsEnfants', 'Mes arrière-petits-enfants', 'Arrière-petits-enfants'],
  ['allies', 'Ils sont aussi de la famille', 'Par alliance'],
  ['famille', 'Ils sont aussi de la famille', 'Autre famille']
]

// Titre du groupe « conjoint » selon la personne : « Mon mari », « Ma femme »
export function titreConjoint(personnes) {
  if (personnes.length !== 1) return 'Mon conjoint'
  const p = personnes[0]
  if (/^Ex-/.test(p.lien ?? '')) return p.genre === 'homme' ? 'Mon ex-mari' : p.genre === 'femme' ? 'Mon ex-femme' : 'Mon ex-conjoint'
  return p.genre === 'homme' ? 'Mon mari' : p.genre === 'femme' ? 'Ma femme' : 'Mon conjoint'
}

export function index(relations) {
  const parents = new Map()
  const enfants = new Map()
  const conjoints = new Map()
  const ajouter = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v) }
  for (const r of relations) {
    if (r.type === 'parent') {
      ajouter(parents, r.b, r.a)
      ajouter(enfants, r.a, r.b)
    } else {
      ajouter(conjoints, r.a, { id: r.b, separes: r.separes, maries: r.maries, relation: r.id })
      ajouter(conjoints, r.b, { id: r.a, separes: r.separes, maries: r.maries, relation: r.id })
    }
  }
  return {
    parents: (id) => parents.get(id) ?? [],
    enfants: (id) => enfants.get(id) ?? [],
    conjoints: (id) => conjoints.get(id) ?? []
  }
}

const parNaissance = (parId) => (a, b) => (parId.get(a)?.dateNaissance ?? '9999').localeCompare(parId.get(b)?.dateNaissance ?? '9999')

// Disposition de l'arbre des aidants : une ligne par génération, chaque couple centré
// au-dessus de ses enfants. Renvoie les positions des cartes et les traits à dessiner.
export function disposer(personnes, relations, { L = 150, H = 172, ecartCouple = 28, ecart = 36, ligne = 250 } = {}) {
  const parId = new Map(personnes.map((p) => [p.id, p]))
  const ix = index(relations)
  const tri = parNaissance(parId)

  // Génération de chacun (0 = la plus ancienne de son groupe de personnes reliées)
  const gen = new Map()
  for (const depart of [...personnes].sort((a, b) => tri(a.id, b.id))) {
    if (gen.has(depart.id)) continue
    const composante = new Map([[depart.id, 0]])
    const file = [depart.id]
    while (file.length) {
      const x = file.shift()
      const g = composante.get(x)
      const voisins = [...ix.parents(x).map((v) => [v, g - 1]), ...ix.enfants(x).map((v) => [v, g + 1]), ...ix.conjoints(x).map((c) => [c.id, g])]
      for (const [v, gv] of voisins) {
        if (composante.has(v) || !parId.has(v)) continue
        composante.set(v, gv)
        file.push(v)
      }
    }
    const min = Math.min(...composante.values())
    for (const [id, g] of composante) gen.set(id, g - min)
  }

  // Unités (une personne et son ou ses conjoints) et leurs enfants
  const pris = new Set()
  const sansParents = (id) => ix.parents(id).filter((p) => parId.has(p)).length === 0
  function unite(id) {
    pris.add(id)
    const membres = [id]
    for (const c of ix.conjoints(id)) {
      if (pris.has(c.id) || !parId.has(c.id)) continue
      // Un conjoint qui a ses propres parents dans l'arbre sera placé sous eux s'il n'est pas déjà pris
      pris.add(c.id)
      membres.push(c.id)
    }
    // La personne entre ses conjoints s'il y en a deux (ex-conjoint d'un côté, conjoint de l'autre)
    if (membres.length === 3) membres.splice(0, 2, membres[1], membres[0])
    const enfants = [...new Set(membres.flatMap((m) => ix.enfants(m)))].filter((e) => parId.has(e)).sort(tri)
    const u = { membres, enfants: [] }
    for (const e of enfants) if (!pris.has(e)) u.enfants.push(unite(e))
    return u
  }
  const racines = []
  const ordre = [...personnes].sort((a, b) => (gen.get(a.id) - gen.get(b.id)) || tri(a.id, b.id))
  for (const p of ordre) {
    if (pris.has(p.id)) continue
    if (!sansParents(p.id) && ordre.some((q) => !pris.has(q.id) && ix.enfants(q.id).includes(p.id))) continue
    if (ix.conjoints(p.id).some((c) => !pris.has(c.id) && !sansParents(c.id))) continue
    racines.push(unite(p.id))
  }
  // Ce qui reste (cas particuliers) devient une racine de plus
  for (const p of ordre) if (!pris.has(p.id)) racines.push(unite(p.id))

  // Une famille reliée à une autre par un mariage se place juste à côté d'elle plutôt qu'à la fin
  const racineDe = new Map()
  racines.forEach((r, i) => {
    const visiter = (u) => { u.membres.forEach((m) => racineDe.set(m, i)); u.enfants.forEach(visiter) }
    visiter(r)
  })
  const voisines = racines.map((r, i) => {
    const liees = new Set()
    const visiter = (u) => {
      for (const m of u.membres) for (const q of ix.parents(m)) {
        const j = racineDe.get(q)
        if (j !== undefined && j !== i) liees.add(j)
      }
      u.enfants.forEach(visiter)
    }
    visiter(r)
    return [...liees]
  })
  const ordreRacines = []
  const placees = new Set()
  const suivre = (i) => {
    if (placees.has(i)) return
    placees.add(i)
    ordreRacines.push(racines[i])
    voisines[i].forEach(suivre)
  }
  racines.forEach((_, i) => suivre(i))
  racines.splice(0, racines.length, ...ordreRacines)

  // Largeurs puis positions
  const largeurUnite = (u) => u.membres.length * L + (u.membres.length - 1) * ecartCouple
  function mesurer(u) {
    const enfants = u.enfants.reduce((s, e) => s + mesurer(e), 0) + Math.max(0, u.enfants.length - 1) * ecart
    u.largeur = Math.max(largeurUnite(u), enfants)
    u.largeurEnfants = enfants
    return u.largeur
  }
  const pos = new Map()
  function placer(u, x) {
    const xu = x + (u.largeur - largeurUnite(u)) / 2
    u.membres.forEach((id, i) => pos.set(id, { x: xu + i * (L + ecartCouple), y: gen.get(id) * ligne }))
    let xe = x + (u.largeur - u.largeurEnfants) / 2
    for (const e of u.enfants) {
      placer(e, xe)
      xe += e.largeur + ecart
    }
  }
  let x = 0
  for (const r of racines) {
    mesurer(r)
    placer(r, x)
    x += r.largeur + ecart * 2
  }

  // Traits : couples (horizontal, pointillé si séparés) et descendance (depuis le milieu du couple)
  const traits = []
  const vus = new Set()
  for (const r of relations) {
    if (r.type !== 'conjoint') continue
    const a = pos.get(r.a)
    const b = pos.get(r.b)
    if (!a || !b || a.y !== b.y) continue
    const [g, d] = a.x < b.x ? [a, b] : [b, a]
    traits.push({ d: `M${g.x + L} ${g.y + H / 2}H${d.x}`, separes: r.separes })
  }
  const groupes = new Map()
  for (const p of personnes) {
    const parents = ix.parents(p.id).filter((q) => pos.has(q))
    if (!parents.length) continue
    const [a, b] = parents.map((q) => pos.get(q)).sort((m, n) => m.x - n.x)
    let origine
    if (b && a.y === b.y && b.x - (a.x + L) <= ecartCouple + 1) origine = { x: (a.x + L + b.x) / 2, y: a.y + H / 2 }
    else origine = { x: a.x + L / 2, y: a.y + H }
    const cle = `${origine.x},${origine.y}`
    if (!groupes.has(cle)) groupes.set(cle, { origine, enfants: [] })
    groupes.get(cle).enfants.push(pos.get(p.id))
    // Second parent éloigné : son propre trait
    if (b && origine.y === a.y + H && !vus.has(`${p.id}`)) {
      vus.add(p.id)
      const e = pos.get(p.id)
      traits.push({ d: `M${b.x + L / 2} ${b.y + H}V${e.y - 24}H${e.x + L / 2}V${e.y}` })
    }
  }
  for (const { origine, enfants } of groupes.values()) {
    const yb = Math.min(...enfants.map((e) => e.y)) - 26
    const xs = enfants.map((e) => e.x + L / 2)
    let d = `M${origine.x} ${origine.y}V${yb}H${Math.min(origine.x, ...xs)}H${Math.max(origine.x, ...xs)}`
    for (const e of enfants) d += `M${e.x + L / 2} ${yb}V${e.y}`
    traits.push({ d })
  }
  const largeur = Math.max(L, ...[...pos.values()].map((p) => p.x + L))
  const hauteur = Math.max(H, ...[...pos.values()].map((p) => p.y + H))
  return { pos, traits, largeur, hauteur }
}
