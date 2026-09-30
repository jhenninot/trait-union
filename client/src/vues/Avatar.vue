<script setup>
import { ref, watch } from 'vue'

// Avatar rond d'une personne : son image, ou l'initiale de son prénom
const props = defineProps({
  src: { type: String, default: null },
  prenom: { type: String, default: '' },
  taille: { type: Number, default: 36 } // px
})
const erreur = ref(false)
watch(() => props.src, () => (erreur.value = false))
</script>

<template>
  <span class="avatar" :style="{ width: `${taille}px`, height: `${taille}px`, fontSize: `${taille * 0.45}px` }" aria-hidden="true">
    <img v-if="src && !erreur" :src="src" alt="" loading="lazy" @error="erreur = true" />
    <template v-else>{{ prenom.charAt(0).toUpperCase() }}</template>
  </span>
</template>

<style scoped>
.avatar {
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  display: inline-grid;
  place-items: center;
  background: var(--vert-clair);
  color: var(--vert);
  font-weight: 700;
  line-height: 1;
}
img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
