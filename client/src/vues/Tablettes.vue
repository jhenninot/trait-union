<script setup>
import { ref } from 'vue'
import { api } from '../api.js'
import { utiliserCercle, heure, copier } from '../cercle.js'

// Page « Tablettes » d'un cercle : personnes accompagnées et configuration de leurs appareils
const { url, cercle, erreur, charger, action, accompagnes } = utiliserCercle()
const codeAppareil = ref(null) // { prenom, code, lien, expireLe }
const nouvelAccompagne = ref({ prenom: '', nom: '' })

const ajouterAccompagne = () => action(async () => {
  await api('POST', `${url.value}/accompagnes`, nouvelAccompagne.value)
  nouvelAccompagne.value = { prenom: '', nom: '' }
  await charger()
})

const genererCode = (m) => action(async () => {
  const { code, expireLe } = await api('POST', `${url.value}/membres/${m.id}/code`)
  codeAppareil.value = { prenom: m.prenom, code, lien: `${location.origin}/appareil?code=${code}`, expireLe }
})

const deconnecterAppareils = (m) => action(async () => {
  if (!confirm(`Déconnecter tous les appareils de ${m.prenom} ?`)) return
  await api('POST', `${url.value}/membres/${m.id}/deconnecter`)
  await charger()
})

const retirer = (m) => action(async () => {
  if (!confirm(`Retirer ${m.prenom} du cercle ?`)) return
  await api('DELETE', `${url.value}/membres/${m.id}`)
  await charger()
})
</script>

<template>
  <main>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <template v-if="cercle">
      <p class="aide surtitre">{{ cercle.nom }}</p>
      <h1>Tablettes</h1>
      <p class="aide">La personne accompagnée utilise une tablette (ou un téléphone) avec un écran très simple, sans mot de passe.</p>

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
    </template>
  </main>
</template>

<style scoped>
.surtitre { margin: 0; }
.ligne { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.encart { background: var(--vert-clair); border-radius: 8px; padding: 12px; margin-top: 12px; }
.code { font-size: 2.5rem; font-weight: 700; letter-spacing: 0.3em; text-align: center; color: var(--bleu-nuit); margin: 8px 0; }
</style>
