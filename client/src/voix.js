import { reactive } from 'vue'
import { dansAppliAndroid } from './installation.js'

// Voix de l'appareil : lecture à voix haute et reconnaissance vocale, sans IA ni service payant.
// Dans l'application Android, la voix vient d'Android (window.TraitUnionVoix, voir
// mobile/android/.../MainActivity.java) ; dans un navigateur, des API Web Speech
// (reconnaissance : Chrome et Edge seulement).
const natif = () => window.TraitUnionVoix
const Reconnaissance = window.SpeechRecognition || window.webkitSpeechRecognition

// Une ancienne version de l'application Android n'a pas la voix : on n'affiche pas les boutons
export const lectureDisponible = () => natif()?.lectureDisponible?.() ??
  (!dansAppliAndroid() && 'speechSynthesis' in window)
export const ecouteDisponible = () => natif()?.ecouteDisponible?.() ??
  (!dansAppliAndroid() && Boolean(Reconnaissance))

// Écran de l'assistant (composant AssistantVoix), ouvert par le bouton « Parler »
export const assistant = reactive({ ouvert: false })

let voixFrancaise = null
function choisirVoix() {
  const voix = window.speechSynthesis?.getVoices() ?? []
  voixFrancaise = voix.find((v) => v.lang === 'fr-FR' && v.localService) ?? voix.find((v) => v.lang?.startsWith('fr')) ?? null
}
if ('speechSynthesis' in window) {
  choisirVoix()
  window.speechSynthesis.addEventListener?.('voiceschanged', choisirVoix)
}

export function parler(texte) {
  if (!texte) return
  if (natif()) return natif().parler(texte)
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const phrase = new SpeechSynthesisUtterance(texte)
  phrase.lang = 'fr-FR'
  phrase.rate = 0.9
  if (voixFrancaise) phrase.voice = voixFrancaise
  window.speechSynthesis.speak(phrase)
}

export function arreterParole() {
  if (natif()) return natif().arreter()
  window.speechSynthesis?.cancel()
}

// Écoute une phrase. Renvoie les propositions de la reconnaissance, de la plus probable à la
// moins probable ([] si la personne n'a rien dit ou a annulé).
export function ecouter() {
  arreterParole()
  if (natif()) {
    return new Promise((resolve) => {
      window.addEventListener('tu-voix', (e) => resolve(e.detail?.phrases ?? []), { once: true })
      natif().ecouter()
    })
  }
  return new Promise((resolve, reject) => {
    const r = new Reconnaissance()
    r.lang = 'fr-FR'
    r.maxAlternatives = 5
    r.interimResults = false
    let phrases = []
    r.onresult = (e) => {
      phrases = Array.from(e.results[0] ?? [], (alt) => alt.transcript)
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') reject(new Error('Le micro n\'est pas autorisé'))
      else if (e.error === 'network') reject(new Error('La reconnaissance vocale a besoin d\'internet'))
    }
    r.onend = () => resolve(phrases)
    r.start()
  })
}
