<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api.js'
import { session, rafraichirSession } from '../session.js'

const config = ref(null) // configuration enregistrée (clé masquée)
const f = ref({ cleApi: '', expediteurEmail: '', expediteurNom: '', actif: false })
const compte = ref(null) // résultat de la vérification de la clé
const destinataire = ref(session.utilisateur.email || '')
const message = ref('')
const erreur = ref('')
const occupe = ref(false)

function remplir(c) {
  config.value = c
  f.value = { cleApi: '', expediteurEmail: c.expediteurEmail, expediteurNom: c.expediteurNom, actif: c.actif }
}
onMounted(async () => remplir(await api('GET', '/admin/email')))

async function action(fn) {
  erreur.value = ''
  message.value = ''
  occupe.value = true
  try {
    await fn()
  } catch (e) {
    erreur.value = e.message
  } finally {
    occupe.value = false
  }
}

const verifier = () => action(async () => {
  compte.value = await api('POST', '/admin/email/verifier', { cleApi: f.value.cleApi })
  if (!f.value.expediteurEmail) {
    const premier = compte.value.expediteurs.find((e) => e.actif)
    if (premier) f.value.expediteurEmail = premier.email
  }
})

const enregistrer = () => action(async () => {
  remplir(await api('PUT', '/admin/email', f.value))
  await rafraichirSession()
  message.value = 'Configuration enregistrée.'
})

const tester = () => action(async () => {
  const { destinataire: a } = await api('POST', '/admin/email/test', { destinataire: destinataire.value })
  message.value = `Email de test envoyé à ${a}. Pensez à regarder dans les indésirables.`
})
</script>

<template>
  <main>
    <h1>Envoi d'emails</h1>
    <p>Trait d'union envoie ses emails (invitations, et plus tard rappels et notifications) avec
      <a href="https://www.brevo.com/fr/" target="_blank" rel="noopener">Brevo</a>. L'offre gratuite permet 300 emails par jour.</p>

    <details class="carte" :open="!config?.cleApi">
      <summary><strong>Comment configurer Brevo</strong></summary>
      <ol class="etapes">
        <li><strong>Créer un compte</strong> gratuit sur <a href="https://app.brevo.com" target="_blank" rel="noopener">app.brevo.com</a>.</li>
        <li><strong>Déclarer l'expéditeur</strong> : menu du compte (en haut à droite) → « Expéditeurs, domaines et IP dédiées » → onglet
          « Expéditeurs » → « Ajouter un expéditeur ». Brevo envoie un code à cette adresse pour la valider.
          <p class="aide">Préférez une adresse de votre propre domaine (ex. <em>contact@mondomaine.fr</em>) et authentifiez ce domaine
            dans l'onglet « Domaines » (enregistrements DNS DKIM et DMARC à ajouter chez votre registraire). Une adresse Gmail ou
            Free comme expéditeur fonctionne mal : les emails risquent d'arriver dans les indésirables.</p>
        </li>
        <li><strong>Créer une clé API</strong> : menu du compte → « SMTP et API » → onglet « Clés API » → « Générer une nouvelle clé API »,
          nommez-la « Trait d'union ». Copiez-la tout de suite : elle commence par <code>xkeysib-</code> et n'est affichée qu'une fois.
          <p class="aide">Attention à ne pas prendre la « clé SMTP » (<code>xsmtpsib-</code>), qui ne marche pas avec l'API.</p>
        </li>
        <li><strong>Autoriser l'adresse IP du serveur</strong> : Brevo bloque par défaut les appels venant d'une adresse IP inconnue.
          Menu du compte → « Sécurité » → « IP autorisées » : ajoutez l'adresse IP publique de votre box (celle de la connexion
          internet du serveur), ou désactivez le blocage. Si l'IP n'est pas autorisée, le bouton « Vérifier la clé » ci-dessous
          affiche le message de Brevo, qui contient l'adresse à ajouter.</li>
        <li><strong>Coller la clé ci-dessous</strong>, cliquer sur « Vérifier la clé », choisir l'expéditeur, cocher « Activer l'envoi
          d'emails », enregistrer, puis envoyer un email de test.</li>
      </ol>
      <p class="aide">Les liens contenus dans les emails utilisent la variable <code>APP_URL</code> du <code>.env</code> Dockge
        (ex. <code>https://trait-union.mondomaine.fr</code>) ; sans elle, l'adresse avec laquelle vous consultez l'application.</p>
    </details>

    <form v-if="config" class="carte" @submit.prevent="enregistrer">
      <label>Clé API Brevo
        <input v-model="f.cleApi" type="password" autocomplete="off" spellcheck="false"
          :placeholder="config.cleApi ? `Enregistrée (${config.cleApi})` : 'xkeysib-…'" />
        <span v-if="config.cleApi" class="aide">Laisser vide pour garder la clé enregistrée.</span>
      </label>
      <div>
        <button type="button" class="secondaire" :disabled="occupe || (!f.cleApi && !config.cleApi)" @click="verifier">Vérifier la clé</button>
      </div>
      <div v-if="compte" class="encart">
        <p>Clé valide : compte <strong>{{ compte.email }}</strong><span v-if="compte.entreprise"> ({{ compte.entreprise }})</span>.</p>
        <p v-if="!compte.expediteurs.length" class="aide">Aucun expéditeur déclaré dans Brevo pour l'instant (étape 2).</p>
        <template v-else>
          <p class="aide">Expéditeurs déclarés dans Brevo (cliquer pour choisir) :</p>
          <ul class="expediteurs">
            <li v-for="e in compte.expediteurs" :key="e.email">
              <button type="button" class="lien" @click="f.expediteurEmail = e.email; f.expediteurNom ||= e.nom">{{ e.nom }} &lt;{{ e.email }}&gt;</button>
              <span v-if="!e.actif" class="aide"> · pas encore validé</span>
            </li>
          </ul>
        </template>
      </div>
      <label>Email de l'expéditeur
        <input v-model="f.expediteurEmail" type="email" placeholder="contact@mondomaine.fr" />
        <span class="aide">Doit être un expéditeur validé dans Brevo.</span>
      </label>
      <label>Nom de l'expéditeur
        <input v-model="f.expediteurNom" placeholder="Trait d'union" maxlength="70" />
      </label>
      <label class="case"><input v-model="f.actif" type="checkbox" /> Activer l'envoi d'emails</label>
      <button :disabled="occupe">Enregistrer</button>
    </form>

    <form v-if="config?.cleApi" class="carte" @submit.prevent="tester">
      <strong>Envoyer un email de test</strong>
      <p class="aide">Utilise la configuration enregistrée, même si l'envoi n'est pas encore activé.</p>
      <label>Destinataire <input v-model="destinataire" type="email" required /></label>
      <button class="secondaire" :disabled="occupe">Envoyer le test</button>
    </form>

    <p v-if="message" class="succes">{{ message }}</p>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
  </main>
</template>

<style scoped>
.etapes { padding-left: 20px; line-height: 1.5; }
.etapes li { margin-bottom: 10px; }
summary { cursor: pointer; }
.case { flex-direction: row; align-items: center; gap: 8px; font-weight: normal; }
.encart { background: var(--vert-clair); border-radius: 8px; padding: 12px; }
.encart p { margin: 4px 0; }
.expediteurs { margin: 4px 0; padding-left: 20px; }
.succes { color: var(--vert); font-weight: 500; }
code { background: #f0eee9; padding: 1px 4px; border-radius: 4px; }
</style>
