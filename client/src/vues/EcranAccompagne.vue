<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { session } from '../session.js'
import { rendezVousAccompagne, debutDuJour, ajouterJours, horaire } from '../agenda.js'
import { nouveautesPhotos } from '../photos.js'
import { auRetour } from '../miseAJour.js'

// Écran de la personne accompagnée : très lisible, sans bouton de déconnexion.
const maintenant = ref(new Date())
let minuterie
// Ce qui est prévu aujourd'hui, rechargé de temps en temps
const programme = ref([])
const chargerProgramme = async () => {
  const jour = debutDuJour()
  // Les rendez-vous privés n'apparaissent que dans l'agenda
  programme.value = (await rendezVousAccompagne(session.cercles, jour, ajouterJours(jour, 1))).filter((r) => !r.masque)
}
// Albums où des photos sont arrivées depuis la dernière visite
const photos = ref(null)
const chargerPhotos = async () => {
  photos.value = await nouveautesPhotos(session.cercles)
}
const nouvellesPhotos = computed(() => photos.value?.albums ?? [])
const nombreNouvelles = computed(() => nouvellesPhotos.value.reduce((n, a) => n + a.nouvelles, 0))
// Un seul album concerné : on l'ouvre directement ; sinon le choix des albums (avec pastilles)
const lienPhotos = computed(() => nouvellesPhotos.value.length === 1 ? nouvellesPhotos.value[0].lien : '/photos')
const recharger = () => {
  chargerProgramme()
  chargerPhotos()
}
let minuterieProgramme
let arreterRetour
onMounted(() => {
  minuterie = setInterval(() => (maintenant.value = new Date()), 30_000)
  recharger()
  minuterieProgramme = setInterval(recharger, 5 * 60_000)
  arreterRetour = auRetour(recharger)
})
onUnmounted(() => {
  clearInterval(minuterie)
  clearInterval(minuterieProgramme)
  arreterRetour?.()
})

const jour = () => maintenant.value.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const heure = () => maintenant.value.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const moment = () => {
  const h = maintenant.value.getHours()
  return h < 12 ? 'C\'est le matin.' : h < 18 ? 'C\'est l\'après-midi.' : 'C\'est le soir.'
}
</script>

<template>
  <main class="accompagne">
    <p class="bonjour">Bonjour {{ session.utilisateur.prenom }}</p>
    <p class="jour">Nous sommes {{ jour() }}</p>
    <p class="heure">{{ heure() }}</p>
    <p class="moment">{{ moment() }}</p>
    <div class="cartes">
    <RouterLink v-if="programme.length" to="/agenda" class="programme">
      <span class="titre-programme">Aujourd'hui</span>
      <span v-for="rdv in programme.slice(0, 3)" :key="rdv.id" class="ligne-programme">
        <strong>{{ horaire(rdv) }}</strong> {{ rdv.titre }}
      </span>
      <span v-if="programme.length > 3" class="suite">et {{ programme.length - 3 }} autre{{ programme.length > 4 ? 's' : '' }}…</span>
    </RouterLink>
    <RouterLink v-if="nouvellesPhotos.length" :to="lienPhotos" class="photos">
      <img v-if="nouvellesPhotos[0].couverture" :src="nouvellesPhotos[0].couverture" alt="" class="miniature" />
      <span v-else class="miniature vide" aria-hidden="true">🖼️</span>
      <span class="texte-photos">
        <strong>{{ nombreNouvelles }} nouvelle{{ nombreNouvelles > 1 ? 's' : '' }} photo{{ nombreNouvelles > 1 ? 's' : '' }}</strong>
        <span class="noms">{{ nouvellesPhotos.map((a) => a.nom).join(', ') }}</span>
      </span>
    </RouterLink>
    <RouterLink v-else-if="photos?.total" to="/photos" class="photos calme">
      <span class="emoji" aria-hidden="true">🖼️</span> Pas de nouvelle photo
    </RouterLink>
    </div>
  </main>
</template>

<style scoped>
.accompagne {
  max-width: none;
  flex: 1;
  min-height: 0;
  overflow-y: auto; /* la barre du bas reste visible si l'écran est petit */
  display: flex;
  flex-direction: column;
  justify-content: safe center;
  text-align: center;
}
.bonjour { font-size: 3rem; font-weight: 700; color: var(--bleu-nuit); margin: 0; }
.jour { font-size: 2rem; margin: 16px 0 0; text-transform: none; }
.heure { font-size: 4rem; font-weight: 700; color: var(--vert); margin: 8px 0; }
.moment { font-size: 1.6rem; color: var(--gris); }
.programme {
  align-self: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--vert-clair);
  border-radius: 24px;
  padding: 16px 28px;
  margin-top: 8px;
  text-decoration: none;
  color: var(--bleu-nuit);
  font-size: 1.6rem;
}
.titre-programme { font-weight: 700; color: var(--vert); }
.cartes {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  gap: 20px;
  margin-top: 8px;
}
.cartes > * { min-width: 0; }
.cartes .programme { align-self: stretch; justify-content: center; margin-top: 0; }
/* Nouvelles photos : une seule ligne compacte, pour laisser la place aux autres éléments */
.photos {
  align-self: center;
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 520px;
  background: #fdf1e4;
  border-radius: 20px;
  padding: 10px 20px 10px 10px;
  color: var(--bleu-nuit);
  text-decoration: none;
  text-align: left;
}
.miniature { flex: none; width: 72px; height: 54px; object-fit: cover; border-radius: 12px; }
.miniature.vide { display: flex; align-items: center; justify-content: center; background: #f3f0ea; font-size: 2rem; }
.texte-photos { display: flex; flex-direction: column; min-width: 0; }
.texte-photos strong { font-size: 1.5rem; color: #c2610c; }
.noms { font-size: 1.15rem; color: var(--gris); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.photos.calme { font-size: 1.4rem; color: var(--gris); background: #f3f0ea; padding: 12px 20px; gap: 10px; }
.ligne-programme strong { color: var(--vert); margin-right: 8px; }
.suite { color: var(--gris); font-size: 1.3rem; }
/* Smartphone */
@media (max-width: 600px) {
  .accompagne { padding: 16px 12px; }
  .bonjour { font-size: 2.2rem; }
  .jour { font-size: 1.5rem; }
  .heure { font-size: 3.4rem; }
  .moment { font-size: 1.3rem; margin: 0 0 8px; }
  .programme { align-self: stretch; padding: 14px 16px; font-size: 1.25rem; border-radius: 18px; }
  .ligne-programme strong { display: block; margin: 0; }
  .cartes { flex-direction: column; flex-wrap: nowrap; align-items: stretch; gap: 12px; }
  .photos { align-self: stretch; max-width: none; padding: 8px 12px 8px 8px; border-radius: 16px; gap: 10px; }
  .miniature { width: 60px; height: 45px; }
  .texte-photos strong { font-size: 1.2rem; }
  .noms { font-size: 1rem; }
  .photos.calme { font-size: 1.15rem; justify-content: center; }
}
</style>
