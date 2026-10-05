<script setup>
import { ref, nextTick } from 'vue'
import { CATEGORIES_EMOJI, emojisRecents, retenirEmoji } from '../emojis.js'
import Icone from '../navigation/Icone.vue'

// Panneau d'émojis, comme sur WhatsApp : onglets en haut, une liste qui défile, les récents
// d'abord. `grand` : version de la personne accompagnée (gros émojis).
defineProps({ grand: Boolean })
const emit = defineEmits(['choisir'])

const ICONES = { recents: 'horloge', visages: 'emoji', coeurs: 'coeur', personnes: 'famille', nature: 'fleur', nourriture: 'gateau', activites: 'lieu', objets: 'telephone' }
const sections = ref([{ cle: 'recents', nom: 'Récents', emojis: emojisRecents() }, ...CATEGORIES_EMOJI])
const active = ref('recents')
const zone = ref(null)

function choisir(e) {
  retenirEmoji(e)
  emit('choisir', e)
}
async function aller(cle) {
  active.value = cle
  await nextTick()
  const el = zone.value?.querySelector(`[data-section="${cle}"]`)
  if (el) zone.value.scrollTop = el.offsetTop
}
// L'onglet suit la section visible
function defile() {
  const haut = zone.value.scrollTop + 8
  let cle = 'recents'
  for (const el of zone.value.querySelectorAll('[data-section]')) if (el.offsetTop <= haut) cle = el.dataset.section
  active.value = cle
}
</script>

<template>
  <div class="selecteur-emoji" :class="{ grand }">
    <div class="onglets" role="tablist" aria-label="Catégories d'émojis">
      <button
        v-for="s in sections" :key="s.cle" type="button" role="tab" class="onglet" :class="{ actif: active === s.cle }"
        :aria-selected="active === s.cle" :aria-label="s.nom" :title="s.nom" @click="aller(s.cle)"
      >
        <Icone :nom="ICONES[s.cle]" />
      </button>
    </div>
    <div ref="zone" class="zone" @scroll.passive="defile">
      <section v-for="s in sections" :key="s.cle" :data-section="s.cle">
        <p class="titre">{{ s.nom }}</p>
        <div class="grille">
          <button v-for="e in s.emojis" :key="e" type="button" class="emoji" :aria-label="`Émoji ${e}`" @click="choisir(e)">{{ e }}</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.selecteur-emoji { background: white; border-top: 1px solid #ebe8e3; display: flex; flex-direction: column; height: 280px; }
.onglets { display: flex; justify-content: space-around; border-bottom: 1px solid #f0ede8; padding: 0 6px; flex: none; }
.onglet { background: none; color: var(--gris); padding: 8px 6px; border-radius: 0; border-bottom: 3px solid transparent; flex: 1; display: grid; place-items: center; }
.onglet .icone { width: 20px; height: 20px; }
.onglet.actif { color: var(--vert); border-bottom-color: var(--vert); }
.zone { flex: 1; overflow-y: auto; padding: 4px 10px 10px; position: relative; }
.titre { margin: 8px 4px 4px; font-size: 0.8rem; color: var(--gris); font-weight: 600; }
.grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); }
.emoji { background: none; padding: 4px 0; font-size: 1.7rem; line-height: 1.3; border-radius: 10px; font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif; }
.emoji:hover { background: #f3f1ed; }
.grand { height: 46vh; border: 2px solid #e8e4dd; border-radius: 20px; }
.grand .onglet .icone { width: 30px; height: 30px; }
.grand .onglet { padding: 12px 6px; }
.grand .titre { font-size: 1.1rem; }
.grand .grille { grid-template-columns: repeat(auto-fill, minmax(68px, 1fr)); }
.grand .emoji { font-size: 2.6rem; padding: 6px 0; }
@media (max-width: 600px) {
  .selecteur-emoji { height: 260px; }
  .grille { grid-template-columns: repeat(8, 1fr); }
  .emoji { font-size: 1.55rem; }
  .grand { height: 44vh; }
  .grand .grille { grid-template-columns: repeat(6, 1fr); }
  .grand .emoji { font-size: 2rem; }
  .grand .onglet .icone { width: 24px; height: 24px; }
}
</style>
