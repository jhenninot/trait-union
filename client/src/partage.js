import { reactive } from 'vue'
import { session } from './session.js'
import { dansAppliAndroid } from './installation.js'

// Partage de photos avec les autres applications (WhatsApp, SMS, e-mail...), dans les deux sens.
// - Partager une photo : dans l'application Android, par Android (window.TraitUnionPartage, voir
//   mobile/android/.../MainActivity.java) ; dans un navigateur, par le partage web (navigator.share)
//   ou, à défaut (ordinateur), en téléchargeant la photo.
// - Recevoir des photos : l'application Android et la PWA installée apparaissent dans le menu
//   « Partager » d'Android. Les photos attendent ici, puis la page /recevoir les propose à l'envoi.
const natif = () => window.TraitUnionPartage
// Cache où le service worker (public/sw.js) dépose les photos partagées vers la PWA
export const CACHE_PARTAGE = 'trait-union-partage'

// Une ancienne version de l'application Android ne sait pas partager : pas de bouton
export const partageDisponible = () => Boolean(natif()?.partager) || !dansAppliAndroid()
// Idem pour l'enregistrement sur l'appareil
export const telechargementDisponible = () => Boolean(natif()?.telecharger) || !dansAppliAndroid()

export const etatPartage = reactive({ message: '' })
let fichierPret = null // { url, fichier } : photo déjà téléchargée, pour un second essai

function signaler(message) {
  etatPartage.message = message
  setTimeout(() => { if (etatPartage.message === message) etatPartage.message = '' }, 6000)
}

// Récupère la photo (version écran) sous forme de fichier, déjà téléchargée si possible
async function fichierDe(photo) {
  if (fichierPret?.url === photo.ecran) return fichierPret.fichier
  // « reload » : une réponse déjà en cache pour l'image affichée n'a pas les en-têtes CORS
  const reponse = await fetch(photo.ecran, { cache: 'reload' })
  if (!reponse.ok) throw new Error()
  const fichier = new File([await reponse.blob()], `photo-${photo.id.slice(0, 8)}.jpg`, { type: 'image/jpeg' })
  fichierPret = { url: photo.ecran, fichier }
  return fichier
}

function enregistrerFichier(fichier) {
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(fichier)
  lien.download = fichier.name
  lien.click()
  setTimeout(() => URL.revokeObjectURL(lien.href), 10_000)
}

// Partage la photo (version écran) avec sa légende
export async function partagerPhoto(photo) {
  const texte = photo.legende ?? ''
  if (natif()?.partager) return natif().partager(photo.ecran, texte)
  try {
    const fichier = await fichierDe(photo)
    if (navigator.canShare?.({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier], text: texte || undefined })
      } catch (e) {
        // Téléchargement trop long : le navigateur n'accepte plus le partage sans nouveau toucher
        if (e.name === 'NotAllowedError') signaler('Touchez encore « Partager » : la photo est prête.')
      }
      return
    }
    enregistrerFichier(fichier)
  } catch {
    signaler('La photo n\'a pas pu être récupérée. Vérifiez la connexion et réessayez.')
  }
}

// Enregistre la photo (version écran) sur l'appareil : galerie Android dans l'application,
// dossier Téléchargements dans un navigateur
export async function telechargerPhoto(photo) {
  if (natif()?.telecharger) return natif().telecharger(photo.ecran)
  try {
    enregistrerFichier(await fichierDe(photo))
    signaler('La photo est enregistrée sur votre appareil.')
  } catch {
    signaler('La photo n\'a pas pu être récupérée. Vérifiez la connexion et réessayez.')
  }
}

// --- Photos reçues d'une autre application ---

export const recues = reactive({ fichiers: [] })

function depuisBase64(json) {
  const { nom, type, donnees } = JSON.parse(json)
  const octets = Uint8Array.from(atob(donnees), (c) => c.charCodeAt(0))
  const extension = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
  return new File([octets], /\.\w+$/.test(nom) ? nom : `${nom}.${extension}`, { type })
}

// Déplace ici les photos en attente dans l'application Android ou la PWA (elles y sont effacées) ;
// renvoie le nombre de photos nouvellement arrivées. Un seul chargement à la fois.
let chargement = null
export function chargerRecues() {
  chargement ??= lireSources().finally(() => { chargement = null })
  return chargement
}

async function lireSources() {
  const fichiers = []
  const n = natif()?.nombreRecues?.() ?? 0
  if (n) {
    for (let i = 0; i < n; i++) {
      const json = natif().photoRecue(i)
      if (json) fichiers.push(depuisBase64(json))
    }
    natif().effacerRecues()
  }
  if ('caches' in window && await caches.has(CACHE_PARTAGE)) {
    const cache = await caches.open(CACHE_PARTAGE)
    for (const requete of await cache.keys()) {
      const reponse = await cache.match(requete)
      const blob = await reponse.blob()
      fichiers.push(new File([blob], decodeURIComponent(reponse.headers.get('X-Nom') ?? 'photo.jpg'), { type: blob.type }))
    }
    await caches.delete(CACHE_PARTAGE)
  }
  recues.fichiers = [...recues.fichiers, ...fichiers]
  return fichiers.length
}

// Photos reçues abandonnées
export function effacerRecues() {
  recues.fichiers = []
}

// Donne les photos reçues à la page Photos, qui les propose à l'envoi
export function prendreRecues() {
  const fichiers = recues.fichiers
  recues.fichiers = []
  return fichiers
}

// Au démarrage, à chaque page et quand l'application Android reçoit des photos : s'il y en a
// en attente et qu'on est connecté, on ouvre la page /recevoir.
export function surveillerPartages(router) {
  const verifier = async () => {
    if (!session.utilisateur) return
    // Sur la page /recevoir, les nouvelles photos s'ajoutent simplement aux autres
    if (await chargerRecues() && router.currentRoute.value.path !== '/recevoir') router.push('/recevoir')
  }
  router.afterEach(() => { verifier() })
  window.addEventListener('tu-partage', (e) => {
    if (e.detail?.erreur === 'telechargement') signaler('La photo n\'a pas pu être enregistrée. Vérifiez la connexion et réessayez.')
    else if (e.detail?.enregistree) signaler('La photo est enregistrée dans la galerie de votre appareil.')
    else if (e.detail?.erreur) signaler('La photo n\'a pas pu être partagée. Vérifiez la connexion et réessayez.')
    else verifier()
  })
}
