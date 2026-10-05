import { ref } from 'vue'

// Petit « ding » quand un message arrive dans la conversation ouverte. Le son est synthétisé par le
// navigateur (aucun fichier). Réglage mémorisé sur l'appareil ; actif par défaut.
const CLE = 'son-messages'
const lire = () => { try { return localStorage.getItem(CLE) !== 'non' } catch { return true } }
export const sonActif = ref(lire())
export function basculerSon() {
  sonActif.value = !sonActif.value
  try { localStorage.setItem(CLE, sonActif.value ? 'oui' : 'non') } catch { /* stockage indisponible */ }
  if (sonActif.value) jouerSon() // pour entendre le réglage
}

let contexte = null
export function jouerSon() {
  try {
    const AC = window.AudioContext ?? window.webkitAudioContext
    if (!AC) return
    contexte ??= new AC()
    if (contexte.state === 'suspended') contexte.resume().catch(() => {})
    const t0 = contexte.currentTime + 0.02
    // Deux notes montantes, douces
    for (const [i, f] of [[0, 880], [1, 1318.5]]) {
      const o = contexte.createOscillator()
      const g = contexte.createGain()
      o.type = 'sine'
      o.frequency.value = f
      const debut = t0 + i * 0.13
      g.gain.setValueAtTime(0.0001, debut)
      g.gain.exponentialRampToValueAtTime(0.22, debut + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, debut + 0.32)
      o.connect(g).connect(contexte.destination)
      o.start(debut)
      o.stop(debut + 0.34)
    }
  } catch { /* son indisponible : sans importance */ }
}

// Le son est joué si la liste des messages s'est allongée de messages d'autrui (page visible)
export function nouveauMessageRecu(avant, apres) {
  if (!avant.length || document.visibilityState !== 'visible' || !sonActif.value) return false
  const connus = new Set(avant.map((m) => m.id))
  return apres.some((m) => !connus.has(m.id) && !m.deMoi && !m.retire)
}
