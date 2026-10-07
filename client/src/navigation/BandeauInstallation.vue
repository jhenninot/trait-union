<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { installation, installer, dansAppliAndroid, estIOS, modeAutonome } from '../installation.js'
import Icone from './Icone.vue'

// Conseil d'installation de la PWA, affiché une fois à tout nouvel utilisateur connecté (aidants,
// proches, auxiliaires, admins). Jamais sur l'appareil de la personne accompagnée (App.vue ne
// l'affiche pas), ni dans l'APK, ni quand l'application est déjà installée.
const CLE = 'tu_conseil_installation'
const route = useRoute()
const lu = () => { try { return localStorage.getItem(CLE) === '1' } catch { return false } }
const masque = ref(lu())
const ios = estIOS()

const visible = computed(() => !masque.value && !installation.installee && !dansAppliAndroid() &&
  !modeAutonome() && route.path !== '/application')

function fermer() {
  masque.value = true
  try { localStorage.setItem(CLE, '1') } catch { /* le conseil reviendra */ }
}

async function installerEtFermer() {
  await installer()
  fermer()
}
</script>

<template>
  <div v-if="visible" class="bandeau" role="status">
    <Icone nom="mobile" class="symbole" />
    <p><strong>Installez Trait d'union sur votre écran d'accueil</strong>
      <span v-if="installation.invite">Il s'ouvrira comme une application, en plein écran, sans chercher l'adresse.</span>
      <span v-else-if="ios">Dans Safari, touchez le bouton Partager (carré avec une flèche), puis « Sur l'écran d'accueil ».</span>
      <span v-else>Dans le menu du navigateur, choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil ».</span></p>
    <div class="boutons">
      <button v-if="installation.invite" @click="installerEtFermer">Installer</button>
      <RouterLink class="bouton" to="/application" @click="fermer">Plus d'infos</RouterLink>
      <button class="secondaire" @click="fermer">Plus tard</button>
    </div>
  </div>
</template>

<style scoped>
.bandeau {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 12px 16px 0;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--vert-clair);
  color: var(--bleu-nuit);
}
.symbole { font-size: 1.6rem; color: var(--vert); }
p { margin: 0; flex: 1; min-width: 180px; }
p span { display: block; font-size: 0.95rem; color: var(--gris); }
.boutons { display: flex; gap: 8px; flex-wrap: wrap; }
.bouton {
  display: inline-block;
  background: var(--vert);
  color: white;
  text-decoration: none;
  padding: 10px 16px;
  border-radius: 8px;
}
.secondaire { background: white; }
</style>
