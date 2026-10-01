<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api.js'
import Icone from '../navigation/Icone.vue'

// Alertes : rien à configurer pour les navigateurs et la PWA (Web Push) ; pour l'application
// Android, un projet Firebase (Firebase Cloud Messaging) dont on colle ici le compte de service.
const config = ref(null) // { actif, projet, compte }
const f = ref({ actif: false, compteService: '' })
const message = ref('')
const erreur = ref('')
const occupe = ref(false)

function remplir(c) {
  config.value = c
  f.value = { actif: c.actif, compteService: '' }
}
onMounted(async () => remplir(await api('GET', '/admin/alertes')))

async function action(fn) {
  erreur.value = message.value = ''
  occupe.value = true
  try {
    await fn()
  } catch (e) {
    erreur.value = e.message
  } finally {
    occupe.value = false
  }
}

async function lireFichier(e) {
  const fichier = e.target.files[0]
  if (fichier) f.value.compteService = await fichier.text()
}

const verifier = () => action(async () => {
  const { projet } = await api('POST', '/admin/alertes/verifier', f.value)
  message.value = `Google accepte le compte de service du projet « ${projet} ».`
})

const enregistrer = () => action(async () => {
  remplir(await api('PUT', '/admin/alertes', f.value))
  message.value = f.value.actif ? 'Configuration enregistrée : l\'application Android peut recevoir les alertes.' : 'Configuration enregistrée.'
})
</script>

<template>
  <main>
    <h1>Alertes</h1>

    <section class="carte">
      <h2><Icone nom="coche" class="en-ligne" /> Navigateurs, PWA et iPhone</h2>
      <p>Les alertes fonctionnent sans configuration dans les navigateurs (Chrome, Firefox, Edge, Safari) et dans
        l'application installée depuis le navigateur (PWA), y compris sur iPhone une fois ajoutée à l'écran d'accueil.
        Les clés de chiffrement (VAPID) ont été créées automatiquement par le serveur.</p>
    </section>

    <section class="carte">
      <h2><Icone nom="mobile" class="en-ligne" /> Application Android (APK)</h2>
      <p>L'application Android ne peut pas recevoir les alertes du navigateur : elle passe par Firebase Cloud Messaging
        (service gratuit de Google). Il faut un projet Firebase, une fois pour toutes.</p>
      <details :open="!config?.compte">
        <summary><strong>Comment créer le projet Firebase</strong></summary>
        <ol class="etapes">
          <li>Sur la <a href="https://console.firebase.google.com/" target="_blank" rel="noopener">console Firebase</a>,
            « Créer un projet » (par exemple « Trait d'union ») ; Google Analytics n'est pas utile.</li>
          <li>Dans le projet, ajoutez une application <strong>Android</strong> avec le nom de package
            <code>fr.traitunion.app</code>, puis téléchargez le fichier <code>google-services.json</code> proposé
            (les étapes suivantes de l'assistant ne sont pas nécessaires).</li>
          <li>Sur GitHub, dans le dépôt : Settings, Secrets and variables, Actions, « New repository secret » nommé
            <code>GOOGLE_SERVICES_JSON</code>, avec tout le contenu de ce fichier. Relancez ensuite la construction de
            l'application (onglet Actions, « Application Android », « Run workflow ») et réinstallez l'APK.</li>
          <li>Dans Firebase : roue dentée, « Paramètres du projet », onglet « Comptes de service »,
            « Générer une nouvelle clé privée ». Choisissez ce fichier JSON ci-dessous, vérifiez, cochez
            « Activer » et enregistrez.</li>
        </ol>
        <p class="aide">La clé privée reste sur ce serveur ; elle n'est plus jamais affichée.</p>
      </details>
    </section>

    <form v-if="config" class="carte" @submit.prevent="enregistrer">
      <p v-if="config.compte" class="aide">Compte de service enregistré : {{ config.compte }} (projet {{ config.projet }}).</p>
      <label>Clé du compte de service (fichier JSON)
        <input type="file" accept=".json,application/json" @change="lireFichier" />
      </label>
      <label>ou collez son contenu
        <textarea v-model="f.compteService" rows="4" spellcheck="false" :placeholder="config.compte ? 'Laisser vide pour garder la clé enregistrée' : '{ &quot;type&quot;: &quot;service_account&quot;, ... }'" />
      </label>
      <div>
        <button type="button" class="secondaire" :disabled="occupe || (!f.compteService && !config.compte)" @click="verifier">{{ occupe ? 'Vérification…' : 'Vérifier' }}</button>
      </div>
      <label class="case"><input v-model="f.actif" type="checkbox" /> Activer les alertes dans l'application Android</label>
      <button :disabled="occupe">Enregistrer</button>
    </form>

    <p v-if="message" class="succes">{{ message }}</p>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
  </main>
</template>

<style scoped>
h2 { font-size: 1.15rem; margin: 0 0 8px; color: var(--bleu-nuit); }
.etapes { padding-left: 20px; line-height: 1.5; }
.etapes li { margin-bottom: 10px; }
summary { cursor: pointer; }
textarea { font: 0.85rem ui-monospace, monospace; padding: 10px 12px; border: 1px solid #ccc; border-radius: 8px; resize: vertical; }
.case { flex-direction: row; align-items: center; gap: 8px; font-weight: normal; }
.succes { color: var(--vert); font-weight: 500; }
code { background: #f0eee9; padding: 1px 4px; border-radius: 4px; }
</style>
