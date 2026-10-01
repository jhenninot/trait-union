<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'
import { parler, arreterParole, lectureDisponible } from '../voix.js'
import {
  ecouterMessagerie, rafraichirNonLus, envoyerRapide, envoyerTexte, envoyerPhotoMessage, envoyerVocal,
  enregistrer, enregistrementPossible, quandCourt, heureMessage, jourMessage, duree, DUREE_VOCAL_MAX
} from '../messagerie.js'
import Icone from '../navigation/Icone.vue'
import Avatar from './Avatar.vue'
import TexteMessage from './TexteMessage.vue'
import ApercuLien from './ApercuLien.vue'
import { confirmer } from '../fenetre.js'
import { motDecede } from '../coordonnees.js'
import { RouterLink } from 'vue-router'
import { REPONSES, jourLong, momentTexte, repondreSondage } from '../sondages.js'

// « Mes messages » de la personne accompagnée, comme WhatsApp en très grand : la liste de ses
// conversations (« Toute la famille » et les privées) avec une pastille de messages non lus ;
// en touchant une conversation, son fil (qui a écrit quoi, avec avatar et prénom), et un gros
// bouton « Écrire » : réponses toutes faites d'un geste, message vocal ou photo.
const donnees = ref(null) // { conversations, contacts, reglages, fichiers }
const erreur = ref('')
const ecran = ref('liste') // liste | contacts | fil | repondre | vocal | envoye | sondage | repondu
const fil = ref(null) // { conversation, messages }
const zoneFil = ref(null)
const cible = ref(null) // { titre, prenom, avatar, lien, famille, conversationId, cercleId, utilisateurId }
const envoi = ref(false)
const texte = ref('')
const enregistrement = ref(null) // { session, secondes }
const enGrand = ref(null)
const choixPhoto = ref(null)
let chrono = null
let retourFil = null

const reglages = computed(() => donnees.value?.reglages ?? { reponses: [], vocal: false })
const fichiers = computed(() => Boolean(donnees.value?.fichiers) && reglages.value.vocal)
const vocalPossible = enregistrementPossible()
const lecture = lectureDisponible()

async function charger() {
  try {
    donnees.value = await api('GET', '/messagerie/accompagne/conversations')
    erreur.value = ''
  } catch (e) {
    erreur.value = e.message
  }
}

// Une image qui finit de charger allonge le fil : on reste en bas juste après l'ouverture
let defileLe = 0
const apresImage = () => Date.now() - defileLe < 5000 && zoneFil.value && (zoneFil.value.scrollTop = zoneFil.value.scrollHeight)

async function chargerFil(id, { defiler = true } = {}) {
  if (defiler) defileLe = Date.now()
  const d = await api('GET', `/messagerie/conversations/${id}`)
  fil.value = { conversation: d.conversation, messages: d.messages }
  api('POST', `/messagerie/conversations/${id}/lu`).then(rafraichirNonLus).catch(() => {})
  if (defiler) {
    await nextTick()
    if (zoneFil.value) zoneFil.value.scrollTop = zoneFil.value.scrollHeight
  }
}

let arreter
onMounted(() => {
  charger()
  arreter = ecouterMessagerie((type, d) => {
    if (type !== 'message') return
    if (ecran.value === 'liste') charger()
    else if (ecran.value === 'fil' && d.conversationId === fil.value?.conversation.id) chargerFil(d.conversationId)
  })
})
onUnmounted(() => {
  arreter?.()
  arreterParole()
  annulerVocal()
  clearTimeout(retourFil)
})

// --- Liste et fil

const titreConv = (c) => (c.type === 'famille' ? 'Toute la famille' : c.titre)
// « Marc : … » dans un groupe ; dans une conversation privée, le message seul (sauf « Vous : … »)
const apercu = (c) => {
  if (!c.dernier) return 'Pas encore de message'
  if (c.dernier.deMoi) return `Vous : ${c.dernier.apercu}`
  return c.type === 'privee' ? c.dernier.apercu : `${c.dernier.auteurPrenom} : ${c.dernier.apercu}`
}

async function ouvrir(c) {
  arreterAudio()
  erreur.value = ''
  try {
    await chargerFil(c.id ?? c)
    ecran.value = 'fil'
    await nextTick()
    if (zoneFil.value) zoneFil.value.scrollTop = zoneFil.value.scrollHeight
  } catch (e) {
    erreur.value = e.message
  }
}

async function ecrireA(p) {
  try {
    const { id } = await api('POST', `/messagerie/cercles/${p.cercleId}/privee`, { utilisateurId: p.utilisateurId })
    await ouvrir(id)
  } catch (e) {
    erreur.value = e.message
  }
}

function versListe() {
  arreterAudio()
  ecran.value = 'liste'
  fil.value = null
  charger()
}

// Le fil, avec un séparateur par jour
const blocs = computed(() => {
  const r = []
  let jour = null
  for (const m of fil.value?.messages ?? []) {
    const j = jourMessage(m.creeLe)
    if (j !== jour) r.push({ separateur: j, cle: `j-${m.id}` })
    jour = j
    r.push(m)
  }
  return r
})

// --- Effacer un de ses messages (pour tout le monde)
async function effacer(m) {
  if (!await confirmer('Effacer ce message pour tout le monde ?', { oui: 'Oui, effacer', non: 'Non', danger: true, icone: 'effacer' })) return
  envoi.value = true
  try {
    await api('DELETE', `/messagerie/messages/${m.id}`)
    await chargerFil(fil.value.conversation.id, { defiler: false })
  } catch (e) {
    erreur.value = e.message
  } finally {
    envoi.value = false
  }
}

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
  const qui = m.deMoi ? 'Vous avez' : `${m.auteur.prenom} a`
  if (m.sondage) parler(texteSondage(m))
  else parler(`${m.type === 'photo' ? `${qui} envoyé une photo.` : `${qui} écrit.`} ${m.texte ?? ''}`)
  audio.value = { id: m.id, element: null }
  setTimeout(() => audio.value?.id === m.id && !audio.value.element && (audio.value = null), 8000)
}
function arreterAudio() {
  audio.value?.element?.pause()
  audio.value = null
  arreterParole()
}

// --- Sondage de dates : Oui / Peut-être / Non pour chaque jour, sur un seul écran

const sondage = ref(null) // { id, titre, lieu, moment, heure, dates, reponses }
const enClair = (s) => [s.lieu, momentTexte(s)].filter(Boolean).join(', ')
function texteSondage(m) {
  const s = m.sondage
  if (!s.ouvert) return `C'est décidé : ${s.titre}, ${jourLong(s.dateRetenue)}, ${momentTexte(s)}.`
  return `${m.deMoi ? 'Vous cherchez' : `${m.auteur.prenom} cherche`} une date pour : ${s.titre}. ${enClair(s)}. Quels jours pouvez-vous venir ? Touchez « Choisir mes jours ».`
}
const aRepondu = (s) => Object.keys(s.mesReponses ?? {}).length > 0
function choisirJours(m) {
  arreterAudio()
  sondage.value = { ...m.sondage, reponses: { ...m.sondage.mesReponses } }
  erreur.value = ''
  ecran.value = 'sondage'
}
const choisir = (date, valeur) => (sondage.value.reponses = { ...sondage.value.reponses, [date]: valeur })
async function envoyerJours() {
  if (envoi.value) return
  envoi.value = true
  erreur.value = ''
  try {
    await repondreSondage(sondage.value.id, sondage.value.reponses)
    ecran.value = 'repondu'
    retourFil = setTimeout(retourSondage, 2500)
  } catch (e) {
    erreur.value = e.message
  } finally {
    envoi.value = false
  }
}
function retourSondage() {
  clearTimeout(retourFil)
  sondage.value = null
  ouvrir(fil.value.conversation.id)
}

// --- Écrire (dans la conversation ouverte)

function repondre() {
  arreterAudio()
  const c = fil.value.conversation
  cible.value = c.type === 'famille'
    ? { titre: 'toute la famille', famille: true, conversationId: c.id }
    : { titre: c.titre, prenom: c.autre?.prenom ?? c.titre, avatar: c.autre?.avatar, lien: c.autre?.lien, conversationId: c.id }
  texte.value = ''
  erreur.value = ''
  ecran.value = 'repondre'
}
function retour() {
  annulerVocal()
  clearTimeout(retourFil)
  ecran.value = 'fil'
  ouvrir(cible.value.conversationId)
}

async function envoyer(fn) {
  if (envoi.value) return
  envoi.value = true
  erreur.value = ''
  try {
    await fn(cible.value.conversationId)
    ecran.value = 'envoye'
    retourFil = setTimeout(retour, 2500)
  } catch (e) {
    erreur.value = e.message
    if (ecran.value === 'vocal') ecran.value = 'repondre'
  } finally {
    envoi.value = false
  }
}

const envoyerReponse = (r) => envoyer((id) => envoyerRapide(id, r))
const envoyerClavier = () => texte.value.trim() && envoyer((id) => envoyerTexte(id, texte.value.trim()))

// Photo choisie : aperçu en grand, avec un commentaire facultatif, avant l'envoi
const photo = ref(null) // { fichier, apercu, commentaire }
function photoChoisie(e) {
  const fichier = e.target.files?.[0]
  e.target.value = ''
  if (!fichier) return
  photo.value = { fichier, apercu: URL.createObjectURL(fichier), commentaire: '' }
  ecran.value = 'photo'
}
function oublierPhoto() {
  if (photo.value) URL.revokeObjectURL(photo.value.apercu)
  photo.value = null
}
function annulerPhoto() {
  oublierPhoto()
  ecran.value = 'repondre'
}
const envoyerLaPhoto = () => {
  const { fichier, commentaire } = photo.value
  return envoyer(async (id) => {
    await envoyerPhotoMessage(id, fichier, commentaire.trim())
    oublierPhoto()
  })
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
    <!-- Liste des conversations -->
    <template v-if="ecran === 'liste'">
      <h1>Mes messages</h1>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <button v-for="c in donnees?.conversations ?? []" :key="c.id" class="conv" :class="{ 'non-lu': c.nonLus }" @click="ouvrir(c)">
        <Avatar v-if="c.autre" :src="c.autre.avatar" :prenom="c.autre.prenom" :taille="76" :decede="c.autre.decede" />
        <span v-else class="rond-famille"><Icone nom="famille" /></span>
        <span class="conv-milieu">
          <span class="conv-titre">{{ titreConv(c) }}<small v-if="c.autre?.decede"> · {{ motDecede(c.autre.genre) }}</small><small v-else-if="c.sousTitre"> · {{ c.sousTitre }}</small></span>
          <span class="conv-apercu">{{ apercu(c) }}</span>
        </span>
        <span class="conv-droite">
          <span class="conv-heure">{{ c.dernier ? quandCourt(c.dernier.le) : '' }}</span>
          <span v-if="c.nonLus" class="pastille" :aria-label="`${c.nonLus} nouveau${c.nonLus > 1 ? 'x' : ''} message${c.nonLus > 1 ? 's' : ''}`">{{ c.nonLus }}</span>
        </span>
      </button>
      <button v-if="donnees?.contacts.length" class="ecrire" @click="ecran = 'contacts'"><Icone nom="ajouter" class="en-ligne" /> Écrire à quelqu'un</button>
    </template>

    <!-- À qui écrire en privé -->
    <template v-else-if="ecran === 'contacts'">
      <button class="secondaire retour" @click="versListe"><Icone nom="precedent" class="en-ligne" /> Retour</button>
      <h1>Écrire à…</h1>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <button v-for="p in donnees.contacts" :key="`${p.cercleId}-${p.utilisateurId}`" class="conv" @click="ecrireA(p)">
        <Avatar :src="p.avatar" :prenom="p.prenom" :taille="76" />
        <span class="conv-milieu">
          <span class="conv-titre">{{ p.prenom }}</span>
          <span v-if="p.lien" class="conv-apercu">{{ p.lien }}</span>
        </span>
      </button>
    </template>

    <!-- Une conversation -->
    <div v-else-if="ecran === 'fil' && fil" class="ecran-fil">
      <div class="tete-fil">
        <button class="secondaire retour" @click="versListe"><Icone nom="precedent" class="en-ligne" /> Retour</button>
        <Avatar v-if="fil.conversation.autre" :src="fil.conversation.autre.avatar" :prenom="fil.conversation.autre.prenom" :taille="64" :decede="fil.conversation.autre.decede" />
        <span v-else class="rond-famille petit-rond"><Icone nom="famille" /></span>
        <div class="grandit">
          <p class="qui">{{ titreConv(fil.conversation) }}</p>
          <p v-if="fil.conversation.type === 'famille'" class="lien-msg">{{ fil.conversation.membres.map((m) => m.prenom).join(', ') }}</p>
          <p v-else-if="fil.conversation.autre?.decede" class="lien-msg">{{ motDecede(fil.conversation.autre.genre, true) }}</p>
          <p v-else-if="fil.conversation.autre?.lien" class="lien-msg">{{ fil.conversation.autre.lien }}</p>
        </div>
      </div>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <div ref="zoneFil" class="zone-fil">
        <p v-if="!fil.messages.length" class="vide">Pas encore de message. Touchez « Écrire » pour envoyer le premier.</p>
        <template v-for="b in blocs" :key="b.cle ?? b.id">
          <p v-if="b.separateur" class="jour"><span>{{ b.separateur }}</span></p>
          <p v-else-if="b.retire" class="retire">{{ b.retire.parAuteur ? 'Message effacé' : 'Message retiré' }}</p>
          <div v-else class="ligne" :class="{ moi: b.deMoi }">
            <Avatar :src="b.auteur.avatar" :prenom="b.auteur.prenom" :taille="56" :decede="b.auteur.decede" />
            <div class="bulle" :class="{ rapide: b.type === 'rapide' }">
              <p class="auteur">{{ b.deMoi ? 'Vous' : b.auteur.prenom }}</p>
              <img v-if="b.photo" :src="b.photo.ecran" alt="Photo" class="photo" @load="apresImage" @click="enGrand = b.photo" />
              <p v-if="b.vocal" class="vocal-msg"><Icone nom="micro" class="en-ligne" /> Message vocal · {{ duree(b.vocal.duree) }}</p>
              <div v-if="b.sondage" class="sondage-aide">
                <p class="etiquette-sondage"><Icone :nom="b.sondage.ouvert ? 'sondage' : 'coche'" class="en-ligne" /> {{ b.sondage.ouvert ? 'On cherche une date' : 'C\'est décidé' }}</p>
                <p class="titre-sondage">{{ b.sondage.titre }}</p>
                <template v-if="b.sondage.ouvert">
                  <p class="sous-sondage">{{ enClair(b.sondage) }}. Quels jours pouvez-vous venir ?</p>
                  <p v-if="aRepondu(b.sondage)" class="deja"><Icone nom="coche" class="en-ligne" /> Vous avez répondu</p>
                  <button v-if="b.sondage.peutRepondre" class="choisir-jours" @click="choisirJours(b)"><Icone nom="agenda" class="en-ligne" /> {{ aRepondu(b.sondage) ? 'Changer mes réponses' : 'Choisir mes jours' }}</button>
                </template>
                <template v-else>
                  <p class="sous-sondage">{{ jourLong(b.sondage.dateRetenue) }}, {{ momentTexte(b.sondage) }}{{ b.sondage.lieu ? `, ${b.sondage.lieu}` : '' }}.</p>
                  <RouterLink to="/agenda" class="choisir-jours secondaire-lien"><Icone nom="agenda" class="en-ligne" /> Voir dans mon agenda</RouterLink>
                </template>
              </div>
              <p v-else-if="b.texte" class="texte"><TexteMessage :texte="b.texte" /></p>
              <ApercuLien v-if="b.lien" :lien="b.lien" grand @charge="apresImage" />
              <div class="pied-bulle">
                <button v-if="b.vocal || lecture" class="ecouter" :aria-label="audio?.id === b.id ? 'Arrêter' : 'Écouter'" @click="audio?.id === b.id ? arreterAudio() : ecouter(b)">
                  <Icone :nom="audio?.id === b.id ? 'stop' : 'son'" class="en-ligne" /> {{ audio?.id === b.id ? 'Arrêter' : 'Écouter' }}
                </button>
                <button v-if="b.deMoi && b.peutRetirer" class="effacer" :disabled="envoi" @click="effacer(b)"><Icone nom="effacer" class="en-ligne" /> Effacer</button>
                <span class="heure">{{ heureMessage(b.creeLe) }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
      <button v-if="fil.conversation.peutEcrire" class="repondre" @click="repondre"><Icone nom="message" class="en-ligne" /> Écrire</button>
    </div>

    <!-- Écrire : réponses toutes faites, vocal, photo -->
    <template v-else-if="ecran === 'repondre'">
      <button class="secondaire retour" @click="retour"><Icone nom="precedent" class="en-ligne" /> Retour</button>
      <div class="a-qui">
        <Avatar v-if="!cible.famille" :src="cible.avatar" :prenom="cible.prenom" :taille="88" />
        <span v-else class="rond-famille"><Icone nom="famille" /></span>
        <div>
          <p class="petit-gris">Écrire à</p>
          <p class="qui grand">{{ cible.famille ? 'Toute la famille' : cible.titre }}</p>
          <p v-if="cible.lien" class="lien-msg">{{ cible.lien }}</p>
        </div>
      </div>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <form class="formulaire-clavier" @submit.prevent="envoyerClavier">
        <textarea v-model="texte" rows="2" maxlength="2000" placeholder="Écrire votre message ici" aria-label="Votre message" />
        <button :disabled="envoi || !texte.trim()"><Icone nom="envoyer" class="en-ligne" /> Envoyer</button>
      </form>
      <p class="petit-gris ou">ou choisir :</p>
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
      <p v-if="envoi" class="envoi">Envoi en cours…</p>
    </template>

    <!-- Photo choisie : commentaire facultatif puis Envoyer -->
    <div v-else-if="ecran === 'photo' && photo" class="ecran-photo">
      <p class="petit-gris">Photo pour <strong>{{ cible.famille ? 'toute la famille' : cible.titre }}</strong></p>
      <img :src="photo.apercu" alt="Photo choisie" class="apercu-grand" />
      <textarea v-model="photo.commentaire" rows="2" maxlength="1000" placeholder="Ajouter un commentaire (facultatif)" aria-label="Commentaire" />
      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <div class="deux-grands etroit">
        <button class="tres-gros annuler" :disabled="envoi" @click="annulerPhoto"><Icone nom="effacer" /><span>Annuler</span></button>
        <button class="tres-gros" :disabled="envoi" @click="envoyerLaPhoto"><Icone nom="envoyer" /><span>{{ envoi ? 'Envoi…' : 'Envoyer' }}</span></button>
      </div>
    </div>

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

    <!-- Sondage de dates : tous les jours sur un écran, Oui / Peut-être / Non -->
    <div v-else-if="ecran === 'sondage' && sondage" class="ecran-sondage">
      <div class="tete-fil">
        <button class="secondaire retour" @click="retourSondage"><Icone nom="precedent" class="en-ligne" /> Retour</button>
        <div class="grandit">
          <p class="qui">Quels jours pouvez-vous venir ?</p>
          <p class="lien-msg">{{ sondage.titre }}, {{ enClair(sondage) }}</p>
        </div>
      </div>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <div class="jours">
        <div v-for="d in sondage.dates" :key="d" class="ligne-jour">
          <p class="nom-jour">{{ jourLong(d) }}<small>{{ momentTexte(sondage) }}</small></p>
          <div class="trois" role="radiogroup" :aria-label="jourLong(d)">
            <button v-for="r in REPONSES" :key="r.valeur" type="button" role="radio" class="choix-jour" :class="[r.valeur, { on: sondage.reponses[d] === r.valeur }]"
              :aria-checked="sondage.reponses[d] === r.valeur" @click="choisir(d, r.valeur)">
              <Icone :nom="r.icone" class="en-ligne" /> {{ r.libelle }}
            </button>
          </div>
        </div>
      </div>
      <button class="repondre" :disabled="envoi || !Object.keys(sondage.reponses).length" @click="envoyerJours"><Icone nom="coche" class="en-ligne" /> {{ envoi ? 'Envoi…' : 'C\'est bon' }}</button>
    </div>

    <div v-else-if="ecran === 'repondu'" class="envoye">
      <span class="coche"><Icone nom="coche" /></span>
      <p class="qui grand">Merci, votre réponse est partie</p>
      <p class="petit-gris">Toute la famille va la voir.</p>
      <button class="secondaire grand-bouton" @click="retourSondage">Revenir à la conversation</button>
    </div>

    <!-- Message parti -->
    <div v-else-if="ecran === 'envoye'" class="envoye">
      <span class="coche"><Icone nom="coche" /></span>
      <p class="qui grand">Votre message est parti</p>
      <p class="petit-gris">{{ cible.famille ? 'Toute la famille va le recevoir.' : `${cible.titre} va le recevoir.` }}</p>
      <button class="secondaire grand-bouton" @click="retour">Revenir à la conversation</button>
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
.grandit { flex: 1; min-width: 0; }
.qui { font-size: 1.7rem; font-weight: 700; color: var(--bleu-nuit); margin: 0; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.qui.grand { font-size: 2.2rem; }
.lien-msg { color: var(--gris); font-size: 1.15rem; margin: 2px 0 0; }
.photo { display: block; max-width: 100%; max-height: 420px; border-radius: 16px; margin-top: 14px; cursor: zoom-in; }
.vocal-msg { font-size: 1.4rem; color: var(--vert); margin: 14px 0 0; }
.texte { font-size: 1.75rem; line-height: 1.4; margin: 14px 0 4px; white-space: pre-wrap; overflow-wrap: anywhere; }
.texte.rapide { color: var(--vert); font-weight: 700; }
/* Liste des conversations */
.conv { display: flex; align-items: center; gap: 18px; width: 100%; padding: 18px 22px; border-radius: 22px; background: white; color: inherit; text-align: left; box-shadow: 0 1px 4px rgb(0 0 0 / 0.08); }
.conv-milieu { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.conv-titre { font-size: 1.8rem; font-weight: 700; color: var(--bleu-nuit); }
.conv-titre small { font-size: 1.1rem; font-weight: 400; color: var(--gris); }
.conv-apercu { font-size: 1.3rem; color: var(--gris); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.non-lu .conv-apercu { color: #2b2b2b; font-weight: 600; }
.conv-droite { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex: none; }
.conv-heure { font-size: 1.1rem; color: var(--gris); }
.non-lu .conv-heure { color: var(--vert); font-weight: 700; }
.pastille { background: var(--vert); color: white; font-size: 1.4rem; font-weight: 700; min-width: 44px; height: 44px; padding: 0 12px; border-radius: 999px; display: grid; place-items: center; }
/* Une conversation */
.ecran-fil { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 14px; }
.tete-fil { display: flex; align-items: center; gap: 16px; }
.tete-fil .retour { flex: none; }
.tete-fil p { margin: 0; }
.petit-rond { width: 64px; height: 64px; }
.petit-rond .icone { width: 36px; height: 36px; }
.zone-fil { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 8px; }
.jour { text-align: center; margin: 6px 0 0; }
.jour span { background: #ebe8e3; color: #555; font-size: 1.1rem; border-radius: 999px; padding: 4px 16px; }
.retire { align-self: center; color: var(--gris); font-style: italic; font-size: 1.1rem; margin: 0; }
.ligne { display: flex; gap: 12px; align-items: flex-start; max-width: 85%; }
.ligne.moi { align-self: flex-end; flex-direction: row-reverse; }
.bulle { background: white; border-radius: 22px 22px 22px 6px; padding: 12px 18px; box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); min-width: 0; }
.moi .bulle { background: #dff1e7; border-radius: 22px 22px 6px 22px; }
.bulle p { margin: 0; }
.auteur { font-size: 1.25rem; font-weight: 700; color: var(--bleu-nuit); }
.bulle .texte { margin: 4px 0 0; font-size: 1.6rem; }
.bulle.rapide .texte { color: var(--vert); font-weight: 700; }
.pied-bulle { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
.ecouter { background: var(--vert-clair); color: var(--vert); font-size: 1.15rem; font-weight: 700; padding: 8px 16px; border-radius: 12px; display: inline-flex; align-items: center; gap: 8px; }
.heure { color: var(--gris); font-size: 1rem; }
.effacer { background: #fbeceb; color: var(--rouge); font-size: 1.15rem; font-weight: 700; padding: 8px 16px; border-radius: 12px; display: inline-flex; align-items: center; gap: 8px; }
.repondre { flex: none; font-size: 1.7rem; font-weight: 700; padding: 20px; border-radius: 20px; display: inline-flex; align-items: center; justify-content: center; gap: 12px; }
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
.formulaire-clavier { display: flex; gap: 12px; align-items: stretch; }
.formulaire-clavier textarea { flex: 1; min-width: 0; font: inherit; font-size: 1.6rem; padding: 16px; border-radius: 18px; border: 3px solid var(--vert); background: #fff; resize: none; }
.formulaire-clavier textarea::placeholder { color: #7a8580; }
.formulaire-clavier button { flex: none; font-size: 1.5rem; font-weight: 700; padding: 14px 24px; border-radius: 18px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.ou { margin: -4px 0 -6px; }
.envoi { font-size: 1.4rem; color: var(--gris); text-align: center; }
.ecran-photo { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.apercu-grand { max-width: 100%; max-height: 42vh; border-radius: 20px; object-fit: contain; }
.ecran-photo textarea { font: inherit; font-size: 1.5rem; width: 100%; max-width: 720px; padding: 14px; border-radius: 16px; border: 2px solid #ddd; }
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
/* Sondage de dates */
.sondage-aide { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.etiquette-sondage { color: var(--vert); font-weight: 700; font-size: 1.15rem; }
.titre-sondage { font-size: 1.6rem; font-weight: 700; color: var(--bleu-nuit); }
.sous-sondage { font-size: 1.3rem; color: #4a4a55; }
.deja { color: var(--vert); font-weight: 600; font-size: 1.15rem; }
.choisir-jours { margin-top: 6px; font-size: 1.5rem; font-weight: 700; padding: 18px 22px; border-radius: 18px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; text-decoration: none; }
.secondaire-lien { background: var(--vert-clair); color: var(--vert); }
.ecran-sondage { display: flex; flex-direction: column; gap: 14px; flex: 1; min-height: 0; }
.jours { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; min-height: 0; flex: 1; }
.ligne-jour { display: flex; align-items: center; gap: 16px; background: white; border-radius: 20px; padding: 14px 18px; box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); }
.nom-jour { flex: 1; margin: 0; font-size: 1.7rem; font-weight: 700; color: var(--bleu-nuit); display: flex; flex-direction: column; }
.nom-jour small { font-size: 1.05rem; font-weight: 400; color: var(--gris); }
.trois { display: grid; grid-template-columns: repeat(3, minmax(0, 180px)); gap: 10px; }
.choix-jour { background: #f2efe9; color: var(--bleu-nuit); font-size: 1.3rem; font-weight: 700; padding: 16px 8px; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 3px solid transparent; white-space: nowrap; }
.choix-jour .icone { width: 1.5rem; height: 1.5rem; }
.choix-jour.oui.on { background: var(--vert); color: white; }
.choix-jour.peut_etre.on { background: #b7791f; color: white; }
.choix-jour.non.on { background: var(--bleu-nuit); color: white; }
/* Smartphone */
@media (max-width: 600px) {
  .titre-sondage { font-size: 1.3rem; }
  .sous-sondage { font-size: 1.1rem; }
  .choisir-jours { font-size: 1.2rem; padding: 14px; }
  .ligne-jour { flex-direction: column; align-items: stretch; gap: 10px; padding: 12px; }
  .nom-jour { font-size: 1.35rem; }
  .trois { grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .choix-jour { font-size: 1.05rem; padding: 10px 4px; gap: 4px; flex-direction: column; }
  .formulaire-clavier { flex-direction: column; }
  .formulaire-clavier textarea { font-size: 1.3rem; padding: 12px; }
  .formulaire-clavier button { font-size: 1.3rem; padding: 12px; }
  .ecran-photo textarea { font-size: 1.15rem; }
  .apercu-grand { max-height: 34vh; }
  .conv { padding: 12px 14px; gap: 12px; border-radius: 18px; }
  .conv :deep(.avatar), .conv .rond-famille { width: 56px !important; height: 56px !important; }
  .conv-titre { font-size: 1.3rem; }
  .conv-apercu { font-size: 1rem; }
  .conv-heure { font-size: 0.9rem; }
  .pastille { font-size: 1.1rem; min-width: 34px; height: 34px; padding: 0 9px; }
  .tete-fil { gap: 10px; }
  .tete-fil :deep(.avatar), .petit-rond { width: 48px !important; height: 48px !important; }
  .tete-fil .retour { padding: 10px 12px; font-size: 1rem; }
  .ligne { max-width: 94%; gap: 8px; }
  .ligne :deep(.avatar) { width: 40px !important; height: 40px !important; }
  .auteur { font-size: 1.05rem; }
  .bulle { padding: 10px 14px; }
  .bulle .texte { font-size: 1.25rem; }
  .ecouter, .effacer { font-size: 1rem; padding: 6px 12px; }
  .repondre { font-size: 1.35rem; padding: 16px; }
  .messages-aide { padding: 18px 14px; gap: 14px; }
  h1 { font-size: 1.9rem; }
  .qui { font-size: 1.4rem; gap: 8px; }
  .qui.grand { font-size: 1.8rem; }
  .lien-msg { font-size: 0.95rem; }
  .texte { font-size: 1.35rem; }
  .photo { max-height: 260px; }
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
