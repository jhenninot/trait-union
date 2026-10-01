<script setup>
import { computed } from 'vue'
import { morceaux } from '../messagerie.js'

// Texte d'un message, avec ses liens cliquables (ouverts dans un nouvel onglet)
const props = defineProps({ texte: { type: String, default: '' } })
const parties = computed(() => morceaux(props.texte))
</script>

<template>
  <template v-for="(p, i) in parties" :key="i"><a v-if="p.lien" :href="p.lien" target="_blank" rel="noopener noreferrer" class="lien-message" @click.stop>{{ p.lien }}</a><template v-else>{{ p.texte }}</template></template>
</template>

<style scoped>
.lien-message { color: inherit; text-decoration: underline; overflow-wrap: anywhere; }
</style>
