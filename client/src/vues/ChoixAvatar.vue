<script setup>
import { ref } from 'vue'
import { choisirAvatar, envoyerPhotoAvatar } from '../avatars.js'
import Avatar from './Avatar.vue'
import RecadrageAvatar from './RecadrageAvatar.vue'

// Choix d'un avatar : importer une photo, prendre un modèle 3D ou revenir à l'initiale.
// `base` : '/profil' ou '/cercles/<id>/membres/<id>' (voir avatars.js).
const props = defineProps({
  base: { type: String, required: true },
  avatar: { type: String, default: null }, // adresse de l'image actuelle
  choix: { type: String, default: null }, // valeur enregistrée (modele:… ou photo:…)
  prenom: { type: String, default: '' }
})
const emit = defineEmits(['change'])

const fichier = ref(null)
const aRecadrer = ref(null) // photo choisie, en attente de recadrage
const enCours = ref(false)
const erreur = ref('')

async function executer(fn) {
  enCours.value = true
  erreur.value = ''
  try {
    emit('change', await fn())
  } catch (e) {
    erreur.value = e.message
  } finally {
    enCours.value = false
  }
}

function importer(event) {
  const f = event.target.files?.[0]
  event.target.value = ''
  if (f) aRecadrer.value = f
}

function recadree(blob) {
  aRecadrer.value = null
  executer(() => envoyerPhotoAvatar(props.base, blob))
}

const choisir = (valeur) => executer(() => choisirAvatar(props.base, valeur))
</script>

<template>
  <div class="choix-avatar">
    <div class="actuel">
      <Avatar :src="avatar" :prenom="prenom" :taille="88" />
      <div class="boutons">
        <input ref="fichier" type="file" accept="image/*" hidden @change="importer" />
        <button type="button" :disabled="enCours" @click="fichier.click()">
          {{ choix?.startsWith('photo:') ? 'Changer la photo' : 'Importer une photo' }}
        </button>
        <button v-if="choix" type="button" class="lien" :disabled="enCours" @click="choisir(null)">Retirer la photo</button>
        <p v-if="enCours" class="aide">Enregistrement…</p>
        <p v-else-if="erreur" class="erreur">{{ erreur }}</p>
        <p v-else class="aide">Vous pourrez recadrer la photo avant de l'enregistrer.</p>
      </div>
    </div>

    <RecadrageAvatar v-if="aRecadrer" :fichier="aRecadrer" @valider="recadree" @annuler="aRecadrer = null" />

  </div>
</template>

<style scoped>
.actuel { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
.boutons { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.boutons p { margin: 0; }
</style>
