import { and, eq, lt, desc, inArray, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { conversations, messages, utilisateurs } from '../db/schema.js'
import { membresCercle, participants } from './droits.js'
import { clePhoto, lienLecture } from './fichiers.js'
import { lienAvatar } from '../avatars.js'

// Album « Conversations » : les photos envoyées par message apparaissent d'elles-mêmes parmi les
// photos du cercle, sans copie des fichiers (ce sont ceux du message, chez l'hébergeur S3).
// Chacun n'y voit que les photos des conversations auxquelles il participe : une photo d'une
// conversation privée n'est visible que de ses deux personnes. Un message retiré disparaît de l'album.
export const ALBUM_CONVERSATIONS = 'conversations'

// Conditions SQL des photos de messages visibles par `utilisateurId` dans le cercle
async function visibles(cercleId, utilisateurId) {
  const [liste, toutes] = await Promise.all([
    membresCercle(cercleId),
    db.select().from(conversations).where(eq(conversations.cercleId, cercleId))
  ])
  const moi = liste.find((m) => m.utilisateurId === utilisateurId)
  if (!moi || moi.role === 'auxiliaire') return null
  const ids = toutes.filter((c) => participants(c, liste).some((m) => m.utilisateurId === utilisateurId)).map((c) => c.id)
  return ids.length ? ids : null
}

const conditions = (cercleId, ids) => [
  eq(messages.cercleId, cercleId),
  inArray(messages.conversationId, ids),
  eq(messages.type, 'photo'),
  eq(messages.publie, true),
  isNull(messages.retireLe)
]

// Nombre, date de la dernière et couverture (miniature) de l'album, ou null s'il est vide
export async function resumeAlbumConversations(cercleId, utilisateurId, stockage) {
  const ids = await visibles(cercleId, utilisateurId)
  if (!ids) return null
  const liste = await db.select().from(messages).where(and(...conditions(cercleId, ids))).orderBy(desc(messages.creeLe))
  if (!liste.length) return null
  return {
    nombre: liste.length,
    derniere: liste[0].creeLe,
    couverture: stockage ? lienLecture(stockage, clePhoto(liste[0], 'miniature')) : null
  }
}

// Photos de l'album au même format que les photos du cercle (routes/photos.js), les plus récentes d'abord
export async function photosAlbumConversations(cercleId, utilisateurId, stockage, { avant, limite }) {
  const ids = await visibles(cercleId, utilisateurId)
  if (!ids) return []
  const where = conditions(cercleId, ids)
  if (avant) where.push(lt(messages.creeLe, avant))
  const liste = await db.select({ message: messages, prenom: utilisateurs.prenom, avatar: utilisateurs.avatar }).from(messages)
    .innerJoin(utilisateurs, eq(utilisateurs.id, messages.auteurId))
    .where(and(...where)).orderBy(desc(messages.creeLe)).limit(limite)
  return liste.map(({ message: m, prenom, avatar }) => ({
    id: m.id,
    cercleId,
    albumId: ALBUM_CONVERSATIONS,
    legende: m.texte,
    largeur: m.fichier?.largeur,
    hauteur: m.fichier?.hauteur,
    creeLe: m.creeLe,
    creeParPrenom: prenom,
    creeParAvatar: lienAvatar(stockage, m.auteurId, avatar),
    deMoi: m.auteurId === utilisateurId,
    // Une photo de conversation se retire depuis la conversation
    peutSupprimer: false,
    miniature: lienLecture(stockage, clePhoto(m, 'miniature')),
    ecran: lienLecture(stockage, clePhoto(m, 'ecran'))
  }))
}
