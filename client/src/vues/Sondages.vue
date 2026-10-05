<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { api } from '../api.js'
import Icone from '../navigation/Icone.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import CarteSondage from './CarteSondage.vue'
import DetailSondage from './DetailSondage.vue'
import FenetreSondage from './FenetreSondage.vue'
import { confirmer } from '../fenetre.js'
import { ecouterMessagerie } from '../messagerie.js'
import { jourLong, momentTexte, listeSondages, supprimerSondage } from '../sondages.js'

// Page « Sondages » des aidants et des proches (demande de Julien, 2026-10-01) : les sondages de
// dates de « Toute la famille », en cours puis terminés. Un sondage terminé peut être supprimé,
// en retirant ou non son rendez-vous de l'agenda.
const route = useRoute()
const cercle = ref(null)
const donnees = ref(null)
const erreur = ref('')
const detail = ref(null) // { id, mode }
const nouveau = ref(false)

async function charger() {
  try {
    const id = route.params.id
    const [c, d] = await Promise.all([api('GET', `/cercles/${id}`), listeSondages(id)])
    if (id !== route.params.id) return
    cercle.value = c
    donnees.value = d
    erreur.value = ''
  } catch (e) {
    erreur.value = e.message
  }
}
watch(() => route.params.id, () => {
  donnees.value = null
  charger()
}, { immediate: true })
// Les réponses arrivent en direct
let arreter
onMounted(() => (arreter = ecouterMessagerie((type) => type !== 'lu' && charger())))
onUnmounted(() => arreter?.())

async function supprimer(s) {
  if (!await confirmer(`Supprimer le sondage « ${s.titre} » ? Sa carte sera effacée du fil « Toute la famille ».`, { titre: 'Supprimer le sondage', oui: 'Supprimer', danger: true, icone: 'effacer' })) return
  let agenda = false
  if (s.rendezVousId) {
    agenda = await confirmer(`Retirer aussi de l'agenda le rendez-vous du ${jourLong(s.dateRetenue).toLowerCase()} ?`, { titre: 'Et le rendez-vous ?', oui: 'Oui, le retirer', non: 'Non, le garder', icone: 'agenda' })
  }
  try {
    await supprimerSondage(s.id, { agenda })
    await charger()
  } catch (e) {
    erreur.value = e.message
  }
}

function lance() {
  nouveau.value = false
  charger()
}
</script>

<template>
  <main class="page-sondages">
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <template v-if="donnees">
      <p v-if="cercle" class="aide surtitre">{{ cercle.nom }}</p>
      <div class="titre">
        <h1>Sondages</h1>
        <button v-if="donnees.peutSonder" @click="nouveau = true"><Icone nom="sondage" class="en-ligne" /> Nouveau sondage</button>
      </div>
      <p class="aide">Pour trouver une date qui convient à tous : chaque sondage est publié dans « Toute la famille », et chacun y répond, les personnes accompagnées aussi.</p>

      <h2>En cours</h2>
      <p v-if="!donnees.enCours.length" class="vide">Aucun sondage en cours.</p>
      <div v-else class="cartes">
        <CarteSondage v-for="s in donnees.enCours" :key="s.id" :sondage="s"
          @repondre="detail = { id: s.id, mode: 'repondre' }" @detail="detail = { id: s.id, mode: 'detail' }" />
      </div>

      <h2>Terminés</h2>
      <p v-if="!donnees.termines.length" class="vide">Aucun sondage terminé.</p>
      <ul v-else class="termines">
        <li v-for="s in donnees.termines" :key="s.id" class="carte termine">
          <div class="infos">
            <strong>{{ s.titre }}</strong>
            <span class="retenue"><Icone nom="coche" class="en-ligne" /> {{ jourLong(s.dateRetenue) }}, {{ momentTexte(s) }}</span>
            <span class="aide"><template v-if="s.lieu">{{ s.lieu }} · </template>{{ s.repondu }} réponse{{ s.repondu > 1 ? 's' : '' }} sur {{ s.nombre }}<template v-if="s.auteur"> · proposé par {{ s.auteur }}</template></span>
          </div>
          <div class="actions">
            <button class="secondaire" @click="detail = { id: s.id, mode: 'detail' }">Voir les réponses</button>
            <RouterLink v-if="s.rendezVousId" class="lien-agenda" :to="`/cercles/${route.params.id}/agenda`"><Icone nom="agenda" class="en-ligne" /> Agenda</RouterLink>
            <BoutonIcone v-if="s.peutGerer" icone="effacer" libelle="Supprimer le sondage" danger @click="supprimer(s)" />
          </div>
        </li>
      </ul>
    </template>

    <FenetreSondage v-if="nouveau && donnees" :conversation-id="donnees.conversationId" @fermer="nouveau = false" @enregistre="lance" />
    <DetailSondage v-if="detail" :key="detail.id + detail.mode" :sondage-id="detail.id" :cercle-id="route.params.id" :mode="detail.mode"
      @fermer="detail = null" @change="charger" />
  </main>
</template>

<style scoped>
.page-sondages { max-width: 1000px; }
.surtitre { margin: 0; }
.titre { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.titre button { display: inline-flex; align-items: center; gap: 6px; }
h2 { color: var(--bleu-nuit); font-size: 1.15rem; margin: 26px 0 10px; }
.vide { color: var(--gris); margin: 0; }
.cartes { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap: 14px; align-items: start; }
.cartes :deep(.carte-sondage) { width: 100%; }
.termines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.termine { margin: 0; padding: 12px 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.infos { flex: 1 1 280px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.infos strong { color: var(--bleu-nuit); }
.retenue { color: var(--vert); font-weight: 700; }
.infos .aide { margin: 0; font-size: 0.85rem; }
.actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.actions button { font-size: 0.9rem; padding: 8px 12px; }
.lien-agenda { display: inline-flex; align-items: center; gap: 6px; color: var(--vert); font-weight: 600; text-decoration: none; padding: 8px 6px; }
</style>
