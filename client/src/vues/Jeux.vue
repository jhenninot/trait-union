<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'
import { chargerFamille } from '../famille.js'
import { ageTexte, dateLongue } from '../coordonnees.js'
import { questionsQui, questionsAge, candidats, reglagesJeux, chargerReglagesJeux, jeuxDisponibles } from '../jeux.js'
import { useRouter } from 'vue-router'
import { lectureDisponible, parler, arreterParole } from '../voix.js'
import Avatar from './Avatar.vue'
import QuizMusical from './QuizMusical.vue'
import Icone from '../navigation/Icone.vue'

// Jeux de la personne accompagnée : « Qui est-ce ? » (retrouver un prénom) et « Quel âge ? »
// (retrouver une tranche d'âge), à partir des photos de sa famille. Pas de score ni de chrono :
// une mauvaise réponse ou « Je ne sais pas » donne la réponse avec bienveillance.
// Mode essai : un aidant ou un proche joue avec les réglages et la famille d'une personne
// accompagnée (props pour = son identifiant, cercleId) ; rien n'est compté ni enregistré.
const props = defineProps({ pour: { type: String, default: null }, cercleId: { type: String, default: null } })
const essai = Boolean(props.pour)
const r = essai ? reactive({ ...reglagesJeux, actif: true, charge: false }) : reglagesJeux
const personnes = ref([])
const charge = ref(false)
const jeu = ref(null) // null (accueil des jeux), 'qui', 'age', 'musique' ou 'musiqueScore'
const partie = ref(0) // change à chaque partie de musique, pour repartir de zéro
const questions = ref([])
const n = ref(0) // question en cours
const reponse = ref(null) // null (question posée), 'bonne', 'presque' ou 'inconnu'
const choisi = ref(null)
const fini = ref(false)
const petit = window.matchMedia('(max-width: 600px)').matches
const parle = lectureDisponible()

const routeur = useRouter()
onMounted(async () => {
  if (essai) {
    Object.assign(r, await api('GET', `/jeux/reglages?pour=${props.pour}`).catch(() => ({})), { actif: true, charge: true })
    personnes.value = [
      ...(await chargerFamille({ pour: props.pour, cercles: [{ id: props.cercleId }] })).personnes,
      ...await api('GET', `/jeux/exterieurs?pour=${props.pour}`).catch(() => [])
    ]
    return (charge.value = true)
  }
  await chargerReglagesJeux()
  // Les aidants ont coupé l'accès aux jeux : retour à l'accueil
  if (!jeuxDisponibles()) return routeur.replace('/')
  personnes.value = [...(await chargerFamille()).personnes, ...await api('GET', '/jeux/exterieurs').catch(() => [])]
  charge.value = true
})
onUnmounted(arreterParole)

const nbQui = computed(() => candidats(personnes.value, { decedes: r.decedes }).length)
const nbAge = computed(() => candidats(personnes.value, { age: true }).length)
const propose = (k) => r[k]
const dispo = (k) => k === 'musique' || k === 'musiqueScore' || (k === 'qui' ? nbQui.value : nbAge.value) >= 2

function jouer(k) {
  arreterParole()
  jeu.value = k
  if (!essai) api('POST', '/jeux/partie').catch(() => {})
  if (k === 'musique' || k === 'musiqueScore') { partie.value++; return }
  questions.value = (k === 'qui' ? questionsQui : questionsAge)(personnes.value, r)
  n.value = 0
  reponse.value = null
  choisi.value = null
  fini.value = false
}
function retour() {
  arreterParole()
  jeu.value = null
}

const q = computed(() => questions.value[n.value])
const p = computed(() => q.value?.personne)
const lien = computed(() => p.value?.lienAide ?? p.value?.lien ?? '')
const enonce = computed(() => jeu.value === 'qui' ? 'Quel est son prénom ?'
  : `${p.value.prenom}${lien.value ? `, ${lien.value.charAt(0).toLowerCase()}${lien.value.slice(1)}` : ''}. Quel âge a-t-il ou elle ?`)

// Phrase donnée une fois la question passée (toujours bienveillante)
const phrase = computed(() => {
  if (!p.value) return ''
  const qui = p.value.phrase ?? `${p.value.prenom}${lien.value ? `, ${lien.value.toLowerCase()}` : ''}.`
  if (jeu.value === 'qui') return `C'est ${p.value.prenom}. ${p.value.phrase ? qui : ''}`.trim()
  const naiss = p.value.dateNaissance ? `, né${p.value.genre === 'femme' ? 'e' : ''} le ${dateLongue(p.value.dateNaissance)}` : ''
  return `${p.value.prenom} a ${ageTexte(p.value.dateNaissance)}${naiss}.`
})
const titreReponse = computed(() => ({ bonne: 'Oui, bravo !', presque: 'Presque !', inconnu: 'Ce n\'est pas grave.' })[reponse.value])
const texteLu = computed(() => `${titreReponse.value} ${phrase.value}`)

function repondre(c) {
  if (reponse.value) return
  choisi.value = c
  reponse.value = c.bonne ? 'bonne' : 'presque'
  if (parle) parler(texteLu.value)
}
function passer() {
  if (reponse.value) return
  reponse.value = 'inconnu'
  if (parle) parler(texteLu.value)
}
function suivante() {
  arreterParole()
  if (n.value + 1 >= questions.value.length) { fini.value = true; return }
  n.value++
  reponse.value = null
  choisi.value = null
}
const lireQuestion = () => parler(`${jeu.value === 'qui' ? 'Quel est son prénom ?' : enonce.value}`)
</script>

<template>
  <main class="jeux">
    <!-- Accueil des jeux -->
    <template v-if="!jeu">
      <h1>Jeux</h1>
      <p class="sous">À quoi voulez-vous jouer ?</p>
      <div class="cartes">
        <button v-if="propose('qui')" type="button" class="jeu" :disabled="!dispo('qui')" @click="jouer('qui')">
          <strong>Qui est-ce ?</strong><span>Retrouver les prénoms de la famille</span>
          <span class="gros"><Icone nom="suivant" /> Jouer</span>
        </button>
        <button v-if="propose('age')" type="button" class="jeu" :disabled="!dispo('age')" @click="jouer('age')">
          <strong>Quel âge ?</strong><span>Deviner l'âge des personnes</span>
          <span class="gros"><Icone nom="suivant" /> Jouer</span>
        </button>
        <button v-if="propose('musique')" type="button" class="jeu" @click="jouer('musique')">
          <strong>Quelle est cette chanson ?</strong><span>Reconnaître les chansons d'autrefois</span>
          <span class="gros"><Icone nom="suivant" /> Jouer</span>
        </button>
        <button v-if="propose('musiqueScore')" type="button" class="jeu" @click="jouer('musiqueScore')">
          <strong>Quiz musical avec score</strong><span>Gagner des points, avec un bonus si vous répondez vite</span>
          <span class="gros"><Icone nom="suivant" /> Jouer</span>
        </button>
      </div>
      <p v-if="charge && ((propose('qui') && !dispo('qui')) || (propose('age') && !dispo('age')))" class="manque">
        Il faut quelques photos de la famille (et leurs dates de naissance) pour jouer. Vos proches peuvent les ajouter.
      </p>
    </template>

    <!-- Quiz musical -->
    <QuizMusical v-else-if="jeu === 'musique' || jeu === 'musiqueScore'" :key="partie" :pour="pour" :score="jeu === 'musiqueScore'" @quitter="retour" @rejouer="jouer(jeu)" />

    <!-- Fin de partie -->
    <template v-else-if="fini">
      <h1>Bravo !</h1>
      <div class="bulle"><p class="grand">Vous avez revu {{ questions.length }} personne{{ questions.length > 1 ? 's' : '' }} de votre famille.</p><p class="moyen">C'était un beau moment.</p></div>
      <div class="visages"><Avatar v-for="x in questions" :key="x.personne.id" :src="x.photo" :prenom="x.personne.prenom" :taille="petit ? 56 : 90" /></div>
      <div class="actions">
        <button type="button" class="gros" @click="jouer(jeu)"><Icone nom="jeux" /> Rejouer</button>
        <button type="button" class="gros second" @click="retour">Retour aux jeux</button>
      </div>
    </template>

    <!-- Une question -->
    <template v-else-if="q">
      <div class="tete">
        <button type="button" class="retour" @click="retour"><Icone nom="precedent" /> Jeux</button>
        <h1>{{ jeu === 'qui' ? 'Qui est-ce ?' : 'Quel âge ?' }}</h1>
        <button v-if="parle" type="button" class="rond" aria-label="Écouter" @click="reponse ? parler(texteLu) : lireQuestion()"><Icone nom="son" /></button>
      </div>
      <p class="etape">Question {{ n + 1 }} sur {{ questions.length }}
        <span v-if="questions.length <= 10" class="points"><i v-for="k in questions.length" :key="k" :class="{ fait: k <= n + 1 }"></i></span>
        <span v-else class="barre"><i :style="{ width: `${(n + 1) / questions.length * 100}%` }"></i></span></p>
      <Avatar :src="q.photo" :prenom="p.prenom" :taille="petit ? 170 : 210" />
      <template v-if="!reponse">
        <p class="question">{{ enonce }}</p>
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
        <button v-if="parle" type="button" class="ecouter" @click="parler(texteLu)"><Icone nom="son" /> Écouter</button>
        <button type="button" class="gros" @click="suivante">{{ n + 1 >= questions.length ? 'Terminer' : 'Question suivante' }} <Icone nom="suivant" /></button>
      </template>
    </template>
  </main>
</template>

<style scoped>
.jeux { max-width: none; flex: 1; padding: 28px 36px; overflow-y: auto; display: flex; flex-direction: column; align-items: center; }
h1 { font-size: 2.6rem; text-align: center; margin: 0; }
.sous { font-size: 1.5rem; color: var(--gris); margin: 6px 0 18px; text-align: center; }
.cartes { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 28px; width: 100%; max-width: 960px; margin-top: 10px; }
.jeu { background: white; color: inherit; border-radius: 28px; box-shadow: 0 1px 4px rgb(0 0 0 / 0.1); padding: 32px 20px; display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; }
.jeu:disabled { opacity: 0.5; }
.jeu strong { font-size: 2rem; color: var(--bleu-nuit); }
.jeu > span:not(.gros) { font-size: 1.3rem; color: var(--gris); }
.gros { display: inline-flex; align-items: center; gap: 12px; background: var(--vert); color: white; font-weight: 700; font-size: 1.6rem; border-radius: 20px; padding: 18px 38px; margin-top: 10px; }
.gros :deep(.icone) { width: 32px; height: 32px; }
.gros.second { background: #f3f0ea; color: var(--bleu-nuit); }
.manque { font-size: 1.3rem; color: var(--gris); text-align: center; max-width: 700px; margin-top: 20px; }
.tete { width: 100%; position: relative; display: flex; justify-content: center; align-items: center; min-height: 60px; margin-bottom: 6px; }
.retour { position: absolute; left: 0; display: flex; align-items: center; gap: 8px; background: #f3f0ea; color: var(--bleu-nuit); border-radius: 16px; padding: 12px 18px; font-weight: 700; font-size: 1.2rem; }
.retour :deep(.icone) { width: 26px; height: 26px; }
.rond { position: absolute; right: 0; width: 60px; height: 60px; padding: 0; border-radius: 50%; background: var(--vert-clair); color: var(--vert); display: grid; place-items: center; }
.rond :deep(.icone) { width: 32px; height: 32px; }
.etape { font-size: 1.25rem; color: var(--gris); display: flex; flex-direction: column; gap: 10px; align-items: center; margin: 0 0 12px; max-width: 100%; }
.points { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; max-width: 100%; }
.points i { width: 16px; height: 16px; border-radius: 50%; background: #dcd8d0; }
.points i.fait { background: var(--vert); }
.barre { display: block; width: min(320px, 80vw); height: 14px; border-radius: 7px; background: #dcd8d0; overflow: hidden; }
.barre i { display: block; height: 100%; background: var(--vert); border-radius: 7px; }
.question { font-size: 2rem; color: var(--bleu-nuit); font-weight: 700; margin: 16px 0; text-align: center; max-width: 900px; }
.reponses { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; width: 100%; max-width: 900px; }
.rep { background: white; color: var(--bleu-nuit); border: 3px solid #e3dfd7; border-radius: 22px; min-height: 96px; font-size: 2.1rem; font-weight: 700; box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); }
.pas-sur { margin-top: 16px; display: flex; align-items: center; gap: 10px; font-size: 1.35rem; font-weight: 700; color: var(--bleu-nuit); background: #f3f0ea; border-radius: 18px; padding: 16px 26px; }
.pas-sur :deep(.icone) { width: 30px; height: 30px; }
.bulle { background: var(--vert-clair); border-radius: 24px; padding: 20px 30px; text-align: center; max-width: 820px; margin: 14px 0; }
.bulle p { margin: 0; }
.grand { font-size: 2.1rem; font-weight: 700; color: var(--vert); }
.moyen { font-size: 1.6rem; color: var(--bleu-nuit); margin-top: 8px !important; }
.bulle.chaude { background: #fff7ec; }
.bulle.chaude .grand { color: #b46a22; }
.ecouter { display: inline-flex; align-items: center; gap: 10px; font-size: 1.2rem; font-weight: 700; color: var(--vert); background: var(--vert-clair); border-radius: 16px; padding: 12px 22px; margin-bottom: 6px; }
.visages { display: flex; gap: 14px; margin: 14px 0; flex-wrap: wrap; justify-content: center; }
.actions { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; margin-top: 10px; }
@media (max-width: 600px) {
  .jeux { padding: 18px 14px; }
  h1 { font-size: 1.9rem; }
  .sous { font-size: 1.15rem; }
  .cartes { grid-template-columns: 1fr; gap: 14px; }
  .jeu { padding: 20px 14px; gap: 8px; }
  .jeu strong { font-size: 1.6rem; }
  .jeu > span:not(.gros) { font-size: 1.05rem; }
  .gros { font-size: 1.2rem; padding: 14px 24px; }
  .retour { position: static; font-size: 0.95rem; padding: 9px 12px; }
  .rond { position: static; width: 44px; height: 44px; }
  .tete { justify-content: space-between; flex-wrap: wrap; }
  .tete h1 { order: 3; width: 100%; margin-top: 8px; }
  .etape { font-size: 1rem; }
  .points { gap: 6px; }
  .points i { width: 12px; height: 12px; }
  .question { font-size: 1.5rem; }
  .reponses { grid-template-columns: 1fr; gap: 12px; }
  .rep { min-height: 70px; font-size: 1.5rem; border-radius: 18px; }
  .pas-sur { font-size: 1.05rem; padding: 12px 18px; }
  .bulle { padding: 14px 18px; }
  .grand { font-size: 1.5rem; }
  .moyen { font-size: 1.15rem; }
}
</style>
