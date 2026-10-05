<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { session } from '../session.js'
import BoutonIcone from './BoutonIcone.vue'

// Fenêtre superposée à la page pour les formulaires d'action (ajout, modification).
// Contenu dans le slot ; plein écran sur téléphone ; gros caractères sur l'appareil de l'aidé.
// <Modale titre="Nouveau rendez-vous" @fermer="formulaire = null"> <form>…</form> </Modale>
defineProps({ titre: { type: String, default: '' }, large: Boolean })
const emit = defineEmits(['fermer'])

const fond = ref(null)
const precedent = document.activeElement

function touche(e) {
  // Une confirmation ouverte par-dessus garde la main sur Échap
  if (e.key === 'Escape' && !document.querySelector('[role="alertdialog"]')) emit('fermer')
}

onMounted(() => {
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', touche)
  const champ = fond.value?.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select')
  champ?.focus({ preventScroll: true })
})
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', touche)
  precedent?.focus?.({ preventScroll: true })
})
</script>

<template>
  <div ref="fond" class="voile-modale" :class="{ accompagne: session.typeSession === 'appareil' }" @mousedown.self="emit('fermer')">
    <div class="modale" :class="{ large }" role="dialog" aria-modal="true" :aria-label="titre">
      <div class="tete-modale">
        <h2>{{ titre }}</h2>
        <BoutonIcone icone="fermer" libelle="Fermer" @click="emit('fermer')" />
      </div>
      <div class="corps-modale"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.voile-modale {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 16px;
  overflow-y: auto;
  background: rgb(35 48 90 / 0.45);
}
.modale {
  width: min(600px, 100%);
  margin: auto;
  border-radius: 16px;
  background: white;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.25);
  display: flex;
  flex-direction: column;
}
.modale.large { width: min(820px, 100%); }
.tete-modale {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 0;
}
h2 { margin: 0; font-size: 1.3rem; color: var(--bleu-nuit); }
.corps-modale { padding: 12px 20px 20px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.corps-modale :deep(form) { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; border: 0; box-shadow: none; background: none; }

.accompagne .modale { width: min(760px, 100%); border-radius: 24px; }
.accompagne h2 { font-size: 1.9rem; }
.accompagne .tete-modale { padding: 22px 24px 0; }
.accompagne .corps-modale { padding: 12px 24px 24px; }

@media (max-width: 640px) {
  .voile-modale { padding: 0; }
  .modale, .modale.large, .accompagne .modale { width: 100%; min-height: 100%; margin: 0; border-radius: 0; }
  .tete-modale, .accompagne .tete-modale { padding: 14px 16px 0; position: sticky; top: 0; background: white; z-index: 1; padding-bottom: 8px; }
  .corps-modale, .accompagne .corps-modale { padding: 8px 16px 24px; }
  h2, .accompagne h2 { font-size: 1.35rem; }
}
</style>
