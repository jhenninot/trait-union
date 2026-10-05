<script setup>
import { ref } from 'vue'
import { api } from '../api.js'
import { retenirEmoji } from '../emojis.js'
import Icone from '../navigation/Icone.vue'
import SelecteurEmoji from './SelecteurEmoji.vue'

// Réactions d'un message, comme sur WhatsApp : les émojis déjà donnés avec leur compteur (toucher
// un émoji en donne un, ou retire le sien), et un bouton pour réagir : six émojis d'un geste, ou
// tous les autres. Une seule réaction par personne et par message.
const props = defineProps({
  messageId: { type: String, required: true },
  reactions: { type: Array, default: () => [] },
  peut: { type: Boolean, default: true }, // peut-on réagir dans cette conversation
  grand: Boolean // personne accompagnée : gros boutons
})
const emit = defineEmits(['change'])

const RAPIDES = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const ouvert = ref(false)
const tous = ref(false)
const erreur = ref('')
let enCours = false

async function reagir(emoji) {
  ouvert.value = false
  tous.value = false
  if (enCours) return
  enCours = true
  try {
    retenirEmoji(emoji)
    await api('PUT', `/messagerie/messages/${props.messageId}/reaction`, { emoji })
    erreur.value = ''
    emit('change')
  } catch (e) {
    erreur.value = e.message
  } finally {
    enCours = false
  }
}
const qui = (r) => r.par.join(', ')
</script>

<template>
  <div class="reactions" :class="{ grand }" @click.stop>
    <button
      v-for="r in reactions" :key="r.emoji" type="button" class="puce" :class="{ moi: r.moi }" :disabled="!peut"
      :title="qui(r)" :aria-label="`${r.emoji} ${r.nombre} : ${qui(r)}`" :aria-pressed="r.moi" @click="reagir(r.emoji)"
    ><span class="e">{{ r.emoji }}</span><span class="n">{{ r.nombre }}</span></button>
    <button v-if="peut" type="button" class="ajout" :class="{ actif: ouvert }" aria-label="Réagir à ce message" title="Réagir" @click="ouvert = !ouvert; tous = false">
      <Icone nom="emoji" />
    </button>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <div v-if="ouvert" class="choix">
      <button v-for="e in RAPIDES" :key="e" type="button" class="rapide" :aria-label="`Réagir avec ${e}`" @click="reagir(e)">{{ e }}</button>
      <button type="button" class="rapide plus" aria-label="Plus d'émojis" @click="tous = !tous"><Icone nom="ajouter" /></button>
    </div>
    <SelecteurEmoji v-if="ouvert && tous" :grand="grand" class="panneau" @choisir="reagir" />
  </div>
</template>

<style scoped>
.reactions { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 3px; position: relative; }
.puce { display: inline-flex; align-items: center; gap: 4px; background: white; border: 1px solid #e2ded7; border-radius: 999px; padding: 1px 8px 1px 6px; font-size: 0.95rem; color: var(--gris); box-shadow: 0 1px 2px rgb(0 0 0 / 0.06); }
.puce.moi { background: var(--vert-clair); border-color: var(--vert); color: var(--vert); font-weight: 700; }
.puce .e { font-size: 1.05rem; font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif; }
.ajout { background: none; color: #b0aaa0; width: 26px; height: 26px; padding: 0; border-radius: 50%; display: grid; place-items: center; }
.ajout:hover, .ajout.actif { background: white; color: var(--vert); }
.ajout .icone { width: 17px; height: 17px; }
.choix { display: flex; gap: 2px; background: white; border-radius: 999px; padding: 4px 6px; box-shadow: 0 4px 16px rgb(0 0 0 / 0.16); flex-basis: auto; }
.rapide { background: none; padding: 2px 6px; border-radius: 999px; font-size: 1.5rem; line-height: 1.2; font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif; display: grid; place-items: center; }
.rapide:hover { background: #f3f1ed; }
.rapide.plus { color: var(--gris); font-size: 1rem; }
.panneau { flex-basis: 100%; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 16px rgb(0 0 0 / 0.12); }
.erreur { flex-basis: 100%; margin: 0; font-size: 0.85rem; }
/* Personne accompagnée */
.grand { gap: 8px; margin-top: 10px; }
.grand .puce { font-size: 1.3rem; padding: 4px 14px 4px 10px; border-width: 2px; }
.grand .puce .e { font-size: 1.7rem; }
.grand .ajout { width: auto; height: 52px; padding: 0 16px; border-radius: 16px; background: var(--vert-clair); color: var(--vert); }
.grand .ajout .icone { width: 30px; height: 30px; }
.grand .choix { gap: 4px; padding: 8px 10px; flex-wrap: wrap; border-radius: 24px; }
.grand .rapide { font-size: 2.4rem; padding: 4px 8px; }
@media (max-width: 600px) {
  .grand .rapide { font-size: 2rem; padding: 2px 5px; }
  .grand .puce .e { font-size: 1.5rem; }
}
</style>
