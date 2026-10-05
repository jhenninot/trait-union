<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'
import { session } from '../session.js'
import { envoyerPhoto } from '../photos.js'
import {
  ecouterMessagerie, envoyerTexte, envoyerPhotoMessage, envoyerVocal, enregistrer, enregistrementPossible,
  heureMessage, jourMessage, duree, texteVu, DUREE_VOCAL_MAX
} from '../messagerie.js'
import Icone from '../navigation/Icone.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import Avatar from './Avatar.vue'
import TexteMessage from './TexteMessage.vue'
import ApercuLien from './ApercuLien.vue'
import { confirmer } from '../fenetre.js'
import { motDecede } from '../coordonnees.js'
import { useRoute } from 'vue-router'
import CarteSondage from './CarteSondage.vue'
import DetailSondage from './DetailSondage.vue'
import FenetreSondage from './FenetreSondage.vue'
import FenetreGroupe from './FenetreGroupe.vue'
import SelecteurEmoji from './SelecteurEmoji.vue'
import { insererDans, seulementEmojis } from '../emojis.js'

// Fil d'une conversation, côté aidants, proches et auxiliaires : messages, accusés de lecture,
// envoi de texte, de photos et de messages vocaux, sourdine et modération par les aidants.
const props = defineProps({
  conversationId: { type: String, required: true },
  retour: Boolean // téléphone : flèche de retour vers la liste
})
const emit = defineEmits(['retour', 'change', 'supprime'])
const gererGroupe = ref(false)

const donnees = ref(null)
const messages = ref([])
const erreur = ref('')
const envoi = ref(false)
const texte = ref('')
const filtre = ref(null) // cahier de liaison : personne accompagnée affichée (null : toutes)
const pour = ref(null) // cahier de liaison : personne accompagnée concernée par la note écrite
const selection = ref(null) // message dont on montre les actions
const zone = ref(null)
const champ = ref(null)
const choixPhoto = ref(null)
const photos = ref(null) // { liste: [{ fichier, apercu, legende }], index, album } : aperçu avant envoi
const camera = ref(null)
const emojis = ref(false) // panneau d'émojis ouvert
const joindre = ref(false) // menu du trombone ouvert
const enregistrement = ref(null) // { session, secondes }
let chrono = null

const conversation = computed(() => donnees.value?.conversation)
const estLiaison = computed(() => conversation.value?.type === 'liaison')
const visibles = computed(() => messages.value.filter((m) => !estLiaison.value || !filtre.value || !m.accompagne || m.accompagne.utilisateurId === filtre.value))
// Séparateurs de jours
const blocs = computed(() => {
  const liste = []
  let jour = null
  for (const m of visibles.value) {
    const j = jourMessage(m.creeLe)
    if (j !== jour) liste.push({ separateur: j, cle: `j-${m.id}` })
    jour = j
    liste.push(m)
  }
  return liste
})
const dernierDeMoi = computed(() => [...messages.value].reverse().find((m) => m.deMoi && !m.retire)?.id)

const sousTitre = computed(() => {
  const c = conversation.value
  if (!c) return ''
  const aides = c.membres.filter((m) => m.role === 'accompagne').map((m) => m.prenom)
  if (c.type === 'famille') return `${c.nombre} personnes${aides.length ? `, dont ${aides.join(' et ')}` : ''}`
  if (c.type === 'aidants') return `Les aidants du cercle, sans ${aides.length ? aides.join(' ni ') : 'les personnes accompagnées'}`
  if (c.type === 'groupe') return [...c.membres.map((m) => m.prenom), 'vous'].join(', ')
  if (c.type === 'liaison') return `Aidants et auxiliaires${aides.length ? ` · ${aides.join(' et ')} ne le ${aides.length > 1 ? 'voient' : 'voit'} pas` : ''}`
  return c.autre?.role === 'accompagne' ? 'Personne accompagnée' : c.autre?.lien ?? ''
})
const placeholder = computed(() => {
  const c = conversation.value
  if (!c) return ''
  if (c.type === 'liaison') return 'Ajouter une note…'
  if (c.type === 'privee') return `Écrire à ${c.titre}…`
  if (c.type === 'groupe') return `Écrire au groupe ${c.titre}…`
  return c.type === 'famille' ? 'Écrire à toute la famille…' : 'Écrire aux aidants…'
})

async function charger({ garderPosition = false } = {}) {
  try {
    const d = await api('GET', `/messagerie/conversations/${props.conversationId}`)
    const enBas = !garderPosition || estEnBas()
    donnees.value = d
    messages.value = d.messages
    erreur.value = ''
    if (enBas) defiler()
    marquerLu()
  } catch (e) {
    erreur.value = e.message
  }
}

async function plusAnciens() {
  const avant = messages.value[0]?.creeLe
  if (!avant) return
  const d = await api('GET', `/messagerie/conversations/${props.conversationId}?avant=${encodeURIComponent(avant)}`)
  const hauteur = zone.value?.scrollHeight ?? 0
  messages.value = [...d.messages, ...messages.value]
  donnees.value = { ...donnees.value, suite: d.suite }
  await nextTick()
  if (zone.value) zone.value.scrollTop += zone.value.scrollHeight - hauteur
}

// Lu dès que la conversation est à l'écran
function marquerLu() {
  if (document.visibilityState !== 'visible') return
  api('POST', `/messagerie/conversations/${props.conversationId}/lu`).then(() => emit('change')).catch(() => {})
}

const estEnBas = () => !zone.value || zone.value.scrollHeight - zone.value.scrollTop - zone.value.clientHeight < 80
let defileLe = 0
async function defiler() {
  defileLe = Date.now()
  await nextTick()
  if (zone.value) zone.value.scrollTop = zone.value.scrollHeight
}
// Une photo qui finit de charger allonge le fil : on reste en bas juste après l'ouverture
const apresImage = () => Date.now() - defileLe < 5000 && zone.value && (zone.value.scrollTop = zone.value.scrollHeight)

watch(() => props.conversationId, () => {
  donnees.value = null
  messages.value = []
  texte.value = ''
  filtre.value = null
  pour.value = null
  annulerPhotos()
  emojis.value = false
  joindre.value = false
  annulerVocal()
  charger()
}, { immediate: true })

let arreter
const auRetourVisible = () => document.visibilityState === 'visible' && charger({ garderPosition: true })
onMounted(() => {
  arreter = ecouterMessagerie((type, d) => {
    if (d.conversationId !== props.conversationId) return
    // Ses propres lectures ne changent rien à l'affichage
    if (type === 'lu' && d.utilisateurId === session.utilisateur.id) return
    charger({ garderPosition: true })
  })
  document.addEventListener('visibilitychange', auRetourVisible)
})
onUnmounted(() => {
  arreter?.()
  document.removeEventListener('visibilitychange', auRetourVisible)
  annulerVocal()
})

const extra = () => (estLiaison.value && pour.value ? { accompagneId: pour.value } : {})

async function action(fn) {
  envoi.value = true
  erreur.value = ''
  try {
    await fn()
    await charger()
    emit('change')
  } catch (e) {
    erreur.value = e.message
  } finally {
    envoi.value = false
  }
}

const envoyer = () => {
  const t = texte.value.trim()
  if (!t || envoi.value) return
  return action(async () => {
    await envoyerTexte(props.conversationId, t, extra())
    texte.value = ''
    nextTick(() => champ.value?.focus())
  })
}

// Entrée envoie, Maj+Entrée va à la ligne (sur téléphone, le bouton Envoyer)
function touche(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(min-width: 761px)').matches) {
    e.preventDefault()
    envoyer()
  }
}

// --- Photo : aperçu, légende, et option « aussi dans les photos du cercle »
// Les photos du cercle : pas pour les auxiliaires de vie (ni depuis le cahier de liaison)
const peutAlbum = computed(() => Boolean(donnees.value?.monRole) && donnees.value.monRole !== 'auxiliaire' && conversation.value?.type !== 'liaison')
const albums = ref(null) // albums du cercle, chargés à la demande
async function chargerAlbums() {
  if (albums.value || !peutAlbum.value) return
  try {
    albums.value = (await api('GET', `/cercles/${conversation.value.cercleId}/albums`)).albums
  } catch {
    albums.value = []
  }
}
// album : false = pas dans les photos du cercle, 'aucun' = « Non classé », sinon l'id de l'album
const albumId = (album) => (album === 'aucun' ? null : album)
// Photos choisies (galerie, appareil photo, collées ou glissées) : aperçu en plein écran comme sur
// WhatsApp, une légende par photo, puis envoi l'une après l'autre
function ajouterPhotos(fichiers) {
  const images = [...fichiers].filter((f) => f.type.startsWith('image/'))
  if (!images.length) return
  joindre.value = false
  emojis.value = false
  const nouvelles = images.map((fichier) => ({ fichier, apercu: URL.createObjectURL(fichier), legende: '' }))
  if (!photos.value) {
    // Le texte déjà tapé devient la légende de la première photo
    nouvelles[0].legende = texte.value.trim()
    photos.value = { liste: nouvelles, index: 0, album: false }
    chargerAlbums()
  } else {
    photos.value.liste.push(...nouvelles)
    photos.value.index = photos.value.liste.length - nouvelles.length
  }
}
function photoChoisie(e) {
  ajouterPhotos(e.target.files ?? [])
  e.target.value = ''
}
function retirerPhoto(i) {
  const p = photos.value
  URL.revokeObjectURL(p.liste[i].apercu)
  p.liste.splice(i, 1)
  if (!p.liste.length) return annulerPhotos()
  p.index = Math.min(p.index, p.liste.length - 1)
}
function annulerPhotos() {
  for (const p of photos.value?.liste ?? []) URL.revokeObjectURL(p.apercu)
  photos.value = null
}
const photoActive = computed(() => photos.value?.liste[photos.value.index])
const envoyerLesPhotos = () => action(async () => {
  const { liste, album } = photos.value
  for (const [i, { fichier, legende }] of liste.entries()) {
    await envoyerPhotoMessage(props.conversationId, fichier, legende.trim(), extra())
      .catch((e) => { throw new Error(i ? `${i} photo${i > 1 ? 's' : ''} envoyée${i > 1 ? 's' : ''}, puis : ${e.message}` : e.message) })
    if (album !== false) await envoyerPhoto(conversation.value.cercleId, fichier, legende.trim(), albumId(album)).catch((e) => { throw new Error(`Message envoyé, mais pas ajouté aux photos : ${e.message}`) })
  }
  texte.value = ''
  annulerPhotos()
})
// Coller une image (Ctrl+V) ou la glisser dans la conversation
function colle(e) {
  const fichiers = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
  if (!fichiers.length || !donnees.value?.fichiers) return
  e.preventDefault()
  ajouterPhotos(fichiers)
}
const survol = ref(false)
function depose(e) {
  survol.value = false
  if (donnees.value?.fichiers && conversation.value?.peutEcrire) ajouterPhotos(e.dataTransfer?.files ?? [])
}

// --- Émojis : le panneau remplace le clavier sur téléphone, comme sur WhatsApp
const tactile = () => window.matchMedia('(pointer: coarse)').matches
function basculerEmojis() {
  emojis.value = !emojis.value
  joindre.value = false
  // Sur tablette ou smartphone, le panneau prend la place du clavier
  if (emojis.value && tactile()) champ.value?.blur()
  if (!emojis.value) nextTick(() => champ.value?.focus())
}
function ajouterEmoji(e) {
  texte.value = insererDans(champ.value, texte.value, e)
  if (!tactile()) nextTick(() => champ.value?.focus())
}
const legende = ref(null)
const emojisLegende = ref(false)
function ajouterEmojiLegende(e) {
  photoActive.value.legende = insererDans(legende.value, photoActive.value.legende, e)
}

// --- Photo d'une conversation : l'ajouter aux photos du cercle, dans l'album choisi
const ajout = ref(null) // { message, album }
const ajoutees = ref(new Set()) // messages déjà ajoutés depuis cet écran
function preparerAjout(m) {
  ajout.value = { message: m, album: 'aucun' }
  chargerAlbums()
}
const ajouterAuxPhotos = () => action(async () => {
  const { message, album } = ajout.value
  let image
  try {
    image = await (await fetch(message.photo.ecran)).blob()
  } catch {
    throw new Error('Impossible de récupérer la photo chez l\'hébergeur')
  }
  await envoyerPhoto(conversation.value.cercleId, image, message.texte ?? '', albumId(album))
  ajoutees.value = new Set([...ajoutees.value, message.id])
  ajout.value = null
  selection.value = null
})

// --- Message vocal : appuyer pour commencer, puis Envoyer ou Effacer
async function commencerVocal() {
  erreur.value = ''
  try {
    const s = await enregistrer({ surFin: () => terminerVocal() })
    enregistrement.value = { session: s, secondes: 0 }
    chrono = setInterval(() => enregistrement.value && (enregistrement.value.secondes = Math.round((Date.now() - s.debut) / 1000)), 500)
  } catch (e) {
    erreur.value = e.message
  }
}
function annulerVocal() {
  clearInterval(chrono)
  enregistrement.value?.session.annuler()
  enregistrement.value = null
}
async function terminerVocal() {
  const e = enregistrement.value
  if (!e) return
  clearInterval(chrono)
  enregistrement.value = null
  const resultat = await e.session.arreter()
  await action(() => envoyerVocal(props.conversationId, resultat, extra()))
}

// --- Actions sur un message
const retirer = async (m) => {
  const question = m.deMoi ? 'Effacer ce message pour tout le monde ?' : `Retirer le message de ${m.auteur.prenom} ? Il restera la mention « Message retiré par ${session.utilisateur.prenom} ».`
  if (!await confirmer(question, { oui: m.deMoi ? 'Effacer' : 'Retirer', danger: true, icone: 'effacer' })) return
  selection.value = null
  return action(() => api('DELETE', `/messagerie/messages/${m.id}`))
}

async function sourdine() {
  const muet = !conversation.value.muet
  await api('PUT', `/messagerie/conversations/${props.conversationId}/muet`, { muet })
  donnees.value.conversation.muet = muet
}

// --- Sondages de dates (« Toute la famille ») : création, réponses, tableau
const route = useRoute()
const nouveauSondage = ref(false)
const detail = ref(null) // { id, mode: 'repondre' | 'detail' }
const sondageLance = (r) => {
  nouveauSondage.value = false
  charger()
  emit('change')
  if (r?.id) detail.value = { id: r.id, mode: 'repondre' }
}
// Ouvert depuis une alerte de relance (?sondage=<id>)
watch(() => route.query.sondage, (id) => id && (detail.value = { id, mode: 'repondre' }), { immediate: true })

const enGrand = ref(null) // photo affichée en grand
const vocalPossible = enregistrementPossible()
</script>

<template>
  <section class="fil" @dragover.prevent="survol = Boolean(donnees?.fichiers && conversation?.peutEcrire)" @dragleave.self="survol = false" @drop.prevent="depose">
    <header v-if="conversation" class="tete-fil">
      <button v-if="retour" class="retour" aria-label="Retour aux conversations" @click="emit('retour')"><Icone nom="precedent" /></button>
      <Avatar v-if="conversation.autre" :src="conversation.autre.avatar" :prenom="conversation.autre.prenom" :taille="42" :decede="conversation.autre.decede" />
      <span v-else class="rond" :class="conversation.type"><Icone :nom="{ famille: 'famille', aidants: 'cadenas', liaison: 'carnet', groupe: 'famille' }[conversation.type]" /></span>
      <div class="grandit">
        <strong>{{ conversation.titre }}<span v-if="conversation.autre?.decede" class="mention-deces">{{ motDecede(conversation.autre.genre) }}</span></strong>
        <p class="aide">{{ sousTitre }}</p>
      </div>
      <div v-if="conversation.type === 'famille' || conversation.type === 'groupe'" class="avatars-groupe">
        <Avatar v-for="m in conversation.membres.slice(0, 5)" :key="m.utilisateurId" :src="m.avatar" :prenom="m.prenom" :taille="30" />
        <span v-if="conversation.membres.length > 5" class="encore">+{{ conversation.membres.length - 5 }}</span>
      </div>
      <BoutonIcone v-if="conversation.peutGerer" icone="modifier" libelle="Modifier le groupe (nom, membres)" @click="gererGroupe = true" />
      <BoutonIcone :icone="conversation.muet ? 'sourdine' : 'cloche'" :libelle="conversation.muet ? 'Réactiver les alertes de cette conversation' : 'Ne plus recevoir d\'alerte pour cette conversation'" @click="sourdine" />
    </header>

    <div v-if="estLiaison && donnees.accompagnes.length > 1" class="filtres">
      <button :class="{ actif: !filtre }" @click="filtre = null">Tous</button>
      <button v-for="a in donnees.accompagnes" :key="a.utilisateurId" :class="{ actif: filtre === a.utilisateurId }" @click="filtre = a.utilisateurId">{{ a.prenom }}</button>
    </div>

    <div ref="zone" class="messages" @click.self="selection = null">
      <button v-if="donnees?.suite" class="lien plus-anciens" @click="plusAnciens">Messages plus anciens</button>
      <p v-if="donnees && !messages.length" class="aide vide">
        {{ estLiaison ? 'Aucune note pour l\'instant. Le cahier de liaison sert aux aidants et aux auxiliaires : passages, repas, soins, courses à prévoir.' : 'Aucun message pour l\'instant. Écrivez le premier !' }}
      </p>
      <template v-for="b in blocs" :key="b.cle ?? b.id">
        <div v-if="b.separateur" class="separateur-jour"><span>{{ b.separateur }}</span></div>

        <div v-else-if="b.retire" class="ligne-msg retire-ligne" :class="{ moi: b.deMoi }">
          <span class="retire"><Icone nom="oeilBarre" class="en-ligne" />
            {{ b.retire.parAuteur ? 'Message effacé' : `Message retiré par ${b.retire.prenom ?? 'un aidant'} (aidant)` }}</span>
        </div>

        <!-- Cahier de liaison : des notes plutôt que des bulles -->
        <article v-else-if="estLiaison" class="note" :class="{ choisie: selection === b.id }" @click="selection = selection === b.id ? null : b.id">
          <div class="note-tete">
            <Avatar :src="b.auteur.avatar" :prenom="b.auteur.prenom" :taille="30" :decede="b.auteur.decede" />
            <strong>{{ b.deMoi ? 'Vous' : b.auteur.prenom }}<span v-if="b.auteur.decede" class="mention-deces">{{ motDecede(b.auteur.genre) }}</span></strong>
            <span v-if="b.accompagne" class="pastille">{{ b.accompagne.prenom }}</span>
            <span class="heure">{{ heureMessage(b.creeLe) }}</span>
          </div>
          <img v-if="b.photo" :src="b.photo.miniature" alt="Photo" class="photo-msg" @load="apresImage" @click.stop="enGrand = b.photo" />
          <audio v-if="b.vocal" :src="b.vocal.lien" controls preload="none" class="audio" />
          <p v-if="b.texte" class="texte-note"><TexteMessage :texte="b.texte" /></p>
          <ApercuLien v-if="b.lien" :lien="b.lien" @charge="apresImage" />
          <p v-if="b.vuPar?.length" class="vu"><Icone nom="coche" class="en-ligne" /> {{ texteVu(b.vuPar) }}</p>
          <div v-if="selection === b.id && b.peutRetirer" class="actions-msg">
            <button class="danger" @click.stop="retirer(b)"><Icone nom="effacer" class="en-ligne" /> {{ b.deMoi ? 'Effacer' : 'Retirer' }}</button>
          </div>
        </article>

        <div v-else class="ligne-msg" :class="{ moi: b.deMoi }">
          <!-- Chaque message montre qui l'a écrit : avatar et prénom (« Vous » pour les siens) -->
          <Avatar :src="b.auteur.avatar" :prenom="b.auteur.prenom" :taille="36" class="avatar-msg" :decede="b.auteur.decede" />
          <div class="bulle-bloc">
            <div class="auteur">{{ b.deMoi ? 'Vous' : b.auteur.prenom }}<span v-if="b.auteur.decede" class="mention-deces">{{ motDecede(b.auteur.genre) }}</span></div>
            <CarteSondage v-if="b.sondage" :sondage="b.sondage" :class="{ choisie: selection === b.id }" @click="selection = selection === b.id ? null : b.id"
              @repondre="detail = { id: b.sondage.id, mode: 'repondre' }" @detail="detail = { id: b.sondage.id, mode: 'detail' }" />
            <div v-else class="bulle" :class="{ rapide: b.type === 'rapide', choisie: selection === b.id, 'gros-emoji': b.type === 'texte' && !b.photo && seulementEmojis(b.texte) }" @click="selection = selection === b.id ? null : b.id">
              <img v-if="b.photo" :src="b.photo.miniature" alt="Photo" class="photo-msg" @load="apresImage" :style="b.photo.largeur ? { aspectRatio: `${b.photo.largeur} / ${b.photo.hauteur}` } : null" @click.stop="enGrand = { ...b.photo, message: b }" />
              <p v-else-if="b.type === 'photo'" class="aide">Photo (stockage non configuré)</p>
              <div v-if="b.vocal" class="vocal"><Icone nom="micro" class="en-ligne" /><audio :src="b.vocal.lien" controls preload="none" /><span>{{ duree(b.vocal.duree) }}</span></div>
              <div v-if="b.texte" class="texte"><TexteMessage :texte="b.texte" /></div>
              <ApercuLien v-if="b.lien" :lien="b.lien" @charge="apresImage" />
              <div class="h">{{ heureMessage(b.creeLe) }}</div>
            </div>
            <p v-if="b.deMoi && b.vuPar?.length && (conversation.type === 'privee' || b.id === dernierDeMoi)" class="vu"><Icone nom="coche" class="en-ligne" /> {{ texteVu(b.vuPar) }}</p>
            <!-- Photo : bouton toujours visible pour la ranger dans les photos du cercle -->
            <p v-if="ajoutees.has(b.id)" class="vu"><Icone nom="coche" class="en-ligne" /> Ajoutée aux photos</p>
            <div v-else-if="ajout?.message.id === b.id" class="actions-msg">
              <select v-model="ajout.album" aria-label="Album">
                <option value="aucun">Non classé</option>
                <option v-for="a in albums ?? []" :key="a.id" :value="a.id">{{ a.nom }}</option>
              </select>
              <button :disabled="envoi" @click.stop="ajouterAuxPhotos"><Icone nom="photo" class="en-ligne" /> {{ envoi ? 'Ajout…' : 'Ajouter' }}</button>
              <button class="secondaire" @click.stop="ajout = null">Annuler</button>
            </div>
            <button v-else-if="b.photo && peutAlbum" class="ajouter-photos" @click.stop="preparerAjout(b)"><Icone nom="photo" class="en-ligne" /> Ajouter aux photos</button>
            <div v-if="selection === b.id && b.peutRetirer" class="actions-msg">
              <button class="danger" @click="retirer(b)"><Icone nom="effacer" class="en-ligne" /> {{ b.deMoi ? 'Effacer pour tout le monde' : 'Retirer ce message' }}</button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <p v-if="erreur" class="erreur bandeau-erreur">{{ erreur }}</p>

    <!-- Enregistrement en cours -->
    <div v-if="enregistrement" class="saisie enregistrement">
      <span class="point-rouge" />
      <span class="grandit">Enregistrement… {{ duree(enregistrement.secondes) }} <span class="aide">(2 minutes au plus)</span></span>
      <button class="secondaire" @click="annulerVocal"><Icone nom="effacer" class="en-ligne" /> Effacer</button>
      <button @click="terminerVocal"><Icone nom="envoyer" class="en-ligne" /> Envoyer</button>
    </div>

    <!-- Barre d'écriture façon WhatsApp : émojis et pièces jointes dans le champ, micro ou envoi à droite -->
    <form v-else-if="conversation?.peutEcrire" class="saisie" @submit.prevent="envoyer">
      <select v-if="estLiaison && donnees.accompagnes.length" v-model="pour" class="pour" aria-label="Personne concernée">
        <option :value="null">Tous</option>
        <option v-for="a in donnees.accompagnes" :key="a.utilisateurId" :value="a.utilisateurId">{{ a.prenom }}</option>
      </select>
      <div class="champ-saisie">
        <button type="button" class="dans-champ" :class="{ actif: emojis }" :aria-label="emojis ? 'Revenir au clavier' : 'Émojis'" :title="emojis ? 'Revenir au clavier' : 'Émojis'" @click="basculerEmojis">
          <Icone :nom="emojis ? 'clavier' : 'emoji'" />
        </button>
        <textarea ref="champ" v-model="texte" :placeholder="placeholder" rows="1" maxlength="4000" @keydown="touche" @paste="colle" @focus="joindre = false; tactile() && (emojis = false)" />
        <div v-if="donnees.fichiers || donnees.peutSonder" class="ancre-joindre">
          <button type="button" class="dans-champ" :class="{ actif: joindre }" aria-label="Joindre" title="Joindre une photo ou un sondage" @click="joindre = !joindre; emojis = false">
            <Icone nom="trombone" />
          </button>
          <div v-if="joindre" class="menu-joindre">
            <button v-if="donnees.fichiers" type="button" @click="choixPhoto.click()"><span class="rond-menu galerie"><Icone nom="photo" /></span> Galerie</button>
            <button v-if="donnees.fichiers" type="button" @click="camera.click()"><span class="rond-menu camera"><Icone nom="appareil" /></span> Appareil photo</button>
            <button v-if="donnees.peutSonder" type="button" @click="joindre = false; nouveauSondage = true"><span class="rond-menu sondage"><Icone nom="sondage" /></span> Sondage de dates</button>
          </div>
        </div>
        <button v-if="donnees.fichiers && !texte.trim()" type="button" class="dans-champ" aria-label="Prendre une photo" title="Prendre une photo" @click="camera.click()">
          <Icone nom="appareil" />
        </button>
      </div>
      <input ref="choixPhoto" type="file" accept="image/*" multiple hidden @change="photoChoisie" />
      <input ref="camera" type="file" accept="image/*" capture="environment" hidden @change="photoChoisie" />
      <button v-if="donnees.fichiers && vocalPossible && !texte.trim()" type="button" class="envoyer" :aria-label="`Message vocal (${DUREE_VOCAL_MAX / 60} minutes au plus)`" :title="`Message vocal (${DUREE_VOCAL_MAX / 60} minutes au plus)`" :disabled="envoi" @click="commencerVocal"><Icone nom="micro" /></button>
      <button v-else class="envoyer" :disabled="envoi || !texte.trim()" aria-label="Envoyer" title="Envoyer"><Icone nom="envoyer" /></button>
    </form>
    <SelecteurEmoji v-if="emojis && conversation?.peutEcrire && !enregistrement" @choisir="ajouterEmoji" />
    <p v-else-if="conversation?.autre?.decede" class="fin-conversation">
      {{ conversation.autre.prenom }} est {{ motDecede(conversation.autre.genre) }} : vos messages restent ici, mais on ne peut plus lui écrire.
    </p>
    <p v-else-if="conversation" class="aide ferme">Vous ne pouvez plus écrire dans cette conversation.</p>

    <!-- Photos choisies : aperçu en grand, une légende par photo, comme sur WhatsApp -->
    <div v-if="photos" class="envoi-photos">
      <div class="haut-photos">
        <button class="sur-noir" aria-label="Annuler" title="Annuler" :disabled="envoi" @click="annulerPhotos"><Icone nom="fermer" /></button>
        <span>{{ photos.liste.length > 1 ? `${photos.index + 1} / ${photos.liste.length}` : '' }}</span>
        <button v-if="photos.liste.length > 1" class="sur-noir" aria-label="Retirer cette photo" title="Retirer cette photo" :disabled="envoi" @click="retirerPhoto(photos.index)"><Icone nom="effacer" /></button>
        <span v-else />
      </div>
      <div class="grande-photo"><img :src="photoActive.apercu" alt="Photo à envoyer" /></div>
      <div class="bas-photos">
        <div class="legende-ligne">
          <div class="champ-saisie sombre">
            <button type="button" class="dans-champ" :aria-label="emojisLegende ? 'Revenir au clavier' : 'Émojis'" @click="emojisLegende = !emojisLegende"><Icone :nom="emojisLegende ? 'clavier' : 'emoji'" /></button>
            <textarea ref="legende" v-model="photoActive.legende" rows="1" maxlength="1000" placeholder="Ajouter une légende…" aria-label="Légende" />
          </div>
        </div>
        <SelecteurEmoji v-if="emojisLegende" class="emojis-legende" @choisir="ajouterEmojiLegende" />
        <div class="vignettes-ligne">
          <div class="vignettes">
            <button v-for="(p, i) in photos.liste" :key="p.apercu" class="vignette" :class="{ active: i === photos.index }" :aria-label="`Photo ${i + 1}`" @click="photos.index = i">
              <img :src="p.apercu" alt="" />
            </button>
            <button class="vignette ajouter" aria-label="Ajouter des photos" title="Ajouter des photos" :disabled="envoi" @click="choixPhoto.click()"><Icone nom="ajouter" /></button>
          </div>
        </div>
        <div class="envoi-ligne">
          <select v-if="peutAlbum" v-model="photos.album" aria-label="Photos du cercle">
            <option :value="false">Pas dans les photos du cercle</option>
            <option value="aucun">Aussi dans les photos : Non classé</option>
            <option v-for="a in albums ?? []" :key="a.id" :value="a.id">Aussi dans l'album « {{ a.nom }} »</option>
          </select>
          <span class="pour-qui">{{ conversation.titre }}</span>
          <button class="envoyer gros" :disabled="envoi" :aria-label="`Envoyer ${photos.liste.length > 1 ? `les ${photos.liste.length} photos` : 'la photo'}`" @click="envoyerLesPhotos">
            <Icone nom="envoyer" /><span v-if="photos.liste.length > 1" class="compte">{{ photos.liste.length }}</span>
          </button>
        </div>
        <p v-if="envoi" class="envoi-cours">Envoi en cours…</p>
        <p v-if="erreur" class="erreur">{{ erreur }}</p>
      </div>
    </div>
    <div v-if="survol" class="zone-depot"><Icone nom="photo" /><p>Déposez les photos ici</p></div>

    <FenetreSondage v-if="nouveauSondage" :conversation-id="conversationId" @fermer="nouveauSondage = false" @enregistre="sondageLance" />
    <FenetreGroupe v-if="gererGroupe" :cercle-id="conversation.cercleId" :groupe="conversation" @fermer="gererGroupe = false" @enregistre="gererGroupe = false; charger(); emit('change')" @supprime="gererGroupe = false; emit('supprime')" />
    <DetailSondage v-if="detail && conversation" :key="detail.id + detail.mode" :sondage-id="detail.id" :cercle-id="conversation.cercleId" :mode="detail.mode"
      @fermer="detail = null" @change="charger({ garderPosition: true }); emit('change')" />

    <div v-if="enGrand" class="plein-ecran" @click="enGrand = null">
      <img :src="enGrand.ecran" alt="Photo" />
      <button class="fermer" aria-label="Fermer"><Icone nom="fermer" /></button>
      <button v-if="enGrand.message && peutAlbum && !ajoutees.has(enGrand.message.id)" class="ajouter-plein" @click.stop="preparerAjout(enGrand.message); enGrand = null"><Icone nom="photo" class="en-ligne" /> Ajouter aux photos</button>
    </div>
  </section>
</template>

<style scoped>
.fil { display: flex; flex-direction: column; min-width: 0; height: 100%; background: var(--fond); }
.tete-fil { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: white; border-bottom: 1px solid #ebe8e3; }
.tete-fil strong { color: var(--bleu-nuit); }
.tete-fil .aide { margin: 0; }
.grandit { flex: 1; min-width: 0; }
.retour { background: none; color: var(--vert); padding: 4px; display: grid; }
.rond { width: 42px; height: 42px; border-radius: 50%; background: var(--vert-clair); color: var(--vert); display: grid; place-items: center; flex: none; }
.rond.liaison { background: #fdebd8; color: #b46a22; }
.rond.aidants { background: #e8ebf5; color: var(--bleu-nuit); }
.rond.groupe { background: #efe8f6; color: #6b4b94; }
.avatars-groupe { display: flex; align-items: center; }
.avatars-groupe > * { margin-left: -8px; border: 2px solid white; }
.encore { color: var(--gris); font-size: 0.85rem; margin-left: 6px; border: none; }
.filtres { display: flex; gap: 8px; padding: 10px 16px 0; flex-wrap: wrap; }
.filtres button { background: white; color: var(--gris); border: 1px solid #e2ded7; border-radius: 999px; padding: 4px 14px; font-size: 0.9rem; }
.filtres button.actif { background: var(--bleu-nuit); border-color: var(--bleu-nuit); color: white; }
.messages { flex: 1; overflow-y: auto; padding: 12px 20px; display: flex; flex-direction: column; gap: 8px; }
.plus-anciens { align-self: center; }
.vide { text-align: center; margin: 32px auto; max-width: 420px; }
.separateur-jour { text-align: center; margin: 6px 0; }
.separateur-jour span { background: #efece6; color: var(--gris); font-size: 0.8rem; padding: 3px 12px; border-radius: 999px; }
.ligne-msg { display: flex; gap: 8px; align-items: flex-start; max-width: 75%; }
.avatar-msg { flex: none; margin-top: 2px; }
.ligne-msg.moi { align-self: flex-end; flex-direction: row-reverse; }
.bulle-bloc { min-width: 0; display: flex; flex-direction: column; }
.moi .bulle-bloc { align-items: flex-end; }
.auteur { font-size: 0.85rem; font-weight: 700; color: var(--bleu-nuit); margin: 0 0 3px 10px; }
.moi .auteur { margin: 0 10px 3px 0; }
.bulle { background: white; border-radius: 16px 16px 16px 4px; padding: 8px 12px; box-shadow: 0 1px 2px rgb(0 0 0 / 0.07); line-height: 1.4; cursor: pointer; max-width: 100%; }
.moi .bulle { background: var(--bleu-nuit); color: white; border-radius: 16px 16px 4px 16px; }
.moi .bulle :deep(.apercu-lien) { background: rgb(255 255 255 / 0.12); }
.bulle.rapide { background: var(--vert-clair); color: var(--vert); font-weight: 700; }
.bulle.choisie { outline: 2px solid var(--vert); }
.carte-sondage.choisie { outline: 2px solid var(--bleu-nuit); }
.texte { white-space: pre-wrap; overflow-wrap: anywhere; }
.h { font-size: 0.72rem; color: var(--gris); text-align: right; margin-top: 2px; }
.moi .h { color: #c5cbe0; }
.vu { font-size: 0.78rem; color: var(--vert); margin: 3px 4px 0; }
.photo-msg { display: block; max-width: min(280px, 100%); max-height: 320px; border-radius: 10px; margin: 2px 0 6px; object-fit: cover; cursor: zoom-in; background: #eee; }
.vocal { display: flex; align-items: center; gap: 8px; }
.vocal audio { height: 36px; max-width: 220px; }
.audio { width: 100%; max-width: 320px; height: 36px; margin: 6px 0 0; }
.retire-ligne { max-width: none; }
.retire { color: var(--gris); font-style: italic; font-size: 0.88rem; background: #f1eee9; border-radius: 12px; padding: 6px 12px; }
.actions-msg { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.actions-msg button, .actions-msg select { font-size: 0.85rem; border-radius: 8px; padding: 6px 10px; }
.actions-msg .danger { font-size: 0.85rem; background: #fbeceb; border-radius: 8px; padding: 6px 10px; }
.note { background: white; border-radius: 12px; padding: 10px 12px; box-shadow: 0 1px 2px rgb(0 0 0 / 0.07); border-left: 4px solid #f2a65a; cursor: pointer; max-width: 720px; }
.note.choisie { outline: 2px solid var(--vert); }
.note-tete { display: flex; gap: 8px; align-items: center; }
.note-tete .heure { margin-left: auto; color: var(--gris); font-size: 0.8rem; }
.texte-note { margin: 8px 0 2px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
.pastille { background: var(--vert-clair); color: var(--vert); border-radius: 999px; padding: 1px 10px; font-size: 0.8rem; }
.saisie { display: flex; gap: 8px; align-items: flex-end; padding: 10px 16px; background: white; border-top: 1px solid #ebe8e3; margin: 0; flex-direction: row; }
.champ-saisie { flex: 1; min-width: 0; display: flex; align-items: flex-end; background: white; border: 1px solid #e2ded7; border-radius: 24px; padding: 2px 4px; }
.champ-saisie:focus-within { border-color: var(--vert); }
.champ-saisie textarea { flex: 1; min-width: 0; font: inherit; border: none; outline: none; background: none; padding: 10px 4px; resize: none; max-height: 160px; min-height: 40px; field-sizing: content; box-shadow: none; }
.dans-champ { background: none; color: var(--gris); width: 40px; height: 40px; padding: 0; border-radius: 50%; display: grid; place-items: center; flex: none; }
.dans-champ:hover, .dans-champ.actif { color: var(--vert); background: var(--vert-clair); }
.dans-champ .icone { width: 22px; height: 22px; }
.ancre-joindre { position: relative; }
.menu-joindre { position: absolute; bottom: 52px; right: -40px; z-index: 20; background: white; border-radius: 16px; box-shadow: 0 6px 24px rgb(0 0 0 / 0.16); padding: 8px; display: flex; flex-direction: column; gap: 2px; min-width: 210px; }
.menu-joindre button { display: flex; align-items: center; gap: 12px; background: none; color: #2b2b2b; padding: 8px 10px; border-radius: 10px; font-weight: 500; text-align: left; }
.menu-joindre button:hover { background: #f4f2ee; }
.rond-menu { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; color: white; flex: none; }
.rond-menu .icone { width: 20px; height: 20px; }
.rond-menu.galerie { background: #8e5bd0; }
.rond-menu.camera { background: #d6487e; }
.rond-menu.sondage { background: #2f8f9d; }
.bulle.gros-emoji { background: none; box-shadow: none; padding: 0 2px; }
.bulle.gros-emoji .texte { font-size: 2.6rem; line-height: 1.2; }
.moi .bulle.gros-emoji { color: inherit; }
.moi .bulle.gros-emoji .h { color: var(--gris); }
.envoi-photos { position: fixed; inset: 0; z-index: 150; background: #0b141a; color: white; display: flex; flex-direction: column; }
.haut-photos { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; }
.sur-noir { background: rgb(255 255 255 / 0.12); color: white; width: 44px; height: 44px; padding: 0; border-radius: 50%; display: grid; place-items: center; }
.grande-photo { flex: 1; min-height: 0; display: grid; place-items: center; padding: 0 12px; }
.grande-photo img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px; }
.bas-photos { padding: 10px 14px 14px; display: flex; flex-direction: column; gap: 10px; max-width: 900px; width: 100%; margin: 0 auto; }
.champ-saisie.sombre { background: #1f2c33; border-color: #1f2c33; }
.champ-saisie.sombre textarea { color: white; }
.champ-saisie.sombre .dans-champ { color: #aebac1; }
.champ-saisie.sombre .dans-champ:hover { background: rgb(255 255 255 / 0.08); color: white; }
.emojis-legende { border-radius: 14px; overflow: hidden; color: #2b2b2b; }
.vignettes-ligne { overflow-x: auto; }
.vignettes { display: flex; gap: 8px; justify-content: center; min-width: min-content; }
.vignette { width: 56px; height: 56px; padding: 0; border-radius: 10px; overflow: hidden; border: 2px solid transparent; background: #1f2c33; flex: none; opacity: 0.7; }
.vignette.active { border-color: var(--vert); opacity: 1; }
.vignette img { width: 100%; height: 100%; object-fit: cover; display: block; }
.vignette.ajouter { display: grid; place-items: center; color: white; opacity: 1; border: 2px dashed #54656f; }
.envoi-ligne { display: flex; align-items: center; gap: 12px; }
.envoi-ligne select { background: #1f2c33; color: white; border: none; border-radius: 10px; padding: 8px 10px; max-width: 60%; }
@media (max-width: 600px) {
  .envoi-ligne { flex-wrap: wrap; }
  .envoi-ligne select { order: 3; flex: 1 1 100%; max-width: none; }
  .pour-qui { text-align: left; }
  .envoyer.gros { margin-left: auto; }
}
.pour-qui { flex: 1; min-width: 0; color: #aebac1; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; }
.envoyer.gros { width: 56px; height: 56px; position: relative; }
.envoyer.gros .compte { position: absolute; top: -4px; right: -4px; background: white; color: var(--vert); border-radius: 999px; font-size: 0.75rem; font-weight: 700; min-width: 20px; height: 20px; display: grid; place-items: center; }
.envoi-cours { margin: 0; color: #aebac1; text-align: center; }
.envoi-photos .erreur { margin: 0; }
.fil { position: relative; }
.zone-depot { position: absolute; inset: 0; z-index: 40; background: rgb(46 140 104 / 0.12); border: 3px dashed var(--vert); display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--vert); pointer-events: none; font-weight: 600; }
.zone-depot .icone { width: 56px; height: 56px; }
.saisie .pour { padding: 8px; border-radius: 10px; max-width: 120px; align-self: center; }
.envoyer { width: 44px; height: 44px; padding: 0; border-radius: 50%; display: grid; place-items: center; flex: none; }
.enregistrement { align-items: center; }
.point-rouge { width: 14px; height: 14px; border-radius: 50%; background: var(--rouge); animation: clignote 1s infinite; flex: none; }
@keyframes clignote { 50% { opacity: 0.3; } }
.case { flex-direction: row; align-items: center; gap: 6px; font-weight: normal; margin-top: 6px; font-size: 0.92rem; }
.boutons-apercu { display: flex; gap: 8px; }
.bandeau-erreur { margin: 0; padding: 6px 16px; background: #fbeceb; }
.ferme { text-align: center; padding: 12px; margin: 0; background: white; border-top: 1px solid #ebe8e3; }
.plein-ecran { position: fixed; inset: 0; z-index: 200; background: rgb(0 0 0 / 0.9); display: grid; place-items: center; }
.plein-ecran img { max-width: 100%; max-height: 100%; object-fit: contain; }
.ajouter-photos { align-self: flex-start; margin-top: 4px; font-size: 0.85rem; padding: 6px 12px; border-radius: 999px; background: var(--vert-clair); color: var(--vert); font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
.moi .ajouter-photos { align-self: flex-end; }
.ajouter-plein { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 12px 20px; border-radius: 999px; display: inline-flex; align-items: center; gap: 8px; font-weight: 700; }
.plein-ecran .fermer { position: absolute; top: 12px; right: 12px; background: rgb(255 255 255 / 0.15); border-radius: 50%; width: 44px; height: 44px; padding: 0; display: grid; place-items: center; }
@media (max-width: 760px) {
  .messages { padding: 10px 10px; }
  .ligne-msg { max-width: 88%; }
  .tete-fil { padding: 8px 10px; gap: 10px; }
  .avatars-groupe { display: none; }
  .saisie { padding: 8px 8px 10px; gap: 6px; }
  .saisie .pour { max-width: 90px; }
}
.mention-deces { margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: #ebe9e5; color: #5f5d58; font-size: 0.8rem; font-weight: 600; }
.fin-conversation { margin: 0; padding: 14px 16px; border-top: 1px solid #ebe8e3; color: var(--gris); text-align: center; }
</style>
