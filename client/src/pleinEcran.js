import { computed, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { dansAppliAndroid } from './installation.js'
import { avecParametres, revenir } from './historique.js'

// Plein écran des visionneuses photo : la photo occupe tout l'écran (fond noir, sans boutons),
// et s'adapte quand on tourne l'appareil. Il est noté dans l'adresse (?plein=1) : le bouton
// retour le quitte. Dans un navigateur, on demande aussi le vrai plein écran (barre d'adresse et
// barres système masquées) ; dans l'application Android, c'est Android qui masque ses barres
// (window.TraitUnionEcran, MainActivity.java). Sinon, l'affichage reste en plein écran dans la page.
const natif = () => window.TraitUnionEcran

export function utiliserPleinEcran() {
  const route = useRoute()
  const router = useRouter()
  const actif = computed(() => route.query.plein === '1')

  const entrer = () => { if (!actif.value) router.push(avecParametres(route, { plein: '1' })) }
  const sortir = () => { if (actif.value) revenir(router, avecParametres(route, { plein: undefined })) }
  const basculer = () => (actif.value ? sortir() : entrer())

  function appliquer(oui) {
    if (natif()) natif().pleinEcran(oui)
    else if (oui && !dansAppliAndroid()) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {})
    if (!oui && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }
  watch(actif, appliquer, { immediate: true })

  // Sortie du vrai plein écran par le système (Échap, retour) : on quitte aussi celui de la page
  const auChangement = () => { if (!document.fullscreenElement) sortir() }
  document.addEventListener('fullscreenchange', auChangement)
  onUnmounted(() => {
    document.removeEventListener('fullscreenchange', auChangement)
    if (actif.value) appliquer(false)
  })

  return { pleinEcran: actif, entrer, sortir, basculer }
}
