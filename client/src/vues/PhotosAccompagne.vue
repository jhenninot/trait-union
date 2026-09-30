<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { session } from '../session.js'
import { photosAccompagne, albumsAccompagne, marquerVu, dateEnvoi } from '../photos.js'
import { auRetour } from '../miseAJour.js'
import { balayage as vBalayage, prechargerVoisines } from '../balayage.js'
import { parler, lectureDisponible } from '../voix.js'

// « Mes photos » sur la tablette de la personne accompagnée. S'il y a des albums, on choisit
// d'abord un album (grandes vignettes) ; puis une photo en grand à la fois, deux gros boutons
// pour passer à la suivante, et un diaporama qui défile tout seul.
// Glisser le doigt sur la photo passe aussi à la suivante ou à la précédente.
// /photos?album=<id> ouvre directement un album (?album=tous : toutes les photos), depuis l'accueil.
const DELAI_DIAPORAMA = 8000
const albums = ref([])
const album = ref(undefined) // undefined : choix de l'album ; null : toutes les photos ; sinon l'album
const liste = ref([])
const charge = ref(false)
const index = ref(0)
const diaporama = ref(false)
let minuterieDiaporama
let minuterieRechargement
let arreterRetour
const route = useRoute()
let demande = route.query.album

async function charger() {
  albums.value = await albumsAccompagne(session.cercles)
  // Sans album, on montre directement toutes les photos
  if (!albums.value.length && album.value === undefined) album.value = null
  // Album demandé par l'accueil (une seule fois)
  if (demande && album.value === undefined) {
    album.value = demande === 'tous' ? null : albums.value.find((a) => a.id === demande)
  }
  demande = null
  if (album.value) album.value = albums.value.find((a) => a.id === album.value.id) ?? null
  if (album.value !== undefined) await chargerPhotos()
  charge.value = true
}

async function chargerPhotos() {
  const idActuelle = liste.value[index.value]?.id
  liste.value = await photosAccompagne(session.cercles, album.value)
  // Rester sur la même photo quand de nouvelles arrivent
  const i = liste.value.findIndex((p) => p.id === idActuelle)
  index.value = i >= 0 ? i : 0
  // Les photos de l'album sont vues : elles ne sont plus « nouvelles » sur l'accueil
  const a = album.value
  marquerVu(session.cercles, a).then(() => {
    if (a) a.nouvelles = 0
    else albums.value.forEach((x) => (x.nouvelles = 0))
  })
}

async function ouvrirAlbum(a) {
  liste.value = []
  index.value = 0
  album.value = a
  await chargerPhotos()
}

function retourAlbums() {
  if (diaporama.value) basculerDiaporama()
  album.value = undefined
  liste.value = []
}
onMounted(() => {
  charger()
  minuterieRechargement = setInterval(charger, 10 * 60_000)
  arreterRetour = auRetour(charger) // nouvelles photos dès qu'on revient sur l'appli
})
onUnmounted(() => {
  clearInterval(minuterieRechargement)
  arreterRetour?.()
  clearInterval(minuterieDiaporama)
})

const photo = computed(() => liste.value[index.value])

// Légende et auteur lus à voix haute
const lecture = lectureDisponible()
const lirePhoto = () => {
  const p = photo.value
  parler(`${p.legende ? `${p.legende}. ` : ''}Photo envoyée par ${p.creeParPrenom ?? 'la famille'}, le ${dateEnvoi(p.creeLe)}.`)
}
watch(photo, () => prechargerVoisines(liste.value, index.value))
const titre = computed(() => album.value?.nom ?? 'Toutes les photos')

function aller(sens) {
  const n = liste.value.length
  if (n) index.value = (index.value + sens + n) % n
}

function basculerDiaporama() {
  diaporama.value = !diaporama.value
  clearInterval(minuterieDiaporama)
  if (diaporama.value) minuterieDiaporama = setInterval(() => aller(1), DELAI_DIAPORAMA)
}

// Toucher une flèche arrête le diaporama
function manuel(sens) {
  if (diaporama.value) basculerDiaporama()
  aller(sens)
}
</script>

<template>
  <main class="photos" :class="{ plein: diaporama }">
    <template v-if="album === undefined">
      <h1>Mes photos</h1>
      <div class="albums">
        <button class="album" @click="ouvrirAlbum(null)">
          <span class="couverture toutes">🖼️</span>
          <span class="nom">Toutes les photos</span>
        </button>
        <button v-for="a in albums" :key="a.id" class="album" @click="ouvrirAlbum(a)">
          <img v-if="a.couverture" :src="a.couverture" alt="" class="couverture" />
          <span class="nom">{{ a.nom }}</span>
          <span v-if="a.nouvelles" class="nouvelles">{{ a.nouvelles }} nouvelle{{ a.nouvelles > 1 ? 's' : '' }}</span>
        </button>
      </div>
    </template>
    <template v-else-if="photo">
      <div v-if="albums.length && !diaporama" class="haut">
        <button class="retour" @click="retourAlbums">◀ Albums</button>
        <span class="titre-album">{{ titre }}</span>
      </div>
      <div v-balayage="{ suivante: () => manuel(1), precedente: () => manuel(-1) }" class="cadre" @click="diaporama && basculerDiaporama()">
        <img :key="photo.id" :src="photo.ecran" :alt="photo.legende || 'Photo de famille'" />
      </div>
      <p v-if="photo.legende" class="legende">{{ photo.legende }}</p>
      <p class="envoi">Envoyée par {{ photo.creeParPrenom ?? 'la famille' }}, {{ dateEnvoi(photo.creeLe) }}</p>
      <p v-if="diaporama" class="envoi">Touchez la photo pour arrêter le diaporama</p>
      <div v-else class="commandes">
        <button class="fleche" aria-label="Photo précédente" :disabled="liste.length < 2" @click="manuel(-1)">◀</button>
        <button class="diaporama" @click="basculerDiaporama">▶ Diaporama</button>
        <button v-if="lecture" class="diaporama" aria-label="Écouter la légende" @click="lirePhoto">🔊</button>
        <button class="fleche" aria-label="Photo suivante" :disabled="liste.length < 2" @click="manuel(1)">▶</button>
      </div>
    </template>
    <template v-else-if="charge">
      <div v-if="albums.length" class="haut">
        <button class="retour" @click="retourAlbums">◀ Albums</button>
      </div>
      <p class="vide">Pas encore de photo.<br />Votre famille peut vous en envoyer.</p>
    </template>
  </main>
</template>

<style scoped>
.photos {
  max-width: none;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 24px;
  gap: 8px;
}
.cadre { flex: 1; min-height: 0; width: 100%; display: flex; align-items: center; justify-content: center; }
.cadre img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 16px; box-shadow: 0 4px 16px rgb(0 0 0 / 0.12); }
.plein { background: #111; }
.plein .cadre img { border-radius: 0; box-shadow: none; }
.plein .legende, .plein .envoi { color: white; }
.legende { font-size: 2rem; font-weight: 700; color: var(--bleu-nuit); margin: 4px 0 0; text-align: center; }
.envoi { font-size: 1.4rem; color: var(--gris); margin: 0; text-align: center; }
.commandes { display: flex; gap: 16px; width: 100%; max-width: 900px; margin-top: 8px; }
.commandes button { border-radius: 20px; font-weight: 700; background: #f3f0ea; color: var(--bleu-nuit); }
.fleche { flex: 1; font-size: 2.6rem; padding: 14px; }
.diaporama { flex: 1.4; font-size: 1.6rem; padding: 14px; }
h1 { font-size: 2.4rem; color: var(--bleu-nuit); margin: 0 0 8px; align-self: flex-start; }
.albums {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 20px;
  overflow-y: auto;
  padding: 4px;
}
.album {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 24px;
  background: white;
  color: var(--bleu-nuit);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
}
.album .couverture {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.couverture.toutes { background: var(--vert-clair); font-size: 5rem; }
.album { position: relative; }
.album .nom { font-size: 1.7rem; font-weight: 700; }
.nouvelles {
  position: absolute;
  top: 20px;
  right: 20px;
  background: #c2610c;
  color: white;
  font-size: 1.3rem;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 999px;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.2);
}
.haut { width: 100%; display: flex; align-items: center; gap: 16px; }
.retour { font-size: 1.4rem; font-weight: 700; padding: 12px 22px; border-radius: 18px; background: #f3f0ea; color: var(--bleu-nuit); }
.titre-album { font-size: 1.7rem; font-weight: 700; color: var(--bleu-nuit); }
.vide { flex: 1; display: flex; align-items: center; text-align: center; font-size: 2rem; color: var(--gris); }
@media (max-width: 600px) {
  .photos { padding: 10px 12px; }
  .legende { font-size: 1.4rem; }
  .envoi { font-size: 1.1rem; }
  .fleche { font-size: 2rem; }
  .diaporama { font-size: 1.2rem; }
  h1 { font-size: 1.8rem; }
  .albums { grid-template-columns: 1fr 1fr; gap: 10px; }
  .album { padding: 8px; border-radius: 16px; gap: 6px; }
  .album .nom { font-size: 1.15rem; }
  .nouvelles { top: 12px; right: 12px; font-size: 1rem; padding: 4px 10px; }
  .couverture.toutes { font-size: 3rem; }
  .retour { font-size: 1.1rem; padding: 10px 14px; }
  .titre-album { font-size: 1.2rem; }
}
</style>
