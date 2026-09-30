<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api } from '../api.js'
import { motDePasseValide } from '../motDePasse.js'
import ChampMotDePasse from './ChampMotDePasse.vue'
import BoutonGoogle from './BoutonGoogle.vue'
import Separateur from './Separateur.vue'
import { session, rafraichirSession } from '../session.js'

const router = useRouter()
const route = useRoute()
const jeton = route.params.jeton
const invitation = ref(null)
const erreur = ref(route.query.erreur || '')
const f = ref({ prenom: '', nom: '', email: '', motDePasse: '' })
const libellesRoles = { aidant: 'aidant', proche: 'proche', auxiliaire: 'auxiliaire de vie' }

onMounted(async () => {
  try {
    invitation.value = await api('GET', `/invitations/${jeton}`)
  } catch (e) {
    erreur.value = e.message
  }
})

async function accepter() {
  erreur.value = ''
  if (!session.utilisateur && !motDePasseValide(f.value.motDePasse)) {
    return (erreur.value = 'Le mot de passe ne respecte pas toutes les règles')
  }
  try {
    const { cercleId } = await api('POST', `/invitations/${jeton}/accepter`, session.utilisateur ? {} : f.value)
    await rafraichirSession()
    router.push(`/cercles/${cercleId}`)
  } catch (e) {
    erreur.value = e.message
  }
}
</script>

<template>
  <main>
    <h1>Invitation</h1>
    <p v-if="!invitation && erreur" class="erreur">{{ erreur }}</p>
    <template v-if="invitation">
      <p>Vous êtes invité(e) à rejoindre <strong>{{ invitation.cercle }}</strong> en tant que {{ libellesRoles[invitation.role] }}.</p>
      <div v-if="session.utilisateur" class="carte">
        <p>Vous êtes connecté(e) en tant que {{ session.utilisateur.prenom }}.</p>
        <p v-if="erreur" class="erreur">{{ erreur }}</p>
        <button @click="accepter">Rejoindre le cercle</button>
      </div>
      <form v-else class="carte" @submit.prevent="accepter">
        <template v-if="session.google">
          <BoutonGoogle mode="invitation" :jeton="jeton" texte="Rejoindre avec Google" />
          <Separateur />
        </template>
        <p>Créez votre compte :</p>
        <label>Prénom <input v-model="f.prenom" required /></label>
        <label>Nom <input v-model="f.nom" /></label>
        <label>Email <input v-model="f.email" type="email" autocomplete="username" required /></label>
        <ChampMotDePasse v-model="f.motDePasse" />
        <p v-if="erreur" class="erreur">{{ erreur }}</p>
        <button>Créer mon compte et rejoindre</button>
        <p class="aide">
          Déjà un compte ?
          <RouterLink :to="{ path: '/connexion', query: { suite: route.fullPath } }">Connectez-vous</RouterLink>
          puis rouvrez ce lien.
        </p>
        <p class="aide"><RouterLink to="/confidentialite">Politique de confidentialité</RouterLink></p>
      </form>
    </template>
  </main>
</template>
