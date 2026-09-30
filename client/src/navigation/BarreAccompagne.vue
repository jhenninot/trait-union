<script setup>
// Barre de la personne accompagnée : quelques gros boutons, toujours au même endroit.
// Ajouter ici les prochaines rubriques (messages...) quand elles existeront.
const boutons = [
  { chemin: '/', emoji: '🏠', libelle: 'Accueil' },
  { chemin: '/agenda', emoji: '📅', libelle: 'Mon agenda' },
  { chemin: '/photos', emoji: '🖼️', libelle: 'Mes photos' },
  { chemin: '/famille', emoji: '👨‍👩‍👧', libelle: 'Ma famille' }
]
</script>

<template>
  <nav class="barre" aria-label="Menu">
    <RouterLink v-for="b in boutons" :key="b.chemin" :to="b.chemin" class="bouton" exact-active-class="actif">
      <span class="emoji" aria-hidden="true">{{ b.emoji }}</span>
      {{ b.libelle }}
    </RouterLink>
  </nav>
</template>

<style scoped>
.barre {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
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
.emoji { font-size: 3.4rem; line-height: 1; }
@media (max-width: 600px) {
  .barre { padding: 8px 8px calc(8px + env(safe-area-inset-bottom)); gap: 8px; }
  .bouton { min-height: 80px; font-size: 1.05rem; line-height: 1.15; text-align: center; padding: 6px 4px; border-radius: 16px; gap: 4px; }
  .emoji { font-size: 2.1rem; }
}
</style>
