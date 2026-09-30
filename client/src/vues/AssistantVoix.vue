<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { assistant, ecouter, parler, arreterParole } from '../voix.js'
import Icone from '../navigation/Icone.vue'

// Assistant vocal de la personne accompagnée, ouvert par le bouton « Parler ».
// Le serveur cherche des mots-clés dans ce qui a été dit (server/voix/assistant.js) ; si une
// page correspond, on l'ouvre en lisant la réponse, sinon on propose de gros boutons.
const router = useRouter()
const etat = ref('ecoute') // ecoute | recherche | reponse
const reponse = ref(null) // { texte, choix }
const entendu = ref('')

async function traiter(demande) {
  etat.value = 'recherche'
  try {
    const r = await demande()
    parler(r.texte)
    if (r.lien && !r.choix) {
      if (router.currentRoute.value.fullPath !== r.lien) router.push(r.lien)
      // Les réponses longues (programme du jour) restent affichées pour être relues
      if (r.texte.length < 60) return fermer({ garderVoix: true })
    }
    reponse.value = r
  } catch (e) {
    reponse.value = { texte: e.message, choix: null }
  }
  etat.value = 'reponse'
}

async function demarrer() {
  etat.value = 'ecoute'
  reponse.value = null
  entendu.value = ''
  let phrases
  try {
    phrases = await ecouter()
  } catch (e) {
    reponse.value = { texte: e.message }
    etat.value = 'reponse'
    return
  }
  if (!assistant.ouvert) return
  if (!phrases.length) {
    reponse.value = { texte: 'Je n\'ai rien entendu. Vous pouvez recommencer, ou choisir :', choix: null, rien: true }
    parler('Je n\'ai rien entendu.')
    etat.value = 'reponse'
    return
  }
  entendu.value = phrases[0]
  await traiter(() => api('POST', '/voix/commande', { phrases }))
}

function choisir(c) {
  if (c.lien) {
    router.push(c.lien)
    return fermer()
  }
  traiter(() => api('POST', '/voix/intention', { intention: c.intention }))
}

function fermer({ garderVoix = false } = {}) {
  if (!garderVoix) arreterParole()
  assistant.ouvert = false
}

watch(() => assistant.ouvert, (ouvert) => ouvert && demarrer(), { immediate: true })

// Choix proposés quand on n'a rien entendu (les mêmes que ceux du serveur)
const CHOIX = [
  { libelle: 'Ma journée', icone: 'soleil', intention: 'journee' },
  { libelle: 'Mes photos', icone: 'photo', lien: '/photos' },
  { libelle: 'Ma famille', icone: 'famille', lien: '/famille' },
  { libelle: 'Mon agenda', icone: 'agenda', lien: '/agenda' }
]
</script>

<template>
  <div v-if="assistant.ouvert" class="assistant" role="dialog" aria-modal="true" aria-label="Assistant vocal">
    <div class="contenu">
      <template v-if="etat === 'ecoute'">
        <Icone nom="micro" class="micro em" />
        <p class="grand">Je vous écoute…</p>
        <p class="aide-voix">Dites par exemple « Mes photos » ou « Qu'est-ce que je fais aujourd'hui ? »</p>
      </template>

      <template v-else-if="etat === 'recherche'">
        <p class="grand">Un instant…</p>
        <p v-if="entendu" class="entendu">« {{ entendu }} »</p>
      </template>

      <template v-else-if="reponse">
        <p v-if="entendu" class="entendu">« {{ entendu }} »</p>
        <p class="grand">{{ reponse.texte }}</p>
        <div v-if="reponse.choix || reponse.rien" class="choix">
          <button v-for="c in reponse.choix ?? CHOIX" :key="c.libelle" class="choix-bouton" @click="choisir(c)">
            <Icone :nom="c.icone" class="emoji em" />{{ c.libelle }}
          </button>
        </div>
        <button class="principal" @click="demarrer"><Icone nom="micro" class="en-ligne" /> Parler à nouveau</button>
      </template>

      <button class="fermer" @click="fermer()">Fermer</button>
    </div>
  </div>
</template>

<style scoped>
.assistant {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgb(35 48 90 / 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.contenu {
  background: white;
  border-radius: 28px;
  padding: 32px 28px;
  width: min(760px, 100%);
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  text-align: center;
}
.micro { color: var(--vert); font-size: 5rem; animation: pulsation 1.4s ease-in-out infinite; }
@keyframes pulsation { 50% { transform: scale(1.15); } }
.grand { font-size: 2.2rem; font-weight: 700; color: var(--bleu-nuit); margin: 0; line-height: 1.3; }
.aide-voix { font-size: 1.4rem; color: var(--gris); margin: 0; }
.entendu { font-size: 1.4rem; color: var(--gris); font-style: italic; margin: 0; }
.choix { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; width: 100%; }
.choix-bouton {
  min-height: 120px;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 1.7rem;
  font-weight: 700;
  color: var(--bleu-nuit);
  background: #f3f0ea;
}
.emoji { font-size: 3rem; line-height: 1; }
button.principal { font-size: 1.7rem; font-weight: 700; padding: 18px 32px; border-radius: 20px; }
button.fermer { font-size: 1.5rem; padding: 14px 32px; border-radius: 20px; background: var(--vert-clair); color: var(--vert); }
@media (max-width: 600px) {
  .contenu { padding: 24px 16px; gap: 14px; border-radius: 20px; }
  .micro { font-size: 3.6rem; }
  .grand { font-size: 1.6rem; }
  .aide-voix, .entendu { font-size: 1.15rem; }
  .choix { gap: 10px; }
  .choix-bouton { min-height: 96px; font-size: 1.25rem; border-radius: 18px; }
  .emoji { font-size: 2.3rem; }
  button.principal { font-size: 1.3rem; padding: 14px 20px; }
  button.fermer { font-size: 1.2rem; }
}
</style>
