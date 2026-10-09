<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'
import Icone from '../navigation/Icone.vue'
import ClassementScore from './ClassementScore.vue'

// « Quelle est cette chanson ? » : un extrait de 30 secondes, 2 ou 3 titres à choisir. Comme les
// autres jeux, pas de score ni de chrono : une erreur ou « Je ne sais pas » donne la réponse, et
// l'extrait continue. « J'aime » / « J'aime moins » aident les aidants à choisir les prochaines chansons.
const props = defineProps({ pour: { type: String, default: null }, score: { type: Boolean, default: false }, cercleId: { type: String, default: null } }) // essai par un aidant : pas de réactions enregistrées
const emit = defineEmits(['quitter', 'rejouer'])
const questions = ref([])
const etat = ref('chargement') // 'chargement', 'jeu', 'vide' ou 'fini'
const n = ref(0)
const reponse = ref(null) // null, 'bonne', 'presque' ou 'inconnu'
const reaction = ref(null) // 'aime' ou 'moins' une fois choisie pour la chanson
const lecture = ref(false)
const petit = window.matchMedia('(max-width: 600px)').matches
let audio = null

// Version avec score : 100 points par bonne réponse, plus jusqu'à 100 points de bonus de rapidité
// (qui diminue pendant 20 secondes après l'affichage de la question). Une erreur ne retire rien.
const BASE = 100, BONUS = 100, DELAI = 20
const total = ref(0)
const gain = ref(null) // { base, bonus } de la question en cours
let depart = 0
const maximum = computed(() => questions.value.length * (BASE + BONUS))
const meilleur = ref(0) // meilleur score du joueur avant cette partie
const classement = ref([]) // les trois meilleurs scores de ce quiz, tous joueurs confondus
function gagner() {
  const t = (Date.now() - depart) / 1000
  gain.value = { base: BASE, bonus: Math.round(BONUS * Math.max(0, 1 - t / DELAI)) }
  total.value += gain.value.base + gain.value.bonus
}
async function terminer() {
  etat.value = 'fini'
  if (!props.score) return
  try {
    const r = await api('POST', `/musique/scores${props.pour ? `?pour=${props.pour}` : ''}`, { points: total.value, questions: questions.value.length })
    meilleur.value = r.meilleur
    classement.value = r.classement
  } catch { /* hors ligne : le score de la partie reste affiché */ }
}

onMounted(async () => {
  try {
    questions.value = (await api('GET', `/musique/quiz${props.pour ? `?pour=${props.pour}` : ''}`)).questions
  } catch { /* hors ligne : message plus bas */ }
  etat.value = questions.value.length ? 'jeu' : 'vide'
  if (etat.value === 'jeu') { depart = Date.now(); jouerExtrait() }
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

function repondre(c) {
  if (reponse.value) return
  reponse.value = c.bonne ? 'bonne' : 'presque'
  if (props.score && c.bonne) gagner()
}
const passer = () => { if (!reponse.value) reponse.value = 'inconnu' }
function noter(r) {
  if (reaction.value) return
  reaction.value = r
  if (props.pour) return
  api('POST', '/musique/reaction', { titre: q.value.titre, artiste: q.value.artiste, reaction: r }).catch(() => {})
}
function suivante() {
  if (n.value + 1 >= questions.value.length) { arreter(); terminer(); return }
  n.value++
  gain.value = null
  reponse.value = null
  reaction.value = null
  depart = Date.now()
  jouerExtrait()
}
</script>

<template>
  <div class="quiz">
    <template v-if="etat === 'chargement'">
      <div class="attente" role="status" aria-live="polite">
        <div class="vinyle-attente" aria-hidden="true"><i></i><i></i><span></span></div>
        <p class="grand-texte">Un instant, je cherche de la musique…</p>
        <p class="sous">Cela peut prendre quelques secondes.</p>
      </div>
    </template>

    <template v-else-if="etat === 'vide'">
      <h1>Quelle est cette chanson ?</h1>
      <p class="sous">Je n'arrive pas à trouver de musique pour l'instant. Vérifiez que l'appareil est connecté à Internet.</p>
      <button type="button" class="gros second" @click="emit('quitter')">Retour aux jeux</button>
    </template>

    <template v-else-if="etat === 'fini'">
      <h1>Bravo !</h1>
      <ClassementScore v-if="score" jeu="musique" :pour="pour" :cercle-id="cercleId" :total="total" :maximum="maximum" :meilleur="meilleur" :classement="classement" :questions="questions.length" />
      <div v-else class="bulle"><p class="grand">Vous avez écouté {{ questions.length }} chanson{{ questions.length > 1 ? 's' : '' }}.</p><p class="moyen">C'était un beau moment.</p></div>
      <div class="actions">
        <button type="button" class="gros" @click="emit('rejouer')"><Icone nom="lecture" /> Rejouer</button>
        <button type="button" class="gros second" @click="emit('quitter')">Retour aux jeux</button>
      </div>
    </template>

    <template v-else>
      <div class="tete">
        <button type="button" class="retour" @click="emit('quitter')"><Icone nom="precedent" /> Jeux</button>
        <h1>{{ score ? 'Quiz avec score' : 'Quelle est cette chanson ?' }}</h1>
      </div>
      <p class="etape">Question {{ n + 1 }} sur {{ questions.length }}<span v-if="score" class="score">{{ total }} point{{ total > 1 ? 's' : '' }}</span>
        <span v-if="questions.length <= 10" class="points"><i v-for="k in questions.length" :key="k" :class="{ fait: k <= n + 1 }"></i></span>
        <span v-else class="barre"><i :style="{ width: `${(n + 1) / questions.length * 100}%` }"></i></span></p>
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
          <p v-if="score && gain" class="points-gagnes">+ {{ gain.base + gain.bonus }} points <small>({{ gain.base }} + {{ gain.bonus }} de bonus de rapidité)</small></p>
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
.score { background: var(--vert-clair); color: var(--vert); font-weight: 700; font-size: 1.5rem; border-radius: 16px; padding: 8px 18px; }
.points-gagnes { font-size: 1.7rem; font-weight: 700; color: var(--bleu-nuit); margin: 8px 0 !important; }
.points-gagnes small { font-size: 1.1rem; font-weight: 500; color: var(--gris); }
.attente { min-height: 60vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; }
.grand-texte { font-size: 2.2rem; font-weight: 700; color: var(--bleu-nuit); margin: 24px 0 0; max-width: 700px; }
.vinyle-attente { position: relative; width: 220px; height: 220px; display: grid; place-items: center; }
.vinyle-attente i { position: absolute; inset: 0; border-radius: 50%; border: 6px solid var(--vert); opacity: 0; animation: onde 1.8s ease-out infinite; }
.vinyle-attente i:nth-child(2) { animation-delay: 0.9s; }
.vinyle-attente span { position: relative; width: 190px; height: 190px; border-radius: 50%; background: radial-gradient(circle, #faf8f4 0 20px, var(--vert) 22px 29px, var(--bleu-nuit) 31px 100%); animation: tourne 2.4s linear infinite; }
.vinyle-attente span::after { content: ''; position: absolute; left: 50%; top: 14px; width: 12px; height: 30px; margin-left: -6px; border-radius: 6px; background: var(--vert-clair); }
@keyframes tourne { to { transform: rotate(360deg); } }
@keyframes onde { 0% { transform: scale(0.8); opacity: 0.7; } 100% { transform: scale(1.5); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .vinyle-attente span { animation-duration: 8s; } .vinyle-attente i { display: none; } }
@media (max-width: 600px) { .vinyle-attente { width: 170px; height: 170px; } .vinyle-attente span { width: 150px; height: 150px; } .grand-texte { font-size: 1.6rem; } }
.quiz { display: flex; flex-direction: column; align-items: center; width: 100%; }
h1 { font-size: 2.6rem; text-align: center; margin: 0; }
.sous { font-size: 1.5rem; color: var(--gris); margin: 10px 0 18px; text-align: center; max-width: 700px; }
.tete { width: 100%; position: relative; display: flex; justify-content: center; align-items: center; min-height: 60px; margin-bottom: 6px; }
.retour { position: absolute; left: 0; display: flex; align-items: center; gap: 8px; background: #f3f0ea; color: var(--bleu-nuit); border-radius: 16px; padding: 12px 18px; font-weight: 700; font-size: 1.2rem; }
.retour :deep(.icone) { width: 26px; height: 26px; }
.etape { font-size: 1.25rem; color: var(--gris); display: flex; flex-direction: column; gap: 10px; align-items: center; margin: 0 0 12px; max-width: 100%; }
.points { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; max-width: 100%; }
.points i { width: 16px; height: 16px; border-radius: 50%; background: #dcd8d0; }
.points i.fait { background: var(--vert); }
.barre { display: block; width: min(320px, 80vw); height: 14px; border-radius: 7px; background: #dcd8d0; overflow: hidden; }
.barre i { display: block; height: 100%; background: var(--vert); border-radius: 7px; }
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
  .score { font-size: 1.1rem; padding: 4px 12px; }
  .points-gagnes { font-size: 1.3rem; }
  .etape { font-size: 1rem; }
  .points { gap: 6px; }
  .points i { width: 12px; height: 12px; }
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
