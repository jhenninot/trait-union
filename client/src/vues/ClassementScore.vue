<script setup>
import { ref } from 'vue'
import { api } from '../api.js'
import Icone from '../navigation/Icone.vue'

// Fin d'un jeu avec score : le score de la partie, le meilleur score du joueur et les trois meilleurs scores,
// avec un bouton pour partager le score dans la conversation « Toute la famille ».
// jeu : clé du jeu ('musique', 'qui', 'age', 'souvenirs') ; pour / cercleId : partie jouée pour une personne accompagnée
const props = defineProps({ total: Number, maximum: Number, meilleur: Number, classement: { type: Array, default: () => [] }, questions: Number, jeu: String, pour: String, cercleId: String })
const etat = ref('') // '' | 'envoi' | 'fait' | 'erreur'
async function partager() {
  etat.value = 'envoi'
  try {
    await api('POST', '/messagerie/partager-score', { jeu: props.jeu, points: props.total, questions: props.questions, pour: props.pour || undefined, cercleId: props.cercleId || undefined })
    etat.value = 'fait'
  } catch { etat.value = 'erreur' }
}
</script>

<template>
  <div class="bulle">
    <p class="grand">{{ total }} points sur {{ maximum }}</p>
    <p class="moyen">{{ total > meilleur && meilleur > 0 ? `Nouveau record personnel, bravo ! (avant : ${meilleur} points)` : meilleur > total ? `Votre meilleur score : ${meilleur} points.` : 'C\'était un beau moment.' }}</p>
  </div>
  <div v-if="classement.length" class="podium">
    <p class="titre-podium">Les meilleurs scores ({{ questions }} questions)</p>
    <ol>
      <li v-for="(c, i) in classement" :key="i" :class="{ moi: c.moi }">
        <span class="rang">{{ i + 1 }}</span><span class="nom">{{ c.prenom }}{{ c.moi ? ' (vous)' : '' }}</span><strong>{{ c.points }} points</strong>
      </li>
    </ol>
  </div>
  <div v-if="jeu" class="partage">
    <p v-if="etat === 'fait'" class="fait"><Icone nom="coche" class="en-ligne" /> Score partagé avec la famille.</p>
    <button v-else type="button" class="partager" :disabled="etat === 'envoi'" @click="partager"><Icone nom="message" class="en-ligne" /> Partager mon score avec la famille</button>
    <p v-if="etat === 'erreur'" class="erreur">Le score n'a pas pu être partagé. Réessayez.</p>
  </div>
</template>

<style scoped>
.bulle { background: var(--vert-clair); border-radius: 24px; padding: 18px 30px; text-align: center; max-width: 820px; margin: 14px 0 8px; }
.bulle p { margin: 0; }
.grand { font-size: 2.1rem; font-weight: 700; color: var(--vert); }
.moyen { font-size: 1.6rem; color: var(--bleu-nuit); margin-top: 8px !important; }
.podium { background: white; border-radius: 22px; box-shadow: 0 1px 4px rgb(0 0 0 / 0.1); padding: 16px 24px; margin: 8px 0 14px; width: min(560px, 100%); }
.titre-podium { font-size: 1.3rem; font-weight: 700; color: var(--bleu-nuit); margin: 0 0 8px; text-align: center; }
.podium ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.podium li { display: flex; align-items: center; gap: 14px; font-size: 1.4rem; padding: 8px 12px; border-radius: 14px; color: var(--bleu-nuit); }
.podium li.moi { background: var(--vert-clair); color: var(--vert); }
.rang { width: 36px; height: 36px; border-radius: 50%; background: #f3f0ea; display: grid; place-items: center; font-weight: 700; flex: none; }
.nom { flex: 1; }
.podium strong { white-space: nowrap; }
.partage { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: 4px 0 10px; }
.partager { display: inline-flex; align-items: center; gap: 10px; background: var(--vert-clair); color: var(--vert); font-weight: 700; font-size: 1.3rem; border-radius: 18px; padding: 14px 26px; }
.partager :deep(.icone) { width: 28px; height: 28px; }
.fait { margin: 0; font-size: 1.3rem; font-weight: 700; color: var(--vert); }
.erreur { margin: 0; font-size: 1.1rem; color: #b46a22; }
@media (max-width: 600px) {
  .partager { font-size: 1.05rem; padding: 12px 18px; }
  .podium li { font-size: 1.15rem; }
  .grand { font-size: 1.5rem; }
  .moyen { font-size: 1.1rem; }
}
</style>
