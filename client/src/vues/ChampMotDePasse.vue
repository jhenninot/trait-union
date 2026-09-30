<script setup>
import { reglesMotDePasse } from '../motDePasse.js'
import Icone from '../navigation/Icone.vue'

// Champ de nouveau mot de passe avec la liste des règles cochées au fil de la saisie
const valeur = defineModel({ type: String, default: '' })
</script>

<template>
  <label>Mot de passe
    <input v-model="valeur" type="password" autocomplete="new-password" minlength="10" required />
  </label>
  <ul class="regles">
    <li v-for="r in reglesMotDePasse" :key="r.texte" :class="{ ok: r.ok(valeur) }">
      <Icone :nom="r.ok(valeur) ? 'coche' : 'rond'" class="en-ligne" /> {{ r.texte }}
    </li>
  </ul>
</template>

<style scoped>
.regles { list-style: none; margin: -4px 0 0; padding: 0; font-size: 0.9rem; color: var(--gris); }
.regles .ok { color: var(--vert); }
</style>
