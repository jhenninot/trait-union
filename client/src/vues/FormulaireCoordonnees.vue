<script setup>
import { reactive } from 'vue'

// Champs facultatifs : téléphone, date de naissance et adresse. Émet « enregistrer »
// avec les valeurs saisies ; le parent fait l'appel à l'API.
const props = defineProps({
  personne: { type: Object, required: true },
  libelleBouton: { type: String, default: 'Enregistrer' }
})
const emit = defineEmits(['enregistrer'])
const f = reactive({
  telephone: props.personne.telephone ?? '',
  dateNaissance: props.personne.dateNaissance ?? '',
  adresse: props.personne.adresse ?? ''
})
const aujourdhui = new Date().toISOString().slice(0, 10)
</script>

<template>
  <form class="coordonnees" @submit.prevent="emit('enregistrer', { ...f })">
    <label>Téléphone <input v-model="f.telephone" type="tel" autocomplete="tel" maxlength="30" placeholder="06 12 34 56 78" /></label>
    <label>Date de naissance <input v-model="f.dateNaissance" type="date" min="1900-01-01" :max="aujourdhui" /></label>
    <label>Adresse <textarea v-model="f.adresse" rows="3" maxlength="300" autocomplete="street-address" placeholder="12 rue des Lilas&#10;75011 Paris" /></label>
    <div class="actions">
      <button type="submit">{{ libelleBouton }}</button>
      <slot />
    </div>
  </form>
</template>

<style scoped>
textarea { font: inherit; padding: 10px 12px; border: 1px solid #ccc; border-radius: 8px; resize: vertical; }
.actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
</style>
