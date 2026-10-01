import { Router } from 'express'
import { and, eq, or, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { personnes, relations, membres, utilisateurs } from '../db/schema.js'
import * as valider from '../auth/validation.js'
import { ErreurSaisie } from '../auth/validation.js'
import { chargerArbre, parente, phrase, lienPossessif, filiation, ancetres } from '../arbre.js'
import { preparerEnvoi, changerAvatar } from '../avatars.js'
import { marquerDeces, annulerDeces } from '../deces.js'

// Arbre généalogique d'un cercle (monté sous /api/cercles/:cercleId/arbre, après chargerCercle).
// Les aidants le gèrent, les proches le consultent, la personne accompagnée en voit une version
// simplifiée (« Ma famille », « Mon arbre ») ; les auxiliaires de vie n'y ont pas accès.
const router = Router()

router.use((req, res, next) => {
  if (!req.peutGerer && req.role === 'auxiliaire') return res.status(403).json({ erreur: 'L\'arbre généalogique n\'est pas accessible aux auxiliaires de vie' })
  next()
})

function exigerGestion(req, res, next) {
  if (!req.peutGerer) return res.status(403).json({ erreur: 'Réservé aux aidants du cercle' })
  next()
}

router.get('/', async (req, res) => {
  const g = await chargerArbre(req.cercle.id)
  const estAccompagne = req.role === 'accompagne' && !req.peutGerer
  // Membres du cercle qui n'ont pas encore de place dans l'arbre (hors auxiliaires de vie)
  const listeMembres = await db
    .select({ id: membres.id, prenom: membres.prenom, nom: membres.nom, role: membres.role, lien: membres.lien, utilisateurId: membres.utilisateurId, decede: utilisateurs.decede })
    .from(membres).leftJoin(utilisateurs, eq(membres.utilisateurId, utilisateurs.id)).where(eq(membres.cercleId, req.cercle.id))
  const places = new Set(g.personnes.map((p) => p.utilisateurId).filter(Boolean))
  const nonPlaces = listeMembres.filter((m) => m.role !== 'auxiliaire' && m.utilisateurId && !places.has(m.utilisateurId))

  if (estAccompagne) {
    // Vue de la personne accompagnée : les personnes visibles, liens vus depuis elle
    const moi = g.personnes.find((p) => p.utilisateurId === req.utilisateur.id)
    const visibles = g.personnes.filter((p) => p.visibleAide || p.id === moi?.id)
    const ids = new Set(visibles.map((p) => p.id))
    return res.json({
      moi: moi?.id ?? null,
      personnes: visibles.map((p) => {
        const r = moi ? parente(g, moi.id, p.id) : null
        return {
          ...presenter(p, false),
          lien: r?.lien ?? null,
          lienAide: r && r.groupe !== 'moi' ? lienPossessif(r.lien, p.genre) : null,
          groupe: r?.groupe ?? 'famille',
          generation: r?.generation ?? null,
          filiation: r && r.generation >= 2 && r.groupe !== 'allies' ? filiation(g, p.id) : null,
          phrase: moi ? phrase(g, moi.id, p.id) : null
        }
      }),
      relations: g.relations.filter((r) => ids.has(r.personneA) && ids.has(r.personneB)).map(presenterRelation)
    })
  }

  // Vue des aidants et des proches : liens vus depuis chaque personne accompagnée placée
  // Liens vus depuis les personnes accompagnées en vie (toutes, s'il n'en reste aucune)
  const toutes = g.personnes.filter((p) => p.role === 'accompagne')
  const accompagnes = toutes.some((p) => !p.decede) ? toutes.filter((p) => !p.decede) : toutes
  res.json({
    peutGerer: req.peutGerer,
    accompagnes: accompagnes.map((p) => ({ id: p.id, prenom: p.prenom })),
    personnes: g.personnes.map((p) => ({
      ...presenter(p, req.peutGerer),
      liens: Object.fromEntries(accompagnes.map((a) => {
        const r = parente(g, a.id, p.id)
        return [a.id, r ? { lien: r.lien, groupe: r.groupe, generation: r.generation } : null]
      })),
      filiation: filiation(g, p.id)
    })),
    relations: g.relations.map(presenterRelation),
    nonPlaces: nonPlaces.map(({ utilisateurId, ...m }) => m)
  })
})

function presenter(p, gestion) {
  return {
    id: p.id,
    prenom: p.prenom,
    nom: p.nom,
    genre: p.genre,
    compte: p.compte,
    // Une personne décédée apparaît comme une personne de l'arbre sans compte (plus de rôle)
    role: p.decede ? null : p.role,
    membreId: p.membreId,
    utilisateurId: p.role === 'accompagne' ? p.utilisateurId : undefined,
    dateNaissance: p.dateNaissance,
    decede: p.decede,
    dateDeces: p.dateDeces,
    telephone: p.telephone,
    adresse: p.adresse,
    avatar: p.avatar,
    avatarChoix: gestion ? p.avatarChoix : undefined,
    aSavoir: p.aSavoir,
    visibleAide: p.visibleAide
  }
}

const presenterRelation = (r) => ({ id: r.id, type: r.type, a: r.personneA, b: r.personneB, separes: r.separes })

// --- Gestion (aidants)

async function chargerPersonne(req, res, next) {
  const [p] = await db.select().from(personnes)
    .where(and(eq(personnes.id, req.params.personneId), eq(personnes.cercleId, req.cercle.id)))
  if (!p) return res.status(404).json({ erreur: 'Personne introuvable' })
  req.personne = p
  next()
}

// Champs d'une fiche. Pour une personne qui a un compte, prénom, nom et coordonnées sont ceux
// du compte (modifiés par elle dans « Mon profil ») : seuls les autres champs sont gardés.
function lireFiche(corps, { compte = false } = {}) {
  const fiche = {}
  if ('genre' in corps) {
    if (![null, '', 'homme', 'femme'].includes(corps.genre)) throw new ErreurSaisie('Genre invalide')
    fiche.genre = corps.genre || null
  }
  if ('decede' in corps) fiche.decede = Boolean(corps.decede)
  if ('dateDeces' in corps) fiche.dateDeces = valider.dateNaissance(corps.dateDeces, { champ: 'date de décès', min: '1800-01-01' })
  if ('aSavoir' in corps) fiche.aSavoir = valider.texte(corps.aSavoir, 'à savoir', { obligatoire: false, max: 500 })
  if ('visibleAide' in corps) fiche.visibleAide = corps.visibleAide !== false
  if (fiche.decede === false) fiche.dateDeces = null
  if (fiche.dateDeces) fiche.decede = true
  if (compte) return fiche
  if ('prenom' in corps) fiche.prenom = valider.texte(corps.prenom, 'prénom', { max: 80 })
  if ('nom' in corps) fiche.nom = valider.texte(corps.nom, 'nom', { obligatoire: false, max: 80 })
  if ('telephone' in corps) fiche.telephone = valider.telephone(corps.telephone)
  if ('dateNaissance' in corps) fiche.dateNaissance = valider.dateNaissance(corps.dateNaissance, { min: '1800-01-01' })
  if ('adresse' in corps) fiche.adresse = valider.texte(corps.adresse, 'adresse', { obligatoire: false, max: 300 })
  return fiche
}

// Vérifie qu'un lien « parent » a → b reste possible : pas soi-même, pas de boucle, deux parents au plus
async function verifierParent(tx, cercleId, a, b) {
  if (a === b) throw new ErreurSaisie('Une personne ne peut pas être son propre parent')
  const rels = await tx.select().from(relations).where(and(eq(relations.cercleId, cercleId), eq(relations.type, 'parent')))
  const parentsDe = (id) => rels.filter((r) => r.personneB === id).map((r) => r.personneA)
  if (parentsDe(b).includes(a)) return false
  if (parentsDe(b).length >= 2) throw new ErreurSaisie('Cette personne a déjà deux parents')
  if (ancetres({ parents: parentsDe }, a).has(b)) throw new ErreurSaisie('Ce lien créerait une boucle dans l\'arbre')
  return true
}

async function ajouterRelation(tx, cercleId, type, a, b, separes = false) {
  if (type === 'parent') {
    if (!await verifierParent(tx, cercleId, a, b)) return
  } else {
    if (a === b) throw new ErreurSaisie('Une personne ne peut pas être son propre conjoint')
    const [deja] = await tx.select({ id: relations.id }).from(relations).where(and(
      eq(relations.type, 'conjoint'),
      or(and(eq(relations.personneA, a), eq(relations.personneB, b)), and(eq(relations.personneA, b), eq(relations.personneB, a)))
    ))
    if (deja) return
  }
  await tx.insert(relations).values({ cercleId, type, personneA: a, personneB: b, separes }).onConflictDoNothing()
}

async function verifierDansCercle(tx, cercleId, ids) {
  ids = [...new Set(ids.filter(Boolean))]
  if (!ids.length) return
  const l = await tx.select({ id: personnes.id }).from(personnes).where(and(eq(personnes.cercleId, cercleId), inArray(personnes.id, ids)))
  if (l.length !== ids.length) throw new ErreurSaisie('Personne introuvable dans ce cercle')
}

// Ajoute une personne, éventuellement reliée à une autre : { ..., relation: { type: 'enfant' |
// 'parent' | 'conjoint' | 'fratrie', de, autreParent } }. Avec `membreId`, place un membre du
// cercle qui n'est pas encore dans l'arbre (sa fiche est alors rattachée à son compte).
router.post('/personnes', exigerGestion, async (req, res) => {
  const rel = req.body.relation ?? null
  if (rel && !['enfant', 'parent', 'conjoint', 'fratrie'].includes(rel.type)) throw new ErreurSaisie('Lien invalide')
  const cree = await db.transaction(async (tx) => {
    let valeurs
    if (req.body.membreId) {
      const [m] = await tx.select().from(membres).where(and(eq(membres.id, req.body.membreId), eq(membres.cercleId, req.cercle.id)))
      if (!m?.utilisateurId || m.role === 'auxiliaire') throw new ErreurSaisie('Membre introuvable')
      const [deja] = await tx.select({ id: personnes.id }).from(personnes)
        .where(and(eq(personnes.cercleId, req.cercle.id), eq(personnes.utilisateurId, m.utilisateurId)))
      if (deja) throw new ErreurSaisie(`${m.prenom} est déjà dans l'arbre`)
      // Le décès d'un membre se lit sur son compte (server/deces.js)
      const [u] = await tx.select({ decede: utilisateurs.decede, dateDeces: utilisateurs.dateDeces }).from(utilisateurs).where(eq(utilisateurs.id, m.utilisateurId))
      valeurs = { ...lireFiche(req.body, { compte: true }), prenom: m.prenom, nom: m.nom, utilisateurId: m.utilisateurId, decede: u.decede, dateDeces: u.dateDeces }
    } else {
      valeurs = lireFiche(req.body)
      if (!valeurs.prenom) throw new ErreurSaisie('Le champ « prénom » est obligatoire')
    }
    const [p] = await tx.insert(personnes).values({ ...valeurs, cercleId: req.cercle.id, creeParId: req.utilisateur.id }).returning()
    if (rel) {
      await verifierDansCercle(tx, req.cercle.id, [rel.de, rel.autreParent])
      if (rel.type === 'enfant') {
        await ajouterRelation(tx, req.cercle.id, 'parent', rel.de, p.id)
        if (rel.autreParent) await ajouterRelation(tx, req.cercle.id, 'parent', rel.autreParent, p.id)
      } else if (rel.type === 'parent') {
        await ajouterRelation(tx, req.cercle.id, 'parent', p.id, rel.de)
      } else if (rel.type === 'conjoint') {
        await ajouterRelation(tx, req.cercle.id, 'conjoint', rel.de, p.id)
      } else {
        // Frère ou sœur : mêmes parents
        const ps = await tx.select({ a: relations.personneA }).from(relations)
          .where(and(eq(relations.type, 'parent'), eq(relations.personneB, rel.de)))
        if (!ps.length) throw new ErreurSaisie('Ajoutez d\'abord un parent pour relier les frères et sœurs')
        for (const { a } of ps) await ajouterRelation(tx, req.cercle.id, 'parent', a, p.id)
      }
    }
    return p
  })
  res.status(201).json({ id: cree.id })
})

router.put('/personnes/:personneId', exigerGestion, chargerPersonne, async (req, res) => {
  const p = req.personne
  let fiche = lireFiche(req.body, { compte: Boolean(p.utilisateurId) })
  // Cocher « Personne décédée » sur la fiche d'un membre indique son décès sur son compte
  // (désactivé, réversible) ; décocher l'annule
  if (p.utilisateurId && 'decede' in fiche) {
    const { decede, dateDeces, ...reste } = fiche
    if (decede) await marquerDeces(p.utilisateurId, dateDeces ?? null, req.utilisateur)
    else if (p.decede) await annulerDeces(p.utilisateurId)
    fiche = reste
  }
  await db.transaction(async (tx) => {
    if (Object.keys(fiche).length) await tx.update(personnes).set(fiche).where(eq(personnes.id, p.id))
    // Les aidants renseignent aussi les coordonnées des personnes accompagnées (comme sur
    // « Famille et aidants ») ; celles des autres comptes restent dans « Mon profil »
    if (p.utilisateurId && ['telephone', 'dateNaissance', 'adresse'].some((c) => c in req.body)) {
      const [m] = await tx.select({ role: membres.role }).from(membres)
        .where(and(eq(membres.cercleId, req.cercle.id), eq(membres.utilisateurId, p.utilisateurId)))
      if (m?.role === 'accompagne') await tx.update(utilisateurs).set(valider.coordonnees(req.body)).where(eq(utilisateurs.id, p.utilisateurId))
    }
  })
  res.status(204).end()
})

// Retire une personne de l'arbre (et ses liens). Un membre du cercle garde son compte :
// il repasse dans « Pas encore dans l'arbre ».
router.delete('/personnes/:personneId', exigerGestion, chargerPersonne, async (req, res) => {
  const [p] = await db.delete(personnes).where(eq(personnes.id, req.personne.id)).returning()
  if (p.avatar?.startsWith('photo:') && !p.utilisateurId) await changerAvatar(p, null, personnes).catch(() => {})
  res.status(204).end()
})

// Avatar d'une personne sans compte (modèle ou photo, comme « Mon profil »)
function exigerSansCompte(req, res, next) {
  if (req.personne.utilisateurId) return res.status(400).json({ erreur: 'Cette personne choisit son avatar dans son profil' })
  next()
}

router.post('/personnes/:personneId/avatar/envoi', exigerGestion, chargerPersonne, exigerSansCompte, async (req, res) => {
  res.json(await preparerEnvoi(req.personne.id, req.body.taille))
})

router.put('/personnes/:personneId/avatar', exigerGestion, chargerPersonne, exigerSansCompte, async (req, res) => {
  res.json(await changerAvatar(req.personne, req.body.avatar, personnes))
})

// Relie deux personnes déjà dans l'arbre : { type: 'parent' (a parent de b) | 'conjoint', a, b, separes }
router.post('/relations', exigerGestion, async (req, res) => {
  const { type, a, b } = req.body
  if (!['parent', 'conjoint'].includes(type)) throw new ErreurSaisie('Lien invalide')
  await db.transaction(async (tx) => {
    await verifierDansCercle(tx, req.cercle.id, [a, b])
    if (!a || !b) throw new ErreurSaisie('Choisissez les deux personnes')
    await ajouterRelation(tx, req.cercle.id, type, a, b, Boolean(req.body.separes))
  })
  res.status(201).end()
})

// Couple séparé ou non
router.put('/relations/:relationId', exigerGestion, async (req, res) => {
  const [r] = await db.update(relations).set({ separes: Boolean(req.body.separes) })
    .where(and(eq(relations.id, req.params.relationId), eq(relations.cercleId, req.cercle.id), eq(relations.type, 'conjoint')))
    .returning()
  if (!r) return res.status(404).json({ erreur: 'Lien introuvable' })
  res.status(204).end()
})

router.delete('/relations/:relationId', exigerGestion, async (req, res) => {
  const [r] = await db.delete(relations)
    .where(and(eq(relations.id, req.params.relationId), eq(relations.cercleId, req.cercle.id)))
    .returning()
  if (!r) return res.status(404).json({ erreur: 'Lien introuvable' })
  res.status(204).end()
})

export default router
