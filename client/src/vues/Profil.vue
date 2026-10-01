<script setup>
import { ref } from 'vue'
import { api } from '../api.js'
import { session } from '../session.js'
import ChoixAvatar from './ChoixAvatar.vue'
import FormulaireCoordonnees from './FormulaireCoordonnees.vue'

// « Mon profil » : prénom, nom, coordonnées et avatar de la personne connectée
const prenom = ref(session.utilisateur.prenom)
const nom = ref(session.utilisateur.nom ?? '')
const message = ref('')
const erreur = ref('')

async function enregistrer() {
  message.value = erreur.value = ''
  try {
    const u = await api('PATCH', '/profil', { prenom: prenom.value, nom: nom.value })
    Object.assign(session.utilisateur, { prenom: u.prenom, nom: u.nom })
    message.value = 'Enregistré'
  } catch (e) {
    erreur.value = e.message
  }
}

const messageCoordonnees = ref('')
const erreurCoordonnees = ref('')

async function enregistrerCoordonnees(c) {
  messageCoordonnees.value = erreurCoordonnees.value = ''
  try {
    const { prenom, nom } = session.utilisateur
    const u = await api('PATCH', '/profil', { prenom, nom, ...c })
    Object.assign(session.utilisateur, { telephone: u.telephone, dateNaissance: u.dateNaissance, adresse: u.adresse })
    messageCoordonnees.value = 'Enregistré'
  } catch (e) {
    erreurCoordonnees.value = e.message
  }
}

const avatarChange = (a) => Object.assign(session.utilisateur, a)
</script>

<template>
  <main>
    <h1>Mon profil</h1>
    <div class="carte">
      <strong>Mon avatar</strong>
      <p class="aide">Il apparaît à côté de votre prénom, notamment sur la tablette de la personne accompagnée.</p>
      <ChoixAvatar
        base="/profil"
        :avatar="session.utilisateur.avatar"
        :choix="session.utilisateur.avatarChoix"
        :prenom="session.utilisateur.prenom"
        @change="avatarChange"
      />
    </div>
    <form class="carte" @submit.prevent="enregistrer">
      <strong>Mon nom</strong>
      <label>Prénom <input v-model="prenom" required maxlength="200" /></label>
      <label>Nom <input v-model="nom" maxlength="200" /></label>
      <p v-if="session.utilisateur.email" class="aide">Adresse email : {{ session.utilisateur.email }}</p>
      <div class="actions">
        <button type="submit">Enregistrer</button>
        <span v-if="message" class="aide">{{ message }}</span>
        <span v-if="erreur" class="erreur">{{ erreur }}</span>
      </div>
    </form>
    <div class="carte">
      <strong>Mes coordonnées</strong>
      <p class="aide">Facultatives. Elles s'affichent pour les membres de vos cercles dans « Famille et aidants » et sur la tablette.
        Les auxiliaires de vie ne voient que le téléphone.</p>
      <FormulaireCoordonnees :personne="session.utilisateur" @enregistrer="enregistrerCoordonnees">
        <span v-if="messageCoordonnees" class="aide">{{ messageCoordonnees }}</span>
        <span v-if="erreurCoordonnees" class="erreur">{{ erreurCoordonnees }}</span>
      </FormulaireCoordonnees>
    </div>
  </main>
</template>

<style scoped>
form { display: flex; flex-direction: column; gap: 12px; }
.actions { display: flex; align-items: center; gap: 12px; }
</style>
