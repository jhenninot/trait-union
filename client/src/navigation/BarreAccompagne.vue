<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api.js'
import { assistant, ecouteDisponible, parler, lectureDisponible } from '../voix.js'
import { etatMessagerie, ecouterMessagerie } from '../messagerie.js'
import Icone from './Icone.vue'
import { ouvrirAide } from '../aide.js'
import { session } from '../session.js'
import { reglagesJeux, jeuxDisponibles, chargerReglagesJeux } from '../jeux.js'

// Barre de la personne accompagnée : quelques gros boutons, toujours au même endroit,
// avec les mêmes pictogrammes que le menu des aidants.
// Ajouter ici les prochaines rubriques quand elles existeront.
const boutons = [
  { chemin: '/', icone: 'accueil', libelle: 'Accueil' },
  { chemin: '/agenda', icone: 'agenda', libelle: 'Mon agenda', agenda: true },
  { chemin: '/photos', icone: 'photo', libelle: 'Mes photos' },
  { chemin: '/famille', icone: 'famille', libelle: 'Ma famille', aussi: ['/mon-arbre'] },
  { chemin: '/messages', icone: 'message', libelle: 'Mes messages', badge: true },
  { chemin: '/jeux', icone: 'jeux', libelle: 'Jeux', jeux: true }
]
const route = useRoute()
// Le bouton « Jeux » disparaît quand les aidants ont coupé l'accès
const visibles = computed(() => boutons.filter((b) => (!b.jeux || (reglagesJeux.charge && jeuxDisponibles())) && (!b.agenda || session.utilisateur?.agendaActif !== false)))
// Le bouton « Mon agenda » disparaît quand les aidants ont coupé l'agenda
// « Parler » ouvre l'assistant vocal, si l'appareil sait reconnaître la voix
const voix = ecouteDisponible()

// Lecture à voix haute des nouveaux messages dès leur arrivée, si les aidants l'ont activée
// (une seule fois par message, quel que soit l'écran affiché)
const dejaLus = new Set()
async function lireNouveaux() {
  if (!lectureDisponible()) return
  try {
    const { messages, reglages } = await api('GET', '/messagerie/accompagne')
    if (!reglages.lectureAuto) return
    const nouveau = messages.find((m) => m.nouveau && !dejaLus.has(m.id))
    if (!nouveau) return
    messages.forEach((m) => dejaLus.add(m.id))
    const quoi = nouveau.type === 'photo' ? 'vous a envoyé une photo' : nouveau.type === 'vocal' ? 'vous a envoyé un message vocal'
      : nouveau.type === 'sondage' ? 'cherche une date pour' : 'vous a écrit'
    parler(`${nouveau.auteur.prenom} ${quoi}. ${nouveau.type === 'vocal' ? '' : nouveau.texte ?? ''}`)
  } catch { /* hors ligne */ }
}
let arreter
onMounted(() => {
  chargerReglagesJeux()
  arreter = ecouterMessagerie((type, d) => type === 'message' && d.auteurId && route.path !== '/messages' && lireNouveaux())
})
onUnmounted(() => arreter?.())
</script>

<template>
  <nav class="barre" aria-label="Menu">
    <!-- Bouton d'aide : juste au-dessus de la barre, à droite, sans gêner les boutons des pages -->
    <button type="button" class="aide" aria-label="Aide sur cet écran" @click="ouvrirAide"><Icone nom="question" /></button>
    <RouterLink v-for="b in visibles" :key="b.chemin" :to="b.chemin" class="bouton" exact-active-class="actif" :class="{ actif: b.aussi?.includes(route.path) }">
      <span class="pictogramme"><Icone :nom="b.icone" /><span v-if="b.badge && etatMessagerie.nonLus" class="badge">{{ etatMessagerie.nonLus }}</span></span>
      {{ b.libelle }}
    </RouterLink>
    <button v-if="voix" type="button" class="bouton parler" @click="assistant.ouvert = true">
      <Icone nom="micro" />
      Parler
    </button>
  </nav>
</template>

<style scoped>
.barre {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 16px;
  padding: 16px 24px calc(20px + env(safe-area-inset-bottom));
  background: white;
  border-top: 2px solid #ebe8e3;
  position: relative;
}
.aide {
  position: absolute;
  right: 16px;
  bottom: calc(100% + 12px);
  width: 64px;
  height: 64px;
  padding: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--vert-clair);
  color: var(--vert);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.2);
}
.aide :deep(.icone) { width: 38px; height: 38px; stroke-width: 2.4; }
.bouton {
  min-height: 130px;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: clamp(1.1rem, 1.95vw, 1.9rem);
  line-height: 1.1;
  text-align: center;
  font-weight: 700;
  color: var(--bleu-nuit);
  background: #f3f0ea;
  text-decoration: none;
}
.bouton.actif { background: var(--vert); color: white; }
button.bouton { font: inherit; font-size: clamp(1.1rem, 1.95vw, 1.9rem); font-weight: 700; padding: 0; cursor: pointer; }
.bouton.parler { background: var(--vert-clair); color: var(--vert); }
.bouton :deep(.icone) { width: 52px; height: 52px; stroke-width: 2.2; }
.pictogramme { position: relative; display: inline-flex; }
.badge { position: absolute; top: -8px; right: -18px; min-width: 30px; height: 30px; padding: 0 8px; border-radius: 999px; background: var(--rouge); color: white; font-size: 1.1rem; font-weight: 700; display: grid; place-items: center; }
@media (max-width: 600px) {
  .aide { width: 52px; height: 52px; right: 10px; bottom: calc(100% + 10px); }
  .aide :deep(.icone) { width: 30px; height: 30px; }
  .barre { padding: 8px 4px calc(8px + env(safe-area-inset-bottom)); gap: 4px; }
  .bouton, button.bouton { min-height: 80px; font-size: 0.66rem; line-height: 1.15; text-align: center; padding: 6px 2px; border-radius: 16px; gap: 4px; }
  .bouton :deep(.icone) { width: 32px; height: 32px; }
  .badge { min-width: 20px; height: 20px; top: -6px; right: -12px; font-size: 0.75rem; padding: 0 5px; }
}
</style>
