<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { session } from '../session.js'
import { recues, chargerRecues, effacerRecues } from '../partage.js'
import { envoyerPhoto } from '../photos.js'

// Photos partagées vers Trait d'union depuis une autre application (Galerie, WhatsApp...).
// Aidants et proches : on choisit le cercle (s'il y en a plusieurs), puis la page Photos du
// cercle les propose à l'envoi (album, légendes). Tablette ou téléphone de la personne
// accompagnée : un seul gros bouton « Envoyer à ma famille ».
const router = useRouter()
const charge = ref(false)
const apercus = ref([])
const etat = ref('attente') // attente | envoi | fait
const erreur = ref('')

const appareil = computed(() => session.typeSession === 'appareil')
// Les auxiliaires de vie n'ont pas accès aux photos
const cercles = computed(() => session.cercles.filter((c) => c.role !== 'auxiliaire'))

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
})

async function annuler() {
  effacerRecues()
  router.replace('/')
}

// Personne accompagnée : envoi dans son cercle, sans album ni légende
async function envoyer() {
  const cercle = session.cercles.find((c) => c.role === 'accompagne') ?? session.cercles[0]
  etat.value = 'envoi'
  erreur.value = ''
  // En cas d'erreur, seules les photos pas encore envoyées restent (pour réessayer)
  const restants = []
  for (const [i, fichier] of recues.fichiers.entries()) {
    try {
      await envoyerPhoto(cercle.id, fichier, '')
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
          <RouterLink class="gros" to="/photos?album=tous">Voir mes photos</RouterLink>
          <RouterLink class="gros secondaire" to="/">Accueil</RouterLink>
        </div>
      </template>
      <template v-else-if="apercus.length">
        <h1>{{ apercus.length > 1 ? `Envoyer ces ${apercus.length} photos à ma famille ?` : 'Envoyer cette photo à ma famille ?' }}</h1>
        <div class="apercus">
          <img v-for="a in apercus" :key="a" :src="a" alt="" />
        </div>
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
  .recevoir-accompagne h1, .grand { font-size: 1.5rem; }
  .gros { font-size: 1.2rem; padding: 14px; }
  .recevoir-accompagne .apercus { grid-template-columns: 1fr 1fr; }
}
</style>
