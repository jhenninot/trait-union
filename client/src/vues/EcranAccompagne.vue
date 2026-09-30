<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { session } from '../session.js'

// Écran de la personne accompagnée : très lisible, sans menu ni bouton de déconnexion.
const maintenant = ref(new Date())
let minuterie
onMounted(() => { minuterie = setInterval(() => (maintenant.value = new Date()), 30_000) })
onUnmounted(() => clearInterval(minuterie))

const jour = () => maintenant.value.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const heure = () => maintenant.value.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const moment = () => {
  const h = maintenant.value.getHours()
  return h < 12 ? 'C\'est le matin.' : h < 18 ? 'C\'est l\'après-midi.' : 'C\'est le soir.'
}
</script>

<template>
  <main class="accompagne">
    <p class="bonjour">Bonjour {{ session.utilisateur.prenom }}</p>
    <p class="jour">Nous sommes {{ jour() }}</p>
    <p class="heure">{{ heure() }}</p>
    <p class="moment">{{ moment() }}</p>
  </main>
</template>

<style scoped>
.accompagne {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}
.bonjour { font-size: 3rem; font-weight: 700; color: var(--bleu-nuit); margin: 0; }
.jour { font-size: 2rem; margin: 16px 0 0; text-transform: none; }
.heure { font-size: 4rem; font-weight: 700; color: var(--vert); margin: 8px 0; }
.moment { font-size: 1.6rem; color: var(--gris); }
</style>
