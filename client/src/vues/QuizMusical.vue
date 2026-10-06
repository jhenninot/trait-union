<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'
import Icone from '../navigation/Icone.vue'

// « Quelle est cette chanson ? » : un extrait de 30 secondes, 2 ou 3 titres à choisir. Comme les
// autres jeux, pas de score ni de chrono : une erreur ou « Je ne sais pas » donne la réponse, et
// l'extrait continue. « J'aime » / « J'aime moins » aident les aidants à choisir les prochaines chansons.
const props = defineProps({ pour: { type: String, default: null } }) // essai par un aidant : pas de réactions enregistrées
const emit = defineEmits(['quitter', 'rejouer'])
const questions = ref([])
const etat = ref('chargement') // 'chargement', 'jeu', 'vide' ou 'fini'
const n = ref(0)
const reponse = ref(null) // null, 'bonne', 'presque' ou 'inconnu'
const reaction = ref(null) // 'aime' ou 'moins' une fois choisie pour la chanson
const lecture = ref(false)
const petit = window.matchMedia('(max-width: 600px)').matches
let audio = null

onMounted(async () => {
  try {
    questions.value = (await api('GET', `/musique/quiz${props.pour ? `?pour=${props.pour}` : ''}`)).questions
  } catch { /* hors ligne : message plus bas */ }
  etat.value = questions.value.length ? 'jeu' : 'vide'
  if (etat.value === 'jeu') jouerExtrait()
})
onUnmounted(arreter)

const q = computed(() => questions.value[n.value])

function arreter() {
  if (audio) { audio.pause(); audio.onended = null; audio = null }
  lecture.value = false
}
function jouerExtrait() {
  arreter()
  audio = new Audio(q.value.apercu)
  audio.onended = () => { lecture.value = false }
  // Si le navigateur refuse la lecture automatique, le gros bouton la lancera
  audio.play().then(() => { lecture.value = true }).catch(() => { lecture.value = false })
}
function basculer() {
  if (!audio) return jouerExtrait()
  if (lecture.value) { audio.pause(); lecture.value = false } else { audio.play().then(() => { lecture.value = true }).catch(() => {}) }
}
const reecouter = () => {
  if (!audio) return jouerExtrait()
  audio.currentTime = 0
  audio.play().then(() => { lecture.value = true }).catch(() => {})
}

const titreReponse = computed(() => ({ bonne: 'Oui, bravo !', presque: 'Presque !', inconnu: 'Ce n\'est pas grave.' })[reponse.value])
const phrase = computed(() => `C'était « ${q.value.titre} », de ${q.value.artiste}${q.value.annee ? ` (${q.value.annee})` : ''}.`)

const repondre = (c) => { if (!reponse.value) reponse.value = c.bonne ? 'bonne' : 'presque' }
const passer = () => { if (!reponse.value) reponse.value = 'inconnu' }
function noter(r) {
  if (reaction.value) return
  reaction.value = r
  if (props.pour) return
  api('POST', '/musique/reaction', { titre: q.value.titre, artiste: q.value.artiste, reaction: r }).catch(() => {})
}
function suivante() {
  if (n.value + 1 >= questions.value.length) { arreter(); etat.value = 'fini'; return }
  n.value++
  reponse.value = null
  reaction.value = null
  jouerExtrait()
}
</script>

<template>
  <div class="quiz">
    <template v-if="etat === 'chargement'">
      <h1>Quelle est cette chanson ?</h1>
      <p class="sous">Un instant, je cherche de la musique…</p>
    </template>

    <template v-else-if="etat === 'vide'">
      <h1>Quelle est cette chanson ?</h1>
      <p class="sous">Je n'arrive pas à trouver de musique pour l'instant. Vérifiez que l'appareil est connecté à Internet.</p>
      <button type="button" class="gros second" @click="emit('quitter')">Retour aux jeux</button>
    </template>

    <template v-else-if="etat === 'fini'">
      <h1>Bravo !</h1>
      <div class="bulle"><p class="grand">Vous avez écouté {{ questions.length }} chanson{{ questions.length > 1 ? 's' : '' }}.</p><p class="moyen">C'était un beau moment.</p></div>
      <div class="actions">
        <button type="button" class="gros" @click="emit('rejouer')"><Icone nom="lecture" /> Rejouer</button>
        <button type="button" class="gros second" @click="emit('quitter')">Retour aux jeux</button>
      </div>
    </template>

    <template v-else>
      <div class="tete">
        <button type="button" class="retour" @click="emit('quitter')"><Icone nom="precedent" /> Jeux</button>
        <h1>Quelle est cette chanson ?</h1>
      </div>
      <p class="etape">Question {{ n + 1 }} sur {{ questions.length }}
        <span class="points"><i v-for="k in questions.length" :key="k" :class="{ fait: k <= n + 1 }"></i></span></p>
      <div class="disque" :style="{ width: `${petit ? 170 : 210}px`, height: `${petit ? 170 : 210}px` }">
        <img v-if="reponse && q.pochette" :src="q.pochette" alt="" />
        <Icone v-else nom="son" />
      </div>
      <div class="lecteur">
        <button type="button" class="gros" @click="basculer"><Icone :nom="lecture ? 'pause' : 'lecture'" /> {{ lecture ? 'Pause' : 'Écouter' }}</button>
        <button v-if="!lecture" type="button" class="gros second" @click="reecouter">Réécouter</button>
      </div>
      <template v-if="!reponse">
        <p class="question">Quel est le titre de cette chanson ?</p>
        <div class="reponses">
          <button v-for="c in q.choix" :key="c.texte" type="button" class="rep" @click="repondre(c)">{{ c.texte }}</button>
        </div>
        <button type="button" class="pas-sur" @click="passer"><Icone nom="question" /> Je ne sais pas</button>
      </template>
      <template v-else>
        <div class="bulle" :class="{ chaude: reponse !== 'bonne' }">
          <p class="grand">{{ titreReponse }}</p>
          <p class="moyen">{{ phrase }}</p>
        </div>
        <div v-if="!reaction" class="avis">
          <button type="button" class="avis-bouton" @click="noter('aime')"><Icone nom="coeur" /> J'aime</button>
          <button type="button" class="avis-bouton" @click="noter('moins')">J'aime moins</button>
        </div>
        <p v-else class="merci">Merci, c'est noté.</p>
        <button type="button" class="gros" @click="suivante">{{ n + 1 >= questions.length ? 'Terminer' : 'Chanson suivante' }} <Icone nom="suivant" /></button>
      </template>
    </template>
  </div>
</template>

<style scoped>
.quiz { display: flex; flex-direction: column; align-items: center; width: 100%; }
h1 { font-size: 2.6rem; text-align: center; margin: 0; }
.sous { font-size: 1.5rem; color: var(--gris); margin: 10px 0 18px; text-align: center; max-width: 700px; }
.tete { width: 100%; position: relative; display: flex; justify-content: center; align-items: center; min-height: 60px; margin-bottom: 6px; }
.retour { position: absolute; left: 0; display: flex; align-items: center; gap: 8px; background: #f3f0ea; color: var(--bleu-nuit); border-radius: 16px; padding: 12px 18px; font-weight: 700; font-size: 1.2rem; }
.retour :deep(.icone) { width: 26px; height: 26px; }
.etape { font-size: 1.25rem; color: var(--gris); display: flex; gap: 10px; align-items: center; margin: 0 0 12px; }
.points { display: flex; gap: 8px; }
.points i { width: 16px; height: 16px; border-radius: 50%; background: #dcd8d0; }
.points i.fait { background: var(--vert); }
.disque { border-radius: 50%; overflow: hidden; background: var(--vert-clair); color: var(--vert); display: grid; place-items: center; }
.disque img { width: 100%; height: 100%; object-fit: cover; }
.disque :deep(.icone) { width: 40%; height: 40%; }
.lecteur { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; margin: 14px 0 4px; }
.gros { display: inline-flex; align-items: center; gap: 12px; background: var(--vert); color: white; font-weight: 700; font-size: 1.6rem; border-radius: 20px; padding: 18px 38px; margin-top: 6px; }
.gros :deep(.icone) { width: 32px; height: 32px; }
.gros.second { background: #f3f0ea; color: var(--bleu-nuit); }
.question { font-size: 2rem; color: var(--bleu-nuit); font-weight: 700; margin: 12px 0; text-align: center; max-width: 900px; }
.reponses { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; width: 100%; max-width: 940px; }
.rep { background: white; color: var(--bleu-nuit); border: 3px solid #e3dfd7; border-radius: 22px; min-height: 96px; font-size: 1.7rem; font-weight: 700; box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); padding: 8px 14px; }
.pas-sur { margin-top: 16px; display: flex; align-items: center; gap: 10px; font-size: 1.35rem; font-weight: 700; color: var(--bleu-nuit); background: #f3f0ea; border-radius: 18px; padding: 16px 26px; }
.pas-sur :deep(.icone) { width: 30px; height: 30px; }
.bulle { background: var(--vert-clair); border-radius: 24px; padding: 18px 30px; text-align: center; max-width: 820px; margin: 14px 0 8px; }
.bulle p { margin: 0; }
.grand { font-size: 2.1rem; font-weight: 700; color: var(--vert); }
.moyen { font-size: 1.6rem; color: var(--bleu-nuit); margin-top: 8px !important; }
.bulle.chaude { background: #fff7ec; }
.bulle.chaude .grand { color: #b46a22; }
.avis { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; margin: 4px 0; }
.avis-bouton { display: inline-flex; align-items: center; gap: 10px; font-size: 1.3rem; font-weight: 700; color: var(--vert); background: var(--vert-clair); border-radius: 16px; padding: 12px 22px; }
.avis-bouton:last-child { color: var(--bleu-nuit); background: #f3f0ea; }
.avis-bouton :deep(.icone) { width: 26px; height: 26px; }
.merci { font-size: 1.3rem; color: var(--gris); margin: 6px 0; }
.actions { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; margin-top: 10px; }
@media (max-width: 600px) {
  h1 { font-size: 1.35rem; }
  .sous { font-size: 1.15rem; }
  .tete { flex-direction: column; align-items: flex-start; gap: 8px; }
  .retour { position: static; font-size: 0.95rem; padding: 9px 12px; }
  .etape { font-size: 1rem; }
  .gros { font-size: 1.2rem; padding: 14px 24px; }
  .question { font-size: 1.4rem; }
  .reponses { grid-template-columns: 1fr; gap: 12px; }
  .rep { min-height: 70px; font-size: 1.3rem; border-radius: 18px; }
  .pas-sur { font-size: 1.05rem; padding: 12px 18px; }
  .bulle { padding: 14px 18px; }
  .grand { font-size: 1.5rem; }
  .moyen { font-size: 1.1rem; }
  .avis-bouton { font-size: 1.1rem; padding: 10px 16px; }
}
</style>
