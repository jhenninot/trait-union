import { Router } from 'express'
import { and, eq, sql, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { conversations, messages, lectures } from '../db/schema.js'
import { exigerConnexion } from '../auth/sessions.js'
import * as valider from '../auth/validation.js'
import { ErreurSaisie } from '../auth/validation.js'
import { stockageActif, lienSigne, infoObjet } from '../stockage/s3.js'
import { liensAvatars } from '../avatars.js'
import { liensDesMembres } from '../arbre.js'
import { mesCercles } from './auth.js'
import { GROUPES, TITRES, reglages, membresCercle, participants, peutEcrire, peutEcrirePrive, peutRetirer } from '../messagerie/droits.js'
import { ouvrirFlux, signaler } from '../messagerie/flux.js'
import { programmerAlertes, apercu } from '../messagerie/alertes.js'
import { premierLien, apercuDe, imageDe } from '../messagerie/liens.js'
import { VARIANTES_PHOTO, VOCAL_MAX, DUREE_VOCAL_MAX, FORMATS_VOCAL, DUREE_ENVOI, clePhoto, cleVocal, clesFichiers, lienLecture, supprimerFichiers } from '../messagerie/fichiers.js'

// Messagerie : conversations de groupe du cercle, conversations privées, cahier de liaison
// (règles d'accès : server/messagerie/droits.js). Temps réel par /api/messagerie/flux.
const router = Router()
router.use(exigerConnexion)

const PAR_PAGE = 50
const JOUR = 86_400_000
const uuids = (ids) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)

// --- Chargements communs

// Les trois conversations de groupe existent d'office (créées à la première visite du cercle)
const groupesCrees = new Set()
async function creerGroupes(cercleId) {
  if (groupesCrees.has(cercleId)) return
  await db.insert(conversations).values(GROUPES.map((type) => ({ cercleId, type }))).onConflictDoNothing()
  groupesCrees.add(cercleId)
}

// Le cercle vu par la personne connectée : ses membres et elle-même (null si elle n'en fait pas partie)
async function vueCercle(req, cercleId) {
  const liste = await membresCercle(cercleId)
  const id = req.utilisateur?.id ?? req.id
  const moi = liste.find((m) => m.utilisateurId === id) ?? null
  return { liste, moi }
}

// Conversations du cercle auxquelles `moi` a accès
async function conversationsDe(cercleId, moi, liste) {
  await creerGroupes(cercleId)
  const toutes = await db.select().from(conversations).where(eq(conversations.cercleId, cercleId))
  return toutes.filter((c) => participants(c, liste).some((m) => m.utilisateurId === moi.utilisateurId))
}

// Messages non lus de chaque conversation (ceux des autres, arrivés depuis sa dernière lecture, ou
// depuis son arrivée dans le cercle s'il n'a encore rien lu)
async function nonLus(utilisateurId, liste) {
  if (!liste.length) return new Map()
  const { rows } = await db.execute(sql`
    select m.conversation_id, count(*)::int as n
    from messages m
    join (values ${sql.join(liste.map((c) => sql`(${c.id}::uuid, ${c.depuis}::timestamptz)`), sql`, `)}) as v(conversation_id, depuis)
      on v.conversation_id = m.conversation_id
    left join lectures l on l.conversation_id = m.conversation_id and l.utilisateur_id = ${utilisateurId}
    where m.auteur_id <> ${utilisateurId} and m.publie and m.retire_le is null
      and m.cree_le > greatest(coalesce(l.lu_jusqu_a, v.depuis), v.depuis)
    group by m.conversation_id`)
  return new Map(rows.map((r) => [r.conversation_id, r.n]))
}

async function derniersMessages(ids) {
  if (!ids.length) return new Map()
  const { rows } = await db.execute(sql`
    select distinct on (m.conversation_id) m.*, u.prenom as auteur_prenom
    from messages m join utilisateurs u on u.id = m.auteur_id
    where m.conversation_id in (${uuids(ids)}) and m.publie
    order by m.conversation_id, m.cree_le desc`)
  return new Map(rows.map((r) => [r.conversation_id, r]))
}

async function etatsLecture(conversationIds, utilisateurId) {
  if (!conversationIds.length) return new Map()
  const l = await db.select().from(lectures)
    .where(and(inArray(lectures.conversationId, conversationIds), eq(lectures.utilisateurId, utilisateurId)))
  return new Map(l.map((x) => [x.conversationId, x]))
}

const personne = (lienAvatar, m) => m && ({ utilisateurId: m.utilisateurId, prenom: m.prenom, nom: m.nom, role: m.role, lien: m.lien, avatar: lienAvatar(m.utilisateurId, m.avatar) })

function presenterConversation(c, { moi, liste, lienAvatar, dernier, nonLu, etat }) {
  const autreId = c.type === 'privee' ? (c.personneA === moi.utilisateurId ? c.personneB : c.personneA) : null
  const autre = autreId ? liste.find((m) => m.utilisateurId === autreId) : null
  const membresConv = participants(c, liste)
  return {
    id: c.id,
    cercleId: c.cercleId,
    type: c.type,
    titre: c.type === 'privee' ? (autre?.prenom ?? 'Ancien membre') : TITRES[c.type],
    autre: personne(lienAvatar, autre),
    nombre: membresConv.length,
    membres: membresConv.filter((m) => m.utilisateurId !== moi.utilisateurId).map((m) => personne(lienAvatar, m)),
    dernier: dernier && {
      apercu: dernier.retire_le ? 'Message retiré' : apercu({ ...dernier, fichier: dernier.fichier }),
      auteurPrenom: dernier.auteur_prenom,
      deMoi: dernier.auteur_id === moi.utilisateurId,
      le: dernier.cree_le
    },
    nonLus: nonLu ?? 0,
    muet: etat?.muet ?? false,
    peutEcrire: peutEcrire(c, moi, liste)
  }
}

// Liste des conversations du cercle, pour la personne connectée
async function listeConversations(req, cercleId, { liste, moi }) {
  const convs = await conversationsDe(cercleId, moi, liste)
  const ids = convs.map((c) => c.id)
  const [lienAvatar, derniers, etats, compte] = await Promise.all([
    liensAvatars(),
    derniersMessages(ids),
    etatsLecture(ids, moi.utilisateurId),
    nonLus(moi.utilisateurId, convs.map((c) => ({ id: c.id, depuis: moi.membreDepuis })))
  ])
  return convs
    .map((c) => presenterConversation(c, { moi, liste, lienAvatar, dernier: derniers.get(c.id), nonLu: compte.get(c.id), etat: etats.get(c.id) }))
    // Une conversation privée sans message n'apparaît pas encore
    .filter((c) => c.type !== 'privee' || c.dernier)
}

// Charge req.conversation, req.liste (membres du cercle) et req.moi ; refuse si la personne n'y a pas accès
async function chargerConversation(req, res, next) {
  const [c] = await db.select().from(conversations).where(eq(conversations.id, req.params.id))
  if (!c) return res.status(404).json({ erreur: 'Conversation introuvable' })
  const { liste, moi } = await vueCercle(req, c.cercleId)
  if (!moi || !participants(c, liste).some((m) => m.utilisateurId === moi.utilisateurId)) {
    return res.status(404).json({ erreur: 'Conversation introuvable' })
  }
  Object.assign(req, { conversation: c, liste, moi })
  next()
}

async function chargerMessage(req, res, next) {
  const [m] = await db.select().from(messages).where(eq(messages.id, req.params.messageId))
  if (!m) return res.status(404).json({ erreur: 'Message introuvable' })
  req.params.id = m.conversationId
  req.message = m
  chargerConversation(req, res, next)
}

// --- Présentation des messages

function presenterMessage(m, { conversation, moi, liste, lienAvatar, stockage, lus }) {
  const auteur = liste.find((x) => x.utilisateurId === m.auteurId)
  const base = {
    id: m.id,
    conversationId: m.conversationId,
    type: m.type,
    creeLe: m.creeLe,
    deMoi: m.auteurId === moi.utilisateurId,
    auteur: auteur ? personne(lienAvatar, auteur) : { utilisateurId: m.auteurId, prenom: m.auteurPrenom ?? 'Ancien membre', avatar: null },
    accompagne: m.accompagneId ? personne(lienAvatar, liste.find((x) => x.utilisateurId === m.accompagneId)) ?? { prenom: '?' } : null
  }
  if (m.retireLe) {
    const par = liste.find((x) => x.utilisateurId === m.retireParId)
    return { ...base, retire: { parAuteur: m.retireParId === m.auteurId, prenom: par?.prenom ?? null } }
  }
  const message = { ...base, texte: m.texte, peutRetirer: peutRetirer(conversation, moi, m) }
  const lien = m.type === 'texte' ? m.fichier?.lien : null
  if (lien) {
    message.lien = { url: lien.url, titre: lien.titre, description: lien.description, site: lien.site, image: lien.image ? `/api/messagerie/messages/${m.id}/apercu-image` : null }
  }
  if (m.type === 'photo' && stockage) {
    message.photo = { miniature: lienLecture(stockage, clePhoto(m, 'miniature')), ecran: lienLecture(stockage, clePhoto(m, 'ecran')), largeur: m.fichier?.largeur, hauteur: m.fichier?.hauteur }
  }
  if (m.type === 'vocal' && stockage) message.vocal = { lien: lienLecture(stockage, cleVocal(m)), duree: m.fichier?.duree ?? 0 }
  // Accusés de lecture, sur ses propres messages
  if (message.deMoi && lus) {
    message.vuPar = lus.filter((l) => l.utilisateurId !== m.auteurId && l.luJusquA >= m.creeLe).map((l) => l.prenom)
  }
  return message
}

// Qui a lu jusqu'où dans une conversation (avec les prénoms)
async function lecteurs(conversation, liste) {
  const l = await db.select().from(lectures).where(eq(lectures.conversationId, conversation.id))
  const membresConv = participants(conversation, liste)
  return l.map((x) => ({ ...x, prenom: membresConv.find((m) => m.utilisateurId === x.utilisateurId)?.prenom }))
    .filter((x) => x.prenom && x.luJusquA)
}

async function marquerLu(conversation, utilisateurId, jusqua = new Date()) {
  await db.insert(lectures).values({ conversationId: conversation.id, utilisateurId, luJusquA: jusqua })
    .onConflictDoUpdate({
      target: [lectures.conversationId, lectures.utilisateurId],
      set: { luJusquA: sql`greatest(${lectures.luJusquA}, ${jusqua.toISOString()}::timestamptz)`, modifieLe: new Date() }
    })
}

// Un message vient d'être publié : la conversation remonte, les pages ouvertes se rafraîchissent,
// les alertes partent un peu plus tard pour ceux qui ne l'ont pas lu
async function annoncer(req, message) {
  const { conversation, liste, moi } = req
  await db.update(conversations).set({ dernierMessageLe: message.creeLe }).where(eq(conversations.id, conversation.id))
  await marquerLu(conversation, moi.utilisateurId, message.creeLe)
  const membresConv = participants(conversation, liste)
  signaler(membresConv.map((m) => m.utilisateurId), 'message', { cercleId: conversation.cercleId, conversationId: conversation.id, auteurId: moi.utilisateurId })
  programmerAlertes(conversation, message, moi, membresConv.filter((m) => m.utilisateurId !== moi.utilisateurId))
}

// Aperçu du premier lien d'un message (après l'envoi, sans faire attendre l'auteur) : enregistré
// dans fichier.lien, puis les pages ouvertes rechargent la conversation (événement sans auteurId,
// pour ne pas relancer la lecture à voix haute de la personne accompagnée).
function ajouterApercu(req, message) {
  const lien = premierLien(message.texte)
  if (!lien) return
  const { conversation, liste } = req
  apercuDe(lien).then(async (a) => {
    if (!a) return
    await db.update(messages).set({ fichier: { lien: a } }).where(and(eq(messages.id, message.id), sql`${messages.retireLe} is null`))
    signaler(participants(conversation, liste).map((m) => m.utilisateurId), 'message', { cercleId: conversation.cercleId, conversationId: conversation.id })
  }).catch((e) => console.error('[Messagerie] Aperçu de lien :', e.message))
}

// --- Routes

// Temps réel : événements « message » et « lu » des conversations de la personne connectée
router.get('/flux', ouvrirFlux)

// Nombre de messages non lus, par cercle (menus, accueil)
router.get('/non-lus', async (req, res) => {
  const resultat = { total: 0, cercles: {} }
  for (const c of await mesCercles(req.utilisateur.id)) {
    const { liste, moi } = await vueCercle(req, c.id)
    if (!moi) continue
    const convs = await conversationsDe(c.id, moi, liste)
    const compte = await nonLus(moi.utilisateurId, convs.map((x) => ({ id: x.id, depuis: moi.membreDepuis })))
    const n = [...compte.values()].reduce((a, b) => a + b, 0)
    resultat.cercles[c.id] = n
    resultat.total += n
  }
  res.json(resultat)
})

// Conversations d'un cercle et personnes à qui l'on peut écrire en privé
router.get('/cercles/:cercleId', async (req, res) => {
  const vue = await vueCercle(req, req.params.cercleId)
  if (!vue.moi) return res.status(403).json({ erreur: 'Seuls les membres du cercle ont accès à ses messages' })
  const lienAvatar = await liensAvatars()
  const liste = await listeConversations(req, req.params.cercleId, vue)
  const prives = await db.select().from(conversations)
    .where(and(eq(conversations.cercleId, req.params.cercleId), eq(conversations.type, 'privee')))
  const contacts = vue.liste.filter((m) => peutEcrirePrive(vue.moi, m)).map((m) => ({
    ...personne(lienAvatar, m),
    conversationId: prives.find((c) => [c.personneA, c.personneB].includes(m.utilisateurId) && [c.personneA, c.personneB].includes(vue.moi.utilisateurId))?.id ?? null
  })).sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'))
  res.json({
    monRole: vue.moi.role,
    conversations: liste,
    contacts,
    // Pour le cahier de liaison : les personnes accompagnées du cercle
    accompagnes: vue.liste.filter((m) => m.role === 'accompagne').map((m) => personne(lienAvatar, m))
  })
})

// Ouvre (ou crée) la conversation privée avec un membre. Corps : { utilisateurId }
router.post('/cercles/:cercleId/privee', async (req, res) => {
  const { liste, moi } = await vueCercle(req, req.params.cercleId)
  if (!moi) return res.status(403).json({ erreur: 'Seuls les membres du cercle ont accès à ses messages' })
  const autre = liste.find((m) => m.utilisateurId === req.body.utilisateurId)
  if (!peutEcrirePrive(moi, autre)) return res.status(403).json({ erreur: 'Vous ne pouvez pas écrire en privé à cette personne' })
  const [personneA, personneB] = [moi.utilisateurId, autre.utilisateurId].sort()
  const valeurs = { cercleId: req.params.cercleId, type: 'privee', personneA, personneB }
  await db.insert(conversations).values(valeurs).onConflictDoNothing()
  const [c] = await db.select({ id: conversations.id }).from(conversations).where(and(
    eq(conversations.cercleId, valeurs.cercleId), eq(conversations.type, 'privee'),
    eq(conversations.personneA, personneA), eq(conversations.personneB, personneB)))
  res.json({ id: c.id })
})

// Une conversation et ses messages (les plus récents, ou ceux d'avant ?avant=<date ISO>)
router.get('/conversations/:id', chargerConversation, async (req, res) => {
  const { conversation, liste, moi } = req
  const conditions = [eq(messages.conversationId, conversation.id), eq(messages.publie, true)]
  if (req.query.avant) {
    const avant = new Date(req.query.avant)
    if (Number.isNaN(avant.getTime())) throw new ErreurSaisie('Date invalide')
    conditions.push(sql`${messages.creeLe} < ${avant.toISOString()}::timestamptz`)
  }
  const lignes = await db.select().from(messages).where(and(...conditions)).orderBy(sql`${messages.creeLe} desc`).limit(PAR_PAGE)
  const [lienAvatar, stockage, lus, etat] = await Promise.all([liensAvatars(), stockageActif(), lecteurs(conversation, liste), etatsLecture([conversation.id], moi.utilisateurId)])
  const contexte = { conversation, moi, liste, lienAvatar, stockage, lus }
  res.json({
    conversation: presenterConversation(conversation, { moi, liste, lienAvatar, etat: etat.get(conversation.id) }),
    messages: lignes.reverse().map((m) => presenterMessage(m, contexte)),
    suite: lignes.length === PAR_PAGE,
    accompagnes: conversation.type === 'liaison' ? liste.filter((m) => m.role === 'accompagne').map((m) => personne(lienAvatar, m)) : [],
    fichiers: Boolean(stockage),
    peutModerer: conversation.type !== 'privee' && moi.role === 'aidant',
    monRole: moi.role,
    // Réglages de la personne accompagnée connectée (réponses toutes faites, vocal)
    reglages: moi.role === 'accompagne' ? reglages(moi.messagerie) : undefined
  })
})

// Envoie un message.
// Texte : { type: 'texte' | 'rapide', texte, accompagneId } ; le message est publié tout de suite.
// Photo : { type: 'photo', texte, largeur, hauteur, tailles: { miniature, ecran } } → liens d'envoi
// Vocal : { type: 'vocal', duree, taille, format } → lien d'envoi ; puis POST /messages/:id/publier
router.post('/conversations/:id/messages', chargerConversation, async (req, res) => {
  const { conversation, liste, moi } = req
  if (!peutEcrire(conversation, moi, liste)) return res.status(403).json({ erreur: 'Vous ne pouvez pas écrire dans cette conversation' })
  const type = req.body.type ?? 'texte'
  if (!['texte', 'rapide', 'photo', 'vocal'].includes(type)) throw new ErreurSaisie('Type de message invalide')
  let accompagneId = null
  if (req.body.accompagneId && conversation.type === 'liaison') {
    const a = liste.find((m) => m.utilisateurId === req.body.accompagneId && m.role === 'accompagne')
    if (!a) throw new ErreurSaisie('Personne accompagnée introuvable')
    accompagneId = a.utilisateurId
  }
  const valeurs = { conversationId: conversation.id, cercleId: conversation.cercleId, auteurId: moi.utilisateurId, type, accompagneId }

  if (type === 'texte' || type === 'rapide') {
    valeurs.texte = valider.texte(req.body.texte, 'message', { max: type === 'rapide' ? 60 : 4000 })
    const [message] = await db.insert(messages).values(valeurs).returning()
    await annoncer(req, message)
    if (type === 'texte') ajouterApercu(req, message)
    return res.status(201).json({ id: message.id })
  }

  if (moi.role === 'accompagne' && !reglages(moi.messagerie).vocal) return res.status(403).json({ erreur: 'Les photos et messages vocaux ne sont pas activés' })
  const stockage = await stockageActif()
  if (!stockage) return res.status(503).json({ erreur: 'L\'envoi de photos et de messages vocaux n\'est pas encore configuré par l\'administrateur' })
  if (type === 'photo') {
    const tailles = Object.fromEntries(Object.entries(VARIANTES_PHOTO).map(([v, max]) => {
      const taille = Number(req.body.tailles?.[v])
      if (!Number.isInteger(taille) || taille <= 0) throw new ErreurSaisie('Taille de photo invalide')
      if (taille > max) throw new ErreurSaisie('Photo trop lourde')
      return [v, taille]
    }))
    const largeur = Number(req.body.largeur)
    const hauteur = Number(req.body.hauteur)
    if (![largeur, hauteur].every((n) => Number.isInteger(n) && n > 0 && n <= 10000)) throw new ErreurSaisie('Dimensions de photo invalides')
    const [message] = await db.insert(messages).values({
      ...valeurs,
      texte: valider.texte(req.body.texte, 'légende', { obligatoire: false, max: 1000 }),
      fichier: { largeur, hauteur },
      publie: false
    }).returning()
    const envois = Object.fromEntries(Object.keys(VARIANTES_PHOTO).map((v) => [v, lienSigne(stockage, 'PUT', clePhoto(message, v), {
      duree: DUREE_ENVOI,
      entetes: { 'content-type': 'image/jpeg', 'content-length': tailles[v] }
    })]))
    return res.status(201).json({ id: message.id, envois })
  }
  // Vocal
  const format = String(req.body.format ?? '').split(';')[0].trim()
  const extension = FORMATS_VOCAL[format]
  if (!extension) throw new ErreurSaisie('Format d\'enregistrement non pris en charge')
  const taille = Number(req.body.taille)
  if (!Number.isInteger(taille) || taille <= 0) throw new ErreurSaisie('Taille d\'enregistrement invalide')
  if (taille > VOCAL_MAX) throw new ErreurSaisie('Message vocal trop long')
  const duree = Math.round(Number(req.body.duree) * 10) / 10
  if (!(duree > 0) || duree > DUREE_VOCAL_MAX + 5) throw new ErreurSaisie(`Un message vocal dure au plus ${DUREE_VOCAL_MAX / 60} minutes`)
  const [message] = await db.insert(messages).values({ ...valeurs, fichier: { duree, format, extension }, publie: false }).returning()
  const envoi = lienSigne(stockage, 'PUT', cleVocal(message), { duree: DUREE_ENVOI, entetes: { 'content-type': format, 'content-length': taille } })
  res.status(201).json({ id: message.id, envoi })
})

// Le navigateur a envoyé le fichier d'une photo ou d'un message vocal : on vérifie qu'il est arrivé
router.post('/messages/:messageId/publier', chargerMessage, async (req, res) => {
  const message = req.message
  if (message.auteurId !== req.moi.utilisateurId) return res.status(403).json({ erreur: 'Seule la personne qui envoie le message peut le publier' })
  if (!message.publie) {
    const stockage = await stockageActif()
    if (!stockage) return res.status(503).json({ erreur: 'Le stockage n\'est plus configuré' })
    for (const cle of clesFichiers(message)) {
      if (!await infoObjet(stockage, cle)) return res.status(400).json({ erreur: 'Le fichier n\'est pas arrivé chez l\'hébergeur, réessayez' })
    }
    // Le message prend l'heure de sa publication (l'envoi du fichier a pu prendre un moment)
    const [publie] = await db.update(messages).set({ publie: true, creeLe: new Date() }).where(eq(messages.id, message.id)).returning()
    await annoncer(req, publie)
  }
  res.json({ id: message.id })
})

// Retire un message : son texte et son fichier sont effacés, il en reste la trace « Message retiré »
router.delete('/messages/:messageId', chargerMessage, async (req, res) => {
  const { conversation, moi, liste, message } = req
  if (!peutRetirer(conversation, moi, message)) return res.status(403).json({ erreur: 'Seuls son auteur et les aidants peuvent retirer ce message' })
  if (!message.retireLe) {
    await supprimerFichiers(await stockageActif(), message).catch((e) => console.error('[Messagerie] Fichier :', e.message))
    // Un envoi jamais terminé disparaît tout à fait
    if (!message.publie) await db.delete(messages).where(eq(messages.id, message.id))
    else await db.update(messages).set({ retireLe: new Date(), retireParId: moi.utilisateurId, texte: null, ...(message.type === 'texte' ? { fichier: null } : {}) }).where(eq(messages.id, message.id))
    signaler(participants(conversation, liste).map((m) => m.utilisateurId), 'message', { cercleId: conversation.cercleId, conversationId: conversation.id })
  }
  res.status(204).end()
})

// Image de l'aperçu d'un lien, relayée par le serveur
router.get('/messages/:messageId/apercu-image', chargerMessage, async (req, res) => {
  const url = req.message.retireLe ? null : req.message.fichier?.lien?.image
  if (!url) return res.status(404).end()
  try {
    const image = await imageDe(url)
    res.set({ 'Content-Type': image.type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' })
    res.send(image.corps)
  } catch {
    res.status(404).end()
  }
})

// La personne a lu la conversation (jusqu'à maintenant)
router.post('/conversations/:id/lu', chargerConversation, async (req, res) => {
  await marquerLu(req.conversation, req.moi.utilisateurId)
  signaler(participants(req.conversation, req.liste).map((m) => m.utilisateurId), 'lu', { conversationId: req.conversation.id, utilisateurId: req.moi.utilisateurId })
  res.status(204).end()
})

// Sourdine : pas d'alerte pour cette conversation. Corps : { muet }
router.put('/conversations/:id/muet', chargerConversation, async (req, res) => {
  const muet = Boolean(req.body.muet)
  await db.insert(lectures).values({ conversationId: req.conversation.id, utilisateurId: req.moi.utilisateurId, muet })
    .onConflictDoUpdate({ target: [lectures.conversationId, lectures.utilisateurId], set: { muet, modifieLe: new Date() } })
  res.json({ muet })
})

// --- Personne accompagnée : tous les messages qui lui sont adressés, sur de grandes cartes

// Messages des autres dans « Toute la famille » et ses conversations privées, tous cercles confondus
// (30 derniers jours), les plus récents d'abord ; `nouveau` s'ils n'avaient pas encore été lus.
// (aussi lus à voix haute par l'assistant vocal, server/voix/assistant.js). avecLesMiens : ses propres
// messages aussi (deMoi), pour que la page « Mes messages » montre la conversation entière.
export async function messagesAccompagne(utilisateur, { avecLesMiens = false } = {}) {
  const [lienAvatar, stockage] = await Promise.all([liensAvatars(), stockageActif()])
  const resultat = { messages: [], famille: [], reglages: reglages(utilisateur.messagerie), fichiers: Boolean(stockage) }
  for (const c of (await mesCercles(utilisateur.id)).filter((x) => x.role === 'accompagne')) {
    const { liste, moi } = await vueCercle(utilisateur, c.id)
    if (!moi) continue
    const convs = (await conversationsDe(c.id, moi, liste)).filter((x) => x.type === 'famille' || x.type === 'privee')
    const famille = convs.find((x) => x.type === 'famille')
    if (famille) resultat.famille.push({ cercleId: c.id, conversationId: famille.id })
    if (!convs.length) continue
    const etats = await etatsLecture(convs.map((x) => x.id), moi.utilisateurId)
    const { liens } = await liensDesMembres(c.id, moi.utilisateurId)
    const lignes = await db.select().from(messages).where(and(
      inArray(messages.conversationId, convs.map((x) => x.id)),
      eq(messages.publie, true),
      sql`${messages.retireLe} is null`,
      ...(avecLesMiens ? [] : [sql`${messages.auteurId} <> ${moi.utilisateurId}`]),
      sql`${messages.creeLe} > ${new Date(Date.now() - 30 * JOUR).toISOString()}::timestamptz`
    )).orderBy(sql`${messages.creeLe} desc`).limit(40)
    for (const m of lignes) {
      const conversation = convs.find((x) => x.id === m.conversationId)
      const auteur = liste.find((x) => x.utilisateurId === m.auteurId)
      const p = presenterMessage(m, { conversation, moi, liste, lienAvatar, stockage })
      const lu = etats.get(conversation.id)?.luJusquA
      // Répondre : dans la même conversation, comme un groupe WhatsApp (la réponse à un message de
      // « Toute la famille » va à toute la famille, celle à un message privé reste privée)
      const repondre = p.deMoi ? null : { cercleId: c.id, conversationId: conversation.id, utilisateurId: m.auteurId, prive: conversation.type === 'privee' }
      resultat.messages.push({
        ...p,
        auteur: { ...p.auteur, lien: liens.get(m.auteurId) ?? auteur?.lien ?? null },
        groupe: conversation.type === 'famille',
        // Ses propres messages privés : à qui elle a écrit
        a: p.deMoi && conversation.type === 'privee'
          ? liste.find((x) => x.utilisateurId === (conversation.personneA === moi.utilisateurId ? conversation.personneB : conversation.personneA))?.prenom ?? null
          : null,
        nouveau: !p.deMoi && (!lu || lu < m.creeLe),
        repondre
      })
    }
  }
  resultat.messages.sort((a, b) => new Date(b.creeLe) - new Date(a.creeLe))
  resultat.messages = resultat.messages.slice(0, 40)
  return resultat
}

// Ses conversations (« Toute la famille » et privées), tous cercles confondus, comme la liste
// des discussions de WhatsApp : la plus récente en haut, avec le nombre de messages non lus ;
// et les personnes à qui elle peut écrire en privé.
router.get('/accompagne/conversations', async (req, res) => {
  const resultat = { conversations: [], contacts: [], reglages: reglages(req.utilisateur.messagerie), fichiers: Boolean(await stockageActif()) }
  const lienAvatar = await liensAvatars()
  const cercles = (await mesCercles(req.utilisateur.id)).filter((x) => x.role === 'accompagne')
  for (const c of cercles) {
    const vue = await vueCercle(req, c.id)
    if (!vue.moi) continue
    for (const conv of await listeConversations(req, c.id, vue)) {
      if (conv.type !== 'famille' && conv.type !== 'privee') continue
      // Plusieurs cercles : le nom du cercle distingue les groupes « Toute la famille »
      resultat.conversations.push({ ...conv, sousTitre: conv.type === 'famille' && cercles.length > 1 ? c.nom : null })
    }
    for (const m of vue.liste.filter((x) => peutEcrirePrive(vue.moi, x))) {
      resultat.contacts.push({ ...personne(lienAvatar, m), cercleId: c.id })
    }
  }
  const quand = (c) => (c.dernier ? new Date(c.dernier.le).getTime() : 0)
  resultat.conversations.sort((a, b) => quand(b) - quand(a) || (a.type === 'famille' ? -1 : 1))
  resultat.contacts.sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'))
  res.json(resultat)
})

router.get('/accompagne', async (req, res) => {
  res.json(await messagesAccompagne(req.utilisateur, { avecLesMiens: req.query.avecLesMiens === '1' }))
})

// La personne accompagnée a vu ses messages : toutes ses conversations sont marquées lues
router.post('/accompagne/lu', async (req, res) => {
  for (const c of (await mesCercles(req.utilisateur.id)).filter((x) => x.role === 'accompagne')) {
    const { liste, moi } = await vueCercle(req, c.id)
    if (!moi) continue
    for (const conversation of (await conversationsDe(c.id, moi, liste)).filter((x) => x.type === 'famille' || x.type === 'privee')) {
      await marquerLu(conversation, moi.utilisateurId)
      signaler(participants(conversation, liste).map((m) => m.utilisateurId), 'lu', { conversationId: conversation.id, utilisateurId: moi.utilisateurId })
    }
  }
  res.status(204).end()
})

export default router
