<script setup>
import { assistant, ecouteDisponible } from '../voix.js'
import Icone from './Icone.vue'

// Barre de la personne accompagnée : quelques gros boutons, toujours au même endroit,
// avec les mêmes pictogrammes que le menu des aidants.
// Ajouter ici les prochaines rubriques (messages...) quand elles existeront.
const boutons = [
  { chemin: '/', icone: 'accueil', libelle: 'Accueil' },
  { chemin: '/agenda', icone: 'agenda', libelle: 'Mon agenda' },
  { chemin: '/photos', icone: 'photo', libelle: 'Mes photos' },
  { chemin: '/famille', icone: 'famille', libelle: 'Ma famille' }
]
// « Parler » ouvre l'assistant vocal, si l'appareil sait reconnaître la voix
const voix = ecouteDisponible()
</script>

<template>
  <nav class="barre" aria-label="Menu">
    <RouterLink v-for="b in boutons" :key="b.chemin" :to="b.chemin" class="bouton" exact-active-class="actif">
      <Icone :nom="b.icone" />
      {{ b.libelle }}
    </RouterLink>
    <button v-if="voix" type="button" class="bouton parler" @click="assistant.ouvert = true">
      <Icone nom="micro" />
      Parler
    </button>
  </nav>
</template>

<style scoped>
.barre {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 16px;
  padding: 16px 24px calc(20px + env(safe-area-inset-bottom));
  background: white;
  border-top: 2px solid #ebe8e3;
}
.bouton {
  min-height: 130px;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 1.9rem;
  font-weight: 700;
  color: var(--bleu-nuit);
  background: #f3f0ea;
  text-decoration: none;
}
.bouton.actif { background: var(--vert); color: white; }
button.bouton { font: inherit; font-size: 1.9rem; font-weight: 700; padding: 0; cursor: pointer; }
.bouton.parler { background: var(--vert-clair); color: var(--vert); }
.bouton :deep(.icone) { width: 52px; height: 52px; stroke-width: 2.2; }
@media (max-width: 600px) {
  .barre { padding: 8px 6px calc(8px + env(safe-area-inset-bottom)); gap: 6px; }
  .bouton, button.bouton { min-height: 80px; font-size: 0.95rem; line-height: 1.15; text-align: center; padding: 6px 4px; border-radius: 16px; gap: 4px; }
  .bouton :deep(.icone) { width: 32px; height: 32px; }
}
</style>
