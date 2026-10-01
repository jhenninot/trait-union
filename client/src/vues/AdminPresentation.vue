<script setup>
// Page de présentation non référencée (Presentation.vue, /decouvrir/<clé>) : activation, lien
// secret à partager, bouton « Me contacter » et compteur de visites. Côté serveur :
// server/presentation/config.js et server/routes/presentation.js.
import { ref, computed, onMounted } from 'vue'
import { api } from '../api.js'
import Icone from '../navigation/Icone.vue'

const TYPES = { email: 'Email', whatsapp: 'WhatsApp', url: 'Lien (https://…)' }
const EXEMPLES = { email: 'contact@mondomaine.fr', whatsapp: '+33 6 12 34 56 78', url: 'https://…' }

const config = ref(null)
const f = ref({ actif: false, afficherContact: false, typeContact: 'email', contact: '' })
const message = ref('')
const erreur = ref('')
const occupe = ref(false)
const copie = ref(false)

function remplir(c) {
  config.value = c
  f.value = { actif: c.actif, afficherContact: c.afficherContact, typeContact: c.typeContact, contact: c.contact }
}
onMounted(async () => remplir(await api('GET', '/admin/presentation')))

const adresse = computed(() => (config.value?.cle ? `${window.location.origin}/decouvrir/${config.value.cle}` : ''))
const date = (d, options) => new Date(d).toLocaleString('fr-FR', options)
const resumeVisites = computed(() => {
  const c = config.value
  const depuis = c.visitesDepuis ? ` depuis le ${date(c.visitesDepuis, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''
  const derniere = c.derniereVisite ? `, la dernière le ${date(c.derniereVisite, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : ''
  return `${c.visites} visite${c.visites > 1 ? 's' : ''}${depuis}${derniere}.`
})

async function action(fn, succes) {
  erreur.value = ''
  message.value = ''
  occupe.value = true
  try {
    remplir(await fn())
    message.value = succes
  } catch (e) {
    erreur.value = e.message
  } finally {
    occupe.value = false
  }
}

const enregistrer = () => action(() => api('PUT', '/admin/presentation', f.value), 'Réglages enregistrés.')

const changerAdresse = () => {
  if (!confirm('Créer une nouvelle adresse ? L\'ancien lien ne fonctionnera plus pour personne.')) return
  action(() => api('POST', '/admin/presentation/nouvelle-adresse'), 'Nouvelle adresse créée : partagez le nouveau lien.')
}

const remettreAZero = () => {
  if (!confirm('Remettre le compteur de visites à zéro ?')) return
  action(() => api('POST', '/admin/presentation/remise-a-zero'), 'Compteur remis à zéro.')
}

async function copier() {
  try {
    await navigator.clipboard.writeText(adresse.value)
    copie.value = true
    setTimeout(() => { copie.value = false }, 2000)
  } catch { /* sélection manuelle possible */ }
}
</script>

<template>
  <main>
    <h1>Page de présentation</h1>
    <p>Une page qui présente Trait d'union à une famille, un aidant ou un EHPAD, à partager par un lien.
      Son adresse est secrète et elle n'est jamais indexée par les moteurs de recherche : seules les personnes
      qui ont le lien peuvent l'ouvrir.</p>

    <template v-if="config">
      <section v-if="config.actif && config.cle" class="carte">
        <div class="entete">
          <strong>Lien à partager</strong>
          <span class="pastille" :title="resumeVisites"><Icone nom="oeil" class="en-ligne" /> {{ config.visites }} visite{{ config.visites > 1 ? 's' : '' }}</span>
        </div>
        <div class="ligne-lien">
          <input type="text" readonly :value="adresse" @click="$event.target.select()" />
          <button type="button" class="secondaire" @click="copier"><Icone nom="copier" class="en-ligne" /> {{ copie ? 'Copié' : 'Copier' }}</button>
        </div>
        <p class="aide">{{ resumeVisites }} Une visite est comptée une fois par onglet ; l'aperçu ouvert d'ici ne compte pas.
          Rien n'est enregistré sur les visiteurs.</p>
        <div class="actions">
          <a :href="`${adresse}?apercu=1`" target="_blank" rel="noopener" class="bouton-lien"><Icone nom="ouvrir" class="en-ligne" /> Voir la page</a>
          <button type="button" class="secondaire" :disabled="occupe" @click="changerAdresse"><Icone nom="repeter" class="en-ligne" /> Nouvelle adresse</button>
          <button v-if="config.visites" type="button" class="secondaire" :disabled="occupe" @click="remettreAZero">Remettre le compteur à zéro</button>
        </div>
      </section>

      <form class="carte" @submit.prevent="enregistrer">
        <label class="case"><input v-model="f.afficherContact" type="checkbox" /> Afficher le bouton « Me contacter »</label>
        <span class="aide">Désactivé, le contact n'est pas du tout envoyé au navigateur des visiteurs.</span>
        <template v-if="f.afficherContact">
          <label>Moyen de contact
            <select v-model="f.typeContact">
              <option v-for="(nom, type) in TYPES" :key="type" :value="type">{{ nom }}</option>
            </select>
          </label>
          <label>{{ TYPES[f.typeContact] }}
            <input v-model="f.contact" :placeholder="EXEMPLES[f.typeContact]" autocomplete="off" maxlength="300" />
            <span class="aide">Le lien est codé dans la page pour ne pas être lu par les robots qui collectent les adresses.</span>
          </label>
        </template>
        <label class="case"><input v-model="f.actif" type="checkbox" /> Activer la page de présentation</label>
        <button :disabled="occupe">Enregistrer</button>
      </form>
    </template>

    <p v-if="message" class="succes">{{ message }}</p>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
  </main>
</template>

<style scoped>
.entete { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.pastille {
  font-size: 0.85rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--vert-clair);
  color: var(--vert);
  cursor: help;
  white-space: nowrap;
}
.ligne-lien { display: flex; gap: 8px; }
.ligne-lien input { flex: 1; min-width: 0; font-family: monospace; font-size: 0.85rem; }
.ligne-lien button, .actions button, .bouton-lien { display: inline-flex; align-items: center; gap: 6px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.bouton-lien {
  padding: 10px 16px;
  border-radius: 8px;
  background: var(--vert-clair);
  color: var(--vert);
  text-decoration: none;
}
.case { flex-direction: row; align-items: center; gap: 8px; font-weight: normal; }
form > .aide { margin-top: -8px; }
form button { align-self: flex-start; }
.succes { color: var(--vert); font-weight: 500; }
</style>
