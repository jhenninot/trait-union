<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import { session } from '../session.js'
import ChoixAvatar from './ChoixAvatar.vue'
import PhotosJeu from './PhotosJeu.vue'
import FormulaireCoordonnees from './FormulaireCoordonnees.vue'
import ChoixLien from './ChoixLien.vue'
import Icone from '../navigation/Icone.vue'

// « Mon profil » : prénom, nom, coordonnées et avatar de la personne connectée.
// Après une invitation (?bienvenue=<cercle>), c'est la 2e étape : compléter son profil.
const route = useRoute()
const router = useRouter()
const bienvenue = computed(() => route.query.bienvenue || null)
const cercleBienvenue = computed(() => session.cercles?.find((c) => c.id === bienvenue.value)?.nom)
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

// « Terminer » enregistre aussi ce qui a été saisi sans cliquer sur « Enregistrer »
const formulaireCoordonnees = ref(null)
async function terminer() {
  await enregistrer()
  if (!erreur.value && cerclesLien.value.length) await enregistrerLiens()
  if (!erreur.value && !erreurLien.value) await enregistrerCoordonnees(formulaireCoordonnees.value.valeurs())
  if (!erreur.value && !erreurLien.value && !erreurCoordonnees.value) router.push(`/cercles/${bienvenue.value}`)
}

// Lien avec la personne accompagnée, dans chaque cercle où l'on est aidant ou proche
// (sauf si l'on est placé dans l'arbre généalogique : le lien y est calculé)
const cerclesLien = computed(() => (session.cercles ?? []).filter((c) => ['aidant', 'proche'].includes(c.role) && c.membreId && !c.personneId))
const liens = ref(Object.fromEntries(cerclesLien.value.map((c) => [c.id, c.lien ?? ''])))
const messageLien = ref('')
const erreurLien = ref('')

async function enregistrerLiens() {
  messageLien.value = erreurLien.value = ''
  try {
    for (const c of cerclesLien.value) {
      if ((c.lien ?? '') === liens.value[c.id]) continue
      c.lien = (await api('PUT', `/cercles/${c.id}/membres/${c.membreId}/lien`, { lien: liens.value[c.id] })).lien
    }
    messageLien.value = 'Enregistré'
  } catch (e) {
    erreurLien.value = e.message
  }
}

const avatarChange = (a) => Object.assign(session.utilisateur, a)
const photosJeu = ref([])
api('GET', '/profil/photos').then((l) => (photosJeu.value = l)).catch(() => {})
</script>

<template>
  <main>
    <template v-if="bienvenue">
      <p class="aide surtitre">Étape 2 sur 2</p>
      <h1>Bienvenue{{ cercleBienvenue ? ` dans ${cercleBienvenue}` : '' }}</h1>
    </template>
    <h1 v-else>Mon profil</h1>
    <div class="carte importance">
      <p><strong>{{ bienvenue ? 'Complétez votre profil : chaque information compte.' : 'Chaque information de votre profil compte.' }}</strong></p>
      <p>La personne accompagnée vous voit sur sa tablette, dans « Ma famille ». Avec une maladie de la mémoire,
        une photo et quelques repères l'aident beaucoup :</p>
      <ul>
        <li><Icone nom="compte" class="en-ligne" /> une <strong>vraie photo de vous</strong>, pour qu'elle vous reconnaisse ;</li>
        <li><Icone nom="gateau" class="en-ligne" /> votre <strong>date de naissance</strong>, pour qu'elle vous souhaite votre anniversaire ;</li>
        <li><Icone nom="telephone" class="en-ligne" /> votre <strong>téléphone</strong> et votre <strong>adresse</strong>, pour qu'elle puisse vous joindre.</li>
      </ul>
    </div>
    <div class="carte">
      <strong>Ma photo</strong>
      <p class="aide">Mettez de préférence une vraie photo de vous, récente, de face et bien éclairée : c'est elle qui permet
        à la personne accompagnée de vous reconnaître. Elle apparaît à côté de votre prénom, notamment sur sa tablette.</p>
      <ChoixAvatar
        base="/profil"
        :avatar="session.utilisateur.avatar"
        :choix="session.utilisateur.avatarChoix"
        :prenom="session.utilisateur.prenom"
        @change="avatarChange"
      />
    </div>
    <div class="carte">
      <strong>Mes photos pour les jeux</strong>
      <p class="aide">Les jeux de la personne accompagnée utilisent votre photo ci-dessus, et aussi ces photos : ajoutez-en d'autres,
        à d'autres âges ou sous un autre angle, pour que le jeu reste varié.</p>
      <PhotosJeu base="/profil" :photos="photosJeu" @change="photosJeu = $event" />
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
    <form v-if="cerclesLien.length" class="carte" @submit.prevent="enregistrerLiens">
      <strong>Mon lien avec la personne accompagnée</strong>
      <p class="aide">Il s'affiche sous votre prénom sur sa tablette, pour l'aider à vous situer.</p>
      <label v-for="c in cerclesLien" :key="c.id">
        <span v-if="cerclesLien.length > 1">{{ c.nom }}</span>
        <ChoixLien v-model="liens[c.id]" />
      </label>
      <div class="actions">
        <button type="submit">Enregistrer</button>
        <span v-if="messageLien" class="aide">{{ messageLien }}</span>
        <span v-if="erreurLien" class="erreur">{{ erreurLien }}</span>
      </div>
    </form>
    <div class="carte">
      <strong>Mes coordonnées</strong>
      <p class="aide">Elles s'affichent pour les membres de vos cercles dans « Famille et aidants » et sur la tablette.
        Les auxiliaires de vie ne voient que le téléphone.</p>
      <FormulaireCoordonnees ref="formulaireCoordonnees" :personne="session.utilisateur" explications @enregistrer="enregistrerCoordonnees">
        <span v-if="messageCoordonnees" class="aide">{{ messageCoordonnees }}</span>
        <span v-if="erreurCoordonnees" class="erreur">{{ erreurCoordonnees }}</span>
      </FormulaireCoordonnees>
    </div>
    <div v-if="bienvenue" class="fin">
      <p class="aide">Vous pourrez compléter ou modifier votre profil à tout moment depuis votre prénom, en bas du menu.</p>
      <button type="button" @click="terminer">Enregistrer et voir le cercle</button>
      <span v-if="erreur || erreurLien || erreurCoordonnees" class="erreur">{{ erreur || erreurLien || erreurCoordonnees }}</span>
    </div>
  </main>
</template>

<style scoped>
form { display: flex; flex-direction: column; gap: 12px; }
.actions { display: flex; align-items: center; gap: 12px; }
.surtitre { margin: 0; }
.importance { background: var(--vert-clair); }
.importance p { margin: 0 0 8px; }
.importance ul { margin: 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.fin { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin-top: 16px; }
</style>
