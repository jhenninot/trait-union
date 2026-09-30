<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { session } from '../session.js'
import { rendezVousAccompagne, debutDuJour, ajouterJours, horaire } from '../agenda.js'

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
let minuterieProgramme
onMounted(() => {
  minuterie = setInterval(() => (maintenant.value = new Date()), 30_000)
  chargerProgramme()
  minuterieProgramme = setInterval(chargerProgramme, 5 * 60_000)
})
onUnmounted(() => {
  clearInterval(minuterie)
  clearInterval(minuterieProgramme)
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
    <RouterLink v-if="programme.length" to="/agenda" class="programme">
      <span class="titre-programme">Aujourd'hui</span>
      <span v-for="rdv in programme.slice(0, 3)" :key="rdv.id" class="ligne-programme">
        <strong>{{ horaire(rdv) }}</strong> {{ rdv.titre }}
      </span>
      <span v-if="programme.length > 3" class="suite">et {{ programme.length - 3 }} autre{{ programme.length > 4 ? 's' : '' }}…</span>
    </RouterLink>
  </main>
</template>

<style scoped>
.accompagne {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
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
.ligne-programme strong { color: var(--vert); margin-right: 8px; }
.suite { color: var(--gris); font-size: 1.3rem; }
</style>
