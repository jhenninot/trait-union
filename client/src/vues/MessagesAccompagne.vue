<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'
import { parler, arreterParole, lectureDisponible } from '../voix.js'
import {
  ecouterMessagerie, rafraichirNonLus, envoyerRapide, envoyerTexte, envoyerPhotoMessage, envoyerVocal,
  enregistrer, enregistrementPossible, quandLong, duree, DUREE_VOCAL_MAX
} from '../messagerie.js'
import Icone from '../navigation/Icone.vue'
import Avatar from './Avatar.vue'

// « Mes messages » de la personne accompagnée : un message par grande carte (le plus récent en
// haut), qu'on peut écouter ; pour répondre, des réponses toutes faites d'un geste, un message
// vocal ou une photo. Pas de clavier par défaut.
const donnees = ref(null)
const erreur = ref('')
const ecran = ref('liste') // liste | repondre | vocal | envoye
const cible = ref(null) // { titre, prenom, avatar, lien, conversationId, cercleId, utilisateurId, prive }
const envoi = ref(false)
const clavier = ref(false)
const texte = ref('')
const enregistrement = ref(null) // { session, secondes }
const enGrand = ref(null)
const choixPhoto = ref(null)
let chrono = null
let retourListe = null

const reglages = computed(() => donnees.value?.reglages ?? { reponses: [], vocal: false })
const fichiers = computed(() => Boolean(donnees.value?.fichiers) && reglages.value.vocal)
const vocalPossible = enregistrementPossible()
const lecture = lectureDisponible()

async function charger() {
  try {
    donnees.value = await api('GET', '/messagerie/accompagne?avecLesMiens=1')
    erreur.value = ''
    // Les messages affichés sont lus (les pastilles « Nouveau » restent jusqu'au prochain chargement)
    if (donnees.value.messages.some((m) => m.nouveau)) {
      api('POST', '/messagerie/accompagne/lu').then(rafraichirNonLus).catch(() => {})
    }
  } catch (e) {
    erreur.value = e.message
  }
}

let arreter
onMounted(() => {
  charger()
  arreter = ecouterMessagerie((type) => type === 'message' && ecran.value === 'liste' && charger())
})
onUnmounted(() => {
  arreter?.()
  arreterParole()
  annulerVocal()
  clearTimeout(retourListe)
})

// --- Écouter un message

const audio = ref(null) // { id, element }
function ecouter(m) {
  arreterAudio()
  if (m.vocal) {
    const element = new Audio(m.vocal.lien)
    element.onended = () => (audio.value = null)
    element.play().catch(() => (erreur.value = 'Impossible de lire ce message vocal'))
    audio.value = { id: m.id, element }
    return
  }
  const debut = m.deMoi ? (m.type === 'photo' ? 'Vous avez envoyé une photo.' : 'Vous avez écrit.')
    : m.type === 'photo' ? `${m.auteur.prenom} vous a envoyé une photo.` : `${m.auteur.prenom} vous a écrit.`
  parler(`${debut} ${m.texte ?? ''}`)
}
function arreterAudio() {
  audio.value?.element.pause()
  audio.value = null
  arreterParole()
}

// --- Répondre

function repondre(m) {
  arreterAudio()
  const r = m.repondre
  cible.value = r.prive
    ? { titre: m.auteur.prenom, prenom: m.auteur.prenom, avatar: m.auteur.avatar, lien: m.auteur.lien, ...r }
    : { titre: 'toute la famille', famille: true, ...r }
  ouvrirReponse()
}
function ecrireFamille() {
  arreterAudio()
  const f = donnees.value.famille[0]
  cible.value = { titre: 'toute la famille', famille: true, cercleId: f.cercleId, conversationId: f.conversationId, prive: false }
  ouvrirReponse()
}
function ouvrirReponse() {
  clavier.value = false
  texte.value = ''
  erreur.value = ''
  ecran.value = 'repondre'
}
function retour() {
  annulerVocal()
  ecran.value = 'liste'
  charger()
}

async function conversationCible() {
  const c = cible.value
  if (c.conversationId) return c.conversationId
  const { id } = await api('POST', `/messagerie/cercles/${c.cercleId}/privee`, { utilisateurId: c.utilisateurId })
  c.conversationId = id
  return id
}

async function envoyer(fn) {
  if (envoi.value) return
  envoi.value = true
  erreur.value = ''
  try {
    await fn(await conversationCible())
    ecran.value = 'envoye'
    retourListe = setTimeout(retour, 3500)
  } catch (e) {
    erreur.value = e.message
    if (ecran.value === 'vocal') ecran.value = 'repondre'
  } finally {
    envoi.value = false
  }
}

const envoyerReponse = (r) => envoyer((id) => envoyerRapide(id, r))
const envoyerClavier = () => texte.value.trim() && envoyer((id) => envoyerTexte(id, texte.value.trim()))

function photoChoisie(e) {
  const fichier = e.target.files?.[0]
  e.target.value = ''
  if (fichier) envoyer((id) => envoyerPhotoMessage(id, fichier))
}

async function commencerVocal() {
  erreur.value = ''
  try {
    const s = await enregistrer({ surFin: () => terminerVocal() })
    enregistrement.value = { session: s, secondes: 0 }
    ecran.value = 'vocal'
    chrono = setInterval(() => enregistrement.value && (enregistrement.value.secondes = Math.round((Date.now() - s.debut) / 1000)), 500)
  } catch (e) {
    erreur.value = e.message
  }
}
function annulerVocal() {
  clearInterval(chrono)
  enregistrement.value?.session.annuler()
  enregistrement.value = null
  if (ecran.value === 'vocal') ecran.value = 'repondre'
}
async function terminerVocal() {
  const e = enregistrement.value
  if (!e) return
  clearInterval(chrono)
  enregistrement.value = null
  const resultat = await e.session.arreter()
  await envoyer((id) => envoyerVocal(id, resultat))
}
</script>

<template>
  <main class="messages-aide">
    <!-- Liste des messages -->
    <template v-if="ecran === 'liste'">
      <h1>Mes messages</h1>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <p v-if="donnees && !donnees.messages.length" class="vide">Pas de message pour le moment.</p>
      <article v-for="m in donnees?.messages ?? []" :key="m.id" class="carte-msg" :class="{ nouveau: m.nouveau, moi: m.deMoi }">
        <div class="tete-msg">
          <Avatar :src="m.auteur.avatar" :prenom="m.auteur.prenom" :taille="72" />
          <div class="grandit">
            <p class="qui">{{ m.deMoi ? 'Vous' : m.auteur.prenom }}<span v-if="m.nouveau" class="pastille-nouveau">Nouveau</span></p>
            <p class="lien-msg">{{ (m.deMoi ? [m.groupe ? 'à toute la famille' : m.a ? `à ${m.a}` : null, quandLong(m.creeLe)] : [m.auteur.lien, m.groupe ? 'à toute la famille' : null, quandLong(m.creeLe)]).filter(Boolean).join(' · ') }}</p>
          </div>
        </div>
        <img v-if="m.photo" :src="m.photo.ecran" alt="Photo" class="photo" @click="enGrand = m.photo" />
        <p v-if="m.vocal" class="vocal-msg"><Icone nom="micro" class="en-ligne" /> Message vocal · {{ duree(m.vocal.duree) }}</p>
        <p v-if="m.texte" class="texte" :class="{ rapide: m.type === 'rapide' }">{{ m.texte }}</p>
        <div v-if="!m.deMoi" class="actions">
          <button v-if="m.vocal || lecture" class="secondaire" @click="audio?.id === m.id ? arreterAudio() : ecouter(m)">
            <Icone :nom="audio?.id === m.id ? 'stop' : 'son'" class="en-ligne" /> {{ audio?.id === m.id ? 'Arrêter' : 'Écouter' }}
          </button>
          <button v-if="m.repondre" @click="repondre(m)"><Icone nom="message" class="en-ligne" /> Répondre</button>
        </div>
      </article>
      <button v-if="donnees?.famille.length" class="ecrire" @click="ecrireFamille"><Icone nom="ajouter" class="en-ligne" /> Envoyer un message à ma famille</button>
    </template>

    <!-- Répondre : réponses toutes faites, vocal, photo -->
    <template v-else-if="ecran === 'repondre'">
      <button class="secondaire retour" @click="retour"><Icone nom="precedent" class="en-ligne" /> Retour</button>
      <div class="a-qui">
        <Avatar v-if="!cible.famille" :src="cible.avatar" :prenom="cible.prenom" :taille="88" />
        <span v-else class="rond-famille"><Icone nom="famille" /></span>
        <div>
          <p class="petit-gris">{{ cible.famille ? 'Écrire à' : 'Répondre à' }}</p>
          <p class="qui grand">{{ cible.famille ? 'Toute la famille' : cible.titre }}</p>
          <p v-if="cible.lien" class="lien-msg">{{ cible.lien }}</p>
        </div>
      </div>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <div class="rapides">
        <button v-for="r in reglages.reponses" :key="r" class="rapide-bouton" :disabled="envoi" @click="envoyerReponse(r)">
          <Icone v-if="/embrasse|bisou/i.test(r)" nom="coeur" class="en-ligne" />{{ r }}
        </button>
      </div>
      <div v-if="fichiers" class="deux-grands">
        <button v-if="vocalPossible" class="tres-gros" :disabled="envoi" @click="commencerVocal">
          <Icone nom="micro" /><span>Parler</span><small>Appuyer, parler, puis « Envoyer »</small>
        </button>
        <button class="tres-gros photo-bouton" :disabled="envoi" @click="choixPhoto.click()">
          <Icone nom="photo" /><span>Une photo</span><small>Prendre ou choisir une photo</small>
        </button>
        <input ref="choixPhoto" type="file" accept="image/*" hidden @change="photoChoisie" />
      </div>
      <button v-if="!clavier" class="lien clavier" @click="clavier = true">Écrire avec le clavier</button>
      <form v-else class="formulaire-clavier" @submit.prevent="envoyerClavier">
        <textarea v-model="texte" rows="3" maxlength="2000" placeholder="Votre message" />
        <button :disabled="envoi || !texte.trim()"><Icone nom="envoyer" class="en-ligne" /> Envoyer</button>
      </form>
      <p v-if="envoi" class="envoi">Envoi en cours…</p>
    </template>

    <!-- Enregistrement d'un message vocal -->
    <div v-else-if="ecran === 'vocal'" class="enregistre">
      <p class="petit-gris">Message pour <strong>{{ cible.famille ? 'toute la famille' : cible.titre }}</strong></p>
      <div class="micro-anime"><Icone nom="micro" /></div>
      <p class="chrono">{{ duree(enregistrement?.secondes ?? 0) }}</p>
      <p class="consigne">Je vous écoute. Appuyez sur « Envoyer » quand vous avez fini.</p>
      <p v-if="enregistrement?.secondes > DUREE_VOCAL_MAX - 20" class="aide">Le message s'arrêtera tout seul à {{ DUREE_VOCAL_MAX / 60 }} minutes.</p>
      <div class="deux-grands etroit">
        <button class="tres-gros annuler" :disabled="envoi" @click="annulerVocal"><Icone nom="effacer" /><span>Effacer</span></button>
        <button class="tres-gros" :disabled="envoi" @click="terminerVocal"><Icone nom="envoyer" /><span>{{ envoi ? 'Envoi…' : 'Envoyer' }}</span></button>
      </div>
    </div>

    <!-- Message parti -->
    <div v-else-if="ecran === 'envoye'" class="envoye">
      <span class="coche"><Icone nom="coche" /></span>
      <p class="qui grand">Votre message est parti</p>
      <p class="petit-gris">{{ cible.famille ? 'Toute la famille va le recevoir.' : `${cible.titre} va le recevoir.` }}</p>
      <button class="secondaire grand-bouton" @click="retour">Revenir à mes messages</button>
    </div>

    <div v-if="enGrand" class="plein-ecran" @click="enGrand = null">
      <img :src="enGrand.ecran" alt="Photo" />
    </div>
  </main>
</template>

<style scoped>
.messages-aide { max-width: 1100px; width: 100%; flex: 1; min-height: 0; overflow-y: auto; padding: 28px 32px; display: flex; flex-direction: column; gap: 18px; }
h1 { font-size: 2.4rem; margin: 0; }
.vide { font-size: 1.6rem; color: var(--gris); text-align: center; margin-top: 40px; }
.carte-msg { background: white; border-radius: 24px; padding: 22px 24px; box-shadow: 0 1px 4px rgb(0 0 0 / 0.08); border: 3px solid transparent; }
.carte-msg.nouveau { border-color: var(--vert); }
/* Ses propres messages, décalés à droite comme dans une conversation */
.carte-msg.moi { background: var(--vert-clair); margin-left: 12%; box-shadow: none; padding-bottom: 18px; }
.tete-msg { display: flex; gap: 16px; align-items: center; }
.grandit { flex: 1; min-width: 0; }
.qui { font-size: 1.7rem; font-weight: 700; color: var(--bleu-nuit); margin: 0; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.qui.grand { font-size: 2.2rem; }
.pastille-nouveau { background: var(--vert); color: white; font-size: 1rem; border-radius: 999px; padding: 3px 14px; }
.lien-msg { color: var(--gris); font-size: 1.15rem; margin: 2px 0 0; }
.photo { display: block; max-width: 100%; max-height: 420px; border-radius: 16px; margin-top: 14px; cursor: zoom-in; }
.vocal-msg { font-size: 1.4rem; color: var(--vert); margin: 14px 0 0; }
.texte { font-size: 1.75rem; line-height: 1.4; margin: 14px 0 4px; white-space: pre-wrap; overflow-wrap: anywhere; }
.texte.rapide { color: var(--vert); font-weight: 700; }
.actions { display: flex; gap: 14px; margin-top: 16px; }
.actions button { flex: 1; font-size: 1.5rem; font-weight: 700; padding: 16px 20px; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; }
.ecrire { font-size: 1.5rem; font-weight: 700; padding: 20px; border-radius: 20px; background: var(--bleu-nuit); display: inline-flex; align-items: center; justify-content: center; gap: 10px; }
.retour { align-self: flex-start; font-size: 1.4rem; font-weight: 700; padding: 14px 24px; border-radius: 16px; }
.a-qui { display: flex; gap: 20px; align-items: center; }
.a-qui p { margin: 0; }
.rond-famille { width: 88px; height: 88px; border-radius: 50%; background: var(--vert-clair); color: var(--vert); display: grid; place-items: center; flex: none; }
.rond-famille .icone { width: 48px; height: 48px; }
.petit-gris { color: var(--gris); font-size: 1.25rem; margin: 0; }
.rapides { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.rapide-bouton { background: var(--vert-clair); color: var(--vert); font-size: 1.7rem; font-weight: 700; padding: 26px 10px; border-radius: 20px; border: 2px solid #cfe8dc; display: inline-flex; align-items: center; justify-content: center; gap: 10px; }
.deux-grands { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.deux-grands.etroit { max-width: 720px; width: 100%; margin: 0 auto; }
.tres-gros { display: flex; flex-direction: column; align-items: center; padding: 24px 16px; border-radius: 24px; font-size: 1.9rem; font-weight: 700; gap: 6px; }
.tres-gros .icone { width: 56px; height: 56px; }
.tres-gros small { font-size: 1.05rem; font-weight: 400; opacity: 0.85; }
.photo-bouton { background: var(--bleu-nuit); }
.tres-gros.annuler { background: #f3f0ea; color: var(--rouge); }
.clavier { align-self: center; font-size: 1.2rem; }
.formulaire-clavier textarea { font: inherit; font-size: 1.5rem; padding: 14px; border-radius: 16px; border: 2px solid #ddd; }
.formulaire-clavier button { font-size: 1.4rem; font-weight: 700; padding: 14px; border-radius: 16px; }
.envoi { font-size: 1.4rem; color: var(--gris); text-align: center; }
.enregistre, .envoye { display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; padding-top: 10px; }
.micro-anime { width: 180px; height: 180px; border-radius: 50%; background: var(--rouge); color: white; display: grid; place-items: center; box-shadow: 0 0 0 22px rgb(179 38 30 / 0.15), 0 0 0 44px rgb(179 38 30 / 0.07); margin: 30px 0 10px; animation: battre 1.6s ease-in-out infinite; }
@keyframes battre { 50% { box-shadow: 0 0 0 28px rgb(179 38 30 / 0.12), 0 0 0 54px rgb(179 38 30 / 0.05); } }
.micro-anime .icone { width: 84px; height: 84px; }
.chrono { font-size: 2.6rem; font-weight: 700; color: var(--rouge); margin: 0; }
.consigne { font-size: 1.5rem; margin: 0; max-width: 640px; }
.coche { width: 140px; height: 140px; border-radius: 50%; background: var(--vert); color: white; display: grid; place-items: center; margin-top: 40px; }
.coche .icone { width: 80px; height: 80px; stroke-width: 3; }
.grand-bouton { font-size: 1.4rem; font-weight: 700; padding: 16px 28px; border-radius: 16px; }
.erreur { font-size: 1.3rem; }
.plein-ecran { position: fixed; inset: 0; z-index: 200; background: rgb(0 0 0 / 0.92); display: grid; place-items: center; }
.plein-ecran img { max-width: 100%; max-height: 100%; object-fit: contain; }
/* Smartphone */
@media (max-width: 600px) {
  .messages-aide { padding: 18px 14px; gap: 14px; }
  h1 { font-size: 1.9rem; }
  .carte-msg { padding: 16px; border-radius: 18px; }
  .tete-msg :deep(.avatar) { width: 56px !important; height: 56px !important; }
  .qui { font-size: 1.4rem; gap: 8px; }
  .qui.grand { font-size: 1.8rem; }
  .pastille-nouveau { font-size: 0.85rem; }
  .lien-msg { font-size: 0.95rem; }
  .texte { font-size: 1.35rem; }
  .photo { max-height: 260px; }
  .actions { gap: 8px; }
  .actions button { font-size: 1.15rem; padding: 14px 8px; }
  .ecrire { font-size: 1.15rem; padding: 16px; }
  .retour { font-size: 1.15rem; padding: 12px 18px; }
  .a-qui :deep(.avatar), .rond-famille { width: 64px !important; height: 64px !important; }
  .rapides { grid-template-columns: 1fr 1fr; gap: 10px; }
  .rapide-bouton { font-size: 1.25rem; padding: 20px 6px; }
  .deux-grands { gap: 10px; }
  .tres-gros { font-size: 1.35rem; padding: 18px 8px; }
  .tres-gros .icone { width: 40px; height: 40px; }
  .tres-gros small { font-size: 0.85rem; }
  .micro-anime { width: 130px; height: 130px; }
  .micro-anime .icone { width: 60px; height: 60px; }
  .consigne { font-size: 1.2rem; }
}
</style>
