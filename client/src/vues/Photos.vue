<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { api } from '../api.js'
import { session } from '../session.js'
import { utiliserCercle } from '../cercle.js'
import { envoyerPhoto, dateEnvoi } from '../photos.js'

// Album photos d'un cercle pour les aidants et les proches : envoi de photos (réduites dans le
// navigateur puis déposées chez l'hébergeur S3), grille des miniatures et visionneuse.
const { url, cercle, erreur, action } = utiliserCercle()
const actif = ref(true) // partage de photos configuré par l'administrateur
const liste = ref([])
const suite = ref(false)
const aEnvoyer = ref([]) // { fichier, apercu, legende, etat: attente | envoi | fait | erreur, message }
const envoiEnCours = ref(false)
const ouverte = ref(null) // index de la photo affichée en grand
const legendeEnEdition = ref(null)

const charger = (avant) => action(async () => {
  const r = await api('GET', `${url.value}/photos${avant ? `?avant=${encodeURIComponent(avant)}` : ''}`)
  actif.value = r.actif
  liste.value = avant ? [...liste.value, ...r.photos] : r.photos
  suite.value = r.suite
})
watch(url, () => {
  liste.value = []
  ouverte.value = null
  vider()
  charger()
}, { immediate: true })

function choisir(evenement) {
  for (const fichier of evenement.target.files) {
    aEnvoyer.value.push({ fichier, apercu: URL.createObjectURL(fichier), legende: '', etat: 'attente', message: '' })
  }
  evenement.target.value = ''
}

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
  envoiEnCours.value = true
  for (const a of aEnvoyer.value.filter((x) => x.etat !== 'fait')) {
    a.etat = 'envoi'
    a.message = ''
    try {
      const photo = await envoyerPhoto(cercle.value.id, a.fichier, a.legende)
      liste.value.unshift(photo)
      a.etat = 'fait'
    } catch (e) {
      a.etat = 'erreur'
      a.message = e.message
    }
  }
  envoiEnCours.value = false
  if (aEnvoyer.value.every((a) => a.etat === 'fait')) vider()
}

const restants = computed(() => aEnvoyer.value.filter((a) => a.etat !== 'fait').length)
const photo = computed(() => (ouverte.value == null ? null : liste.value[ouverte.value]))

function ouvrir(i) {
  ouverte.value = i
  legendeEnEdition.value = null
}
function deplacer(sens) {
  const i = ouverte.value + sens
  if (i >= 0 && i < liste.value.length) ouvrir(i)
}
function touche(e) {
  if (ouverte.value == null || legendeEnEdition.value != null) return
  if (e.key === 'ArrowLeft') deplacer(-1)
  if (e.key === 'ArrowRight') deplacer(1)
  if (e.key === 'Escape') ouverte.value = null
}
window.addEventListener('keydown', touche)
onUnmounted(() => window.removeEventListener('keydown', touche))

const enregistrerLegende = () => action(async () => {
  const { legende } = await api('PATCH', `${url.value}/photos/${photo.value.id}`, { legende: legendeEnEdition.value })
  photo.value.legende = legende
  legendeEnEdition.value = null
})

const supprimer = () => action(async () => {
  if (!confirm('Supprimer cette photo pour tout le cercle ?')) return
  await api('DELETE', `${url.value}/photos/${photo.value.id}`)
  liste.value.splice(ouverte.value, 1)
  if (!liste.value.length) ouverte.value = null
  else if (ouverte.value >= liste.value.length) ouverte.value = liste.value.length - 1
})

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
        <p class="aide">Les photos sont réduites avant l'envoi (2 048 pixels au plus) : c'est plus rapide et bien assez pour un écran.</p>
        <div class="actions">
          <button :disabled="envoiEnCours || !restants" @click="envoyer">
            {{ envoiEnCours ? 'Envoi…' : restants > 1 ? `Envoyer les ${restants} photos` : 'Envoyer la photo' }}
          </button>
          <button class="secondaire" :disabled="envoiEnCours" @click="vider">Annuler</button>
        </div>
      </section>

      <p v-if="actif && !liste.length && !aEnvoyer.length" class="aide">
        Aucune photo pour l'instant. Les photos envoyées ici apparaissent sur la tablette de la personne accompagnée.
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

    <div v-if="photo" class="visionneuse" @click.self="ouverte = null">
      <button class="fermer" aria-label="Fermer" @click="ouverte = null">✕</button>
      <button v-if="ouverte > 0" class="fleche gauche" aria-label="Photo précédente" @click="deplacer(-1)">‹</button>
      <img :key="photo.id" :src="photo.ecran" :alt="photo.legende || 'Photo'" />
      <button v-if="ouverte < liste.length - 1" class="fleche droite" aria-label="Photo suivante" @click="deplacer(1)">›</button>
      <div class="infos">
        <form v-if="legendeEnEdition != null" class="edition" @submit.prevent="enregistrerLegende">
          <input v-model="legendeEnEdition" maxlength="500" placeholder="Légende" />
          <button>Enregistrer</button>
          <button type="button" class="secondaire" @click="legendeEnEdition = null">Annuler</button>
        </form>
        <p v-else-if="photo.legende" class="legende">{{ photo.legende }}</p>
        <p class="aide">Envoyée par {{ auteur(photo) }}, {{ dateEnvoi(photo.creeLe) }}</p>
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
.fermer { top: 12px; right: 12px; width: 44px; height: 44px; padding: 0; font-size: 1.3rem; }
.fleche { top: 50%; transform: translateY(-50%); width: 52px; height: 52px; padding: 0; font-size: 2.2rem; line-height: 1; }
.gauche { left: 12px; }
.droite { right: 12px; }
.infos { color: white; text-align: center; max-width: 700px; }
.infos .aide { color: #c9cbd6; margin: 4px 0; }
.legende { font-size: 1.15rem; margin: 0; }
.infos .actions { justify-content: center; }
.infos .lien { color: white; }
.edition { flex-direction: row; flex-wrap: wrap; justify-content: center; }
.edition input { min-width: 240px; }
@media (max-width: 600px) {
  .grille { grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .fleche { top: auto; bottom: 16px; transform: none; }
}
</style>
