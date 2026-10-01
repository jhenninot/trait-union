import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { lectures } from '../db/schema.js'
import { envoyerAlerte } from '../alertes/envoi.js'
import { TITRES } from './droits.js'

// Alertes « messages ». Elles partent 20 secondes après le message, seulement aux personnes qui
// ne l'ont pas encore lu : quelqu'un qui a la conversation sous les yeux la marque lue tout de suite
// et n'est pas dérangé. Pas plus d'une alerte toutes les 5 minutes par personne et par
// conversation (les suivantes remplacent la précédente sur l'appareil, même « tag »), et
// aucune pour une conversation mise en sourdine.
const DELAI = 20_000
const CALME = 5 * 60_000
const dernieres = new Map() // `${utilisateurId}:${conversationId}` → heure de la dernière alerte

const minutes = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function apercu(message) {
  if (message.type === 'photo') return message.texte ? `Photo : ${message.texte}` : 'Photo'
  if (message.type === 'sondage') return `Sondage : ${message.texte ?? ''}`
  if (message.type === 'vocal') return `Message vocal (${minutes(message.fichier?.duree ?? 0)})`
  const texte = message.texte ?? ''
  return texte.length > 140 ? `${texte.slice(0, 137)}…` : texte
}

// conversation, message, auteur ({ prenom }), destinataires : membres participants (sans l'auteur)
export function programmerAlertes(conversation, message, auteur, destinataires) {
  if (!destinataires.length) return
  setTimeout(() => envoyer(conversation, message, auteur, destinataires).catch((e) => console.error('[Messagerie] Alertes :', e.message)), DELAI).unref?.()
}

async function envoyer(conversation, message, auteur, destinataires) {
  const ids = destinataires.map((m) => m.utilisateurId)
  const etats = await db.select().from(lectures).where(and(eq(lectures.conversationId, conversation.id), inArray(lectures.utilisateurId, ids)))
  const etat = new Map(etats.map((l) => [l.utilisateurId, l]))
  const maintenant = Date.now()
  const aPrevenir = destinataires.filter((m) => {
    const l = etat.get(m.utilisateurId)
    if (l?.muet) return false
    if (l?.luJusquA && l.luJusquA >= message.creeLe) return false
    const cle = `${m.utilisateurId}:${conversation.id}`
    if (maintenant - (dernieres.get(cle) ?? 0) < CALME) return false
    dernieres.set(cle, maintenant)
    return true
  })
  const corps = apercu(message)
  const tag = `messages-${conversation.id}`
  const groupe = conversation.type === 'privee' ? null : conversation.type === 'groupe' ? conversation.titre : TITRES[conversation.type]
  const accompagnes = aPrevenir.filter((m) => m.role === 'accompagne').map((m) => m.utilisateurId)
  const autres = aPrevenir.filter((m) => m.role !== 'accompagne').map((m) => m.utilisateurId)
  await envoyerAlerte(accompagnes, { categorie: 'messages', titre: `${auteur.prenom} vous a écrit`, corps, url: '/messages', tag })
  await envoyerAlerte(autres, {
    categorie: 'messages',
    titre: groupe ? `${auteur.prenom} · ${groupe}` : auteur.prenom,
    corps,
    url: `/cercles/${conversation.cercleId}/messages?c=${conversation.id}`,
    tag
  })
}
