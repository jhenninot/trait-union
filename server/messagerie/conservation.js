import { and, eq, lt, or, ne, inArray, isNotNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { parametres, messages, conversations } from '../db/schema.js'
import { stockageActif } from '../stockage/s3.js'
import { supprimerFichiers } from './fichiers.js'

// Durée de conservation des messages (données personnelles, souvent de santé) : au-delà, ils sont
// effacés avec leurs fichiers. Réglée par un administrateur (clé « messagerie » de parametres) :
// 12 mois par défaut, 6 mois pour le cahier de liaison. Les photos ajoutées aussi à un album
// restent dans l'album (ce sont des photos du cercle à part entière).
const CLE = 'messagerie'
export const CONSERVATION_DEFAUT = { mois: 12, moisLiaison: 6 }
export const DUREES_POSSIBLES = [1, 3, 6, 12, 24, 36]
const JOUR = 86_400_000
const PAR_PASSE = 200

export async function lireConservation() {
  const [ligne] = await db.select().from(parametres).where(eq(parametres.cle, CLE))
  return { ...CONSERVATION_DEFAUT, ...ligne?.valeur }
}

export async function enregistrerConservation(valeur) {
  await db.insert(parametres).values({ cle: CLE, valeur })
    .onConflictDoUpdate({ target: parametres.cle, set: { valeur, modifieLe: new Date() } })
}

const ilYA = (mois, maintenant) => new Date(maintenant.getTime() - mois * 30.4 * JOUR)

// Efface les messages trop anciens, et les envois de fichiers jamais terminés (plus d'un jour)
export async function purgerMessages(maintenant = new Date()) {
  const { mois, moisLiaison } = await lireConservation()
  const liaison = db.select({ id: conversations.id }).from(conversations).where(eq(conversations.type, 'liaison'))
  const condition = or(
    and(inArray(messages.conversationId, liaison), lt(messages.creeLe, ilYA(moisLiaison, maintenant))),
    and(ne(messages.type, 'texte'), eq(messages.publie, false), lt(messages.creeLe, new Date(maintenant - JOUR))),
    lt(messages.creeLe, ilYA(mois, maintenant))
  )
  const stockage = await stockageActif()
  let total = 0
  for (;;) {
    const lot = await db.select().from(messages).where(condition).limit(PAR_PASSE)
    if (!lot.length) break
    for (const m of lot.filter((m) => !m.retireLe && ['photo', 'vocal'].includes(m.type))) {
      await supprimerFichiers(stockage, m).catch((e) => console.error('[Messagerie] Fichier :', e.message))
    }
    await db.delete(messages).where(inArray(messages.id, lot.map((m) => m.id)))
    total += lot.length
    if (lot.length < PAR_PASSE) break
  }
  return total
}

// Fichiers des messages d'un compte, à effacer avant de supprimer ce compte (ses messages partent avec lui)
export async function supprimerFichiersDe(utilisateurId) {
  const stockage = await stockageActif()
  if (!stockage) return
  const liste = await db.select().from(messages)
    .where(and(eq(messages.auteurId, utilisateurId), inArray(messages.type, ['photo', 'vocal']), isNotNull(messages.fichier)))
  for (const m of liste.filter((m) => !m.retireLe)) await supprimerFichiers(stockage, m).catch(() => {})
}
