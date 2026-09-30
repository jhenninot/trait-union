<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import { session, rafraichirSession } from '../session.js'

const route = useRoute()
const router = useRouter()
const url = `/cercles/${route.params.id}`
const cercle = ref(null)
const erreur = ref('')
const invitation = ref(null) // { role, lien, expireLe, emailEnvoye, erreurEmail }
const emailInvite = ref('')
const codeAppareil = ref(null) // { prenom, code, lien, expireLe }
const nouvelAccompagne = ref({ prenom: '', nom: '' })
const libellesRoles = { accompagne: 'Personne accompagnée', aidant: 'Aidant', proche: 'Proche' }

const accompagnes = computed(() => cercle.value?.membres.filter((m) => m.role === 'accompagne') ?? [])
const autres = computed(() => cercle.value?.membres.filter((m) => m.role !== 'accompagne') ?? [])
const heure = (d) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

async function charger() {
  try {
    cercle.value = await api('GET', url)
  } catch (e) {
    erreur.value = e.message
  }
}
onMounted(charger)

async function action(fn) {
  erreur.value = ''
  try {
    await fn()
  } catch (e) {
    erreur.value = e.message
  }
}

const inviter = (role) => action(async () => {
  const { jeton, expireLe, emailEnvoye, erreurEmail } = await api('POST', `${url}/invitations`, { role, email: emailInvite.value || undefined })
  invitation.value = { role, lien: `${location.origin}/invitation/${jeton}`, expireLe, emailEnvoye, erreurEmail }
  if (emailEnvoye) emailInvite.value = ''
})

const ajouterAccompagne = () => action(async () => {
  await api('POST', `${url}/accompagnes`, nouvelAccompagne.value)
  nouvelAccompagne.value = { prenom: '', nom: '' }
  await charger()
})

const genererCode = (m) => action(async () => {
  const { code, expireLe } = await api('POST', `${url}/membres/${m.id}/code`)
  codeAppareil.value = { prenom: m.prenom, code, lien: `${location.origin}/appareil?code=${code}`, expireLe }
})

const deconnecterAppareils = (m) => action(async () => {
  if (!confirm(`Déconnecter tous les appareils de ${m.prenom} ?`)) return
  await api('POST', `${url}/membres/${m.id}/deconnecter`)
  await charger()
})

const retirer = (m) => action(async () => {
  if (!confirm(`Retirer ${m.prenom} du cercle ?`)) return
  await api('DELETE', `${url}/membres/${m.id}`)
  await rafraichirSession()
  // Si l'on s'est retiré soi-même, le cercle n'est plus accessible
  try {
    cercle.value = await api('GET', url)
  } catch {
    router.push('/')
  }
})

const rejoindre = () => action(async () => {
  await api('POST', `${url}/rejoindre`)
  await rafraichirSession()
  await charger()
})

const copier = (texte) => navigator.clipboard?.writeText(texte)
</script>

<template>
  <main>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <template v-if="cercle">
      <h1>{{ cercle.nom }}</h1>
      <div v-if="(!cercle.monRole || cercle.monRole === 'proche') && session.utilisateur.estAdmin" class="carte ligne">
        <span v-if="!cercle.monRole">Vous voyez ce cercle en tant qu'administrateur, sans en être membre.</span>
        <span v-else>Vous êtes proche dans ce cercle.</span>
        <button @click="rejoindre">Rejoindre comme aidant</button>
      </div>

      <h2>Personnes accompagnées</h2>
      <p v-if="!accompagnes.length" class="aide">Personne pour l'instant.</p>
      <div v-for="m in accompagnes" :key="m.id" class="carte">
        <div class="ligne">
          <strong>{{ m.prenom }} {{ m.nom }}</strong>
          <span class="aide">{{ m.appareils }} appareil{{ m.appareils > 1 ? 's' : '' }} connecté{{ m.appareils > 1 ? 's' : '' }}</span>
        </div>
        <div v-if="cercle.peutGerer" class="actions">
          <button class="secondaire" @click="genererCode(m)">Configurer un appareil</button>
          <button v-if="m.appareils" class="danger" @click="deconnecterAppareils(m)">Déconnecter ses appareils</button>
          <button class="danger" @click="retirer(m)">Retirer</button>
        </div>
      </div>

      <div v-if="codeAppareil" class="carte encart">
        <p>Sur l'appareil de {{ codeAppareil.prenom }}, ouvrez <strong>{{ codeAppareil.lien }}</strong>
          ou allez sur la page de connexion, choisissez « Le configurer avec un code » et saisissez :</p>
        <p class="code">{{ codeAppareil.code }}</p>
        <p class="aide">Valable une seule fois, jusqu'au {{ heure(codeAppareil.expireLe) }}.</p>
        <button class="secondaire" @click="copier(codeAppareil.lien)">Copier le lien</button>
      </div>

      <form v-if="cercle.peutGerer" class="carte" @submit.prevent="ajouterAccompagne">
        <strong>Ajouter une personne accompagnée</strong>
        <label>Prénom <input v-model="nouvelAccompagne.prenom" required /></label>
        <label>Nom <input v-model="nouvelAccompagne.nom" /></label>
        <button>Ajouter</button>
      </form>

      <h2>Aidants et proches</h2>
      <div v-for="m in autres" :key="m.id" class="carte ligne">
        <span>
          <strong>{{ m.prenom }} {{ m.nom }}</strong>
          <span v-if="m.email" class="aide"> · {{ m.email }}</span>
        </span>
        <span>
          <span class="aide">{{ libellesRoles[m.role] }}</span>
          <button v-if="cercle.peutGerer" class="danger" @click="retirer(m)">Retirer</button>
        </span>
      </div>

      <div v-if="cercle.peutGerer" class="carte">
        <strong>Inviter quelqu'un</strong>
        <p class="aide">Un aidant gère le cercle (tâches, rendez-vous, médicaments). Un proche peut échanger et envoyer des photos.</p>
        <label v-if="session.email" class="champ-email">Son adresse email (facultatif)
          <input v-model="emailInvite" type="email" placeholder="Pour lui envoyer le lien par email" />
        </label>
        <div class="actions">
          <button class="secondaire" @click="inviter('aidant')">Inviter un aidant</button>
          <button class="secondaire" @click="inviter('proche')">Inviter un proche</button>
        </div>
        <div v-if="invitation" class="encart">
          <p v-if="invitation.emailEnvoye">Invitation envoyée par email à <strong>{{ invitation.emailEnvoye }}</strong>. Vous pouvez aussi lui transmettre ce lien :</p>
          <template v-else>
            <p v-if="invitation.erreurEmail" class="erreur">L'email n'a pas pu partir : {{ invitation.erreurEmail }}</p>
            <p>Envoyez ce lien à la personne ({{ libellesRoles[invitation.role].toLowerCase() }}) :</p>
          </template>
          <input :value="invitation.lien" readonly @focus="$event.target.select()" />
          <p class="aide">Valable une seule fois, jusqu'au {{ heure(invitation.expireLe) }}.</p>
          <button class="secondaire" @click="copier(invitation.lien)">Copier le lien</button>
        </div>
      </div>
    </template>
  </main>
</template>

<style scoped>
.ligne { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.encart { background: var(--vert-clair); border-radius: 8px; padding: 12px; margin-top: 12px; }
.encart input { width: 100%; }
.champ-email { margin-top: 12px; }
.code { font-size: 2.5rem; font-weight: 700; letter-spacing: 0.3em; text-align: center; color: var(--bleu-nuit); margin: 8px 0; }
</style>
