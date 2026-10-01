<script setup>
import { naissance, lienTelephone } from '../coordonnees.js'
import Icone from '../navigation/Icone.vue'

// Téléphone (cliquable), date de naissance avec l'âge et adresse d'une personne
defineProps({ personne: { type: Object, required: true } })
</script>

<template>
  <ul class="coordonnees">
    <li v-if="personne.telephone">
      <Icone nom="telephone" class="en-ligne" />
      <a :href="lienTelephone(personne.telephone)">{{ personne.telephone }}</a>
    </li>
    <li v-if="personne.dateNaissance"><Icone nom="gateau" class="en-ligne" /> {{ naissance(personne.dateNaissance) }}</li>
    <li v-if="personne.adresse" class="adresse"><Icone nom="lieu" class="en-ligne" /> <span>{{ personne.adresse }}</span></li>
  </ul>
</template>

<style scoped>
.coordonnees { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.coordonnees li { display: flex; align-items: baseline; gap: 8px; }
.coordonnees .icone { color: var(--vert); position: relative; top: 0.15em; }
.adresse span { white-space: pre-line; }
</style>
