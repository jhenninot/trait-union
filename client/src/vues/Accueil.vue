<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { session, rafraichirSession } from '../session.js'
import EcranAccompagne from './EcranAccompagne.vue'

const router = useRouter()
const tousLesCercles = ref([])
const nomCercle = ref('')
const erreur = ref('')
const libellesRoles = { accompagne: 'Personne accompagnée', aidant: 'Aidant', proche: 'Proche' }

async function chargerCercles() {
  if (session.utilisateur?.estAdmin) tousLesCercles.value = await api('GET', '/cercles')
}
chargerCercles()

async function creerCercle() {
  erreur.value = ''
  try {
    const cercle = await api('POST', '/cercles', { nom: nomCercle.value })
    await rafraichirSession()
    router.push(`/cercles/${cercle.id}`)
  } catch (e) {
    erreur.value = e.message
  }
}
</script>

<template>
  <EcranAccompagne v-if="session.typeSession === 'appareil'" />
  <main v-else>
    <h1>Bonjour {{ session.utilisateur.prenom }}</h1>

    <h2>Mes cercles</h2>
    <p v-if="!session.cercles.length" class="aide">Vous ne faites encore partie d'aucun cercle.</p>
    <RouterLink v-for="c in session.cercles" :key="c.id" :to="`/cercles/${c.id}`" class="carte cercle">
      <strong>{{ c.nom }}</strong>
      <span class="aide">{{ libellesRoles[c.role] }}</span>
    </RouterLink>

    <template v-if="session.utilisateur.estAdmin">
      <h2>Administration</h2>
      <form class="carte" @submit.prevent="creerCercle">
        <label>Nouveau cercle <input v-model="nomCercle" placeholder="Le cercle de Mamie" required /></label>
        <p v-if="erreur" class="erreur">{{ erreur }}</p>
        <button>Créer le cercle</button>
      </form>
      <h3>Tous les cercles</h3>
      <RouterLink v-for="c in tousLesCercles" :key="c.id" :to="`/cercles/${c.id}`" class="carte cercle">
        <strong>{{ c.nom }}</strong>
        <span class="aide">{{ c.role ? libellesRoles[c.role] : 'Vous n\'êtes pas membre' }}</span>
      </RouterLink>
    </template>
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
