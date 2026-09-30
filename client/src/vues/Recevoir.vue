<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { session } from '../session.js'
import { recues, chargerRecues, effacerRecues } from '../partage.js'
import { api } from '../api.js'
import { envoyerPhoto } from '../photos.js'

// Photos partagées vers Trait d'union depuis une autre application (Galerie, WhatsApp...).
// Aidants et proches : on choisit le cercle (s'il y en a plusieurs), puis la page Photos du
// cercle les propose à l'envoi (album, légendes). Tablette ou téléphone de la personne
// accompagnée : choix de l'album en gros boutons (ou nouvel album), puis « Envoyer ».
const router = useRouter()
const charge = ref(false)
const apercus = ref([])
const etat = ref('attente') // attente | envoi | fait
const erreur = ref('')

const appareil = computed(() => session.typeSession === 'appareil')
// Les auxiliaires de vie n'ont pas accès aux photos
const cercles = computed(() => session.cercles.filter((c) => c.role !== 'auxiliaire'))

// Personne accompagnée : son cercle et ses albums ('' = sans album, 'nouveau' = à créer)
const cercleAide = computed(() => session.cercles.find((c) => c.role === 'accompagne') ?? session.cercles[0])
const albums = ref([])
const albumChoisi = ref('')
const nomNouvelAlbum = ref('')

function versCercle(c) {
  router.replace(`/cercles/${c.id}/photos`) // la page Photos prend les photos reçues
}

// Aperçus des photos reçues (d'autres peuvent arriver pendant qu'on est sur la page)
const liberer = () => apercus.value.forEach((a) => URL.revokeObjectURL(a))
watch(() => recues.fichiers, (fichiers) => {
  liberer()
  apercus.value = fichiers.map((f) => URL.createObjectURL(f))
}, { immediate: true })
onUnmounted(liberer)

onMounted(async () => {
  await chargerRecues()
  charge.value = true
  if (recues.fichiers.length && !appareil.value && cercles.value.length === 1) versCercle(cercles.value[0])
  if (appareil.value && cercleAide.value) {
    albums.value = await api('GET', `/cercles/${cercleAide.value.id}/albums`).then((r) => r.albums).catch(() => [])
  }
})

async function annuler() {
  effacerRecues()
  router.replace('/')
}

// Personne accompagnée : envoi dans son cercle, dans l'album choisi, sans légende
async function envoyer() {
  const cercle = cercleAide.value
  erreur.value = ''
  if (albumChoisi.value === 'nouveau') {
    const nom = nomNouvelAlbum.value.trim()
    if (!nom) return (erreur.value = 'Écrivez le nom du nouvel album')
    try {
      const album = await api('POST', `/cercles/${cercle.id}/albums`, { nom })
      albums.value.unshift(album)
      albumChoisi.value = album.id
      nomNouvelAlbum.value = ''
    } catch (e) {
      return (erreur.value = e.message)
    }
  }
  etat.value = 'envoi'
  // En cas d'erreur, seules les photos pas encore envoyées restent (pour réessayer)
  const restants = []
  for (const [i, fichier] of recues.fichiers.entries()) {
    try {
      await envoyerPhoto(cercle.id, fichier, '', albumChoisi.value || null)
    } catch (e) {
      restants.push(i)
      erreur.value = e.message
    }
  }
  if (restants.length) {
    recues.fichiers = restants.map((i) => recues.fichiers[i])
    etat.value = 'attente'
    return
  }
  effacerRecues()
  etat.value = 'fait'
}
</script>

<template>
  <main :class="appareil ? 'recevoir-accompagne' : 'recevoir'">
    <template v-if="charge && !recues.fichiers.length && etat !== 'fait'">
      <h1>Photos reçues</h1>
      <p class="aide">Aucune photo en attente.</p>
      <RouterLink to="/">Retour à l'accueil</RouterLink>
    </template>

    <template v-else-if="appareil">
      <template v-if="etat === 'fait'">
        <p class="grand">C'est envoyé ! Votre famille va voir vos photos.</p>
        <div class="gros-boutons">
          <RouterLink class="gros" :to="`/photos?album=${albumChoisi || 'tous'}`">Voir mes photos</RouterLink>
          <RouterLink class="gros secondaire" to="/">Accueil</RouterLink>
        </div>
      </template>
      <template v-else-if="apercus.length">
        <h1>{{ apercus.length > 1 ? `Envoyer ces ${apercus.length} photos à ma famille ?` : 'Envoyer cette photo à ma famille ?' }}</h1>
        <div class="apercus">
          <img v-for="a in apercus" :key="a" :src="a" alt="" />
        </div>
        <h2>Dans quel album ?</h2>
        <div class="choix-albums">
          <button :class="{ choisi: albumChoisi === '' }" :disabled="etat === 'envoi'" @click="albumChoisi = ''">Sans album</button>
          <button v-for="a in albums" :key="a.id" :class="{ choisi: albumChoisi === a.id }" :disabled="etat === 'envoi'" @click="albumChoisi = a.id">{{ a.nom }}</button>
          <button :class="{ choisi: albumChoisi === 'nouveau' }" :disabled="etat === 'envoi'" @click="albumChoisi = 'nouveau'">＋ Nouvel album</button>
        </div>
        <input
          v-if="albumChoisi === 'nouveau'"
          v-model="nomNouvelAlbum"
          class="nom-album"
          maxlength="100"
          placeholder="Nom du nouvel album"
          :disabled="etat === 'envoi'"
        />
        <p v-if="erreur" class="erreur">{{ erreur }}</p>
        <div class="gros-boutons">
          <button class="gros" :disabled="etat === 'envoi'" @click="envoyer">{{ etat === 'envoi' ? 'Envoi en cours…' : 'Envoyer' }}</button>
          <button class="gros secondaire" :disabled="etat === 'envoi'" @click="annuler">Annuler</button>
        </div>
      </template>
    </template>

    <template v-else-if="apercus.length">
      <h1>Photos reçues</h1>
      <div class="apercus petits">
        <img v-for="a in apercus" :key="a" :src="a" alt="" />
      </div>
      <template v-if="cercles.length">
        <p>Dans quel cercle voulez-vous les ajouter ?</p>
        <div class="cercles">
          <button v-for="c in cercles" :key="c.id" @click="versCercle(c)">{{ c.nom }}</button>
        </div>
      </template>
      <p v-else class="aide">Votre rôle ne permet pas d'ajouter des photos.</p>
      <button class="secondaire" @click="annuler">Annuler</button>
    </template>
  </main>
</template>

<style scoped>
.apercus { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; margin: 12px 0; }
.apercus img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; }
.cercles { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.recevoir-accompagne {
  max-width: 900px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.recevoir-accompagne h1 { font-size: 2rem; }
.recevoir-accompagne .apercus { width: 100%; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.recevoir-accompagne .erreur { font-size: 1.3rem; }
.recevoir-accompagne h2 { font-size: 1.6rem; color: var(--bleu-nuit); margin: 8px 0; }
.choix-albums { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; width: 100%; max-width: 900px; }
.choix-albums button {
  font-size: 1.4rem;
  font-weight: 700;
  padding: 14px 22px;
  border-radius: 18px;
  background: #f3f0ea;
  color: var(--bleu-nuit);
  border: 3px solid transparent;
}
.choix-albums button.choisi { border-color: var(--vert); background: var(--vert-clair); }
.nom-album { font-size: 1.5rem; padding: 14px; border-radius: 16px; width: 100%; max-width: 600px; margin-top: 12px; }
.grand { font-size: 2rem; font-weight: 700; color: var(--bleu-nuit); margin: 32px 0; }
.gros-boutons { display: flex; gap: 16px; width: 100%; max-width: 700px; margin-top: 8px; }
.gros {
  flex: 1;
  font-size: 1.6rem;
  font-weight: 700;
  padding: 18px;
  border-radius: 20px;
  background: var(--vert);
  color: white;
  text-decoration: none;
  text-align: center;
}
.gros.secondaire { background: #f3f0ea; color: var(--bleu-nuit); }
@media (max-width: 600px) {
  .recevoir-accompagne h1, .recevoir-accompagne h2 { font-size: 1.6rem; color: var(--bleu-nuit); margin: 8px 0; }
.choix-albums { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; width: 100%; max-width: 900px; }
.choix-albums button {
  font-size: 1.4rem;
  font-weight: 700;
  padding: 14px 22px;
  border-radius: 18px;
  background: #f3f0ea;
  color: var(--bleu-nuit);
  border: 3px solid transparent;
}
.choix-albums button.choisi { border-color: var(--vert); background: var(--vert-clair); }
.nom-album { font-size: 1.5rem; padding: 14px; border-radius: 16px; width: 100%; max-width: 600px; margin-top: 12px; }
.grand { font-size: 1.5rem; }
  .gros { font-size: 1.2rem; padding: 14px; }
  .recevoir-accompagne h2 { font-size: 1.3rem; }
  .choix-albums button { font-size: 1.1rem; padding: 10px 16px; }
  .nom-album { font-size: 1.2rem; }
  .recevoir-accompagne .apercus { grid-template-columns: 1fr 1fr; }
}
</style>
