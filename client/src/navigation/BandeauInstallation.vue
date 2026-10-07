<script setup>
import { ref, computed } from 'vue'
import { installation, installer, dansAppliAndroid, estIOS, modeAutonome } from '../installation.js'
import Icone from './Icone.vue'

// Conseil d'installation de la PWA, comme sur FamilyGest : une carte flottante en bas de l'écran,
// proposée aux aidants, proches, auxiliaires et administrateurs connectés (App.vue ne l'affiche pas
// sur l'appareil de la personne accompagnée). Bouton Installer sous Chrome, Edge et Android,
// guide en deux étapes sous Safari (iPhone, iPad). Fermée, elle revient au bout de 7 jours.
const CLE = 'tu_conseil_installation'
const DELAI = 7 * 86_400_000
const recemmentFermee = () => {
  try { return Date.now() - Number(localStorage.getItem(CLE)) < DELAI } catch { return false }
}
const masque = ref(recemmentFermee())
const guideOuvert = ref(false)
const safariIOS = estIOS() && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)

const visible = computed(() => !masque.value && !installation.installee && !dansAppliAndroid() &&
  !modeAutonome() && (Boolean(installation.invite) || safariIOS))

function fermer() {
  masque.value = true
  try { localStorage.setItem(CLE, String(Date.now())) } catch { /* le conseil reviendra */ }
}
</script>

<template>
  <Transition name="monte">
    <div v-if="visible" class="conteneur">
      <div class="carte-installation" role="status">
        <img src="/icones/icone-192.png" alt="" class="logo">
        <div class="texte">
          <strong>Installer Trait d'union</strong>
          <span>Ajoutez-le à votre écran d'accueil : il s'ouvre comme une application, en plein écran.</span>
        </div>
        <div class="actions">
          <button v-if="installation.invite" @click="installer">
            <Icone nom="telecharger" /> Installer
          </button>
          <button v-else @click="guideOuvert = !guideOuvert">
            <Icone nom="partager" /> {{ guideOuvert ? 'Fermer' : 'Installer' }}
          </button>
          <button class="fermer" aria-label="Plus tard" title="Plus tard" @click="fermer">
            <Icone nom="fermer" />
          </button>
        </div>
        <ol v-if="guideOuvert" class="guide">
          <li>Touchez le bouton Partager <Icone nom="partager" /> en bas de Safari.</li>
          <li>Choisissez <strong>« Sur l'écran d'accueil »</strong>.</li>
        </ol>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.conteneur {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 40px);
  max-width: 520px;
  z-index: 14;
  pointer-events: none;
}
.carte-installation {
  pointer-events: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: white;
  color: var(--bleu-nuit);
  border: 1px solid var(--vert);
  border-radius: 16px;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.22);
}
.logo { width: 42px; height: 42px; border-radius: 10px; flex-shrink: 0; }
.texte { flex: 1; min-width: 180px; }
.texte span { display: block; font-size: 0.85rem; color: var(--gris); }
.actions { display: flex; align-items: center; gap: 8px; }
.fermer { background: var(--vert-clair); color: var(--gris); padding: 8px; border-radius: 50%; }
.guide { width: 100%; margin: 0; padding: 10px 0 0 20px; border-top: 1px dashed #d9d5ce; font-size: 0.9rem; color: var(--gris); }
.monte-enter-active, .monte-leave-active { transition: opacity 0.3s, translate 0.3s; }
.monte-enter-from, .monte-leave-to { opacity: 0; translate: 0 20px; }
/* Au-dessus de la barre de navigation du bas sur téléphone */
@media (max-width: 760px) {
  .conteneur { bottom: 88px; width: calc(100% - 20px); }
}
</style>
