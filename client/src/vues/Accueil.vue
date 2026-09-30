<script setup>
import { session } from '../session.js'
import { libellesRoles } from '../roles.js'
import EcranAccompagne from './EcranAccompagne.vue'
</script>

<template>
  <EcranAccompagne v-if="session.typeSession === 'appareil'" />
  <main v-else>
    <h1>Bonjour {{ session.utilisateur.prenom }}</h1>

    <h2>Mes cercles</h2>
    <p v-if="!session.cercles.length" class="aide">
      Vous ne faites encore partie d'aucun cercle.
      <RouterLink v-if="session.utilisateur.estAdmin" to="/admin/cercles">Créer un cercle</RouterLink>
    </p>
    <RouterLink v-for="c in session.cercles" :key="c.id" :to="`/cercles/${c.id}`" class="carte cercle">
      <strong>{{ c.nom }}</strong>
      <span class="aide">{{ libellesRoles[c.role] }}</span>
    </RouterLink>
  </main>
</template>

<style scoped>
.cercle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  text-decoration: none;
  color: inherit;
}
</style>
