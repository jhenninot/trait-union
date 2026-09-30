<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { session } from '../session.js'
import { photosAccompagne, dateEnvoi } from '../photos.js'

// « Mes photos » sur la tablette de la personne accompagnée : une photo en grand à la fois,
// deux gros boutons pour passer à la suivante, et un diaporama qui défile tout seul.
const DELAI_DIAPORAMA = 8000
const liste = ref([])
const charge = ref(false)
const index = ref(0)
const diaporama = ref(false)
let minuterieDiaporama
let minuterieRechargement

async function charger() {
  const idActuelle = liste.value[index.value]?.id
  liste.value = await photosAccompagne(session.cercles)
  // Rester sur la même photo quand de nouvelles arrivent
  const i = liste.value.findIndex((p) => p.id === idActuelle)
  index.value = i >= 0 ? i : 0
  charge.value = true
}
onMounted(() => {
  charger()
  minuterieRechargement = setInterval(charger, 10 * 60_000)
})
onUnmounted(() => {
  clearInterval(minuterieRechargement)
  clearInterval(minuterieDiaporama)
})

const photo = computed(() => liste.value[index.value])

function aller(sens) {
  const n = liste.value.length
  if (n) index.value = (index.value + sens + n) % n
}

function basculerDiaporama() {
  diaporama.value = !diaporama.value
  clearInterval(minuterieDiaporama)
  if (diaporama.value) minuterieDiaporama = setInterval(() => aller(1), DELAI_DIAPORAMA)
}

// Toucher une flèche arrête le diaporama
function manuel(sens) {
  if (diaporama.value) basculerDiaporama()
  aller(sens)
}
</script>

<template>
  <main class="photos" :class="{ plein: diaporama }">
    <template v-if="photo">
      <div class="cadre" @click="diaporama && basculerDiaporama()">
        <img :key="photo.id" :src="photo.ecran" :alt="photo.legende || 'Photo de famille'" />
      </div>
      <p v-if="photo.legende" class="legende">{{ photo.legende }}</p>
      <p class="envoi">Envoyée par {{ photo.creeParPrenom ?? 'la famille' }}, {{ dateEnvoi(photo.creeLe) }}</p>
      <p v-if="diaporama" class="envoi">Touchez la photo pour arrêter le diaporama</p>
      <div v-else class="commandes">
        <button class="fleche" aria-label="Photo précédente" :disabled="liste.length < 2" @click="manuel(-1)">◀</button>
        <button class="diaporama" @click="basculerDiaporama">▶ Diaporama</button>
        <button class="fleche" aria-label="Photo suivante" :disabled="liste.length < 2" @click="manuel(1)">▶</button>
      </div>
    </template>
    <p v-else-if="charge" class="vide">Pas encore de photo.<br />Votre famille peut vous en envoyer.</p>
  </main>
</template>

<style scoped>
.photos {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 24px;
  gap: 8px;
}
.cadre { flex: 1; min-height: 0; width: 100%; display: flex; align-items: center; justify-content: center; }
.cadre img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 16px; box-shadow: 0 4px 16px rgb(0 0 0 / 0.12); }
.plein { background: #111; }
.plein .cadre img { border-radius: 0; box-shadow: none; }
.plein .legende, .plein .envoi { color: white; }
.legende { font-size: 2rem; font-weight: 700; color: var(--bleu-nuit); margin: 4px 0 0; text-align: center; }
.envoi { font-size: 1.4rem; color: var(--gris); margin: 0; text-align: center; }
.commandes { display: flex; gap: 16px; width: 100%; max-width: 900px; margin-top: 8px; }
.commandes button { border-radius: 20px; font-weight: 700; background: #f3f0ea; color: var(--bleu-nuit); }
.fleche { flex: 1; font-size: 2.6rem; padding: 14px; }
.diaporama { flex: 1.4; font-size: 1.6rem; padding: 14px; }
.vide { flex: 1; display: flex; align-items: center; text-align: center; font-size: 2rem; color: var(--gris); }
@media (max-width: 600px) {
  .photos { padding: 10px 12px; }
  .legende { font-size: 1.4rem; }
  .envoi { font-size: 1.1rem; }
  .fleche { font-size: 2rem; }
  .diaporama { font-size: 1.2rem; }
}
</style>
