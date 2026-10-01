<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api.js'
import { session } from '../session.js'
import { estAuxiliaire } from '../roles.js'
import { modeAlertes, autorisation, activerAlertes, desactiverAlertes } from '../alertes.js'
import Icone from '../navigation/Icone.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'

// « Mes alertes » : activer les alertes sur cet appareil, choisir ce que l'on reçoit
// et voir les appareils qui les reçoivent.
const donnees = ref(null) // { preferences, clePublique, android, appareils }
const message = ref('')
const erreur = ref('')
const occupe = ref(false)
const mode = modeAlertes()
const etat = ref(['web', 'android'].includes(mode) ? autorisation() : 'refusee')

const charger = async () => (donnees.value = await api('GET', '/alertes'))
onMounted(() => charger().catch((e) => (erreur.value = e.message)))

const ceAppareil = computed(() => donnees.value?.appareils.find((a) => a.ceAppareil) ?? null)
const autres = computed(() => donnees.value?.appareils.filter((a) => !a.ceAppareil) ?? [])
// Une personne qui n'est qu'auxiliaire de vie n'a pas accès aux photos
const voitPhotos = computed(() => session.utilisateur.estAdmin || session.cercles.some((c) => !estAuxiliaire(c.role)))

const CATEGORIES = computed(() => [
  { valeur: 'rendezVous', icone: 'agenda', libelle: 'Rappels de rendez-vous', aide: 'Pour les rendez-vous de l\'agenda qui ont une alerte, au moment choisi.' },
  ...(voitPhotos.value ? [{ valeur: 'photos', icone: 'photo', libelle: 'Nouvelles photos', aide: 'Quand quelqu\'un ajoute des photos dans un de vos cercles.' }] : [])
])

async function action(fn, succes = '') {
  message.value = erreur.value = ''
  occupe.value = true
  try {
    await fn()
    message.value = succes
  } catch (e) {
    erreur.value = e.message
  } finally {
    occupe.value = false
    if (['web', 'android'].includes(mode)) etat.value = autorisation()
  }
}

const activer = () => action(async () => {
  await activerAlertes(donnees.value.clePublique)
  await charger()
}, 'Les alertes sont activées sur cet appareil.')

const desactiver = () => action(async () => {
  await desactiverAlertes(ceAppareil.value?.id)
  await charger()
}, 'Cet appareil ne recevra plus d\'alertes.')

const retirer = (a) => action(async () => {
  if (!confirm(`Ne plus envoyer d'alertes sur « ${a.libelle} » ?`)) return
  await api('POST', '/alertes/appareils/retirer', { id: a.id })
  await charger()
})

const essayer = (a) => action(async () => {
  await api('POST', '/alertes/essai', { id: a.id })
}, 'Alerte d\'essai envoyée. Elle peut mettre quelques secondes à arriver.')

const changerPreference = (cle, valeur) => action(async () => {
  donnees.value.preferences = await api('PUT', '/alertes/preferences', { ...donnees.value.preferences, [cle]: valeur })
})

const date = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
</script>

<template>
  <main>
    <h1>Mes alertes</h1>
    <p class="aide">Trait d'union peut vous prévenir sur votre téléphone, même quand l'application est fermée.</p>

    <section v-if="donnees" class="carte">
      <h2><Icone nom="mobile" class="en-ligne" /> Sur cet appareil</h2>
      <template v-if="ceAppareil">
        <p class="etat actif"><Icone nom="coche" class="en-ligne" /> Les alertes sont activées ({{ ceAppareil.libelle }}).</p>
        <div class="actions">
          <button class="secondaire" :disabled="occupe" @click="essayer(ceAppareil)"><Icone nom="cloche" class="en-ligne" /> Envoyer une alerte d'essai</button>
          <button class="lien" :disabled="occupe" @click="desactiver">Désactiver sur cet appareil</button>
        </div>
      </template>
      <template v-else-if="mode === 'web' || mode === 'android'">
        <p v-if="etat === 'refusee'" class="erreur">Les notifications sont bloquées pour Trait d'union.
          {{ mode === 'android' ? 'Autorisez-les dans les réglages d\'Android (Applications, Trait d\'union, Notifications).' : 'Autorisez-les dans les réglages du site de votre navigateur (cadenas à gauche de l\'adresse), puis rechargez la page.' }}</p>
        <p v-else>Les alertes ne sont pas activées sur cet appareil.</p>
        <button :disabled="occupe || etat === 'refusee'" @click="activer"><Icone nom="cloche" class="en-ligne" /> Activer les alertes ici</button>
      </template>
      <p v-else-if="mode === 'android-sans-firebase'" class="aide">Cette version de l'application Android ne peut pas encore recevoir d'alertes :
        <template v-if="session.utilisateur.estAdmin">configurez Firebase dans <RouterLink to="/admin/alertes">Administration, Alertes</RouterLink>.</template>
        <template v-else>l'administrateur doit d'abord la configurer. En attendant, ouvrez Trait d'union dans Chrome et activez les alertes depuis le navigateur.</template>
      </p>
      <p v-else-if="mode === 'ios-installer'" class="aide">Sur iPhone et iPad, les alertes ne fonctionnent qu'une fois Trait d'union ajouté à l'écran d'accueil :
        voir <RouterLink to="/application">Application mobile</RouterLink>, puis ouvrez l'application depuis l'écran d'accueil et revenez ici.</p>
      <p v-else class="aide">Ce navigateur ne sait pas recevoir d'alertes. Essayez avec Chrome, Firefox, Edge ou Safari à jour.</p>
    </section>

    <section v-if="donnees" class="carte">
      <h2><Icone nom="cloche" class="en-ligne" /> Ce que je reçois</h2>
      <label v-for="c in CATEGORIES" :key="c.valeur" class="categorie">
        <input type="checkbox" :checked="donnees.preferences[c.valeur]" :disabled="occupe" @change="changerPreference(c.valeur, $event.target.checked)" />
        <span class="texte">
          <strong><Icone :nom="c.icone" class="en-ligne" /> {{ c.libelle }}</strong>
          <span class="aide">{{ c.aide }}</span>
        </span>
      </label>
      <p class="aide">Ce choix vaut pour tous vos appareils. Le délai d'un rappel se choisit dans chaque rendez-vous de l'agenda.</p>
    </section>

    <section v-if="autres.length" class="carte">
      <h2>Mes autres appareils</h2>
      <div v-for="a in autres" :key="a.id" class="appareil">
        <span><strong>{{ a.libelle }}</strong> <span class="aide">depuis le {{ date(a.creeLe) }}</span></span>
        <span class="gestes">
          <BoutonIcone icone="cloche" libelle="Envoyer une alerte d'essai" @click="essayer(a)" />
          <BoutonIcone icone="effacer" libelle="Ne plus envoyer d'alertes sur cet appareil" danger @click="retirer(a)" />
        </span>
      </div>
    </section>

    <p v-if="message" class="succes">{{ message }}</p>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
  </main>
</template>

<style scoped>
h2 { font-size: 1.15rem; margin: 0 0 12px; color: var(--bleu-nuit); }
.etat.actif { color: var(--vert); font-weight: 500; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.categorie { flex-direction: row; align-items: flex-start; gap: 12px; font-weight: normal; padding: 8px 0; border-bottom: 1px solid #ebe8e3; }
.categorie input { width: 22px; height: 22px; margin-top: 2px; flex: none; }
.categorie .texte { display: flex; flex-direction: column; gap: 2px; }
.categorie .aide { font-size: 0.9rem; }
.appareil { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #ebe8e3; }
.appareil:last-child { border-bottom: 0; }
.gestes { display: flex; gap: 6px; }
.succes { color: var(--vert); font-weight: 500; }
</style>
