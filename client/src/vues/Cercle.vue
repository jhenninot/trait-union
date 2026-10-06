<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { session, rafraichirSession } from '../session.js'
import { utiliserCercle, heure, copier } from '../cercle.js'
import { libellesRoles } from '../roles.js'
import { aDesCoordonnees, mentionDeces } from '../coordonnees.js'
import Avatar from './Avatar.vue'
import ChoixAvatar from './ChoixAvatar.vue'
import Coordonnees from './Coordonnees.vue'
import PhotosJeu from './PhotosJeu.vue'
import FormulaireCoordonnees from './FormulaireCoordonnees.vue'
import ChoixLien from './ChoixLien.vue'
import FenetreDeces from './FenetreDeces.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import Icone from '../navigation/Icone.vue'
import Modale from '../navigation/Modale.vue'
import { confirmer } from '../fenetre.js'
import { lienWhatsAppMessage, lienSmsMessage } from '../coordonnees.js'

// Page « Famille et aidants » d'un cercle : membres et invitations
const router = useRouter()
const { url, cercle, erreur, charger, action, accompagnes, autres } = utiliserCercle()
const invitation = ref(null) // { role, lien, expireLe, emailEnvoye, erreurEmail }
const emailInvite = ref('')
const telInvite = ref('')
const texteInvitation = (i) => `Bonjour, je vous invite à rejoindre le cercle « ${cercle.value.nom} » sur Trait d'union (${libellesRoles[i.role].toLowerCase()}). Voici votre lien personnel, valable une seule fois jusqu'au ${heure(i.expireLe)} : ${i.lien}`
// Partage natif du téléphone (choix de l'application) quand il existe
const partageNatif = () => typeof navigator.share === 'function'
const partagerInvitation = () => navigator.share({ text: texteInvitation(invitation.value) }).catch(() => {})
const avatarOuvert = ref(null) // personne accompagnée dont on choisit l'avatar
const photosMembre = ref(null) // membre dont un aidant gère les photos pour les jeux
const coordonneesOuvertes = ref(null) // personne accompagnée dont on modifie les coordonnées
const erreurCoordonnees = ref('')

const ouvrir = (quoi, id) => {
  avatarOuvert.value = quoi === 'avatar' && avatarOuvert.value !== id ? id : null
  coordonneesOuvertes.value = quoi === 'coordonnees' && coordonneesOuvertes.value !== id ? id : null
  erreurCoordonnees.value = ''
}

async function enregistrerCoordonnees(m, c) {
  erreurCoordonnees.value = ''
  try {
    Object.assign(m, await api('PUT', `${url.value}/membres/${m.id}/coordonnees`, c))
    coordonneesOuvertes.value = null
  } catch (e) {
    erreurCoordonnees.value = e.message
  }
}

// Lien d'un aidant ou d'un proche avec la personne accompagnée, précisé par un aidant
const lienOuvert = ref(null) // { id, lien }
const enregistrerLien = (m) => action(async () => {
  m.lien = (await api('PUT', `${url.value}/membres/${m.id}/lien`, { lien: lienOuvert.value.lien })).lien
  lienOuvert.value = null
})

const inviter = (role) => action(async () => {
  const { jeton, expireLe, emailEnvoye, erreurEmail } = await api('POST', `${url.value}/invitations`, { role, email: emailInvite.value || undefined })
  invitation.value = { role, lien: `${location.origin}/invitation/${jeton}`, expireLe, emailEnvoye, erreurEmail }
  if (emailEnvoye) emailInvite.value = ''
  await chargerSuivi()
})

// Suivi des invitations : en attente, acceptées, expirées ; relance (nouveau lien) et annulation
const suivi = ref([])
const chargerSuivi = async () => {
  if (!cercle.value?.peutGerer) return
  try { suivi.value = await api('GET', `${url.value}/invitations`) } catch { /* liste laissée telle quelle */ }
}
watch(() => cercle.value?.id, chargerSuivi, { immediate: true })
const libellesStatut = { attendue: 'En attente', acceptee: 'Acceptée', expiree: 'Expirée' }
const destinataireDe = (i) => i.personne || i.email || 'Lien sans destinataire'
const relancer = (i) => action(async () => {
  const { jeton, expireLe, emailEnvoye, erreurEmail } = await api('POST', `${url.value}/invitations/${i.id}/relancer`, {})
  invitation.value = { role: i.role, lien: `${location.origin}/invitation/${jeton}`, expireLe, emailEnvoye, erreurEmail }
  await chargerSuivi()
})
const annuler = (i) => action(async () => {
  if (!await confirmer(`Annuler l'invitation de ${destinataireDe(i)} ? Son lien ne fonctionnera plus.`, { oui: 'Annuler l\'invitation', non: 'Garder', danger: true })) return
  await api('DELETE', `${url.value}/invitations/${i.id}`)
  await chargerSuivi()
})

const retirer = (m) => action(async () => {
  if (!await confirmer(`Retirer ${m.prenom} du cercle ?`, { oui: 'Retirer', danger: true })) return
  await api('DELETE', `${url.value}/membres/${m.id}`)
  await rafraichirSession()
  // Si l'on s'est retiré soi-même, le cercle n'est plus accessible
  try {
    cercle.value = await api('GET', url.value)
  } catch {
    router.push('/')
  }
})

// Décès d'un membre, ou annulation d'un décès indiqué par erreur
const deces = ref(null) // membre concerné
const seulAidant = (m) => m.role === 'aidant' && cercle.value.membres.filter((x) => x.role === 'aidant' && !x.decede).length === 1
const decesFait = (r) => {
  Object.assign(deces.value, r)
  deces.value = null
}

const rejoindre = () => action(async () => {
  await api('POST', `${url.value}/rejoindre`)
  await rafraichirSession()
  await charger()
})
</script>

<template>
  <main>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <template v-if="cercle">
      <p class="aide surtitre">{{ cercle.nom }}</p>
      <h1>Famille et aidants</h1>

      <div v-if="(!cercle.monRole || cercle.monRole === 'proche') && session.utilisateur.estAdmin" class="carte ligne">
        <span v-if="!cercle.monRole">Vous voyez ce cercle en tant qu'administrateur, sans en être membre.</span>
        <span v-else>Vous êtes proche dans ce cercle.</span>
        <button @click="rejoindre">Rejoindre comme aidant</button>
      </div>

      <h2>Personnes accompagnées</h2>
      <p v-if="!accompagnes.length" class="aide">Personne pour l'instant.</p>
      <div v-for="m in accompagnes" :key="m.id" class="carte" :class="{ decede: m.decede }">
        <div class="ligne">
          <span class="personne">
            <Avatar :src="m.avatar" :prenom="m.prenom" :taille="44" :decede="m.decede" />
            <span>
              <strong>{{ m.prenom }} {{ m.nom }}</strong>
              <span v-if="m.decede" class="mention-deces">{{ mentionDeces(m) }}</span>
            </span>
          </span>
          <span v-if="cercle.peutGerer && m.decede" class="liens">
            <BoutonIcone icone="annuler" :libelle="`Annuler le décès de ${m.prenom} (erreur)`" @click="deces = m" />
          </span>
          <span v-else-if="cercle.peutGerer" class="liens">
            <BoutonIcone
              :icone="coordonneesOuvertes === m.id ? 'fermer' : 'modifier'"
              :libelle="coordonneesOuvertes === m.id ? 'Fermer' : 'Modifier ses coordonnées'"
              @click="ouvrir('coordonnees', m.id)"
            />
            <BoutonIcone
              :icone="avatarOuvert === m.id ? 'fermer' : 'compte'"
              :libelle="avatarOuvert === m.id ? 'Fermer' : 'Changer son avatar'"
              @click="ouvrir('avatar', m.id)"
            />
            <BoutonIcone v-if="cercle.peutGerer && !m.decede && m.role !== 'auxiliaire'" icone="photo" :libelle="`Photos de ${m.prenom} pour les jeux`" @click="photosMembre = m" />
            <RouterLink :to="`${url}/tablettes`" class="bouton-icone" aria-label="Gérer sa tablette" title="Gérer sa tablette"><Icone nom="tablette" /></RouterLink>
            <BoutonIcone icone="fleur" :libelle="`Indiquer le décès de ${m.prenom}`" @click="deces = m" />
          </span>
        </div>
        <template v-if="m.decede" />
        <Coordonnees v-else-if="coordonneesOuvertes !== m.id && aDesCoordonnees(m)" class="details" :personne="m" :inscrite :membre-id="m.moi ? null : m.id" :cercle-id="cercle.id" />
        <FormulaireCoordonnees
          v-else
          class="choix"
          :personne="m"
          @enregistrer="enregistrerCoordonnees(m, $event)"
        >
          <span v-if="erreurCoordonnees" class="erreur">{{ erreurCoordonnees }}</span>
        </FormulaireCoordonnees>
        <ChoixAvatar
          v-if="avatarOuvert === m.id"
          class="choix"
          :base="`${url}/membres/${m.id}`"
          :avatar="m.avatar"
          :choix="m.avatarChoix"
          :prenom="m.prenom"
          @change="Object.assign(m, $event)"
        />
      </div>

      <Modale v-if="photosMembre" :titre="`Photos de ${photosMembre.prenom} pour les jeux`" @fermer="photosMembre = null">
        <PhotosJeu :base="`${url}/membres/${photosMembre.id}`" :photos="photosMembre.photosJeu ?? []" @change="photosMembre.photosJeu = $event" />
        <div class="actions"><button type="button" @click="photosMembre = null">Terminer</button></div>
      </Modale>

      <h2>Aidants, proches et auxiliaires</h2>
      <div v-for="m in autres" :key="m.id" class="carte" :class="{ decede: m.decede }">
        <div class="ligne">
          <span class="personne">
            <Avatar :src="m.avatar" :prenom="m.prenom" :taille="40" :decede="m.decede" />
            <span>
              <strong>{{ m.prenom }} {{ m.nom }}</strong>
              <span v-if="m.lien" class="lien-famille">{{ m.lien }}</span>
              <span v-if="m.decede" class="mention-deces">{{ mentionDeces(m) }}</span>
              <span v-else-if="m.email" class="aide"> · {{ m.email }}</span>
            </span>
          </span>
          <span class="liens">
            <span v-if="!m.decede" class="aide">{{ libellesRoles[m.role] }}</span>
            <!-- Placé dans l'arbre généalogique : le lien est calculé, on va le voir dans l'arbre -->
            <RouterLink
              v-if="m.lienCalcule"
              :to="`${url}/arbre?personne=${m.personneId}`"
              class="bouton-icone"
              :aria-label="`Voir ${m.prenom} dans l'arbre généalogique`"
              :title="`Voir ${m.prenom} dans l'arbre généalogique`"
            ><Icone nom="arbre" /></RouterLink>
            <BoutonIcone
              v-else-if="cercle.peutGerer && !m.moi && m.role !== 'auxiliaire' && !m.decede"
              :icone="'famille'"
              :libelle="`Préciser le lien de ${m.prenom} avec la personne accompagnée`"
              @click="lienOuvert = { id: m.id, lien: m.lien ?? '' }"
            />
            <BoutonIcone v-if="cercle.peutGerer && !m.decede && m.role !== 'auxiliaire'" icone="photo" :libelle="`Photos de ${m.prenom} pour les jeux`" @click="photosMembre = m" />
            <RouterLink v-if="m.moi" to="/profil" class="bouton-icone" aria-label="Modifier mon profil" title="Modifier mon profil"><Icone nom="modifier" /></RouterLink>
            <template v-if="cercle.peutGerer && !m.moi">
              <BoutonIcone v-if="m.decede" icone="annuler" :libelle="`Annuler le décès de ${m.prenom} (erreur)`" @click="deces = m" />
              <BoutonIcone v-else icone="fleur" :libelle="`Indiquer le décès de ${m.prenom}`" @click="deces = m" />
            </template>
            <BoutonIcone v-if="cercle.peutGerer" icone="effacer" :libelle="`Retirer ${m.prenom} du cercle`" danger @click="retirer(m)" />
          </span>
        </div>
        <Modale v-if="lienOuvert?.id === m.id" :titre="`Lien de ${m.prenom}`" @fermer="lienOuvert = null">
          <form class="lien-form" @submit.prevent="enregistrerLien(m)">
            <label>Lien de {{ m.prenom }} avec la personne accompagnée <ChoixLien v-model="lienOuvert.lien" /></label>
            <div class="actions">
              <button type="submit">Enregistrer</button>
              <button type="button" class="secondaire" @click="lienOuvert = null">Annuler</button>
            </div>
          </form>
        </Modale>
        <Coordonnees v-if="!m.decede && aDesCoordonnees(m)" class="details" :personne="m" :inscrite :membre-id="m.moi ? null : m.id" :cercle-id="cercle.id" />
      </div>

      <div v-if="cercle.peutGerer" class="carte">
        <strong>Inviter quelqu'un</strong>
        <p class="aide">Un aidant gère le cercle (tâches, rendez-vous, médicaments). Un proche peut échanger et envoyer des photos.
          Une auxiliaire de vie voit seulement les rendez-vous qui lui sont ouverts, pas les photos.</p>
        <label v-if="session.email" class="champ-email">Son adresse email (facultatif)
          <input v-model="emailInvite" type="email" placeholder="Pour lui envoyer le lien par email" />
        </label>
        <div class="actions">
          <button class="secondaire" @click="inviter('aidant')">Inviter un aidant</button>
          <button class="secondaire" @click="inviter('proche')">Inviter un proche</button>
          <button class="secondaire" @click="inviter('auxiliaire')">Inviter une auxiliaire de vie</button>
        </div>
        <Modale v-if="invitation" :titre="`Inviter ${libellesRoles[invitation.role].toLowerCase()}`" @fermer="invitation = null">
          <div class="encart-invitation">
          <p v-if="invitation.emailEnvoye">Invitation envoyée par email à <strong>{{ invitation.emailEnvoye }}</strong>. Vous pouvez aussi lui transmettre ce lien :</p>
          <template v-else>
            <p v-if="invitation.erreurEmail" class="erreur">L'email n'a pas pu partir : {{ invitation.erreurEmail }}</p>
            <p>Envoyez ce lien à la personne ({{ libellesRoles[invitation.role].toLowerCase() }}) :</p>
          </template>
          <input :value="invitation.lien" readonly @focus="$event.target.select()" />
          <p class="aide">Valable une seule fois, jusqu'au {{ heure(invitation.expireLe) }}.</p>
          <label class="champ-email">Son numéro de téléphone (facultatif)
            <input v-model="telInvite" type="tel" placeholder="06 12 34 56 78" />
          </label>
          <div class="actions">
            <BoutonIcone icone="copier" libelle="Copier le lien" @click="copier(invitation.lien)" />
            <a class="rond" :href="lienWhatsAppMessage(telInvite, texteInvitation(invitation))" target="_blank" rel="noopener" title="Envoyer par WhatsApp" aria-label="Envoyer l'invitation par WhatsApp"><Icone nom="whatsapp" /></a>
            <a class="rond" :href="lienSmsMessage(telInvite, texteInvitation(invitation))" title="Envoyer par SMS" aria-label="Envoyer l'invitation par SMS"><Icone nom="sms" /></a>
            <BoutonIcone v-if="partageNatif()" icone="partager" libelle="Partager avec une autre application" @click="partagerInvitation" />
          </div>
          </div>
        </Modale>
      </div>
      <div v-if="cercle.peutGerer && suivi.length" class="carte">
        <strong>Invitations envoyées</strong>
        <ul class="suivi">
          <li v-for="i in suivi" :key="i.id">
            <div>
              <strong>{{ destinataireDe(i) }}</strong>
              <span class="aide"> · {{ libellesRoles[i.role] }} · envoyée le {{ heure(i.creeLe) }}<template v-if="i.creePar"> par {{ i.creePar }}</template></span>
              <p class="aide statut" :class="i.statut">
                <template v-if="i.statut === 'acceptee'">Acceptée le {{ heure(i.accepteeLe) }}<template v-if="i.accepteePar"> par {{ i.accepteePar }}</template>, compte créé</template>
                <template v-else-if="i.statut === 'expiree'">Expirée le {{ heure(i.expireLe) }}</template>
                <template v-else>En attente, valable jusqu'au {{ heure(i.expireLe) }}</template>
              </p>
            </div>
            <span v-if="i.statut !== 'acceptee'" class="liens">
              <BoutonIcone icone="repeter" :libelle="`Relancer ${destinataireDe(i)} avec un nouveau lien`" @click="relancer(i)" />
              <BoutonIcone icone="effacer" :libelle="`Annuler l'invitation de ${destinataireDe(i)}`" danger @click="annuler(i)" />
            </span>
          </li>
        </ul>
      </div>
      <FenetreDeces v-if="deces" :url="url" :membre="deces" :seul-aidant="seulAidant(deces)" @fermer="deces = null" @fait="decesFait" />
    </template>
  </main>
</template>

<style scoped>
.surtitre { margin: 0; }
.ligne { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.personne { display: flex; align-items: center; gap: 12px; }
.lien-famille { margin-left: 8px; padding: 2px 10px; border-radius: 999px; background: var(--vert-clair); color: var(--vert); font-size: 0.9rem; font-weight: 600; white-space: nowrap; }
.mention-deces { margin-left: 8px; padding: 2px 10px; border-radius: 999px; background: #ebe9e5; color: #5f5d58; font-size: 0.9rem; font-weight: 600; white-space: nowrap; }
.carte.decede { background: #f8f7f5; }
.carte.decede strong { color: #5f5d58; }
.lien-form { display: flex; flex-direction: column; gap: 8px; }
.liens { display: flex; align-items: center; gap: 8px; }
.details { margin: 10px 0 0 52px; }
.choix { margin-top: 16px; border-top: 1px solid #ebe8e3; padding-top: 12px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.encart-invitation { display: flex; flex-direction: column; gap: 12px; }
.encart-invitation input { width: 100%; }
.encart { background: var(--vert-clair); border-radius: 8px; padding: 12px; margin-top: 12px; }
.encart input { width: 100%; }
.rond { width: 44px; height: 44px; border-radius: 50%; background: var(--vert-clair); color: var(--vert); display: grid; place-items: center; flex: none; }
.encart .actions { align-items: center; margin-top: 8px; }
.champ-email { margin-top: 12px; }
.suivi { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.suivi li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-top: 10px; border-top: 1px solid #ece9e3; }
.suivi p { margin: 2px 0 0; }
.statut.acceptee { color: var(--vert); font-weight: 600; }
.statut.expiree { color: #b3261e; }
</style>
