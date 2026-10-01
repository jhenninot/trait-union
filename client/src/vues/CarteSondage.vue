<script setup>
import { computed } from 'vue'
import Icone from '../navigation/Icone.vue'
import Avatar from './Avatar.vue'
import { jourCourt, jourLong, momentTexte, avantLe } from '../sondages.js'

// Carte d'un sondage de dates dans le fil d'une conversation (aidants, proches) : une barre par
// date (« oui » en vert foncé, « peut-être » en vert clair), qui a répondu, et les boutons.
const props = defineProps({ sondage: { type: Object, required: true } })
const emit = defineEmits(['repondre', 'detail'])

const s = computed(() => props.sondage)
const max = computed(() => Math.max(1, s.value.nombre))
const aRepondu = computed(() => Object.keys(s.value.mesReponses).length > 0)
</script>

<template>
  <div class="carte-sondage" :class="{ clos: !s.ouvert }">
    <span class="etiquette"><Icone nom="sondage" class="en-ligne" /> {{ s.ouvert ? 'Sondage de dates' : 'Date retenue' }}</span>
    <strong class="titre">{{ s.titre }}</strong>
    <p class="meta">
      <span v-if="s.lieu"><Icone nom="lieu" class="en-ligne" /> {{ s.lieu }}</span>
      <span><Icone nom="horloge" class="en-ligne" /> {{ momentTexte(s) }}</span>
      <span v-if="s.ouvert && s.dateLimite"><Icone nom="cloche" class="en-ligne" /> {{ avantLe(s.dateLimite) }}</span>
    </p>

    <p v-if="!s.ouvert" class="retenue"><Icone nom="coche" class="en-ligne" /> {{ jourLong(s.dateRetenue) }}, {{ momentTexte(s) }}</p>
    <template v-else>
      <div v-for="d in s.parDate" :key="d.date" class="barre-date" :class="{ meilleure: d.date === s.meilleure }">
        <span class="jour">{{ jourCourt(d.date) }}</span>
        <span class="jauge" :aria-label="`${d.oui} oui, ${d.peutEtre} peut-être`">
          <i :style="{ width: `${(d.oui / max) * 100}%` }" />
          <i class="peut-etre" :style="{ width: `${(d.peutEtre / max) * 100}%` }" />
        </span>
        <span class="compte">{{ d.oui }} oui<small v-if="d.peutEtre">{{ d.peutEtre }} peut-être</small></span>
      </div>
    </template>

    <div class="bas">
      <span class="pile">
        <Avatar v-for="p in s.ontRepondu.slice(0, 6)" :key="p.utilisateurId" :src="p.avatar" :prenom="p.prenom" :taille="26" />
      </span>
      <span class="aide">{{ s.repondu }} réponse{{ s.repondu > 1 ? 's' : '' }} sur {{ s.nombre }}<template v-if="s.ouvert && s.attendus.length && s.attendus.length <= 3"> · on attend {{ s.attendus.join(', ') }}</template></span>
    </div>
    <div class="boutons">
      <button v-if="s.peutRepondre" @click.stop="emit('repondre')"><Icone nom="coche" class="en-ligne" /> {{ aRepondu ? 'Changer mes réponses' : 'Donner mes disponibilités' }}</button>
      <button class="secondaire" @click.stop="emit('detail')">{{ s.ouvert && s.peutGerer ? 'Voir les réponses et choisir' : 'Voir les réponses' }}</button>
    </div>
  </div>
</template>

<style scoped>
.carte-sondage { background: white; color: #222; border: 2px solid var(--vert); border-radius: 16px; padding: 12px 14px; width: min(480px, 100%); box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); display: flex; flex-direction: column; gap: 6px; }
.carte-sondage.clos { border-color: #cfe8dc; }
.etiquette { color: var(--vert); font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
.titre { color: var(--bleu-nuit); font-size: 1.1rem; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--gris); font-size: 0.85rem; margin: 0 0 4px; }
.retenue { margin: 2px 0; font-weight: 700; color: var(--vert); font-size: 1.05rem; }
.barre-date { display: grid; grid-template-columns: 104px 1fr 76px; gap: 8px; align-items: center; font-size: 0.88rem; }
.jour { font-weight: 600; color: var(--bleu-nuit); white-space: nowrap; }
.meilleure .jour { color: var(--vert); }
.jauge { height: 10px; background: #f0ede8; border-radius: 999px; overflow: hidden; display: flex; }
.jauge i { display: block; background: var(--vert); }
.jauge i.peut-etre { background: #9fd3bd; }
.compte { color: var(--gris); font-size: 0.8rem; text-align: right; line-height: 1.15; }
.compte small { display: block; font-size: 0.72rem; }
.bas { display: flex; align-items: center; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
.pile { display: flex; }
.pile > * { margin-left: -6px; border: 2px solid white; }
.pile > *:first-child { margin-left: 0; }
.bas .aide { margin: 0; font-size: 0.82rem; }
.boutons { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
.boutons button { flex: 1 1 auto; font-size: 0.9rem; padding: 8px 12px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
@media (max-width: 760px) {
  .barre-date { grid-template-columns: 100px 1fr 70px; }
}
</style>
