<script setup>
import { ref, watch } from 'vue'
import { api } from '../api.js'
import { utiliserCercle, heure, copier } from '../cercle.js'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import Icone from '../navigation/Icone.vue'
import UtilisationAccompagne from './UtilisationAccompagne.vue'

// Page « Personnes accompagnées » d'un cercle : personnes accompagnées et configuration de leurs appareils
const { url, cercle, erreur, charger, action, accompagnes } = utiliserCercle()

// Utilisation de l'application par chaque personne accompagnée (aidants seulement)
const utilisation = ref([])
watch(() => cercle.value?.id, async (id) => {
  utilisation.value = []
  if (!id || !cercle.value.peutGerer) return
  try {
    utilisation.value = await api('GET', `${url.value}/utilisation`)
  } catch { /* bloc laissé vide */ }
}, { immediate: true })
const utilisationDe = (m) => utilisation.value.find((u) => u.utilisateurId === m.utilisateurId) ?? null
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

// Alertes reçues par la personne accompagnée sur ses appareils
const changerAlertes = (m, cle, valeur) => action(async () => {
  const { appareils, ...preferences } = m.alertes
  m.alertes = { ...await api('PUT', `${url.value}/membres/${m.id}/alertes`, { ...preferences, [cle]: valeur }), appareils }
})

const retirer = (m) => action(async () => {
  if (!confirm(`Retirer ${m.prenom} du cercle ?`)) return
  await api('DELETE', `${url.value}/membres/${m.id}`)
  await charger()
})
// Adresse courte qui télécharge la dernière APK (server/index.js)
const adresseApk = `${location.host}/apk`
</script>

<template>
  <main>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <template v-if="cercle">
      <p class="aide surtitre">{{ cercle.nom }}</p>
      <h1>Personnes accompagnées</h1>
      <p class="aide">Chaque personne accompagnée utilise une tablette (ou un téléphone) avec un écran très simple, sans mot de passe.
        Un cercle peut en réunir plusieurs, un couple par exemple : chaque appareil est configuré pour une seule personne.</p>

      <p v-if="!accompagnes.length" class="aide">Personne pour l'instant.</p>
      <div v-for="m in accompagnes" :key="m.id" class="carte">
        <div class="ligne">
          <strong>{{ m.prenom }} {{ m.nom }}</strong>
          <span class="aide">{{ m.appareils }} appareil{{ m.appareils > 1 ? 's' : '' }} connecté{{ m.appareils > 1 ? 's' : '' }}</span>
        </div>
        <p v-if="m.appareilsAMettreAJour" class="mise-a-jour">
          <Icone nom="telecharger" class="en-ligne" />
          Nouvelle version de l'application à installer sur {{ m.appareilsAMettreAJour > 1 ? `${m.appareilsAMettreAJour} de ses appareils` : 'son appareil' }} :
          sur l'appareil de {{ m.prenom }}, ouvrez Chrome à l'adresse <strong>{{ adresseApk }}</strong>,
          puis ouvrez le fichier téléchargé et touchez « Mettre à jour ».
        </p>
        <UtilisationAccompagne v-if="cercle.peutGerer" :utilisation="utilisationDe(m)" :prenom="m.prenom" :appareils="m.appareils" />
        <div v-if="m.alertes" class="alertes">
          <span class="titre-alertes"><Icone nom="cloche" class="en-ligne" /> Alertes</span>
          <label class="case"><input type="checkbox" :checked="m.alertes.rendezVous" @change="changerAlertes(m, 'rendezVous', $event.target.checked)" /> Rappels de rendez-vous</label>
          <label class="case"><input type="checkbox" :checked="m.alertes.photos" @change="changerAlertes(m, 'photos', $event.target.checked)" /> Nouvelles photos</label>
          <label class="case"><input type="checkbox" :checked="m.alertes.anniversaires" @change="changerAlertes(m, 'anniversaires', $event.target.checked)" /> Anniversaires de la famille</label>
          <span class="aide">{{ m.alertes.appareils
            ? `Reçues sur ${m.alertes.appareils} appareil${m.alertes.appareils > 1 ? 's' : ''}.`
            : `Pas encore activées : sur l'appareil de ${m.prenom}, touchez « Recevoir les alertes » sur l'écran d'accueil.` }}</span>
        </div>
        <div v-if="cercle.peutGerer" class="actions">
          <button class="secondaire" @click="genererCode(m)">Configurer un appareil</button>
          <BoutonIcone v-if="m.appareils" icone="deconnexion" libelle="Déconnecter ses appareils" danger @click="deconnecterAppareils(m)" />
          <BoutonIcone icone="effacer" :libelle="`Retirer ${m.prenom} du cercle`" danger @click="retirer(m)" />
        </div>
      </div>

      <div v-if="codeAppareil" class="carte encart">
        <p>Sur l'appareil de {{ codeAppareil.prenom }}, ouvrez <strong>{{ codeAppareil.lien }}</strong>
          ou allez sur la page de connexion, choisissez « Le configurer avec un code » et saisissez :</p>
        <p class="code">{{ codeAppareil.code }}</p>
        <p class="aide">Valable une seule fois, jusqu'au {{ heure(codeAppareil.expireLe) }}.</p>
        <BoutonIcone icone="copier" libelle="Copier le lien" @click="copier(codeAppareil.lien)" />
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
.mise-a-jour {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--vert-clair);
  color: var(--bleu-nuit);
  font-size: 0.95rem;
}
.surtitre { margin: 0; }
.ligne { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.alertes { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #ebe8e3; }
.titre-alertes { font-weight: 600; color: var(--bleu-nuit); }
.alertes .aide { flex-basis: 100%; margin: 0; }
.case { flex-direction: row; align-items: center; gap: 6px; font-weight: normal; }
.encart { background: var(--vert-clair); border-radius: 8px; padding: 12px; margin-top: 12px; }
.code { font-size: 2.5rem; font-weight: 700; letter-spacing: 0.3em; text-align: center; color: var(--bleu-nuit); margin: 8px 0; }
</style>
