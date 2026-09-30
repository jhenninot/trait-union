<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api } from '../api.js'
import { session, rafraichirSession } from '../session.js'
import BoutonGoogle from './BoutonGoogle.vue'
import Separateur from './Separateur.vue'
import logo from '../logo.svg'

const router = useRouter()
const route = useRoute()
const email = ref('')
const motDePasse = ref('')
const erreur = ref(route.query.erreur || '')
const envoi = ref(false)

async function seConnecter() {
  erreur.value = ''
  envoi.value = true
  try {
    await api('POST', '/auth/connexion', { email: email.value, motDePasse: motDePasse.value })
    await rafraichirSession()
    router.push(route.query.suite || '/')
  } catch (e) {
    erreur.value = e.message
  } finally {
    envoi.value = false
  }
}
</script>

<template>
  <main>
    <img :src="logo" alt="Trait d'union" class="logo" />
    <div class="carte">
      <h1>Connexion</h1>
      <form @submit.prevent="seConnecter">
        <label>Email <input v-model="email" type="email" autocomplete="username" required /></label>
        <label>Mot de passe <input v-model="motDePasse" type="password" autocomplete="current-password" required /></label>
        <p v-if="erreur" class="erreur">{{ erreur }}</p>
        <button :disabled="envoi">Se connecter</button>
      </form>
      <template v-if="session.google">
        <Separateur />
        <BoutonGoogle :suite="route.query.suite" />
      </template>
    </div>
    <p class="aide">
      Cet appareil est destiné à une personne accompagnée ?
      <RouterLink to="/appareil">Le configurer avec un code</RouterLink>
    </p>
  </main>
</template>

<style scoped>
.logo { display: block; max-width: 280px; margin: 16px auto; }
</style>
