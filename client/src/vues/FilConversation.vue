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
import { confirmer } from '../fenetre.js'

// Fil d'une conversation, côté aidants, proches et auxiliaires : messages, accusés de lecture,
// envoi de texte, de photos et de messages vocaux, sourdine et modération par les aidants.
const props = defineProps({
  conversationId: { type: String, required: true },
  retour: Boolean // téléphone : flèche de retour vers la liste
})
const emit = defineEmits(['retour', 'change'])

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
const photo = ref(null) // { fichier, apercu, legende, album }
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
  if (c.type === 'liaison') return `Aidants et auxiliaires${aides.length ? ` · ${aides.join(' et ')} ne le ${aides.length > 1 ? 'voient' : 'voit'} pas` : ''}`
  return c.autre?.role === 'accompagne' ? 'Personne accompagnée' : c.autre?.lien ?? ''
})
const placeholder = computed(() => {
  const c = conversation.value
  if (!c) return ''
  if (c.type === 'liaison') return 'Ajouter une note…'
  if (c.type === 'privee') return `Écrire à ${c.titre}…`
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
  photo.value = null
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
function photoChoisie(e) {
  const fichier = e.target.files?.[0]
  e.target.value = ''
  if (!fichier) return
  photo.value = { fichier, apercu: URL.createObjectURL(fichier), legende: texte.value.trim(), album: false }
  chargerAlbums()
}
function annulerPhoto() {
  if (photo.value) URL.revokeObjectURL(photo.value.apercu)
  photo.value = null
}
const envoyerLaPhoto = () => action(async () => {
  const { fichier, legende, album } = photo.value
  await envoyerPhotoMessage(props.conversationId, fichier, legende, extra())
  if (album !== false) await envoyerPhoto(conversation.value.cercleId, fichier, legende, albumId(album)).catch((e) => { throw new Error(`Message envoyé, mais pas ajouté aux photos : ${e.message}`) })
  texte.value = ''
  annulerPhoto()
})

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

const enGrand = ref(null) // photo affichée en grand
const vocalPossible = enregistrementPossible()
</script>

<template>
  <section class="fil">
    <header v-if="conversation" class="tete-fil">
      <button v-if="retour" class="retour" aria-label="Retour aux conversations" @click="emit('retour')"><Icone nom="precedent" /></button>
      <Avatar v-if="conversation.autre" :src="conversation.autre.avatar" :prenom="conversation.autre.prenom" :taille="42" />
      <span v-else class="rond" :class="conversation.type"><Icone :nom="{ famille: 'famille', aidants: 'cadenas', liaison: 'carnet' }[conversation.type]" /></span>
      <div class="grandit">
        <strong>{{ conversation.titre }}</strong>
        <p class="aide">{{ sousTitre }}</p>
      </div>
      <div v-if="conversation.type === 'famille'" class="avatars-groupe">
        <Avatar v-for="m in conversation.membres.slice(0, 5)" :key="m.utilisateurId" :src="m.avatar" :prenom="m.prenom" :taille="30" />
        <span v-if="conversation.membres.length > 5" class="encore">+{{ conversation.membres.length - 5 }}</span>
      </div>
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
            <Avatar :src="b.auteur.avatar" :prenom="b.auteur.prenom" :taille="30" />
            <strong>{{ b.deMoi ? 'Vous' : b.auteur.prenom }}</strong>
            <span v-if="b.accompagne" class="pastille">{{ b.accompagne.prenom }}</span>
            <span class="heure">{{ heureMessage(b.creeLe) }}</span>
          </div>
          <img v-if="b.photo" :src="b.photo.miniature" alt="Photo" class="photo-msg" @load="apresImage" @click.stop="enGrand = b.photo" />
          <audio v-if="b.vocal" :src="b.vocal.lien" controls preload="none" class="audio" />
          <p v-if="b.texte" class="texte-note">{{ b.texte }}</p>
          <p v-if="b.vuPar?.length" class="vu"><Icone nom="coche" class="en-ligne" /> {{ texteVu(b.vuPar) }}</p>
          <div v-if="selection === b.id && b.peutRetirer" class="actions-msg">
            <button class="danger" @click.stop="retirer(b)"><Icone nom="effacer" class="en-ligne" /> {{ b.deMoi ? 'Effacer' : 'Retirer' }}</button>
          </div>
        </article>

        <div v-else class="ligne-msg" :class="{ moi: b.deMoi }">
          <!-- Chaque message montre qui l'a écrit : avatar et prénom (« Vous » pour les siens) -->
          <Avatar :src="b.auteur.avatar" :prenom="b.auteur.prenom" :taille="36" class="avatar-msg" />
          <div class="bulle-bloc">
            <div class="auteur">{{ b.deMoi ? 'Vous' : b.auteur.prenom }}</div>
            <div class="bulle" :class="{ rapide: b.type === 'rapide', choisie: selection === b.id }" @click="selection = selection === b.id ? null : b.id">
              <img v-if="b.photo" :src="b.photo.miniature" alt="Photo" class="photo-msg" @load="apresImage" :style="b.photo.largeur ? { aspectRatio: `${b.photo.largeur} / ${b.photo.hauteur}` } : null" @click.stop="enGrand = { ...b.photo, message: b }" />
              <p v-else-if="b.type === 'photo'" class="aide">Photo (stockage non configuré)</p>
              <div v-if="b.vocal" class="vocal"><Icone nom="micro" class="en-ligne" /><audio :src="b.vocal.lien" controls preload="none" /><span>{{ duree(b.vocal.duree) }}</span></div>
              <div v-if="b.texte" class="texte">{{ b.texte }}</div>
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

    <!-- Photo choisie : aperçu avant envoi -->
    <div v-if="photo" class="apercu-photo">
      <img :src="photo.apercu" alt="" />
      <div class="grandit">
        <textarea v-model="photo.legende" rows="2" placeholder="Ajouter un commentaire (facultatif)" maxlength="1000" aria-label="Commentaire" />
        <select v-if="peutAlbum" v-model="photo.album" aria-label="Photos du cercle">
          <option :value="false">Pas dans les photos du cercle</option>
          <option value="aucun">Photos du cercle : Non classé</option>
          <option v-for="a in albums ?? []" :key="a.id" :value="a.id">Album « {{ a.nom }} »</option>
        </select>
      </div>
      <div class="boutons-apercu">
        <button class="secondaire" :disabled="envoi" @click="annulerPhoto">Annuler</button>
        <button :disabled="envoi" @click="envoyerLaPhoto"><Icone nom="envoyer" class="en-ligne" /> {{ envoi ? 'Envoi…' : 'Envoyer' }}</button>
      </div>
    </div>

    <!-- Enregistrement en cours -->
    <div v-else-if="enregistrement" class="saisie enregistrement">
      <span class="point-rouge" />
      <span class="grandit">Enregistrement… {{ duree(enregistrement.secondes) }} <span class="aide">(2 minutes au plus)</span></span>
      <button class="secondaire" @click="annulerVocal"><Icone nom="effacer" class="en-ligne" /> Effacer</button>
      <button @click="terminerVocal"><Icone nom="envoyer" class="en-ligne" /> Envoyer</button>
    </div>

    <form v-else-if="conversation?.peutEcrire" class="saisie" @submit.prevent="envoyer">
      <select v-if="estLiaison && donnees.accompagnes.length" v-model="pour" class="pour" aria-label="Personne concernée">
        <option :value="null">Tous</option>
        <option v-for="a in donnees.accompagnes" :key="a.utilisateurId" :value="a.utilisateurId">{{ a.prenom }}</option>
      </select>
      <BoutonIcone v-if="donnees.fichiers" icone="photo" libelle="Envoyer une photo" :disabled="envoi" @click="choixPhoto.click()" />
      <input ref="choixPhoto" type="file" accept="image/*" hidden @change="photoChoisie" />
      <textarea ref="champ" v-model="texte" :placeholder="placeholder" rows="1" maxlength="4000" @keydown="touche" />
      <BoutonIcone v-if="donnees.fichiers && vocalPossible && !texte.trim()" icone="micro" :libelle="`Message vocal (${DUREE_VOCAL_MAX / 60} minutes au plus)`" :disabled="envoi" @click="commencerVocal" />
      <button v-else class="envoyer" :disabled="envoi || !texte.trim()" aria-label="Envoyer" title="Envoyer"><Icone nom="envoyer" /></button>
    </form>
    <p v-else-if="conversation" class="aide ferme">Vous ne pouvez plus écrire dans cette conversation.</p>

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
.bulle.rapide { background: var(--vert-clair); color: var(--vert); font-weight: 700; }
.bulle.choisie { outline: 2px solid var(--vert); }
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
.saisie textarea { flex: 1; font: inherit; border: 1px solid #e2ded7; border-radius: 22px; padding: 10px 16px; resize: none; max-height: 160px; min-height: 44px; field-sizing: content; }
.saisie .pour { padding: 8px; border-radius: 10px; max-width: 120px; align-self: center; }
.envoyer { width: 44px; height: 44px; padding: 0; border-radius: 50%; display: grid; place-items: center; flex: none; }
.enregistrement { align-items: center; }
.point-rouge { width: 14px; height: 14px; border-radius: 50%; background: var(--rouge); animation: clignote 1s infinite; flex: none; }
@keyframes clignote { 50% { opacity: 0.3; } }
.apercu-photo { display: flex; gap: 12px; align-items: center; padding: 10px 16px; background: white; border-top: 1px solid #ebe8e3; flex-wrap: wrap; }
.apercu-photo img { width: 96px; height: 96px; object-fit: cover; border-radius: 10px; }
.apercu-photo .grandit { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 6px; }
.apercu-photo textarea { font: inherit; width: 100%; resize: vertical; padding: 8px 10px; border-radius: 10px; border: 1px solid #ddd; }
.apercu-photo input:not([type]) { width: 100%; }
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
</style>
