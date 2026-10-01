<script setup>
import { computed } from 'vue'
import { etatUtilisation, quandPassage, LIBELLES_ECRANS } from '../utilisation.js'
import Icone from '../navigation/Icone.vue'

// Bloc « Utilisation » d'une personne accompagnée (page Personnes accompagnées, aidants) :
// dernier passage, jours d'utilisation, frise des 30 derniers jours, écrans ouverts, photos pas vues.
// Des nombres seulement, jamais ce qui a été regardé (server/utilisation.js).
const props = defineProps({
  utilisation: { type: Object, default: null },
  prenom: { type: String, required: true },
  appareils: { type: Number, default: 0 }
})

const etat = computed(() => etatUtilisation(props.utilisation, props.appareils))
const frise = computed(() => props.utilisation?.frise ?? [])
const intensite = (n) => (n === 0 ? 0 : n < 4 ? 1 : n < 10 ? 2 : 3)
const dateCourte = (jour) => new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const titreJour = (j) => `${dateCourte(j.jour)} : ${j.ecrans ? `${j.ecrans} écran${j.ecrans > 1 ? 's' : ''} ouvert${j.ecrans > 1 ? 's' : ''}` : 'pas utilisée'}`

const ecrans = computed(() => Object.entries(props.utilisation?.ecrans ?? {})
  .filter(([, n]) => n > 0)
  .sort((a, b) => b[1] - a[1])
  .map(([cle, n]) => ({ cle, n, ...LIBELLES_ECRANS[cle] })))

// Suivi commencé il y a moins de 30 jours : la frise ne remonte pas plus loin
const suiviRecent = computed(() => {
  const depuis = props.utilisation?.suiviDepuis
  return depuis && (Date.now() - new Date(`${depuis}T12:00:00`)) < 29 * 86_400_000 ? depuis : null
})
</script>

<template>
  <div class="utilisation">
    <span class="titre"><Icone nom="statistiques" class="en-ligne" /> Utilisation</span>
    <p class="etat" :class="etat.niveau">
      <Icone :nom="etat.niveau === 'ok' ? 'coche' : etat.niveau === 'aucun' ? 'tablette' : 'attention'" class="en-ligne" />
      {{ etat.texte }}<template v-if="etat.niveau !== 'ok' && utilisation?.dernierPassage"> (dernier passage {{ quandPassage(utilisation.dernierPassage) }})</template>
    </p>

    <template v-if="utilisation?.dernierPassage">
      <p class="jours">
        <strong>{{ utilisation.jours7 }}</strong> jour{{ utilisation.jours7 > 1 ? 's' : '' }} sur les 7 derniers
        · <strong>{{ utilisation.jours30 }}</strong> sur 30
      </p>
      <div class="frise" role="img" :aria-label="`${prenom} a utilisé l'application ${utilisation.jours30} jours sur les 30 derniers`">
        <span v-for="j in frise" :key="j.jour" class="case-jour" :class="`n${intensite(j.ecrans)}`" :title="titreJour(j)" />
      </div>
      <div class="bornes aide">
        <span>{{ dateCourte(frise[0].jour) }}</span>
        <span>Aujourd'hui</span>
      </div>

      <div v-if="ecrans.length" class="ecrans">
        <span class="aide">Écrans ouverts sur 30 jours :</span>
        <span v-for="e in ecrans" :key="e.cle" class="ecran"><Icone :nom="e.icone" class="en-ligne" /> {{ e.nom }} <strong>{{ e.n }}</strong></span>
      </div>
    </template>

    <p v-if="utilisation && appareils" class="photos" :class="{ ok: !utilisation.photosNonVues }">
      <Icone :nom="utilisation.photosNonVues ? 'photo' : 'coche'" class="en-ligne" />
      {{ utilisation.photosNonVues
        ? `${utilisation.photosNonVues} photo${utilisation.photosNonVues > 1 ? 's' : ''} pas encore vue${utilisation.photosNonVues > 1 ? 's' : ''}`
        : 'A vu toutes les photos' }}
    </p>
    <p v-if="suiviRecent" class="aide note">Suivi depuis le {{ new Date(`${suiviRecent}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) }}.</p>
  </div>
</template>

<style scoped>
.utilisation { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #ebe8e3; }
.titre { font-weight: 600; color: var(--bleu-nuit); }
.utilisation p { margin: 0; }
.etat { display: flex; align-items: center; gap: 6px; font-weight: 500; }
.etat.ok { color: var(--vert); }
.etat.attention { color: #a35a12; }
.etat.alerte { color: var(--rouge); }
.etat.aucun { color: var(--gris); }
.jours { font-size: 0.95rem; }
.jours strong { color: var(--bleu-nuit); }
.frise { display: grid; grid-template-columns: repeat(30, 1fr); gap: 3px; }
.case-jour { aspect-ratio: 1; border-radius: 3px; background: #efede8; min-width: 0; }
.case-jour.n1 { background: #b9dfcd; }
.case-jour.n2 { background: #5fb08d; }
.case-jour.n3 { background: var(--vert); }
.bornes { display: flex; justify-content: space-between; font-size: 0.78rem; margin-top: -4px; }
.ecrans { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ecrans .aide { flex-basis: 100%; }
.ecran {
  display: inline-flex; align-items: center; gap: 5px; font-size: 0.88rem;
  padding: 3px 10px; border-radius: 999px; background: var(--vert-clair); color: var(--bleu-nuit);
}
.ecran .icone { color: var(--vert); }
.photos { display: flex; align-items: center; gap: 6px; font-size: 0.95rem; color: #a35a12; }
.photos.ok { color: var(--vert); }
.note { font-size: 0.8rem; }
@media (max-width: 600px) {
  .frise { gap: 2px; }
}
</style>
