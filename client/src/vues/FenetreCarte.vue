<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Icone from '../navigation/Icone.vue'

// Carte (OpenStreetMap) des lieux de prise de vue : une photo, ou toutes celles d'un album.
// Chaque point est un repère ; le toucher montre la miniature, qui ouvre la photo (événement « ouvrir »).
const props = defineProps({
  points: { type: Array, required: true }, // { id, latitude, longitude, miniature, legende }
  titre: { type: String, default: 'Lieu de prise de vue' },
  grand: { type: Boolean, default: false } // gros caractères et gros boutons (appareil de l'aidé)
})
const emit = defineEmits(['fermer', 'ouvrir'])
const conteneur = ref(null)
let carte = null

function touche(e) {
  if (e.key === 'Escape') emit('fermer')
}

onMounted(() => {
  carte = L.map(conteneur.value, { zoomControl: true, attributionControl: true })
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  }).addTo(carte)
  const reperes = props.points.map((p) => {
    // Repère dessiné (pas d'image) : les icônes par défaut de Leaflet ne survivent pas à l'empaquetage
    const repere = L.circleMarker([p.latitude, p.longitude], { radius: 9, color: '#ffffff', weight: 3, fillColor: '#3a63c8', fillOpacity: 1 }).addTo(carte)
    const contenu = document.createElement('div')
    contenu.className = 'bulle-photo'
    if (p.miniature) {
      const image = document.createElement('img')
      image.src = p.miniature
      image.alt = p.legende || 'Photo'
      if (props.points.length > 1) image.addEventListener('click', () => emit('ouvrir', p.id))
      contenu.appendChild(image)
    }
    if (p.legende) {
      const legende = document.createElement('span')
      legende.textContent = p.legende
      contenu.appendChild(legende)
    }
    if (contenu.childNodes.length) repere.bindPopup(contenu, { minWidth: 120 })
    return repere
  })
  if (props.points.length === 1) carte.setView([props.points[0].latitude, props.points[0].longitude], 15)
  else carte.fitBounds(L.featureGroup(reperes).getBounds().pad(0.2), { maxZoom: 16 })
  if (props.points.length === 1) reperes[0].openPopup()
  window.addEventListener('keydown', touche)
})
onUnmounted(() => {
  window.removeEventListener('keydown', touche)
  carte?.remove()
})
</script>

<template>
  <div class="voile" :class="{ grand }" @click.self="emit('fermer')">
    <div class="fenetre" role="dialog" aria-modal="true" :aria-label="titre">
      <header>
        <strong>{{ titre }}</strong>
        <button class="fermer" aria-label="Fermer la carte" @click="emit('fermer')"><Icone nom="fermer" class="en-ligne" /></button>
      </header>
      <div ref="conteneur" class="carte-leaflet"></div>
    </div>
  </div>
</template>

<style scoped>
.voile { position: fixed; inset: 0; z-index: 300; background: rgb(15 18 30 / 0.7); display: grid; place-items: center; padding: 16px; }
.fenetre { width: min(900px, 100%); height: min(640px, 100%); background: white; border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; }
header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; }
.grand header { font-size: 1.6rem; padding: 14px 18px; }
.fermer { width: 44px; height: 44px; padding: 0; display: grid; place-items: center; border-radius: 50%; }
.grand .fermer { width: 60px; height: 60px; }
.carte-leaflet { flex: 1; min-height: 0; }
.bulle-photo { display: flex; flex-direction: column; gap: 6px; align-items: center; }
.bulle-photo img { max-width: 160px; max-height: 160px; border-radius: 6px; cursor: pointer; }
</style>
