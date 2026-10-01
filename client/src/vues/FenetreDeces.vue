<script setup>
import { ref, computed } from 'vue'
import { api } from '../api.js'
import { motDecede } from '../coordonnees.js'
import Icone from '../navigation/Icone.vue'

// Fenêtre pour indiquer le décès d'un membre du cercle (n'importe quel rôle), ou l'annuler s'il a
// été indiqué par erreur. Le compte est désactivé mais rien n'est effacé (server/deces.js).
const props = defineProps({
  url: { type: String, required: true }, // /cercles/:id
  membre: { type: Object, required: true },
  seulAidant: { type: Boolean, default: false } // le seul aidant encore en vie du cercle
})
const emit = defineEmits(['fermer', 'fait'])

const aujourdhui = new Date().toISOString().slice(0, 10)
const dateDeces = ref(props.membre.dateDeces ?? '')
const occupe = ref(false)
const erreur = ref('')
const m = props.membre
const annulation = computed(() => m.decede)
const accompagne = m.role === 'accompagne'

async function confirmer() {
  occupe.value = true
  erreur.value = ''
  try {
    const r = annulation.value
      ? await api('DELETE', `${props.url}/membres/${m.id}/deces`)
      : await api('PUT', `${props.url}/membres/${m.id}/deces`, { dateDeces: dateDeces.value || null })
    emit('fait', r)
  } catch (e) {
    erreur.value = e.message
  } finally {
    occupe.value = false
  }
}
</script>

<template>
  <div class="voile" @click.self="emit('fermer')">
    <form class="carte fenetre" role="alertdialog" aria-modal="true" aria-labelledby="titre-deces" @submit.prevent="confirmer">
      <template v-if="!annulation">
        <h2 id="titre-deces">Indiquer le décès de {{ m.prenom }} {{ m.nom }}</h2>
        <label>Date du décès (facultatif) <input v-model="dateDeces" type="date" min="1900-01-01" :max="aujourdhui" /></label>
        <ul class="consequences">
          <li><Icone nom="fleur" class="en-ligne" />
            Partout dans l'application, {{ m.prenom }} apparaîtra comme {{ motDecede(m.genre) }}, avec un visage grisé :
            famille, arbre généalogique, messages et agenda.</li>
          <li><Icone nom="cadenas" class="en-ligne" />
            Son compte est désactivé : plus de connexion{{ accompagne ? ' (ses tablettes sont déconnectées)' : '' }},
            plus d'alertes, plus de messages ni de rappel d'anniversaire.</li>
          <li><Icone nom="coche" class="en-ligne" />
            Rien n'est effacé : ses photos, ses messages, les rendez-vous et sa fiche dans l'arbre sont gardés.</li>
          <li><Icone nom="annuler" class="en-ligne" />
            En cas d'erreur, vous pourrez annuler depuis la page « Famille et aidants ».</li>
        </ul>
        <p v-if="seulAidant" class="avertissement"><Icone nom="attention" class="en-ligne" />
          {{ m.prenom }} est le seul aidant du cercle : pensez à inviter un autre aidant pour continuer à le gérer.</p>
      </template>
      <template v-else>
        <h2 id="titre-deces">Annuler le décès de {{ m.prenom }} {{ m.nom }} ?</h2>
        <p>À faire si le décès a été indiqué par erreur. {{ m.prenom }} redevient un membre actif du cercle, avec son rôle,
          ses messages et ses alertes.</p>
        <p class="aide">Ses appareils ont été déconnectés au moment du décès :
          {{ accompagne ? 'générez un nouveau code dans « Tablettes » pour reconnecter sa tablette.' : `${m.prenom} devra se reconnecter avec son mot de passe ou Google.` }}</p>
      </template>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <div class="boutons">
        <button type="submit" :disabled="occupe">{{ annulation ? 'Annuler le décès' : 'Confirmer le décès' }}</button>
        <button type="button" class="secondaire" @click="emit('fermer')">Fermer</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.voile {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgb(20 24 40 / 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.fenetre { width: 100%; max-width: 520px; max-height: calc(100vh - 32px); overflow-y: auto; margin: 0; padding: 20px; }
.fenetre h2 { margin: 0 0 14px; font-size: 1.25rem; color: var(--bleu-nuit); }
.consequences { list-style: none; padding: 0; margin: 16px 0 8px; display: flex; flex-direction: column; gap: 10px; }
.consequences li { display: flex; align-items: flex-start; gap: 8px; }
.consequences .icone { margin-top: 2px; color: var(--vert); flex: none; }
.avertissement { background: #fdf3e6; border: 1px solid #f0d2a6; border-radius: 10px; padding: 10px 12px; color: #6b4310; }
.boutons { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
</style>
