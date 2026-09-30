import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(crypto.scrypt)
const PARAMS = { N: 16384, r: 8, p: 1 }

// Empreinte d'un mot de passe au format scrypt$N$r$p$sel$empreinte
export async function hacherMotDePasse(motDePasse) {
  const sel = crypto.randomBytes(16)
  const cle = await scrypt(motDePasse, sel, 64, PARAMS)
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, sel.toString('base64'), cle.toString('base64')].join('$')
}

export async function verifierMotDePasse(motDePasse, empreinte) {
  if (!empreinte) return false
  const [algo, N, r, p, sel, attendu] = empreinte.split('$')
  if (algo !== 'scrypt') return false
  const attenduBuf = Buffer.from(attendu, 'base64')
  const cle = await scrypt(motDePasse, Buffer.from(sel, 'base64'), attenduBuf.length, { N: +N, r: +r, p: +p })
  return crypto.timingSafeEqual(cle, attenduBuf)
}

// Empreinte factice pour garder un temps de réponse constant quand l'email est inconnu
export const empreinteFactice = await hacherMotDePasse(crypto.randomBytes(16).toString('hex'))

export const nouveauJeton = () => crypto.randomBytes(32).toString('base64url')
export const nouveauCode = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
export const empreinte = (valeur) => crypto.createHash('sha256').update(valeur).digest('hex')

// Limiteur simple en mémoire : au plus `max` tentatives par clé sur `fenetreMs`.
export function limiteur({ max, fenetreMs }) {
  const tentatives = new Map()
  return {
    depasse(cle) {
      const maintenant = Date.now()
      const entree = tentatives.get(cle)
      if (!entree || entree.debut + fenetreMs < maintenant) {
        tentatives.set(cle, { debut: maintenant, nombre: 1 })
        return false
      }
      entree.nombre++
      return entree.nombre > max
    },
    reinitialiser(cle) {
      tentatives.delete(cle)
    }
  }
}
