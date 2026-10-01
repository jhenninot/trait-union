<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api.js'
import { session } from '../session.js'
import { confirmer } from '../fenetre.js'
import Icone from '../navigation/Icone.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import Avatar from './Avatar.vue'

// Créer (ou modifier) un groupe de discussion : son nom et ses membres, choisis parmi le cercle.
// Réservé aux aidants ; la personne qui crée le groupe en fait partie. Auxiliaires et proches ne
// peuvent pas être réunis dans un même groupe (même règle que pour les messages privés).
const props = defineProps({
  cercleId: { type: String, required: true },
  groupe: { type: Object, default: null } // modification : la conversation (titre, membres)
})
const emit = defineEmits(['fermer', 'enregistre', 'supprime'])

const titre = ref(props.groupe?.titre ?? '')
const choisis = ref(new Set(props.groupe?.membres.map((m) => m.utilisateurId) ?? []))
const personnes = ref([])
const erreur = ref('')
const envoi = ref(false)

onMounted(async () => {
  try {
    const d = await api('GET', `/messagerie/cercles/${props.cercleId}`)
    personnes.value = d.membresCercle.filter((m) => m.utilisateurId !== session.utilisateur.id)
  } catch (e) {
    erreur.value = e.message
  }
})

const ROLES = { accompagne: 'Personne accompagnée', aidant: 'Aidant', proche: 'Proche', auxiliaire: 'Auxiliaire de vie' }
const roleDe = (p) => (p.role === 'proche' && p.lien ? p.lien : ROLES[p.role])
const roles = computed(() => personnes.value.filter((p) => choisis.value.has(p.utilisateurId)).map((p) => p.role))
// Une personne qu'on ne peut pas ajouter à cause de celles déjà choisies
function bloque(p) {
  if (choisis.value.has(p.utilisateurId)) return null
  if (p.role === 'auxiliaire' && roles.value.includes('proche')) return 'Pas avec des proches'
  if (p.role === 'proche' && roles.value.includes('auxiliaire')) return 'Pas avec une auxiliaire'
  return null
}
function basculer(p) {
  if (bloque(p)) return
  const s = new Set(choisis.value)
  s.has(p.utilisateurId) ? s.delete(p.utilisateurId) : s.add(p.utilisateurId)
  choisis.value = s
}

async function enregistrer() {
  erreur.value = ''
  if (!choisis.value.size) return (erreur.value = 'Choisissez au moins une personne')
  envoi.value = true
  try {
    const corps = { titre: titre.value, membres: [...choisis.value] }
    if (props.groupe) {
      await api('PUT', `/messagerie/conversations/${props.groupe.id}/groupe`, corps)
      emit('enregistre', props.groupe.id)
    } else {
      const { id } = await api('POST', `/messagerie/cercles/${props.cercleId}/groupes`, corps)
      emit('enregistre', id)
    }
  } catch (e) {
    erreur.value = e.message
  } finally {
    envoi.value = false
  }
}

async function supprimer() {
  const ok = await confirmer(`Supprimer le groupe « ${props.groupe.titre} » et tous ses messages, pour tout le monde ?`, { titre: 'Supprimer le groupe', oui: 'Supprimer', danger: true, icone: 'effacer' })
  if (!ok) return
  try {
    await api('DELETE', `/messagerie/conversations/${props.groupe.id}/groupe`)
    emit('supprime')
  } catch (e) {
    erreur.value = e.message
  }
}
</script>

<template>
  <div class="voile" @click.self="emit('fermer')">
    <form class="fenetre carte" @submit.prevent="enregistrer">
      <div class="tete">
        <h2><Icone nom="famille" class="en-ligne" /> {{ groupe ? 'Modifier le groupe' : 'Nouveau groupe' }}</h2>
        <BoutonIcone icone="fermer" libelle="Fermer" @click="emit('fermer')" />
      </div>

      <label>Nom du groupe
        <input v-model="titre" required maxlength="80" placeholder="Ex. : Les petits-enfants" />
      </label>

      <div class="champ">
        <span class="libelle">Membres <span class="aide">({{ choisis.size + 1 }} avec vous)</span></span>
        <div class="liste">
          <button
            v-for="p in personnes" :key="p.utilisateurId" type="button" class="personne"
            :class="{ on: choisis.has(p.utilisateurId), bloque: bloque(p) }" role="checkbox"
            :aria-checked="choisis.has(p.utilisateurId)" :aria-disabled="Boolean(bloque(p))" @click="basculer(p)"
          >
            <Avatar :src="p.avatar" :prenom="p.prenom" :taille="38" />
            <span class="grandit">
              <strong>{{ p.prenom }} {{ p.nom }}</strong>
              <span class="aide">{{ bloque(p) ?? roleDe(p) }}</span>
            </span>
            <span class="case"><Icone v-if="choisis.has(p.utilisateurId)" nom="coche" /></span>
          </button>
        </div>
        <p class="aide">Seuls les membres du groupe le voient. Une auxiliaire de vie ne peut pas être dans un groupe avec des proches.</p>
      </div>

      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <div class="actions">
        <button v-if="groupe" type="button" class="secondaire danger" @click="supprimer"><Icone nom="effacer" class="en-ligne" /> Supprimer le groupe</button>
        <span class="espace" />
        <button type="button" class="secondaire" @click="emit('fermer')">Annuler</button>
        <button :disabled="envoi"><Icone nom="coche" class="en-ligne" /> {{ envoi ? 'Enregistrement…' : groupe ? 'Enregistrer' : 'Créer le groupe' }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.voile { position: fixed; inset: 0; z-index: 60; background: rgb(35 48 90 / 0.35); display: grid; grid-template-columns: minmax(0, 1fr); place-items: start center; overflow-y: auto; padding: 32px 16px; }
.fenetre { width: min(560px, 100%); margin: 0; padding: 22px; display: flex; flex-direction: column; gap: 14px; }
.tete { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
h2 { margin: 0; color: var(--bleu-nuit); font-size: 1.3rem; display: flex; align-items: center; gap: 8px; }
.champ { display: flex; flex-direction: column; gap: 8px; }
.libelle { font-weight: 500; }
.liste { display: flex; flex-direction: column; gap: 4px; max-height: 46vh; overflow-y: auto; border: 1px solid #e2ded7; border-radius: 12px; padding: 6px; }
.personne { display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 10px; border-radius: 10px; background: none; color: inherit; text-align: left; }
.personne:hover { background: #f6f4f0; }
.personne.on { background: var(--vert-clair); }
.personne.bloque { opacity: 0.5; cursor: not-allowed; }
.grandit { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.grandit strong { color: var(--bleu-nuit); }
.case { width: 26px; height: 26px; border-radius: 8px; border: 2px solid #cfcac2; display: grid; place-items: center; flex: none; background: white; }
.on .case { background: var(--vert); border-color: var(--vert); color: white; }
.case .icone { width: 18px; height: 18px; }
.aide { margin: 0; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.actions button { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.espace { flex: 1; }
.danger { color: var(--rouge); }
@media (max-width: 640px) {
  .voile { padding: 0; }
  .fenetre { border-radius: 0; min-height: 100%; padding: 16px; }
  .liste { max-height: none; }
  .actions button { flex: 1; justify-content: center; }
  .espace { display: none; }
}
</style>
