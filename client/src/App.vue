<script setup>
import { computed } from 'vue'
import { session } from './session.js'
import MenuAidant from './navigation/MenuAidant.vue'
import BarreAccompagne from './navigation/BarreAccompagne.vue'
import AssistantVoix from './vues/AssistantVoix.vue'

// Trois mises en page : la tablette de la personne accompagnée (barre de gros boutons),
// les aidants, proches et administrateurs (menu complet), et les pages publiques (sans menu).
const miseEnPage = computed(() => {
  if (!session.utilisateur) return 'publique'
  return session.typeSession === 'appareil' ? 'accompagne' : 'aidant'
})
</script>

<template>
  <div v-if="miseEnPage === 'accompagne'" class="mise-en-page-accompagne">
    <RouterView />
    <BarreAccompagne />
    <AssistantVoix />
  </div>
  <div v-else-if="miseEnPage === 'aidant'" class="mise-en-page-aidant">
    <MenuAidant />
    <div class="page"><RouterView /></div>
  </div>
  <RouterView v-else />
</template>

<style>
:root {
  --vert: #2f8f6b;
  --vert-clair: #e7f4ee;
  --bleu-nuit: #23305a;
  --gris: #6b6b78;
  --fond: #faf8f5;
  --rouge: #b3261e;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: var(--fond);
  color: #2b2b2b;
  font-size: 1.05rem;
}
main {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 16px;
}
h1 { color: var(--bleu-nuit); }
.mise-en-page-aidant { display: flex; min-height: 100vh; }
.mise-en-page-aidant .page { flex: 1; min-width: 0; }
.mise-en-page-accompagne { display: flex; flex-direction: column; height: 100vh; height: 100dvh; }
.mise-en-page-accompagne > main { width: 100%; }
@media (max-width: 760px) {
  .mise-en-page-aidant { display: block; }
  .mise-en-page-aidant .page { padding-bottom: 80px; }
}
.carte {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin: 12px 0;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
}
form { display: flex; flex-direction: column; gap: 12px; }
label { display: flex; flex-direction: column; gap: 4px; font-weight: 500; }
input, select {
  font: inherit;
  padding: 10px 12px;
  border: 1px solid #ccc;
  border-radius: 8px;
  background: white;
}
button {
  font: inherit;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: var(--vert);
  color: white;
  cursor: pointer;
}
button.secondaire { background: var(--vert-clair); color: var(--vert); }
button.danger { background: none; color: var(--rouge); padding: 4px 8px; }
button.lien { background: none; color: var(--vert); padding: 4px 8px; }
button:disabled { opacity: 0.6; cursor: default; }
.erreur { color: var(--rouge); }
.aide { color: var(--gris); font-size: 0.9rem; }
a { color: var(--vert); }
</style>
