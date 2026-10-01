<script setup>
import { ref, watch } from 'vue'
import { LIENS } from '../coordonnees.js'

// Lien avec la personne accompagnée : une des valeurs proposées ou « Autre » en texte libre.
// v-model : le texte du lien, '' si aucun.
const modele = defineModel({ type: String, default: '' })
const autre = ref('')
const choix = ref('')
const lire = (v) => {
  if (!v) choix.value = ''
  else if (LIENS.includes(v)) choix.value = v
  else {
    choix.value = 'autre'
    autre.value = v
  }
}
lire(modele.value)
watch(modele, (v) => { if (v !== (choix.value === 'autre' ? autre.value : choix.value)) lire(v) })
watch([choix, autre], () => (modele.value = choix.value === 'autre' ? autre.value : choix.value))
</script>

<template>
  <div class="choix-lien">
    <select v-model="choix" aria-label="Lien avec la personne accompagnée">
      <option value="">Non précisé</option>
      <option v-for="l in LIENS" :key="l" :value="l">{{ l }}</option>
      <option value="autre">Autre…</option>
    </select>
    <input v-if="choix === 'autre'" v-model="autre" maxlength="60" placeholder="Ex. neveu, voisine, amie" aria-label="Autre lien" />
  </div>
</template>

<style scoped>
.choix-lien { display: flex; gap: 8px; flex-wrap: wrap; }
.choix-lien > * { flex: 1 1 180px; }
</style>
