<script setup>
import { ref, computed, reactive } from 'vue'
import Icone from '../navigation/Icone.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import { MOMENTS, jourLong, versIso, lancerSondage, modifierSondage } from '../sondages.js'

// Lancer (ou modifier) un sondage de dates dans « Toute la famille » : pour quoi, les jours
// proposés (touchés dans un calendrier), le moment, le lieu et la date limite des réponses.
const props = defineProps({
  conversationId: { type: String, default: null },
  sondage: { type: Object, default: null } // modification
})
const emit = defineEmits(['fermer', 'enregistre'])

const f = reactive({
  titre: props.sondage?.titre ?? '',
  lieu: props.sondage?.lieu ?? '',
  moment: props.sondage?.moment ?? 'midi',
  heure: props.sondage?.heure ?? '14:00',
  dates: [...(props.sondage?.dates ?? [])],
  dateLimite: props.sondage?.dateLimite ?? ''
})
const erreur = ref('')
const envoi = ref(false)

const aujourdhui = versIso(new Date())
const premier = f.dates[0] ? new Date(`${f.dates[0]}T12:00`) : new Date()
const mois = ref(new Date(premier.getFullYear(), premier.getMonth(), 1))
const nomMois = computed(() => {
  const t = mois.value.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
})
const changerMois = (n) => (mois.value = new Date(mois.value.getFullYear(), mois.value.getMonth() + n, 1))
// Cases du mois, la semaine commence le lundi
const cases = computed(() => {
  const m = mois.value
  const decalage = (m.getDay() + 6) % 7
  const nb = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()
  return [
    ...Array.from({ length: decalage }, (_, i) => ({ vide: true, cle: `v${i}` })),
    ...Array.from({ length: nb }, (_, i) => {
      const iso = versIso(new Date(m.getFullYear(), m.getMonth(), i + 1))
      return { iso, cle: iso, jour: i + 1, passe: iso < aujourdhui, choisi: f.dates.includes(iso) }
    })
  ]
})
function basculer(c) {
  if (c.passe) return
  f.dates = c.choisi ? f.dates.filter((d) => d !== c.iso) : [...f.dates, c.iso].sort()
}

async function enregistrer() {
  erreur.value = ''
  if (!f.dates.length) return (erreur.value = 'Touchez au moins un jour dans le calendrier')
  envoi.value = true
  try {
    const donnees = { ...f, heure: f.moment === 'heure' ? f.heure : null, dateLimite: f.dateLimite || null }
    const r = props.sondage ? await modifierSondage(props.sondage.id, donnees) : await lancerSondage(props.conversationId, donnees)
    emit('enregistre', r)
  } catch (e) {
    erreur.value = e.message
  } finally {
    envoi.value = false
  }
}
</script>

<template>
  <div class="voile" @click.self="emit('fermer')">
    <form class="fenetre carte" @submit.prevent="enregistrer">
      <div class="tete">
        <h2><Icone nom="sondage" class="en-ligne" /> {{ sondage ? 'Modifier le sondage' : 'Proposer des dates à toute la famille' }}</h2>
        <BoutonIcone icone="fermer" libelle="Fermer" @click="emit('fermer')" />
      </div>

      <label>Pour quoi ?
        <input v-model="f.titre" required maxlength="120" placeholder="Réunion de famille, repas d'anniversaire…" />
      </label>

      <div class="deux">
        <div class="champ">
          <span class="libelle">Jours proposés (touchez les jours)</span>
          <div class="nav-mois">
            <BoutonIcone icone="precedent" libelle="Mois précédent" @click="changerMois(-1)" />
            <strong>{{ nomMois }}</strong>
            <BoutonIcone icone="suivant" libelle="Mois suivant" @click="changerMois(1)" />
          </div>
          <div class="calendrier">
            <span v-for="(j, i) in ['L', 'M', 'M', 'J', 'V', 'S', 'D']" :key="i" class="tete-jour">{{ j }}</span>
            <template v-for="c in cases" :key="c.cle">
              <span v-if="c.vide" />
              <button v-else type="button" class="jour" :class="{ choisi: c.choisi }" :disabled="c.passe" :aria-pressed="c.choisi" @click="basculer(c)">{{ c.jour }}</button>
            </template>
          </div>
        </div>

        <div class="colonne">
          <div class="champ">
            <span class="libelle">Moment</span>
            <div class="puces" role="radiogroup" aria-label="Moment">
              <button v-for="m in MOMENTS" :key="m.valeur" type="button" role="radio" class="puce" :class="{ on: f.moment === m.valeur }" :aria-checked="f.moment === m.valeur" @click="f.moment = m.valeur">{{ m.libelle }}</button>
            </div>
            <input v-if="f.moment === 'heure'" v-model="f.heure" type="time" required aria-label="Heure" class="heure" />
          </div>
          <label>Lieu (facultatif) <input v-model="f.lieu" maxlength="200" placeholder="Chez Claire" /></label>
          <label>Réponses attendues avant le (facultatif) <input v-model="f.dateLimite" type="date" :min="aujourdhui" /></label>
          <p class="aide">Toute la famille peut répondre, les personnes accompagnées aussi depuis leur tablette. Les auxiliaires ne voient pas le sondage.</p>
        </div>
      </div>

      <div v-if="f.dates.length" class="puces choisies">
        <button v-for="d in f.dates" :key="d" type="button" class="puce on" :aria-label="`Retirer le ${jourLong(d)}`" @click="f.dates = f.dates.filter((x) => x !== d)">
          {{ jourLong(d) }} <Icone nom="fermer" class="en-ligne" />
        </button>
      </div>
      <p v-if="sondage" class="aide">Les réponses déjà données aux jours retirés seront effacées.</p>

      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <div class="actions">
        <button type="button" class="secondaire" @click="emit('fermer')">Annuler</button>
        <button :disabled="envoi"><Icone :nom="sondage ? 'coche' : 'envoyer'" class="en-ligne" /> {{ envoi ? 'Envoi…' : sondage ? 'Enregistrer' : 'Envoyer dans « Toute la famille »' }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.voile { position: fixed; inset: 0; z-index: 60; background: rgb(35 48 90 / 0.35); display: grid; grid-template-columns: minmax(0, 1fr); place-items: start center; overflow-y: auto; padding: 32px 16px; }
.fenetre { width: min(720px, 100%); margin: 0; padding: 22px; display: flex; flex-direction: column; gap: 12px; }
.tete { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
h2 { margin: 0; color: var(--bleu-nuit); font-size: 1.3rem; display: flex; align-items: center; gap: 8px; }
.deux { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.colonne { display: flex; flex-direction: column; gap: 12px; }
.champ { display: flex; flex-direction: column; gap: 6px; }
.libelle { font-weight: 500; }
.nav-mois { display: flex; align-items: center; justify-content: space-between; color: var(--bleu-nuit); }
.calendrier { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; border: 1px solid #e2ded7; border-radius: 12px; padding: 8px; text-align: center; }
.tete-jour { color: var(--gris); font-size: 0.78rem; padding: 2px 0; }
.jour { background: none; color: inherit; padding: 7px 0; border-radius: 8px; font-size: 0.92rem; }
.jour:hover:not(:disabled) { background: var(--vert-clair); }
.jour.choisi { background: var(--vert); color: white; font-weight: 700; }
.jour:disabled { color: #c4c0b8; opacity: 1; }
.puces { display: flex; flex-wrap: wrap; gap: 6px; }
.puce { background: #f1eee9; color: var(--gris); border-radius: 999px; padding: 6px 12px; font-size: 0.88rem; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; }
.puce.on { background: var(--vert-clair); color: var(--vert); font-weight: 700; }
.heure { max-width: 140px; }
.aide { margin: 0; }
.actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
.actions button { display: inline-flex; align-items: center; gap: 6px; }
@media (max-width: 640px) {
  .voile { padding: 0; }
  .fenetre { border-radius: 0; min-height: 100%; padding: 16px; }
  .deux { grid-template-columns: 1fr; }
  .actions button { flex: 1; justify-content: center; }
}
</style>
