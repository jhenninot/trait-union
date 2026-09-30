<script setup>
import { ref, computed } from 'vue'
import { periode, jours, duJour, titrePeriode, valeurJour, heureCourte, titreRdv } from '../agenda.js'

// Vue semaine ou mois d'un agenda. On change de période avec les flèches ou d'un
// geste (balayage vers la gauche ou la droite). Toucher un jour le sélectionne.
const props = defineProps({
  vue: { type: String, required: true }, // 'semaine' ou 'mois'
  reference: { type: Date, required: true }, // un jour de la période affichée
  rendezVous: { type: Array, required: true },
  jourChoisi: { type: String, default: null }, // AAAA-MM-JJ
  grand: { type: Boolean, default: false } // tablette de la personne accompagnée
})
const emit = defineEmits(['naviguer', 'choisirJour'])

const sens = ref('suivant') // pour l'animation de glissement
function naviguer(s) {
  sens.value = s > 0 ? 'suivant' : 'precedent'
  emit('naviguer', s)
}

// Balayage horizontal au doigt
let depart = null
function toucher(e) {
  const t = e.changedTouches[0]
  depart = { x: t.clientX, y: t.clientY }
}
function lacher(e) {
  if (!depart) return
  const t = e.changedTouches[0]
  const dx = t.clientX - depart.x
  const dy = t.clientY - depart.y
  depart = null
  if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) naviguer(dx < 0 ? 1 : -1)
}

const titre = computed(() => titrePeriode(props.vue, props.reference))
const titreCourt = computed(() => titrePeriode(props.vue, props.reference, true))
const listeJours = computed(() => {
  const { debut, fin } = periode(props.vue, props.reference)
  const aujourdhui = valeurJour(new Date())
  const mois = props.reference.getMonth()
  return jours(debut, fin).map((d) => {
    const cle = valeurJour(d)
    return {
      cle,
      numero: d.getDate(),
      nom: d.toLocaleDateString('fr-FR', { weekday: props.grand ? 'long' : 'short' }),
      horsMois: props.vue === 'mois' && d.getMonth() !== mois,
      aujourdhui: cle === aujourdhui,
      rendezVous: duJour(props.rendezVous, cle)
    }
  })
})
const MAX_MOIS = 3 // rendez-vous affichés par case dans la vue mois
const entetes = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const heure = (rdv) => (rdv.journeeEntiere ? '' : heureCourte(rdv.debut))
</script>

<template>
  <div class="calendrier" :class="{ grand }">
    <div class="periode">
      <button class="fleche" aria-label="Période précédente" @click="naviguer(-1)">‹</button>
      <strong><span class="long">{{ titre }}</span><span class="court">{{ titreCourt }}</span></strong>
      <button class="fleche" aria-label="Période suivante" @click="naviguer(1)">›</button>
    </div>

    <div class="zone" @touchstart.passive="toucher" @touchend="lacher">
      <Transition :name="`glisse-${sens}`" mode="out-in">
        <div v-if="vue === 'mois'" :key="`mois-${titre}`" class="mois">
          <span v-for="e in entetes" :key="e" class="entete">{{ e }}</span>
          <button
            v-for="j in listeJours" :key="j.cle" type="button" class="case"
            :class="{ 'hors-mois': j.horsMois, aujourdhui: j.aujourdhui, choisi: j.cle === jourChoisi }"
            @click="emit('choisirJour', j.cle)"
          >
            <span class="numero">{{ j.numero }}</span>
            <span v-for="rdv in j.rendezVous.slice(0, MAX_MOIS)" :key="rdv.id" class="puce" :class="{ masque: rdv.masque }">
              <span class="texte">{{ heure(rdv) }} {{ titreRdv(rdv) }}</span>
            </span>
            <span v-if="j.rendezVous.length > MAX_MOIS" class="plus">+{{ j.rendezVous.length - MAX_MOIS }}</span>
          </button>
        </div>

        <div v-else :key="`semaine-${titre}`" class="semaine">
          <button
            v-for="j in listeJours" :key="j.cle" type="button" class="jour"
            :class="{ aujourdhui: j.aujourdhui, choisi: j.cle === jourChoisi }"
            @click="emit('choisirJour', j.cle)"
          >
            <span class="nom-jour">{{ j.nom }} <strong>{{ j.numero }}</strong></span>
            <span v-if="!j.rendezVous.length" class="rien">—</span>
            <span v-for="rdv in j.rendezVous" :key="rdv.id" class="bloc" :class="{ masque: rdv.masque }">
              <strong v-if="heure(rdv)">{{ heure(rdv) }}</strong>
              {{ titreRdv(rdv) }}
            </span>
          </button>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.periode { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 12px 0; }
.periode strong { color: var(--bleu-nuit); text-align: center; }
.fleche { background: var(--vert-clair); color: var(--vert); font-size: 1.6rem; line-height: 1; padding: 6px 16px; }
.zone { overflow: hidden; touch-action: pan-y; }
.court { display: none; }

.mois { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.entete { text-align: center; font-size: 0.8rem; color: var(--gris); padding-bottom: 2px; }
.case {
  min-height: 92px;
  background: white;
  color: inherit;
  border-radius: 8px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  border: 2px solid transparent;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
  min-width: 0;
}
.case.hors-mois { opacity: 0.45; }
.case.aujourdhui .numero { background: var(--vert); color: white; }
.case.choisi, .jour.choisi { border-color: var(--vert); }
.numero { align-self: flex-start; font-weight: 600; font-size: 0.85rem; border-radius: 999px; padding: 0 6px; }
.puce {
  font-size: 0.72rem;
  background: var(--vert-clair);
  color: var(--vert);
  border-radius: 4px;
  padding: 1px 4px;
  min-width: 0;
}
.puce .texte { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.masque { background: #eceae6 !important; color: var(--gris) !important; font-style: italic; }
.plus { font-size: 0.72rem; color: var(--gris); }

.semaine { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.jour {
  min-height: 180px;
  background: white;
  color: inherit;
  border-radius: 10px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  border: 2px solid transparent;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
  min-width: 0;
}
.jour.aujourdhui { background: var(--vert-clair); }
.nom-jour { color: var(--gris); font-size: 0.85rem; text-transform: capitalize; }
.nom-jour strong { color: var(--bleu-nuit); font-size: 1.1rem; }
.rien { color: #c9c5bd; }
.bloc { background: var(--vert-clair); color: var(--bleu-nuit); border-left: 3px solid var(--vert); border-radius: 6px; padding: 4px 6px; font-size: 0.85rem; overflow-wrap: anywhere; }
.bloc strong { color: var(--vert); display: block; }
.jour.aujourdhui .bloc { background: white; }

/* Téléphone : la semaine s'affiche en lignes, le mois en pastilles */
@media (max-width: 700px) {
  .semaine { grid-template-columns: 1fr; }
  .jour { min-height: 0; flex-direction: row; flex-wrap: wrap; align-items: baseline; }
  .nom-jour { width: 100%; }
  .case { min-height: 56px; }
  .puce { font-size: 0; height: 6px; padding: 0; }
}

/* Tablette de la personne accompagnée : tout en plus grand */
.grand .periode strong { font-size: 1.6rem; }
.grand .fleche { font-size: 2.4rem; padding: 8px 28px; border-radius: 16px; }
.grand .entete { font-size: 1.1rem; }
.grand .case { min-height: 110px; border-radius: 14px; }
.grand .numero { font-size: 1.3rem; }
.grand .puce { font-size: 0.95rem; }
.grand .jour { border-radius: 16px; }
.grand .nom-jour { font-size: 1.1rem; }
.grand .nom-jour strong { font-size: 1.5rem; }
.grand .bloc { font-size: 1.1rem; }

/* Smartphone de la personne accompagnée */
@media (max-width: 600px) {
  .long { display: none; }
  .court { display: inline; }
  .grand .periode strong { font-size: 1.3rem; }
  .grand .fleche { font-size: 2rem; padding: 6px 18px; }
  .grand .entete { font-size: 0.85rem; }
  .grand .case { min-height: 60px; border-radius: 10px; padding: 3px; }
  .grand .numero { font-size: 1.05rem; padding: 0 4px; }
  .grand .puce { font-size: 0; height: 7px; }
  .grand .jour { padding: 10px 12px; }
  .grand .bloc { font-size: 1.05rem; }
}

.glisse-suivant-enter-active, .glisse-suivant-leave-active,
.glisse-precedent-enter-active, .glisse-precedent-leave-active { transition: transform 0.18s ease, opacity 0.18s ease; }
.glisse-suivant-enter-from, .glisse-precedent-leave-to { transform: translateX(40px); opacity: 0; }
.glisse-suivant-leave-to, .glisse-precedent-enter-from { transform: translateX(-40px); opacity: 0; }
</style>
