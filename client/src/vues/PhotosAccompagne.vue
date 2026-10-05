<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { session } from '../session.js'
import { photosAccompagne, albumsAccompagne, marquerVu, dateEnvoi } from '../photos.js'
import { auRetour } from '../miseAJour.js'
import { balayage as vBalayage, diapos, prechargerVoisines } from '../balayage.js'
import { parler, lectureDisponible } from '../voix.js'
import { choixNatifDisponible, choisirPhotosNatif, partagerPhoto, partageDisponible, telechargerPhoto, telechargementDisponible, recues } from '../partage.js'
import { utiliserPleinEcran } from '../pleinEcran.js'
import { zoom as vZoom } from '../zoom.js'
import { revenir } from '../historique.js'
import Avatar from './Avatar.vue'
import Icone from '../navigation/Icone.vue'
import FenetreCarte from './FenetreCarte.vue'

// « Mes photos » sur la tablette de la personne accompagnée. S'il y a des albums, on choisit
// d'abord un album (grandes vignettes) ; puis une photo en grand à la fois, deux gros boutons
// pour passer à la suivante, et un diaporama qui défile tout seul.
// Glisser le doigt sur la photo passe aussi à la suivante ou à la précédente.
// L'album ouvert est dans l'adresse : /photos?album=<id> (?album=tous : toutes les photos), et le
// plein écran aussi (?plein=1) : le bouton retour revient à l'étape d'avant (plein écran → album
// → choix de l'album). L'accueil ouvre directement un album : le choix est inséré avant.
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
const router = useRouter()
// Album de l'adresse ; sans album du tout, on montre directement toutes les photos
function albumDemande() {
  const id = route.query.album
  if (!id) return albums.value.length ? undefined : null
  return id === 'tous' ? null : (albums.value.find((a) => a.id === id) ?? null)
}

async function charger() {
  albums.value = await albumsAccompagne(session.cercles)
  album.value = albumDemande()
  if (album.value !== undefined) await chargerPhotos()
  charge.value = true
}

// Changement d'album par l'adresse (bouton d'album, bouton retour)
watch(() => route.query.album, async () => {
  if (route.path !== '/photos' || !charge.value) return
  if (diaporama.value) basculerDiaporama()
  liste.value = []
  index.value = 0
  album.value = albumDemande()
  if (album.value !== undefined) await chargerPhotos()
})

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

function ouvrirAlbum(a) {
  router.push({ path: '/photos', query: { album: a?.id ?? 'tous' } })
}

function retourAlbums() {
  revenir(router, { path: '/photos' })
}
onMounted(() => {
  // Arrivée directe dans un album (depuis l'accueil) : l'étape « choix de l'album » est ajoutée
  // avant, pour que le bouton retour y mène
  if (route.query.album && window.history.state?.back !== '/photos') {
    const albumDirect = route.fullPath
    router.replace('/photos').then(() => router.push(albumDirect))
  }
  charger()
  minuterieRechargement = setInterval(charger, 10 * 60_000)
  arreterRetour = auRetour(charger) // nouvelles photos dès qu'on revient sur l'appli
})
onUnmounted(() => {
  clearInterval(minuterieRechargement)
  arreterRetour?.()
  clearInterval(minuterieDiaporama)
  clearTimeout(minuterieAide)
})

const photo = computed(() => liste.value[index.value])

// Légende et auteur lus à voix haute
const lecture = lectureDisponible()
const partage = partageDisponible()
const carte = ref(null) // photo dont on montre le lieu de prise de vue
const telechargement = telechargementDisponible()
const lirePhoto = () => {
  const p = photo.value
  parler(`${p.legende ? `${p.legende}. ` : ''}Photo envoyée par ${p.creeParPrenom ?? 'la famille'}, le ${dateEnvoi(p.creeLe)}.`)
}
watch(photo, () => prechargerVoisines(liste.value, index.value))
// Photos choisies sur l'appareil : même écran que les photos partagées depuis une autre
// application (choix de l'album, puis « Envoyer »)
// Dans l'application Android : sélecteur natif, qui garde le lieu de prise de vue
const choixNatif = choixNatifDisponible()
async function choisirNatif(evenement) {
  if (!choixNatif) return
  evenement.preventDefault()
  envoyerFichiers(await choisirPhotosNatif())
}
function ajouter(evenement) {
  const fichiers = [...evenement.target.files]
  evenement.target.value = ''
  envoyerFichiers(fichiers)
}
function envoyerFichiers(fichiers) {
  if (!fichiers.length) return
  recues.fichiers = [...recues.fichiers, ...fichiers]
  router.push('/recevoir')
}
const titre = computed(() => album.value?.nom ?? 'Toutes les photos')

function aller(sens) {
  const n = liste.value.length
  if (n) index.value = (index.value + sens + n) % n
}

// Le diaporama passe en plein écran ; toucher la photo (ou le bouton retour) l'arrête et revient
const { pleinEcran, entrer: entrerPleinEcran, sortir: sortirPleinEcran, basculer: basculerPleinEcran } = utiliserPleinEcran()
const aideDiaporama = ref(false) // « Touchez l'écran pour arrêter », les premières secondes
let minuterieAide
function relancerMinuterie() {
  clearInterval(minuterieDiaporama)
  if (diaporama.value) minuterieDiaporama = setInterval(() => aller(1), DELAI_DIAPORAMA)
}
function basculerDiaporama() {
  diaporama.value = !diaporama.value
  relancerMinuterie()
  clearTimeout(minuterieAide)
  aideDiaporama.value = diaporama.value
  if (diaporama.value) {
    entrerPleinEcran()
    minuterieAide = setTimeout(() => (aideDiaporama.value = false), 4000)
  } else sortirPleinEcran()
}
watch(pleinEcran, (oui) => {
  if (!oui && diaporama.value) basculerDiaporama()
})

// Toucher la photo : arrête le diaporama, sinon l'affiche en plein écran (ou revient)
function toucherPhoto() {
  if (diaporama.value) basculerDiaporama()
  else basculerPleinEcran()
}

// Toucher une flèche arrête le diaporama
function manuel(sens) {
  if (diaporama.value) basculerDiaporama()
  aller(sens)
}
// Glisser le doigt pendant le diaporama change de photo sans l'arrêter
function glisser(sens) {
  aller(sens)
  relancerMinuterie()
}
</script>

<template>
  <main class="photos" :class="{ plein: diaporama }">
    <template v-if="album === undefined">
      <div class="entete">
        <h1>Mes photos</h1>
        <label class="ajouter"><Icone nom="appareil" class="en-ligne" /> Ajouter des photos<input type="file" accept="image/*" multiple @click="choisirNatif" @change="ajouter" /></label>
      </div>
      <div class="albums">
        <button class="album" @click="ouvrirAlbum(null)">
          <span class="couverture toutes"><Icone nom="albums" class="em" /></span>
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
      <div v-if="!diaporama" class="haut">
        <button v-if="albums.length" class="retour" @click="retourAlbums"><Icone nom="precedent" class="en-ligne" /> Albums</button>
        <span v-if="albums.length" class="titre-album">{{ titre }}</span>
        <label class="ajouter"><Icone nom="appareil" class="en-ligne" /> Ajouter des photos<input type="file" accept="image/*" multiple @click="choisirNatif" @change="ajouter" /></label>
      </div>
      <div v-balayage="{ suivante: () => glisser(1), precedente: () => glisser(-1), duree: diaporama ? 900 : 450 }" v-zoom="pleinEcran" class="cadre" :class="{ 'plein-ecran': pleinEcran }" @click="toucherPhoto">
        <div class="piste">
          <div v-for="d in diapos(liste, index, true)" :key="d.cle" :data-role="d.role" :data-id="d.photo.id">
            <img :src="d.photo.ecran" :alt="d.photo.legende || 'Photo de famille'" />
          </div>
        </div>
        <template v-if="diaporama && pleinEcran">
          <p v-if="aideDiaporama" class="aide-diaporama">Touchez l'écran pour arrêter le diaporama</p>
          <p v-if="photo.legende" class="legende-diaporama">{{ photo.legende }}</p>
        </template>
      </div>
      <p v-if="photo.legende" class="legende">{{ photo.legende }}</p>
      <p class="envoi">
        <Avatar v-if="photo.creeParPrenom" :src="photo.creeParAvatar" :prenom="photo.creeParPrenom" :taille="44" />
        <span>Envoyée par {{ photo.creeParPrenom ?? 'la famille' }}, {{ dateEnvoi(photo.creeLe) }}</span>
      </p>
      <div class="commandes">
        <button class="fleche" aria-label="Photo précédente" :disabled="liste.length < 2" @click="manuel(-1)"><Icone nom="precedent" class="en-ligne" /></button>
        <button class="diaporama" @click="basculerDiaporama"><Icone nom="lecture" class="en-ligne" /> Diaporama</button>
        <button v-if="lecture" class="diaporama" aria-label="Écouter la légende" @click="lirePhoto"><Icone nom="son" class="en-ligne" /></button>
        <button v-if="partage" class="diaporama" aria-label="Partager" title="Partager" @click="partagerPhoto(photo)"><Icone nom="partager" class="en-ligne" /></button>
        <button v-if="photo.latitude != null" class="diaporama" aria-label="Où a été prise la photo ?" title="Où a été prise la photo ?" @click="carte = photo"><Icone nom="lieu" class="en-ligne" /></button>
        <button v-if="telechargement" class="diaporama" aria-label="Télécharger la photo" title="Télécharger la photo" @click="telechargerPhoto(photo)"><Icone nom="telecharger" class="en-ligne" /></button>
        <button class="fleche" aria-label="Photo suivante" :disabled="liste.length < 2" @click="manuel(1)"><Icone nom="suivant" class="en-ligne" /></button>
      </div>
    </template>
    <template v-else-if="charge">
      <div class="haut">
        <button v-if="albums.length" class="retour" @click="retourAlbums"><Icone nom="precedent" class="en-ligne" /> Albums</button>
        <label class="ajouter"><Icone nom="appareil" class="en-ligne" /> Ajouter des photos<input type="file" accept="image/*" multiple @click="choisirNatif" @change="ajouter" /></label>
      </div>
      <p class="vide">Pas encore de photo.<br />Votre famille peut vous en envoyer.</p>
    </template>
    <FenetreCarte v-if="carte" grand :points="[carte]" titre="Où a été prise la photo" @fermer="carte = null" />
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
  overflow: hidden;
}
.cadre { flex: 1; min-height: 0; width: 100%; display: flex; }
.piste { flex: 1; min-width: 0; }
.cadre img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 16px; box-shadow: 0 4px 16px rgb(0 0 0 / 0.12); }
.plein { background: #111; }
/* Plein écran : la photo seule sur fond noir, par-dessus la barre de boutons ; toucher pour revenir */
.cadre.plein-ecran { position: fixed; inset: 0; z-index: 60; background: black; overflow: hidden; }
.cadre.plein-ecran img { border-radius: 0; box-shadow: none; }
/* Diaporama en plein écran : légende en bas, sur la photo */
.cadre { position: relative; }
.aide-diaporama, .legende-diaporama { position: absolute; left: 50%; transform: translateX(-50%); margin: 0; padding: 10px 22px; border-radius: 999px; background: rgb(0 0 0 / 0.55); color: white; text-align: center; pointer-events: none; max-width: calc(100% - 32px); }
.aide-diaporama { top: 24px; font-size: 1.4rem; }
.legende-diaporama { bottom: 28px; font-size: 1.8rem; font-weight: 700; }
.plein .cadre img { border-radius: 0; box-shadow: none; }
.plein .legende, .plein .envoi { color: white; }
.legende { font-size: 2rem; font-weight: 700; color: var(--bleu-nuit); margin: 4px 0 0; text-align: center; }
.envoi { font-size: 1.4rem; color: var(--gris); margin: 0; text-align: center; display: flex; align-items: center; justify-content: center; gap: 12px; }
.commandes { display: flex; gap: 16px; width: 100%; max-width: 900px; margin-top: 8px; }
.commandes button { border-radius: 20px; font-weight: 700; background: #f3f0ea; color: var(--bleu-nuit); }
.fleche { flex: 1; font-size: 2.6rem; padding: 14px; }
.diaporama { flex: 1.4; font-size: 1.6rem; padding: 14px; }
h1 { font-size: 2.4rem; color: var(--bleu-nuit); margin: 0; }
.entete { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
.ajouter {
  margin-left: auto;
  font-size: 1.4rem;
  font-weight: 700;
  padding: 12px 22px;
  border-radius: 18px;
  background: var(--vert);
  color: white;
  cursor: pointer;
  flex-direction: row;
}
.ajouter input { display: none; }
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
.haut { width: 100%; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
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
  .ajouter { font-size: 1.1rem; padding: 10px 14px; }
  .titre-album { font-size: 1.2rem; }
}
</style>
