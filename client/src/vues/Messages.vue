<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import { ecouterMessagerie, quandCourt, rafraichirNonLus } from '../messagerie.js'
import { motDecede } from '../coordonnees.js'
import Icone from '../navigation/Icone.vue'
import Avatar from './Avatar.vue'
import FilConversation from './FilConversation.vue'
import FenetreGroupe from './FenetreGroupe.vue'

// Messagerie du cercle (aidants, proches, auxiliaires) : la liste des conversations et, à côté sur
// grand écran (à la place sur téléphone), la conversation choisie (?c=<id>).
const route = useRoute()
const router = useRouter()
const cercleId = computed(() => route.params.id)
const choisie = computed(() => route.query.c ?? null)

const donnees = ref(null)
const erreur = ref('')
const ecrire = ref(false) // choix de la personne à qui écrire en privé
const nouveauGroupe = ref(false)
const grandEcran = ref(window.matchMedia('(min-width: 900px)').matches)
const media = window.matchMedia('(min-width: 900px)')
const suivreEcran = (e) => (grandEcran.value = e.matches)

async function charger() {
  try {
    donnees.value = await api('GET', `/messagerie/cercles/${cercleId.value}`)
    erreur.value = ''
    // Grand écran : la première conversation s'ouvre d'office
    if (grandEcran.value && !choisie.value && donnees.value.conversations.length) ouvrir(donnees.value.conversations[0].id, true)
  } catch (e) {
    erreur.value = e.message
  }
}
watch(cercleId, () => {
  donnees.value = null
  ecrire.value = false
  charger()
}, { immediate: true })

let arreter
onMounted(() => {
  media.addEventListener('change', suivreEcran)
  arreter = ecouterMessagerie((type, d) => d.cercleId === cercleId.value || type !== 'message' ? charger() : null)
})
onUnmounted(() => {
  media.removeEventListener('change', suivreEcran)
  arreter?.()
})

const ouvrir = (id, remplacer = false) => {
  ecrire.value = false
  router[remplacer ? 'replace' : 'push']({ query: { c: id } })
}
const fermer = () => router.push({ query: {} })

async function ecrireA(contact) {
  try {
    const id = contact.conversationId ?? (await api('POST', `/messagerie/cercles/${cercleId.value}/privee`, { utilisateurId: contact.utilisateurId })).id
    ouvrir(id)
  } catch (e) {
    erreur.value = e.message
  }
}

const apresChangement = () => {
  charger()
  rafraichirNonLus()
}
function groupeCree(id) {
  nouveauGroupe.value = false
  charger()
  ouvrir(id)
}
function groupeSupprime() {
  router.replace({ query: {} })
  apresChangement()
}

const icone = (c) => ({ famille: 'famille', aidants: 'cadenas', liaison: 'carnet', groupe: 'famille' })[c.type]
const note = computed(() => {
  const r = donnees.value?.monRole
  if (r === 'aidant') return '« Toute la famille » réunit tout le cercle, personnes accompagnées comprises (pas les auxiliaires). « Les aidants » et le cahier de liaison ne sont pas visibles par les personnes accompagnées. « Nouveau groupe » crée une conversation avec les personnes de votre choix.'
  if (r === 'auxiliaire') return 'Le cahier de liaison est partagé avec les aidants de la famille. Vous pouvez aussi écrire en privé aux aidants et aux personnes accompagnées.'
  return null
})
const montrerListe = computed(() => grandEcran.value || !choisie.value)
const montrerFil = computed(() => Boolean(choisie.value))
</script>

<template>
  <div class="messagerie" :class="{ 'grand-ecran': grandEcran }">
    <section v-if="montrerListe" class="colonne-liste">
      <div class="titre-liste">
        <h1>Messages</h1>
        <span class="boutons-liste">
          <button v-if="donnees?.peutCreerGroupe" class="petit secondaire" @click="nouveauGroupe = true"><Icone nom="famille" class="en-ligne" /> Nouveau groupe</button>
          <button v-if="donnees?.contacts.length" class="petit" @click="ecrire = !ecrire"><Icone nom="ajouter" class="en-ligne" /> Écrire</button>
        </span>
      </div>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>

      <div v-if="ecrire" class="contacts carte">
        <p class="titre-contacts">Écrire en privé à…</p>
        <button v-for="p in donnees.contacts" :key="p.utilisateurId" class="contact" @click="ecrireA(p)">
          <Avatar :src="p.avatar" :prenom="p.prenom" :taille="36" />
          <span class="grandit">{{ p.prenom }} {{ p.nom }}</span>
          <span class="aide">{{ p.role === 'accompagne' ? 'Personne accompagnée' : p.role === 'auxiliaire' ? 'Auxiliaire de vie' : p.lien ?? (p.role === 'aidant' ? 'Aidant' : 'Proche') }}</span>
        </button>
      </div>

      <button v-for="c in donnees?.conversations ?? []" :key="c.id" class="conv" :class="{ actif: c.id === choisie, 'non-lu': c.nonLus }" @click="ouvrir(c.id)">
        <Avatar v-if="c.autre" :src="c.autre.avatar" :prenom="c.autre.prenom" :taille="44" :decede="c.autre.decede" />
        <span v-else class="rond" :class="c.type"><Icone :nom="icone(c)" /></span>
        <span class="grandit">
          <span class="conv-haut"><strong>{{ c.titre }}<span v-if="c.autre?.decede" class="mention-deces">{{ motDecede(c.autre.genre) }}</span></strong><span class="heure">{{ c.dernier ? quandCourt(c.dernier.le) : '' }}</span></span>
          <span class="conv-bas">
            <span class="dernier">
              <Icone v-if="c.muet" nom="sourdine" class="en-ligne" />
              <template v-if="c.dernier">{{ c.dernier.deMoi ? 'Vous' : c.dernier.auteurPrenom }} : {{ c.dernier.apercu }}</template>
              <template v-else>Aucun message</template>
            </span>
            <span v-if="c.nonLus" class="badge">{{ c.nonLus }}</span>
          </span>
        </span>
      </button>
      <p v-if="note" class="aide note">{{ note }}</p>
    </section>

    <FilConversation v-if="montrerFil" :key="choisie" :conversation-id="choisie" :retour="!grandEcran" class="colonne-fil" @retour="fermer" @change="apresChangement" @supprime="groupeSupprime" />
    <div v-else-if="grandEcran" class="colonne-fil vide"><Icone nom="message" class="grande" /><p class="aide">Choisissez une conversation</p></div>
    <FenetreGroupe v-if="nouveauGroupe" :cercle-id="cercleId" @fermer="nouveauGroupe = false" @enregistre="groupeCree" />
  </div>
</template>

<style scoped>
.messagerie { display: flex; height: 100vh; height: 100dvh; }
.colonne-liste { width: 100%; padding: 20px 12px; overflow-y: auto; background: white; }
.grand-ecran .colonne-liste { width: 360px; flex: none; border-right: 1px solid #ebe8e3; }
.colonne-fil { flex: 1; min-width: 0; }
.colonne-fil.vide { display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--gris); }
.grande { width: 56px; height: 56px; stroke-width: 1.5; }
.titre-liste { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin: 0 8px 12px; }
.titre-liste h1 { margin: 0; }
.boutons-liste { display: flex; gap: 6px; }
.boutons-liste button { white-space: nowrap; }
.petit { padding: 8px 14px; font-size: 0.92rem; }
.conv { display: flex; gap: 12px; align-items: center; width: 100%; padding: 10px; border-radius: 12px; background: none; color: inherit; text-align: left; }
.conv:hover { background: #f6f4f0; }
.conv.actif { background: var(--vert-clair); }
.grandit { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.conv-haut, .conv-bas { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.conv-haut strong { color: var(--bleu-nuit); }
.heure { color: var(--gris); font-size: 0.8rem; white-space: nowrap; }
.dernier { color: var(--gris); font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.non-lu .dernier { color: #2b2b2b; font-weight: 600; }
.non-lu .heure { color: var(--vert); font-weight: 700; }
.badge { background: var(--rouge); color: white; border-radius: 999px; font-size: 0.75rem; font-weight: 700; min-width: 20px; height: 20px; padding: 0 6px; display: inline-grid; place-items: center; flex: none; }
.rond { width: 44px; height: 44px; border-radius: 50%; background: var(--vert-clair); color: var(--vert); display: grid; place-items: center; flex: none; }
.rond.liaison { background: #fdebd8; color: #b46a22; }
.rond.aidants { background: #e8ebf5; color: var(--bleu-nuit); }
.rond.groupe { background: #efe8f6; color: #6b4b94; }
.note { margin: 14px 10px 0; line-height: 1.4; }
.contacts { margin: 0 0 12px; padding: 8px; }
.titre-contacts { font-weight: 600; color: var(--bleu-nuit); margin: 4px 8px 6px; }
.contact { display: flex; gap: 10px; align-items: center; width: 100%; padding: 8px; border-radius: 10px; background: none; color: inherit; text-align: left; }
.contact:hover { background: var(--vert-clair); }
.contact .grandit { flex-direction: row; }
@media (max-width: 760px) {
  /* Sous l'en-tête et au-dessus des onglets du menu */
  .messagerie { height: calc(100dvh - 49px - 72px); }
  .colonne-liste { padding: 16px 8px; }
}
.mention-deces { margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: #ebe9e5; color: #5f5d58; font-size: 0.8rem; font-weight: 600; }
</style>
