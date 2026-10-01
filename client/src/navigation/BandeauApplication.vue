<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { etatApplication, verifierApplication, miseAJourDisponible, telechargementDirect, telechargerApk, reporte, reporter } from '../application.js'
import { auRetour } from '../miseAJour.js'
import Icone from './Icone.vue'

// Bandeau « nouvelle version de l'application » pour les aidants et la famille qui utilisent
// l'APK. Jamais sur l'appareil de la personne accompagnée (App.vue ne l'affiche pas).
const route = useRoute()
const masque = ref(false)
let arreter = null
onMounted(() => {
  verifierApplication().then(() => (masque.value = reporte()))
  arreter = auRetour(verifierApplication)
})
onUnmounted(() => arreter?.())

// Inutile sur la page qui explique déjà la mise à jour
const visible = computed(() => miseAJourDisponible.value && !masque.value && route.path !== '/application')

function plusTard() {
  reporter()
  masque.value = true
}
</script>

<template>
  <div v-if="visible" class="bandeau" role="status">
    <Icone nom="telecharger" class="em symbole" />
    <p><strong>Nouvelle version de l'application</strong>
      <span>La version {{ etatApplication.derniere.nom }} est disponible.</span></p>
    <div class="boutons">
      <button v-if="telechargementDirect()" @click="telechargerApk">Télécharger</button>
      <RouterLink v-else class="bouton" to="/application">Comment faire</RouterLink>
      <button class="secondaire" @click="plusTard">Plus tard</button>
    </div>
  </div>
</template>

<style scoped>
.bandeau {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 12px 16px 0;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--vert-clair);
  color: var(--bleu-nuit);
}
.symbole { font-size: 1.6rem; color: var(--vert); }
p { margin: 0; flex: 1; min-width: 180px; }
p span { display: block; font-size: 0.95rem; color: var(--gris); }
.boutons { display: flex; gap: 8px; }
.bouton {
  display: inline-block;
  background: var(--vert);
  color: white;
  text-decoration: none;
  padding: 10px 16px;
  border-radius: 8px;
}
.secondaire { background: white; }
</style>
