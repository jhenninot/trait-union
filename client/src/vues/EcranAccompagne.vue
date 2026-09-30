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
    <section v-if="nouvellesPhotos.length" class="photos">
      <span class="titre-photos">{{ nombreNouvelles > 1 ? 'Nouvelles photos' : 'Nouvelle photo' }}</span>
      <div class="albums">
        <RouterLink v-for="a in nouvellesPhotos.slice(0, 3)" :key="a.id" :to="a.lien" class="album">
          <img v-if="a.couverture" :src="a.couverture" alt="" class="miniature" />
          <span v-else class="miniature vide">🖼️</span>
          <span class="nom">{{ a.nom }}</span>
          <span class="nombre">{{ a.nouvelles }} nouvelle{{ a.nouvelles > 1 ? 's' : '' }}</span>
        </RouterLink>
      </div>
    </section>
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
.photos {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #fdf1e4;
  border-radius: 24px;
  padding: 16px 20px;
  color: var(--bleu-nuit);
}
.titre-photos { font-size: 1.6rem; font-weight: 700; color: #c2610c; }
.albums { display: flex; gap: 14px; justify-content: center; }
.album {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 190px;
  padding: 8px;
  border-radius: 18px;
  background: white;
  text-decoration: none;
  color: var(--bleu-nuit);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
}
.miniature { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 12px; }
.miniature.vide { display: flex; align-items: center; justify-content: center; background: #f3f0ea; font-size: 3rem; }
.album .nom { font-size: 1.35rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.album .nombre { font-size: 1.15rem; font-weight: 700; color: white; background: #c2610c; border-radius: 999px; padding: 2px 12px; }
.photos.calme { align-self: center; flex-direction: row; align-items: center; font-size: 1.5rem; color: var(--gris); background: #f3f0ea; text-decoration: none; padding: 14px 22px; }
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
  .photos { padding: 12px; border-radius: 18px; }
  .titre-photos { font-size: 1.3rem; }
  .albums { gap: 8px; }
  .album { flex: 1; min-width: 0; width: auto; padding: 6px; border-radius: 14px; }
  .album:nth-child(n + 3) { display: none; } /* deux albums au plus sur un téléphone */
  .album .nom { font-size: 1.05rem; }
  .album .nombre { font-size: 0.95rem; padding: 2px 8px; }
  .photos.calme { font-size: 1.15rem; justify-content: center; }
}
</style>
