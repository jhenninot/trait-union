<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api } from '../api.js'
import { rafraichirSession } from '../session.js'

// Configuration de l'appareil d'une personne accompagnée : un aidant saisit
// (ou ouvre le lien contenant) le code à 6 chiffres. L'appareil reste ensuite connecté.
const router = useRouter()
const route = useRoute()
const code = ref(String(route.query.code || ''))
const libelle = ref('')
const erreur = ref('')

async function valider() {
  erreur.value = ''
  try {
    await api('POST', '/auth/appareil', { code: code.value, libelle: libelle.value })
    await rafraichirSession()
    router.replace('/')
  } catch (e) {
    erreur.value = e.message
  }
}
</script>

<template>
  <main>
    <h1>Configurer cet appareil</h1>
    <p>Saisissez le code à 6 chiffres donné par l'aidant. Cet appareil restera ensuite connecté, sans mot de passe.</p>
    <form class="carte" @submit.prevent="valider">
      <label>Code
        <input v-model="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456" required />
      </label>
      <label>Nom de l'appareil (facultatif)
        <input v-model="libelle" placeholder="Tablette de la chambre" maxlength="80" />
      </label>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <button>Valider</button>
    </form>
    <p class="aide"><RouterLink to="/connexion">Retour à la connexion</RouterLink></p>
  </main>
</template>

<style scoped>
.code { font-size: 2rem; letter-spacing: 0.3em; text-align: center; }
</style>
