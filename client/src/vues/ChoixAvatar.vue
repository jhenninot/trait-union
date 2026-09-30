<script setup>
import { ref } from 'vue'
import { MODELES, choisirAvatar, envoyerPhotoAvatar } from '../avatars.js'
import Avatar from './Avatar.vue'

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
  if (f) executer(() => envoyerPhotoAvatar(props.base, f))
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
        <button v-if="choix" type="button" class="lien" :disabled="enCours" @click="choisir(null)">Revenir à l'initiale</button>
        <p v-if="enCours" class="aide">Enregistrement…</p>
        <p v-else-if="erreur" class="erreur">{{ erreur }}</p>
        <p v-else class="aide">La photo est recadrée en carré, au centre.</p>
      </div>
    </div>

    <p class="aide">Ou choisissez un modèle :</p>
    <template v-for="g in MODELES" :key="g.groupe">
      <p class="groupe">{{ g.groupe }}</p>
      <div class="grille">
        <button
          v-for="m in g.modeles"
          :key="m.id"
          type="button"
          class="modele"
          :class="{ choisi: choix === m.choix }"
          :title="m.nom"
          :aria-label="m.nom"
          :aria-pressed="choix === m.choix"
          :disabled="enCours"
          @click="choisir(m.choix)"
        >
          <img :src="m.image" alt="" loading="lazy" />
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.actuel { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
.boutons { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.boutons p { margin: 0; }
.groupe { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--gris); margin: 12px 0 6px; }
.grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 8px; }
.modele {
  padding: 0;
  aspect-ratio: 1;
  border-radius: 50%;
  overflow: hidden;
  background: #f5f3ef;
  border: 3px solid transparent;
}
.modele:hover { border-color: var(--vert-clair); }
.modele.choisi { border-color: var(--vert); }
.modele img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
