<script setup>
import Icone from './Icone.vue'

// Bouton d'action réduit à son icône (modifier, effacer, partager...). Le libellé reste lu
// par les lecteurs d'écran et s'affiche au survol.
defineProps({
  icone: { type: String, required: true },
  libelle: { type: String, required: true },
  danger: Boolean, // action destructrice : en rouge
  gros: Boolean // écrans de la personne accompagnée
})
</script>

<template>
  <button type="button" class="bouton-icone" :class="{ danger, gros }" :aria-label="libelle" :title="libelle">
    <Icone :nom="icone" />
  </button>
</template>

<style>
.bouton-icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 12px;
  background: var(--vert-clair);
  color: var(--vert);
}
.bouton-icone.danger { background: #fbeceb; color: var(--rouge); }
.bouton-icone .icone { width: 22px; height: 22px; }
.bouton-icone.gros { width: 64px; height: 64px; border-radius: 18px; }
.bouton-icone.gros .icone { width: 32px; height: 32px; }
</style>
