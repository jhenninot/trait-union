<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { rafraichirSession } from '../session.js'
import { libellesRoles } from '../roles.js'

// Administration : création d'un cercle et liste de tous les cercles
const router = useRouter()
const tousLesCercles = ref([])
const nomCercle = ref('')
const rejoindre = ref(true)
const erreur = ref('')

async function chargerCercles() {
  tousLesCercles.value = await api('GET', '/cercles')
}
chargerCercles()

async function creerCercle() {
  erreur.value = ''
  try {
    const cercle = await api('POST', '/cercles', { nom: nomCercle.value, rejoindre: rejoindre.value })
    await rafraichirSession()
    router.push(`/cercles/${cercle.id}`)
  } catch (e) {
    erreur.value = e.message
  }
}
</script>

<template>
  <main>
    <h1>Tous les cercles</h1>
    <RouterLink v-for="c in tousLesCercles" :key="c.id" :to="`/cercles/${c.id}`" class="carte cercle">
      <strong>{{ c.nom }}</strong>
      <span class="aide">{{ c.role ? libellesRoles[c.role] : 'Vous n\'êtes pas membre' }}</span>
    </RouterLink>
    <p v-if="!tousLesCercles.length" class="aide">Aucun cercle pour l'instant.</p>

    <form class="carte" @submit.prevent="creerCercle">
      <label>Nouveau cercle <input v-model="nomCercle" placeholder="Le cercle de Mamie" required /></label>
      <label class="case"><input v-model="rejoindre" type="checkbox" /> J'en fais partie comme aidant</label>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <button>Créer le cercle</button>
    </form>
  </main>
</template>

<style scoped>
.case { flex-direction: row; align-items: center; gap: 8px; font-weight: normal; }
.cercle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  text-decoration: none;
  color: inherit;
}
</style>
