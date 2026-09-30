<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api } from '../api.js'
import { motDePasseValide } from '../motDePasse.js'
import ChampMotDePasse from './ChampMotDePasse.vue'
import { session, rafraichirSession } from '../session.js'
import BoutonGoogle from './BoutonGoogle.vue'
import Separateur from './Separateur.vue'

const router = useRouter()
const f = ref({ prenom: '', nom: '', email: '', motDePasse: '' })
const erreur = ref(useRoute().query.erreur || '')

async function creer() {
  erreur.value = ''
  if (!motDePasseValide(f.value.motDePasse)) return (erreur.value = 'Le mot de passe ne respecte pas toutes les règles')
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
      <ChampMotDePasse v-model="f.motDePasse" />
      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <button>Créer le compte administrateur</button>
      <template v-if="session.google">
        <Separateur />
        <BoutonGoogle mode="initialiser" texte="Créer le compte avec Google" />
      </template>
    </form>
  </main>
</template>
