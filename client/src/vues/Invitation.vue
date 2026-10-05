<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api } from '../api.js'
import { motDePasseValide } from '../motDePasse.js'
import ChampMotDePasse from './ChampMotDePasse.vue'
import BoutonGoogle from './BoutonGoogle.vue'
import Separateur from './Separateur.vue'
import Icone from '../navigation/Icone.vue'
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
    // Adresse à laquelle l'invitation a été envoyée, modifiable
    if (invitation.value.email && !f.value.email) f.value.email = invitation.value.email
    // Invitation envoyée depuis une fiche de l'arbre : prénom et nom déjà connus
    if (invitation.value.prenom && !f.value.prenom) f.value.prenom = invitation.value.prenom
    if (invitation.value.nom && !f.value.nom) f.value.nom = invitation.value.nom
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
    // Dernière étape : compléter son profil (photo, coordonnées)
    router.push({ path: '/profil', query: { bienvenue: cercleId } })
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
      <div class="carte importance">
        <p><strong>Deux étapes :</strong> créer votre compte, puis compléter votre profil.</p>
        <p>Votre profil est ce que voit la personne accompagnée sur sa tablette. Chaque information compte :</p>
        <ul>
          <li><Icone nom="compte" class="en-ligne" /> une <strong>vraie photo de vous</strong>, de face, pour qu'elle vous reconnaisse ;</li>
          <li><Icone nom="gateau" class="en-ligne" /> votre <strong>date de naissance</strong>, pour qu'elle pense à vous souhaiter votre anniversaire ;</li>
          <li><Icone nom="telephone" class="en-ligne" /> votre <strong>téléphone</strong> et votre <strong>adresse</strong>, pour qu'elle puisse vous joindre.</li>
        </ul>
      </div>
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
        <p><strong>Étape 1 sur 2 : votre compte</strong></p>
        <label>Prénom <input v-model="f.prenom" required /></label>
        <label>Nom <input v-model="f.nom" /></label>
        <label>Email <input v-model="f.email" type="email" autocomplete="username" required /></label>
        <p v-if="invitation.email" class="aide note-email">C'est l'adresse qui a reçu l'invitation. Vous pouvez en mettre une autre.</p>
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

<style scoped>
.importance { background: var(--vert-clair); }
.importance p { margin: 0 0 8px; }
.importance ul { margin: 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.note-email { margin: -6px 0 0; }
</style>
