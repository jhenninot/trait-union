<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { rafraichirSession } from '../session.js'

const router = useRouter()
const f = ref({ prenom: '', nom: '', email: '', motDePasse: '' })
const erreur = ref('')

async function creer() {
  erreur.value = ''
  try {
    await api('POST', '/auth/initialiser', f.value)
    await rafraichirSession()
    router.push('/')
  } catch (e) {
    erreur.value = e.message
  }
}
</script>

<template>
  <main>
    <h1>Bienvenue dans Trait d'union</h1>
    <p>Premier lancement : créez le compte administrateur de l'application.</p>
    <form class="carte" @submit.prevent="creer">
      <label>Prénom <input v-model="f.prenom" required /></label>
      <label>Nom <input v-model="f.nom" /></label>
      <label>Email <input v-model="f.email" type="email" autocomplete="username" required /></label>
      <label>Mot de passe (8 caractères minimum)
        <input v-model="f.motDePasse" type="password" autocomplete="new-password" minlength="8" required />
      </label>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <button>Créer le compte administrateur</button>
    </form>
  </main>
</template>
