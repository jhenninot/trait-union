<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { session } from '../session.js'
import { rendezVousAccompagne, debutDuJour, ajouterJours, horaire } from '../agenda.js'
import { nouveautesPhotos } from '../photos.js'
import { auRetour } from '../miseAJour.js'
import { api } from '../api.js'
import { parler, lectureDisponible } from '../voix.js'
import Icone from '../navigation/Icone.vue'
import { modeAlertes, autorisation, activerAlertes, alertesArretees, refuserAlertes } from '../alertes.js'

// Écran de la personne accompagnée : très lisible, sans bouton de déconnexion.
const maintenant = ref(new Date())
let minuterie
// Ce qui est prévu aujourd'hui, rechargé de temps en temps
const rendezVousDuJour = ref([])
const chargerProgramme = async () => {
  const jour = debutDuJour()
  // Les rendez-vous privés n'apparaissent que dans l'agenda
  rendezVousDuJour.value = (await rendezVousAccompagne(session.cercles, jour, ajouterJours(jour, 1))).filter((r) => !r.masque)
}
// Un rendez-vous terminé disparaît (l'heure est mise à jour toutes les 30 secondes)
const programme = computed(() => rendezVousDuJour.value.filter((r) => new Date(r.fin ?? r.debut) > maintenant.value))
// Albums où des photos sont arrivées depuis la dernière visite
const photos = ref(null)
const chargerPhotos = async () => {
  photos.value = await nouveautesPhotos(session.cercles)
}
const nouvellesPhotos = computed(() => photos.value?.albums ?? [])
const nombreNouvelles = computed(() => nouvellesPhotos.value.reduce((n, a) => n + a.nouvelles, 0))
// Un seul album concerné : on l'ouvre directement ; sinon le choix des albums (avec pastilles)
const lienPhotos = computed(() => nouvellesPhotos.value.length === 1 ? nouvellesPhotos.value[0].lien : '/photos')
// Proposer les alertes sur cet appareil, si les aidants en ont laissé au moins une catégorie
// et qu'elles ne sont ni actives, ni refusées ici
const alertes = ref(null) // { clePublique, proposer, fait, erreur }
async function chargerAlertes() {
  const mode = modeAlertes()
  if (!['web', 'android'].includes(mode) || alertesArretees() || autorisation() === 'refusee') return
  const d = await api('GET', '/alertes').catch(() => null)
  if (!d || d.appareils.some((a) => a.ceAppareil) || !Object.values(d.preferences).some(Boolean)) return
  alertes.value = { clePublique: d.clePublique, proposer: true }
}
async function accepterAlertes() {
  try {
    await activerAlertes(alertes.value.clePublique)
    alertes.value = { fait: true }
    setTimeout(() => (alertes.value = null), 8000)
  } catch (e) {
    alertes.value = { ...alertes.value, erreur: e.message }
  }
}
function refuser() {
  refuserAlertes()
  alertes.value = null
}
chargerAlertes()

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

// « Écouter » : la date, l'heure et le programme du jour lus à voix haute (texte préparé par
// le serveur, le même que donnera Alexa)
const lecture = lectureDisponible()
const lecteurOccupe = ref(false)
async function ecouterJournee() {
  lecteurOccupe.value = true
  try {
    parler((await api('GET', '/voix/journee')).texte)
  } finally {
    lecteurOccupe.value = false
  }
}

const jour = () => maintenant.value.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const heure = () => maintenant.value.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const moment = () => {
  const h = maintenant.value.getHours()
  return h < 6 || h >= 22 ? 'C\'est la nuit.' : h < 12 ? 'C\'est le matin.' : h < 18 ? 'C\'est l\'après-midi.' : 'C\'est le soir.'
}
</script>

<template>
  <main class="accompagne">
    <p class="bonjour">Bonjour {{ session.utilisateur.prenom }}</p>
    <p class="jour">Nous sommes {{ jour() }}</p>
    <p class="heure">{{ heure() }}</p>
    <p class="moment">{{ moment() }}</p>
    <button v-if="lecture" class="ecouter" :disabled="lecteurOccupe" @click="ecouterJournee">
      <Icone nom="son" class="en-ligne" /> Écouter ma journée
    </button>
    <div class="cartes">
    <RouterLink v-if="programme.length" to="/agenda" class="programme">
      <span class="titre-programme">Aujourd'hui</span>
      <span v-for="rdv in programme.slice(0, 3)" :key="rdv.cle" class="ligne-programme">
        <strong>{{ horaire(rdv) }}</strong> {{ rdv.titre }}
      </span>
      <span v-if="programme.length > 3" class="suite">et {{ programme.length - 3 }} autre{{ programme.length > 4 ? 's' : '' }}…</span>
    </RouterLink>
    <RouterLink v-if="nouvellesPhotos.length" :to="lienPhotos" class="photos">
      <img v-if="nouvellesPhotos[0].couverture" :src="nouvellesPhotos[0].couverture" alt="" class="miniature" />
      <span v-else class="miniature vide"><Icone nom="photo" class="em" /></span>
      <span class="texte-photos">
        <strong>{{ nombreNouvelles }} nouvelle{{ nombreNouvelles > 1 ? 's' : '' }} photo{{ nombreNouvelles > 1 ? 's' : '' }}</strong>
        <span class="noms">{{ nouvellesPhotos.map((a) => a.nom).join(', ') }}</span>
      </span>
    </RouterLink>
    <RouterLink v-else-if="photos?.total" to="/photos" class="photos calme">
      <Icone nom="photo" class="en-ligne" /> Pas de nouvelle photo
    </RouterLink>
    <div v-if="alertes?.proposer" class="alertes">
      <button class="activer" @click="accepterAlertes"><Icone nom="cloche" class="en-ligne" /> Recevoir les alertes</button>
      <span class="explication">Mes rendez-vous et les nouvelles photos, même quand l'écran est éteint.</span>
      <span v-if="alertes.erreur" class="erreur">{{ alertes.erreur }}</span>
      <button class="non" @click="refuser">Non merci</button>
    </div>
    <p v-else-if="alertes?.fait" class="alertes fait"><Icone nom="coche" class="en-ligne" /> Les alertes arriveront sur cet appareil.</p>
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
.ecouter {
  align-self: center;
  font-size: 1.6rem;
  font-weight: 700;
  padding: 14px 28px;
  border-radius: 20px;
  margin-bottom: 16px;
  background: var(--vert-clair);
  color: var(--vert);
}
.ligne-programme strong { color: var(--vert); margin-right: 8px; }
.suite { color: var(--gris); font-size: 1.3rem; }
/* Proposition des alertes : discrète, sous le reste */
.alertes {
  align-self: center;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 14px;
  max-width: 560px;
  background: #eef0f6;
  border-radius: 20px;
  padding: 12px 18px;
  color: var(--bleu-nuit);
}
.alertes .activer { font-size: 1.4rem; font-weight: 700; padding: 12px 22px; border-radius: 16px; background: var(--bleu-nuit); }
.alertes .explication { font-size: 1.15rem; color: var(--gris); flex: 1 1 200px; text-align: left; }
.alertes .non { background: none; color: var(--gris); font-size: 1.1rem; text-decoration: underline; }
.alertes .erreur { flex-basis: 100%; font-size: 1.1rem; }
.alertes.fait { font-size: 1.3rem; color: var(--vert); background: var(--vert-clair); margin: 0; }
/* Smartphone */
@media (max-width: 600px) {
  .accompagne { padding: 16px 12px; }
  .bonjour { font-size: 2.2rem; }
  .jour { font-size: 1.5rem; }
  .heure { font-size: 3.4rem; }
  .moment { font-size: 1.3rem; margin: 0 0 8px; }
  .ecouter { font-size: 1.25rem; padding: 12px 20px; margin-bottom: 12px; }
  .programme { align-self: stretch; padding: 14px 16px; font-size: 1.25rem; border-radius: 18px; }
  .ligne-programme strong { display: block; margin: 0; }
  .cartes { flex-direction: column; flex-wrap: nowrap; align-items: stretch; gap: 12px; }
  .photos { align-self: stretch; max-width: none; padding: 8px 12px 8px 8px; border-radius: 16px; gap: 10px; }
  .miniature { width: 60px; height: 45px; }
  .texte-photos strong { font-size: 1.2rem; }
  .noms { font-size: 1rem; }
  .photos.calme { font-size: 1.15rem; justify-content: center; }
  .alertes { align-self: stretch; max-width: none; padding: 10px 12px; border-radius: 16px; }
  .alertes .activer { font-size: 1.2rem; width: 100%; }
  .alertes .explication { font-size: 1rem; text-align: center; }
}
</style>
