<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api.js'

// Messagerie : durée de conservation des messages. Les messages parlent souvent de santé : ils ne
// sont gardés que le temps utile, puis effacés avec leurs photos et messages vocaux.
const config = ref(null) // { mois, moisLiaison, durees }
const message = ref('')
const erreur = ref('')
const occupe = ref(false)

onMounted(async () => {
  try {
    config.value = await api('GET', '/admin/messagerie')
  } catch (e) {
    erreur.value = e.message
  }
})

const libelle = (n) => (n === 1 ? '1 mois' : n % 12 === 0 ? `${n / 12} an${n > 12 ? 's' : ''}` : `${n} mois`)

async function enregistrer() {
  erreur.value = message.value = ''
  occupe.value = true
  try {
    config.value = await api('PUT', '/admin/messagerie', { mois: config.value.mois, moisLiaison: config.value.moisLiaison })
    message.value = 'Durées enregistrées. Les messages plus anciens seront effacés dans l\'heure.'
  } catch (e) {
    erreur.value = e.message
  } finally {
    occupe.value = false
  }
}
</script>

<template>
  <main>
    <h1>Messagerie</h1>
    <section class="carte">
      <p>Chaque cercle a d'office trois conversations : « Toute la famille » (personnes accompagnées comprises),
        « Les aidants » et le « Cahier de liaison » des aidants et auxiliaires de vie, plus des conversations privées à deux.</p>
      <p class="aide">Les photos et messages vocaux sont rangés chez l'hébergeur configuré dans « Stockage des photos ».
        Un administrateur qui n'est pas membre d'un cercle ne voit pas ses messages.</p>
    </section>
    <form v-if="config" class="carte" @submit.prevent="enregistrer">
      <h2>Durée de conservation</h2>
      <p class="aide">Les messages parlent souvent de santé : au-delà de cette durée, ils sont effacés automatiquement,
        avec leurs photos et messages vocaux. Les photos ajoutées aussi aux albums du cercle y restent.</p>
      <label>Conversations de la famille et conversations privées
        <select v-model.number="config.mois">
          <option v-for="n in config.durees" :key="n" :value="n">{{ libelle(n) }}</option>
        </select>
      </label>
      <label>Cahier de liaison
        <select v-model.number="config.moisLiaison">
          <option v-for="n in config.durees" :key="n" :value="n">{{ libelle(n) }}</option>
        </select>
      </label>
      <button :disabled="occupe">Enregistrer</button>
      <p v-if="message" class="succes">{{ message }}</p>
    </form>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
  </main>
</template>

<style scoped>
h2 { font-size: 1.15rem; color: var(--bleu-nuit); margin: 0; }
.succes { color: var(--vert); margin: 0; }
</style>
