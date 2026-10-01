import { reactive, computed } from 'vue'
import { api } from './api.js'
import { APK_URL, dansAppliAndroid } from './installation.js'

// Mise à jour de l'application Android : le serveur compare la version de l'APK installée
// (agent utilisateur « TraitUnionAndroid/42 ») à la dernière publiée sur GitHub.
export const etatApplication = reactive({
  derniere: null, // { version, nom, publieeLe }
  installee: null // null : pas l'application Android ; 0 : ancienne APK sans numéro de version
})

export async function verifierApplication() {
  if (!dansAppliAndroid()) return
  try {
    Object.assign(etatApplication, await api('GET', '/application'))
  } catch {
    // Hors ligne : on réessaiera au prochain retour sur l'appli
  }
}

export const miseAJourDisponible = computed(() =>
  etatApplication.installee !== null && etatApplication.derniere != null && etatApplication.installee < etatApplication.derniere.version)

// Les APK récentes savent ouvrir le téléchargement dans le navigateur du téléphone
export const telechargementDirect = () => Boolean(window.TraitUnionAppli?.ouvrirNavigateur)

export function telechargerApk() {
  window.TraitUnionAppli.ouvrirNavigateur(APK_URL)
}

// Adresse courte à taper dans Chrome (redirige vers l'APK, voir server/index.js)
export const adresseCourte = () => `${location.host}/apk`

// « Plus tard » : le bandeau revient 7 jours après, ou dès la version suivante
const CLE = 'tu_apk_plus_tard'
export function reporte() {
  try {
    const r = JSON.parse(localStorage.getItem(CLE))
    return r?.version === etatApplication.derniere?.version && r.jusqua > Date.now()
  } catch {
    return false
  }
}
export function reporter() {
  try {
    localStorage.setItem(CLE, JSON.stringify({ version: etatApplication.derniere?.version, jusqua: Date.now() + 7 * 86_400_000 }))
  } catch { /* stockage indisponible : le bandeau reviendra */ }
}
