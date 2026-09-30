import { ref, onUnmounted } from 'vue'
import { dansAppliAndroid } from './installation.js'

// Plein écran des visionneuses photo : la photo occupe tout l'écran (fond noir, sans boutons),
// et s'adapte quand on tourne l'appareil. Dans un navigateur, on demande aussi le vrai plein
// écran (barre d'adresse et barres système masquées) ; dans l'application Android, c'est Android
// qui masque ses barres (window.TraitUnionEcran, MainActivity.java). Sinon, l'affichage reste en
// plein écran dans la page. Échap ou le retour du navigateur le font quitter.
const natif = () => window.TraitUnionEcran

export function utiliserPleinEcran() {
  const actif = ref(false)

  function entrer() {
    actif.value = true
    if (natif()) natif().pleinEcran(true)
    else if (!dansAppliAndroid()) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {})
  }
  function sortir() {
    actif.value = false
    natif()?.pleinEcran(false)
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }
  const basculer = () => (actif.value ? sortir() : entrer())

  // Sortie du vrai plein écran par le système (retour, Échap) : on quitte aussi celui de la page
  const auChangement = () => { if (!document.fullscreenElement) actif.value = false }
  document.addEventListener('fullscreenchange', auChangement)
  onUnmounted(() => {
    document.removeEventListener('fullscreenchange', auChangement)
    if (actif.value) sortir()
  })

  return { pleinEcran: actif, entrer, sortir, basculer }
}
