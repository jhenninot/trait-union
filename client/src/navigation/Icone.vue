<script setup>
// Pictogrammes au trait (style Lucide), dessinés en ligne pour éviter une dépendance
defineProps({ nom: { type: String, required: true } })
const traces = {
  accueil: '<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  famille: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  tablette: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 18h.01"/>',
  cercle: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  email: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
  compte: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  deconnexion: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  fermer: '<path d="M18 6 6 18M6 6l12 12"/>',
  mobile: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M12 18h.01"/>'
}
</script>

<template>
  <svg class="icone" viewBox="0 0 24 24" aria-hidden="true" v-html="traces[nom]" />
</template>

<style>
.icone {
  width: 20px;
  height: 20px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
