import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { parametres } from '../db/schema.js'

// Page de présentation (/decouvrir/<clé>) : réglages dans la table `parametres`
const CLE = 'presentation'

export async function lireConfiguration() {
  const [ligne] = await db.select().from(parametres).where(eq(parametres.cle, CLE))
  return {
    actif: false,
    cle: null, // adresse secrète de la page
    afficherContact: false,
    typeContact: 'email', // email, whatsapp ou url
    contact: '',
    visites: 0,
    derniereVisite: null,
    visitesDepuis: ligne?.creeLe ?? null,
    ...ligne?.valeur
  }
}

export async function enregistrerConfiguration(valeur) {
  await db.insert(parametres).values({ cle: CLE, valeur })
    .onConflictDoUpdate({ target: parametres.cle, set: { valeur, modifieLe: new Date() } })
}

export const nouvelleCle = () => crypto.randomBytes(9).toString('base64url')

// Lien du bouton « Me contacter », ou null si le contact n'est pas utilisable
export function lienContact(type, valeur) {
  const v = String(valeur || '').trim()
  if (!v) return null
  if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? `mailto:${v}?subject=${encodeURIComponent('Trait d\'union')}` : null
  if (type === 'whatsapp') {
    const chiffres = v.replace(/[^\d]/g, '').replace(/^00/, '')
    return chiffres.length >= 8 ? `https://wa.me/${chiffres}` : null
  }
  return /^https:\/\/\S+$/.test(v) ? v : null
}

// Comparaison à temps constant de la clé demandée et de la clé enregistrée
export function cleValide(config, demandee) {
  if (!config.actif || !config.cle) return false
  const a = Buffer.from(String(demandee || ''))
  const b = Buffer.from(config.cle)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
