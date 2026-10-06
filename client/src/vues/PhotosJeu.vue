<script setup>
import { ref } from 'vue'
import { ajouterPhotoJeu, retirerPhotoJeu } from '../avatars.js'
import RecadrageAvatar from './RecadrageAvatar.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'

// Photos supplémentaires d'une personne de l'arbre, pour varier « Qui est-ce ? » et « Quel âge ? » :
// la photo de contact reste son avatar, et chaque jeu en tire une au hasard parmi toutes.
// `base` : '/cercles/<id>/arbre/personnes/<id>' ; `photos` : [{ id, url }]
const props = defineProps({
  base: { type: String, required: true },
  photos: { type: Array, default: () => [] }
})
const emit = defineEmits(['change'])

const fichier = ref(null)
const aRecadrer = ref(null)
const enCours = ref(false)
const erreur = ref('')

async function executer(fn) {
  enCours.value = true
  erreur.value = ''
  try { emit('change', await fn()) } catch (e) { erreur.value = e.message } finally { enCours.value = false }
}
function choisie(event) {
  const f = event.target.files?.[0]
  event.target.value = ''
  if (f) aRecadrer.value = f
}
function recadree(blob) {
  aRecadrer.value = null
  executer(() => ajouterPhotoJeu(props.base, blob))
}
</script>

<template>
  <div class="photos-jeu">
    <p class="aide">Photos supplémentaires (à d'autres âges, de face, de profil…) : les jeux en choisissent une au hasard, en plus de la photo de contact.</p>
    <div class="grille">
      <div v-for="x in photos" :key="x.id" class="vignette">
        <img :src="x.url" alt="" loading="lazy" />
        <BoutonIcone icone="effacer" libelle="Retirer cette photo" danger :disabled="enCours" @click="executer(() => retirerPhotoJeu(base, x.id))" />
      </div>
    </div>
    <input ref="fichier" type="file" accept="image/*" hidden @change="choisie" />
    <button type="button" class="secondaire petit" :disabled="enCours || photos.length >= 10" @click="fichier.click()">
      {{ enCours ? 'Enregistrement…' : 'Ajouter une photo' }}
    </button>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <RecadrageAvatar v-if="aRecadrer" :fichier="aRecadrer" @valider="recadree" @annuler="aRecadrer = null" />
  </div>
</template>

<style scoped>
.photos-jeu { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.photos-jeu .aide { margin: 0; }
.grille { display: flex; flex-wrap: wrap; gap: 10px; }
.vignette { position: relative; width: 84px; height: 84px; }
.vignette img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; display: block; }
.vignette :deep(button) { position: absolute; right: 2px; bottom: 2px; width: 30px; height: 30px; padding: 0; }
.petit { padding: 6px 12px; font-size: 0.9rem; }
</style>
