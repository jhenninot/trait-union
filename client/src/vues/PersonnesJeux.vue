<script setup>
import { ref, watch } from 'vue'
import { api } from '../api.js'
import { ageTexte } from '../coordonnees.js'
import { confirmer } from '../fenetre.js'
import Avatar from './Avatar.vue'
import ChoixAvatar from './ChoixAvatar.vue'
import PhotosJeu from './PhotosJeu.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import Icone from '../navigation/Icone.vue'
import Modale from '../navigation/Modale.vue'

// Personnes extérieures à la famille (voisins, amis, personnalités...) pour « Qui est-ce ? » et
// « Quel âge ? » : une fiche avec photo, prénom et date de naissance, sans place dans l'arbre.
// Partagées par toutes les personnes accompagnées du cercle.
const props = defineProps({ cercleId: { type: String, required: true } })
const base = () => `/cercles/${props.cercleId}/arbre`

const liste = ref([])
const erreur = ref('')
const fiche = ref(null) // { id?, prenom, nom, genre, dateNaissance, avatar, avatarChoix }
const enCours = ref(false)
const aujourdhui = new Date().toISOString().slice(0, 10)

async function charger() {
  try { liste.value = await api('GET', `${base()}/exterieurs`) } catch (e) { erreur.value = e.message }
}
watch(() => props.cercleId, charger, { immediate: true })

const nouvelle = () => { erreur.value = ''; fiche.value = { prenom: '', nom: '', genre: '', dateNaissance: '', avatar: null, avatarChoix: null } }
const modifier = (p) => { erreur.value = ''; fiche.value = { ...p, nom: p.nom ?? '', genre: p.genre ?? '', dateNaissance: p.dateNaissance ?? '' } }

async function enregistrer() {
  enCours.value = true
  erreur.value = ''
  const f = fiche.value
  const corps = { prenom: f.prenom, nom: f.nom, genre: f.genre || null, dateNaissance: f.dateNaissance }
  try {
    if (f.id) {
      await api('PUT', `${base()}/personnes/${f.id}`, corps)
      fiche.value = null
    } else {
      // Après la création, la même fenêtre propose d'ajouter la photo
      const { id } = await api('POST', `${base()}/personnes`, { ...corps, exterieur: true })
      fiche.value = { ...f, id, etapePhoto: true }
    }
    await charger()
  } catch (e) {
    erreur.value = e.message
  } finally {
    enCours.value = false
  }
}
async function photoChangee(a) {
  fiche.value = { ...fiche.value, ...a }
  await charger()
}
async function photosChangees(l) {
  fiche.value = { ...fiche.value, photosJeu: l }
  await charger()
}
async function retirer(p) {
  if (!await confirmer(`Retirer ${p.prenom} des jeux ?`, { oui: 'Retirer', danger: true })) return
  try { await api('DELETE', `${base()}/personnes/${p.id}`); await charger() } catch (e) { erreur.value = e.message }
}
</script>

<template>
  <div class="reglage">
    <span class="libelle-reglage">Personnes extérieures à la famille</span>
    <p class="aide">Un voisin, un ami, une personnalité : ajoutez sa photo, son prénom et sa date de naissance pour qu'elle apparaisse dans « Qui est-ce ? » et « Quel âge ? ». Ces personnes ne figurent pas dans l'arbre et sont communes à tout le cercle.</p>
    <p v-if="erreur && !fiche" class="erreur">{{ erreur }}</p>
    <ul v-if="liste.length" class="liste">
      <li v-for="p in liste" :key="p.id">
        <Avatar :src="p.avatar" :prenom="p.prenom" :taille="40" />
        <span class="nom"><strong>{{ p.prenom }} {{ p.nom ?? '' }}</strong>
          <small v-if="p.dateNaissance"> · {{ ageTexte(p.dateNaissance) }}</small>
          <small v-if="!p.avatar" class="manque"> · sans photo</small></span>
        <BoutonIcone icone="modifier" libelle="Modifier" @click="modifier(p)" />
        <BoutonIcone icone="effacer" :libelle="`Retirer ${p.prenom}`" danger @click="retirer(p)" />
      </li>
    </ul>
    <button type="button" class="secondaire petit" @click="nouvelle"><Icone nom="ajouter" class="en-ligne" /> Ajouter une personne</button>

    <Modale v-if="fiche" :titre="fiche.id ? (fiche.etapePhoto ? `Photo de ${fiche.prenom}` : `Fiche de ${fiche.prenom}`) : 'Ajouter une personne extérieure'" @fermer="fiche = null">
      <div v-if="fiche.etapePhoto" class="formulaire">
        <p class="aide">{{ fiche.prenom }} est ajouté{{ fiche.genre === 'femme' ? 'e' : '' }}. Ajoutez maintenant sa photo (et d'autres si vous le souhaitez) : sans photo, la personne n'apparaît pas dans les jeux.</p>
        <ChoixAvatar :base="`${base()}/personnes/${fiche.id}`" :avatar="fiche.avatar" :choix="fiche.avatarChoix" :prenom="fiche.prenom" @change="photoChangee" />
        <PhotosJeu :base="`${base()}/personnes/${fiche.id}`" :photos="fiche.photosJeu ?? []" @change="photosChangees" />
        <div class="actions"><button type="button" @click="fiche = null">Terminer</button></div>
      </div>
      <form v-else class="formulaire" @submit.prevent="enregistrer">
        <label>Prénom <input v-model="fiche.prenom" required maxlength="80" autocomplete="off" /></label>
        <label>Nom <input v-model="fiche.nom" maxlength="80" autocomplete="off" placeholder="Facultatif" /></label>
        <div class="champ">
          <span class="libelle">Il ou elle</span>
          <div class="choix-genre" role="radiogroup" aria-label="Il ou elle">
            <button v-for="[v, t] in [['homme', 'Homme'], ['femme', 'Femme'], ['', 'Ne pas préciser']]" :key="v"
              type="button" role="radio" :aria-checked="fiche.genre === v" :class="{ on: fiche.genre === v }" @click="fiche.genre = v">{{ t }}</button>
          </div>
          <span class="aide">Les mauvaises réponses proposées sont du même genre.</span>
        </div>
        <label>Date de naissance <input v-model="fiche.dateNaissance" type="date" min="1800-01-01" :max="aujourdhui" />
          <span class="aide">Nécessaire pour « Quel âge ? » ; sans elle, la personne n'apparaît que dans « Qui est-ce ? ».</span></label>
        <div v-if="fiche.id" class="champ">
          <span class="libelle">Photo</span>
          <ChoixAvatar :base="`${base()}/personnes/${fiche.id}`" :avatar="fiche.avatar" :choix="fiche.avatarChoix" :prenom="fiche.prenom" @change="photoChangee" />
          <PhotosJeu :base="`${base()}/personnes/${fiche.id}`" :photos="fiche.photosJeu ?? []" @change="photosChangees" />
        </div>
        <p v-if="erreur" class="erreur">{{ erreur }}</p>
        <div class="actions">
          <button type="submit" :disabled="enCours">{{ fiche.id ? 'Enregistrer' : 'Ajouter' }}</button>
          <button type="button" class="secondaire" @click="fiche = null">Annuler</button>
        </div>
      </form>
    </Modale>
  </div>
</template>

<style scoped>
.reglage { display: flex; flex-direction: column; gap: 4px; }
.libelle-reglage { font-weight: 600; font-size: 0.95rem; }
.reglage .aide { margin: 0; }
.petit { padding: 6px 12px; font-size: 0.9rem; }
.liste { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.liste li { display: flex; align-items: center; gap: 10px; }
.nom { flex: 1; min-width: 0; }
.manque { color: #b46a22; }
.formulaire { display: flex; flex-direction: column; gap: 12px; }
.formulaire input:not([type='file']) { width: 100%; }
.champ { display: flex; flex-direction: column; gap: 4px; }
.libelle { font-weight: 500; }
.choix-genre { display: flex; border: 1px solid #ccc; border-radius: 8px; overflow: hidden; }
.choix-genre button { flex: 1; border-radius: 0; background: white; color: inherit; padding: 9px 4px; font-size: 0.9rem; border-left: 1px solid #ccc; }
.choix-genre button:first-child { border-left: none; }
.choix-genre button.on { background: var(--vert); color: white; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
