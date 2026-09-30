<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { api } from '../api.js'
import { session } from '../session.js'
import { utiliserCercle } from '../cercle.js'
import { envoyerPhoto, dateEnvoi } from '../photos.js'
import { auRetour } from '../miseAJour.js'
import { balayage as vBalayage, prechargerVoisines } from '../balayage.js'
import { partagerPhoto, partageDisponible, prendreRecues } from '../partage.js'
import { utiliserPleinEcran } from '../pleinEcran.js'
import { zoom as vZoom } from '../zoom.js'
import { useRoute, useRouter } from 'vue-router'
import { avecParametres, revenir } from '../historique.js'
import Avatar from './Avatar.vue'
import Icone from '../navigation/Icone.vue'

// Photos d'un cercle pour les aidants et les proches : albums, envoi de photos (réduites dans le
// navigateur puis déposées chez l'hébergeur S3), grille des miniatures et visionneuse.
// L'album affiché (?album=), la photo ouverte (?photo=) et le plein écran (?plein=1) sont dans
// l'adresse : le bouton retour revient à l'étape d'avant (plein écran → photo → album → toutes).
const route = useRoute()
const router = useRouter()
const { url, cercle, erreur, action } = utiliserCercle()
const actif = ref(true) // partage de photos configuré par l'administrateur
const liste = ref([])
const suite = ref(false)
const aEnvoyer = ref([]) // { fichier, apercu, legende, etat: attente | envoi | fait | erreur, message }
const envoiEnCours = ref(false)
const ouverte = ref(null) // index de la photo affichée en grand (suit ?photo=)
const legendeEnEdition = ref(null)
const albums = ref([])
const compteurs = ref({ total: 0, sansAlbum: 0 })
const filtreDemande = () => route.query.album ?? 'tous'
const filtre = ref(filtreDemande()) // 'tous', 'aucun' (sans album) ou l'id d'un album (suit ?album=)
const albumEnvoi = ref('') // album où ranger les photos envoyées ('' = sans album, NOUVEL_ALBUM = à créer)
const NOUVEL_ALBUM = 'nouveau'
const nomAlbumEnvoi = ref('') // nom de l'album créé au moment de l'envoi
const erreurAlbum = ref('')
const nomAlbum = ref(null) // saisie d'un nouvel album ou d'un nouveau nom

const albumCourant = computed(() => albums.value.find((a) => a.id === filtre.value) ?? null)

const charger = (avant) => action(async () => {
  const params = new URLSearchParams()
  if (avant) params.set('avant', avant)
  if (filtre.value !== 'tous') params.set('album', filtre.value)
  const r = await api('GET', `${url.value}/photos?${params}`)
  actif.value = r.actif
  liste.value = avant ? [...liste.value, ...r.photos] : r.photos
  suite.value = r.suite
})
const chargerAlbums = () => action(async () => {
  const r = await api('GET', `${url.value}/albums`)
  albums.value = r.albums
  compteurs.value = { total: r.total, sansAlbum: r.sansAlbum }
  if (filtre.value !== 'tous' && filtre.value !== 'aucun' && !albumCourant.value) choisirFiltre('tous')
})
watch(url, () => {
  liste.value = []
  filtre.value = filtreDemande()
  albumEnvoi.value = filtre.value === 'tous' || filtre.value === 'aucun' ? '' : filtre.value
  vider()
  charger()
  chargerAlbums()
}, { immediate: true })

// Nouvelles photos et albums quand on revient sur l'appli (sauf pendant un envoi)
onUnmounted(auRetour(() => {
  if (envoiEnCours.value || aEnvoyer.value.length) return
  charger()
  chargerAlbums()
}))

// Toutes les photos → un album : nouvelle étape ; d'un album à l'autre : on remplace ;
// retour à toutes les photos : comme le bouton retour
function choisirFiltre(f) {
  if (filtre.value === f) return
  const cible = avecParametres(route, { album: f === 'tous' ? undefined : f, photo: undefined, plein: undefined })
  if (f === 'tous') revenir(router, cible)
  else if (filtre.value === 'tous') router.push(cible)
  else router.replace(cible)
}
watch(() => route.query.album, () => {
  if (route.path !== `${url.value}/photos` || filtre.value === filtreDemande()) return
  filtre.value = filtreDemande()
  albumEnvoi.value = filtre.value === 'tous' || filtre.value === 'aucun' ? '' : filtre.value
  nomAlbum.value = null
  liste.value = []
  charger()
})

// Création (nomAlbum.id vide) ou renommage d'un album
const enregistrerAlbum = () => action(async () => {
  const { id, nom } = nomAlbum.value
  if (id) {
    await api('PATCH', `${url.value}/albums/${id}`, { nom })
  } else {
    const album = await api('POST', `${url.value}/albums`, { nom })
    albums.value.unshift(album)
    choisirFiltre(album.id)
  }
  nomAlbum.value = null
  await chargerAlbums()
})

const supprimerAlbum = () => action(async () => {
  const a = albumCourant.value
  if (!confirm(`Supprimer l'album « ${a.nom} » ? Ses ${a.nombre} photo(s) sont gardées, sans album.`)) return
  await api('DELETE', `${url.value}/albums/${a.id}`)
  choisirFiltre('tous')
  await chargerAlbums()
})

function ajouter(fichiers) {
  for (const fichier of fichiers) {
    aEnvoyer.value.push({ fichier, apercu: URL.createObjectURL(fichier), legende: '', etat: 'attente', message: '' })
  }
}
function choisir(evenement) {
  ajouter(evenement.target.files)
  evenement.target.value = ''
}
// Photos partagées depuis une autre application (page /recevoir) : prêtes à envoyer
ajouter(prendreRecues())

function retirer(i) {
  URL.revokeObjectURL(aEnvoyer.value[i].apercu)
  aEnvoyer.value.splice(i, 1)
}

function vider() {
  aEnvoyer.value.forEach((a) => URL.revokeObjectURL(a.apercu))
  aEnvoyer.value = []
}
onUnmounted(vider)

// Envoi une photo après l'autre (les réductions consomment beaucoup de mémoire sur téléphone)
async function envoyer() {
  // Album créé à la volée : d'abord l'album, puis les photos dedans
  if (albumEnvoi.value === NOUVEL_ALBUM) {
    const nom = nomAlbumEnvoi.value.trim()
    erreurAlbum.value = nom ? '' : 'Donnez un nom au nouvel album'
    if (!nom) return
    let album
    try {
      album = await api('POST', `${url.value}/albums`, { nom })
    } catch (e) {
      erreurAlbum.value = e.message
      return
    }
    albums.value.unshift(album)
    albumEnvoi.value = album.id
    nomAlbumEnvoi.value = ''
  }
  envoiEnCours.value = true
  for (const a of aEnvoyer.value.filter((x) => x.etat !== 'fait')) {
    a.etat = 'envoi'
    a.message = ''
    try {
      const photo = await envoyerPhoto(cercle.value.id, a.fichier, a.legende, albumEnvoi.value || null)
      if (filtre.value === 'tous' || filtre.value === (photo.albumId ?? 'aucun')) liste.value.unshift(photo)
      a.etat = 'fait'
    } catch (e) {
      a.etat = 'erreur'
      a.message = e.message
    }
  }
  envoiEnCours.value = false
  if (aEnvoyer.value.every((a) => a.etat === 'fait')) vider()
  chargerAlbums()
}

const restants = computed(() => aEnvoyer.value.filter((a) => a.etat !== 'fait').length)
const photo = computed(() => (ouverte.value == null ? null : liste.value[ouverte.value]))
const { pleinEcran, entrer: entrerPleinEcran, sortir: sortirPleinEcran } = utiliserPleinEcran()
watch(photo, (p) => p && prechargerVoisines(liste.value, ouverte.value))

// La photo ouverte est celle de l'adresse (?photo=), si elle est dans la liste chargée
watch([() => route.query.photo, liste], ([id]) => {
  const i = id ? liste.value.findIndex((p) => p.id === id) : -1
  if (i !== ouverte.value) legendeEnEdition.value = null
  ouverte.value = i >= 0 ? i : null
}, { immediate: true })

// Ouvrir une photo : nouvelle étape ; passer à la suivante : on remplace
function ouvrir(i) {
  const cible = avecParametres(route, { photo: liste.value[i].id })
  if (ouverte.value == null) router.push(cible)
  else router.replace(cible)
}
function fermer() {
  revenir(router, avecParametres(route, { photo: undefined, plein: undefined }))
}
function deplacer(sens) {
  const i = ouverte.value + sens
  if (i >= 0 && i < liste.value.length) ouvrir(i)
}
function touche(e) {
  if (ouverte.value == null || legendeEnEdition.value != null) return
  if (e.key === 'ArrowLeft') deplacer(-1)
  if (e.key === 'ArrowRight') deplacer(1)
  if (e.key === 'Escape' && !pleinEcran.value) fermer()
}
window.addEventListener('keydown', touche)
onUnmounted(() => window.removeEventListener('keydown', touche))

const enregistrerLegende = () => action(async () => {
  const { legende } = await api('PATCH', `${url.value}/photos/${photo.value.id}`, { legende: legendeEnEdition.value })
  photo.value.legende = legende
  legendeEnEdition.value = null
})

// Range la photo affichée dans un autre album
const changerAlbum = (albumId) => action(async () => {
  const r = await api('PATCH', `${url.value}/photos/${photo.value.id}`, { albumId: albumId || null })
  photo.value.albumId = r.albumId
  // Elle ne fait plus partie de l'album affiché
  if (filtre.value !== 'tous' && filtre.value !== (r.albumId ?? 'aucun')) retirerDeLaListe()
  chargerAlbums()
})

// La photo affichée quitte la liste : on montre la suivante (ou la précédente), sinon on ferme
function retirerDeLaListe() {
  const i = ouverte.value
  const voisine = liste.value[i + 1] ?? liste.value[i - 1]
  if (voisine) router.replace(avecParametres(route, { photo: voisine.id }))
  else fermer()
  liste.value.splice(i, 1)
}

const supprimer = () => action(async () => {
  if (!confirm('Supprimer cette photo pour tout le cercle ?')) return
  await api('DELETE', `${url.value}/photos/${photo.value.id}`)
  retirerDeLaListe()
  chargerAlbums()
})

const partage = partageDisponible()
const auteur = (p) => (p.deMoi ? 'vous' : (p.creeParPrenom ?? 'un ancien membre'))
</script>

<template>
  <main class="album">
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <template v-if="cercle">
      <p class="aide surtitre">{{ cercle.nom }}</p>
      <div class="titre">
        <h1>Photos</h1>
        <label v-if="actif" class="bouton-fichier" :class="{ inactif: envoiEnCours }">
          Ajouter des photos
          <input type="file" accept="image/*" multiple :disabled="envoiEnCours" @change="choisir" />
        </label>
      </div>

      <div v-if="!actif" class="carte">
        <p>Le partage de photos n'est pas encore configuré.</p>
        <p v-if="session.utilisateur.estAdmin">
          <RouterLink to="/admin/photos">Configurer le stockage des photos</RouterLink>
        </p>
        <p v-else class="aide">L'administrateur de l'application doit d'abord choisir où les photos sont stockées.</p>
      </div>

      <template v-if="actif">
        <div class="albums" role="tablist" aria-label="Albums">
          <button class="carte-album" :class="{ choisi: filtre === 'tous' }" @click="choisirFiltre('tous')">
            <span class="couverture tous"><Icone nom="albums" class="em" /></span>
            <span class="nom">Toutes les photos</span>
            <span class="aide">{{ compteurs.total }}</span>
          </button>
          <button v-for="a in albums" :key="a.id" class="carte-album" :class="{ choisi: filtre === a.id }" @click="choisirFiltre(a.id)">
            <img v-if="a.couverture" :src="a.couverture" alt="" class="couverture" />
            <span v-else class="couverture vide"><Icone nom="dossier" class="em" /></span>
            <span class="nom">{{ a.nom }}</span>
            <span class="aide">{{ a.nombre }}</span>
          </button>
          <button v-if="albums.length && compteurs.sansAlbum" class="carte-album" :class="{ choisi: filtre === 'aucun' }" @click="choisirFiltre('aucun')">
            <span class="couverture vide"><Icone nom="photo" class="em" /></span>
            <span class="nom">Sans album</span>
            <span class="aide">{{ compteurs.sansAlbum }}</span>
          </button>
          <button class="carte-album nouveau" @click="nomAlbum = { id: null, nom: '' }">
            <span class="couverture vide">＋</span>
            <span class="nom">Nouvel album</span>
          </button>
        </div>

        <form v-if="nomAlbum" class="carte ligne-album" @submit.prevent="enregistrerAlbum">
          <input v-model="nomAlbum.nom" required maxlength="100" placeholder="Nom de l'album (ex. Noël 2025, Vacances à Biarritz)" />
          <button>{{ nomAlbum.id ? 'Renommer' : 'Créer l\'album' }}</button>
          <button type="button" class="secondaire" @click="nomAlbum = null">Annuler</button>
        </form>
        <div v-else-if="albumCourant?.peutModifier" class="actions-album">
          <strong>{{ albumCourant.nom }}</strong>
          <button class="lien" @click="nomAlbum = { id: albumCourant.id, nom: albumCourant.nom }">Renommer</button>
          <button class="danger" @click="supprimerAlbum">Supprimer l'album</button>
        </div>
      </template>

      <section v-if="aEnvoyer.length" class="carte envoi">
        <strong>{{ aEnvoyer.length > 1 ? `${aEnvoyer.length} photos à envoyer` : '1 photo à envoyer' }}</strong>
        <div v-for="(a, i) in aEnvoyer" :key="a.apercu" class="a-envoyer">
          <img :src="a.apercu" alt="" />
          <div class="champs">
            <input v-model="a.legende" maxlength="500" placeholder="Légende (facultatif) : qui, où, quand…" :disabled="a.etat === 'envoi' || a.etat === 'fait'" />
            <span v-if="a.etat === 'envoi'" class="aide">Envoi en cours…</span>
            <span v-else-if="a.etat === 'fait'" class="succes">Envoyée</span>
            <span v-else-if="a.etat === 'erreur'" class="erreur">{{ a.message }}</span>
          </div>
          <button v-if="!envoiEnCours && a.etat !== 'fait'" class="lien" @click="retirer(i)">Retirer</button>
        </div>
        <label v-if="actif" class="choix-album">Ranger dans l'album
          <select v-model="albumEnvoi" :disabled="envoiEnCours">
            <option value="">Sans album</option>
            <option v-for="a in albums" :key="a.id" :value="a.id">{{ a.nom }}</option>
            <option :value="NOUVEL_ALBUM">＋ Nouvel album…</option>
          </select>
        </label>
        <input
          v-if="albumEnvoi === NOUVEL_ALBUM"
          v-model="nomAlbumEnvoi"
          maxlength="100"
          placeholder="Nom du nouvel album (ex. Noël 2025, Vacances à Biarritz)"
          :disabled="envoiEnCours"
        />
        <p v-if="erreurAlbum" class="erreur">{{ erreurAlbum }}</p>
        <p class="aide">Les photos sont réduites avant l'envoi (2 048 pixels au plus) : c'est plus rapide et bien assez pour un écran.</p>
        <div class="actions">
          <button :disabled="envoiEnCours || !restants" @click="envoyer">
            {{ envoiEnCours ? 'Envoi…' : restants > 1 ? `Envoyer les ${restants} photos` : 'Envoyer la photo' }}
          </button>
          <button class="secondaire" :disabled="envoiEnCours" @click="vider">Annuler</button>
        </div>
      </section>

      <p v-if="actif && !liste.length && !aEnvoyer.length" class="aide">
        <template v-if="albumCourant">Cet album est vide : ajoutez-y des photos avec le bouton « Ajouter des photos ».</template>
        <template v-else>Aucune photo pour l'instant. Les photos envoyées ici apparaissent sur la tablette de la personne accompagnée.</template>
      </p>
      <div class="grille">
        <button v-for="(p, i) in liste" :key="p.id" class="vignette" @click="ouvrir(i)">
          <img :src="p.miniature" :alt="p.legende || 'Photo'" loading="lazy" />
        </button>
      </div>
      <div v-if="suite" class="plus">
        <button class="secondaire" @click="charger(liste[liste.length - 1].creeLe)">Voir les photos plus anciennes</button>
      </div>
    </template>

    <div
      v-if="photo"
      v-balayage="{ suivante: () => deplacer(1), precedente: () => deplacer(-1) }"
      v-zoom="pleinEcran"
      class="visionneuse"
      :class="{ 'plein-ecran': pleinEcran }"
      @click.self="pleinEcran ? sortirPleinEcran() : fermer()"
    >
      <button v-if="pleinEcran" class="fermer discret" aria-label="Quitter le plein écran" @click="sortirPleinEcran"><Icone nom="fermer" class="en-ligne" /></button>
      <template v-else>
        <button class="fermer" aria-label="Fermer" @click="fermer"><Icone nom="fermer" class="en-ligne" /></button>
        <button class="agrandir" aria-label="Plein écran" title="Plein écran" @click="entrerPleinEcran"><Icone nom="agrandir" class="en-ligne" /></button>
        <button v-if="ouverte > 0" class="fleche gauche" aria-label="Photo précédente" @click="deplacer(-1)">‹</button>
      </template>
      <img :key="photo.id" :src="photo.ecran" :alt="photo.legende || 'Photo'" @click="pleinEcran ? sortirPleinEcran() : entrerPleinEcran()" />
      <button v-if="!pleinEcran && ouverte < liste.length - 1" class="fleche droite" aria-label="Photo suivante" @click="deplacer(1)">›</button>
      <div v-if="!pleinEcran" class="infos">
        <form v-if="legendeEnEdition != null" class="edition" @submit.prevent="enregistrerLegende">
          <input v-model="legendeEnEdition" maxlength="500" placeholder="Légende" />
          <button>Enregistrer</button>
          <button type="button" class="secondaire" @click="legendeEnEdition = null">Annuler</button>
        </form>
        <p v-else-if="photo.legende" class="legende">{{ photo.legende }}</p>
        <p class="aide auteur">
          <Avatar v-if="photo.creeParPrenom" :src="photo.creeParAvatar" :prenom="photo.creeParPrenom" :taille="28" />
          Envoyée par {{ auteur(photo) }}, {{ dateEnvoi(photo.creeLe) }}
        </p>
        <button v-if="partage && legendeEnEdition == null" class="partager" @click="partagerPhoto(photo)">Partager</button>
        <label v-if="photo.peutSupprimer && albums.length && legendeEnEdition == null" class="album-photo">Album
          <select :value="photo.albumId ?? ''" @change="changerAlbum($event.target.value)">
            <option value="">Sans album</option>
            <option v-for="a in albums" :key="a.id" :value="a.id">{{ a.nom }}</option>
          </select>
        </label>
        <div v-if="photo.peutSupprimer && legendeEnEdition == null" class="actions">
          <button class="lien" @click="legendeEnEdition = photo.legende ?? ''">{{ photo.legende ? 'Modifier la légende' : 'Ajouter une légende' }}</button>
          <button class="danger" @click="supprimer">Supprimer</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.album { max-width: 1000px; }
.surtitre { margin: 0; }
.titre { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.bouton-fichier {
  background: var(--vert);
  color: white;
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: normal;
  display: inline-block;
}
.bouton-fichier.inactif { opacity: 0.5; cursor: default; }
.bouton-fichier input { display: none; }
.envoi { display: flex; flex-direction: column; gap: 10px; }
.a-envoyer { display: flex; gap: 12px; align-items: center; }
.a-envoyer img { width: 72px; height: 72px; object-fit: cover; border-radius: 8px; flex: none; }
.champs { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.succes { color: var(--vert); font-weight: 500; }
.grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-top: 16px; }
.vignette { padding: 0; background: #ebe8e3; border-radius: 10px; overflow: hidden; aspect-ratio: 1; }
.vignette img { width: 100%; height: 100%; object-fit: cover; display: block; }
.plus { text-align: center; margin: 16px 0; }
.albums { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 10px; margin: 8px 0; }
.carte-album {
  flex: none;
  width: 130px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 6px;
  background: white;
  color: #2b2b2b;
  border: 2px solid transparent;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
  text-align: left;
}
.carte-album.choisi { border-color: var(--vert); }
.couverture {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  background: #f3f0ea;
}
.carte-album.nouveau .couverture { color: var(--vert); }
.carte-album .nom {
  font-weight: 600;
  font-size: 0.95rem;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.carte-album .aide { font-size: 0.8rem; }
.ligne-album { flex-direction: row; flex-wrap: wrap; align-items: center; }
.ligne-album input { flex: 1; min-width: 200px; }
.actions-album { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.choix-album { flex-direction: row; align-items: center; gap: 8px; flex-wrap: wrap; }
.album-photo { flex-direction: row; justify-content: center; align-items: center; gap: 8px; font-weight: normal; margin: 6px 0; }
.album-photo select { padding: 4px 8px; }
.visionneuse {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgb(15 18 30 / 0.94);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px 16px;
  gap: 12px;
}
.visionneuse img { max-width: 100%; max-height: calc(100vh - 190px); object-fit: contain; border-radius: 6px; }
.fermer, .fleche { position: absolute; background: rgb(255 255 255 / 0.15); color: white; border-radius: 999px; }
.fermer, .agrandir { top: 12px; width: 44px; height: 44px; padding: 0; font-size: 1.3rem; }
.fermer { right: 12px; }
.agrandir { position: absolute; left: 12px; background: rgb(255 255 255 / 0.15); color: white; border-radius: 999px; font-size: 1.5rem; }
.visionneuse img { cursor: zoom-in; }
/* Plein écran : la photo seule, aussi grande que possible, dans les deux sens de l'écran */
.visionneuse.plein-ecran { padding: 0; background: black; gap: 0; }
.visionneuse.plein-ecran img { max-width: 100vw; max-height: 100vh; max-height: 100dvh; border-radius: 0; cursor: zoom-out; }
.fermer.discret { opacity: 0.6; z-index: 1; }
.fleche { top: 50%; transform: translateY(-50%); width: 52px; height: 52px; padding: 0; font-size: 2.2rem; line-height: 1; }
.gauche { left: 12px; }
.droite { right: 12px; }
.infos { color: white; text-align: center; max-width: 700px; }
.infos .aide { color: #c9cbd6; margin: 4px 0; }
.legende { font-size: 1.15rem; margin: 0; }
.infos .actions { justify-content: center; }
.infos .lien { color: white; }
.partager { margin: 6px 0; }
.edition { flex-direction: row; flex-wrap: wrap; justify-content: center; }
.edition input { min-width: 240px; }
@media (max-width: 600px) {
  .grille { grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .carte-album { width: 104px; }
  .fleche { top: auto; bottom: 16px; transform: none; }
}
.auteur { display: flex; align-items: center; gap: 8px; }
</style>
