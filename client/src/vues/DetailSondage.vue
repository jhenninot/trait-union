<script setup>
import { ref, computed, reactive, watch, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import Icone from '../navigation/Icone.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import Avatar from './Avatar.vue'
import FenetreSondage from './FenetreSondage.vue'
import { avertir, confirmer } from '../fenetre.js'
import { ecouterMessagerie } from '../messagerie.js'
import {
  REPONSES, jourLong, jourCourt, momentTexte, avantLe, horairesParDefaut,
  lireSondage, repondreSondage, relancerSondage, retenirDate, rouvrirSondage
} from '../sondages.js'

// Un sondage de dates en grand (aidants, proches) : ses réponses à donner (« repondre »), le
// tableau de tout le monde (« detail ») et, pour son auteur et les aidants, la date à retenir.
const props = defineProps({
  sondageId: { type: String, required: true },
  cercleId: { type: String, required: true },
  mode: { type: String, default: 'detail' }
})
const emit = defineEmits(['fermer', 'change'])

const s = ref(null)
const erreur = ref('')
const envoi = ref(false)
const vue = ref(props.mode) // repondre | detail | retenir | modifier
const pour = ref(null) // ligne de la personne pour qui l'on répond (null : soi-même)
const saisie = reactive({ reponses: {}, commentaire: '' })
const retenue = reactive({ date: '', titre: '', lieu: '', journee: false, debut: '', fin: '', rappel: '1440' })

async function charger() {
  try {
    s.value = await lireSondage(props.sondageId)
    erreur.value = ''
  } catch (e) {
    erreur.value = e.message
  }
}
watch(() => props.sondageId, async () => {
  await charger()
  if (vue.value === 'repondre') preparerReponse(null)
}, { immediate: true })
// Les réponses des autres arrivent en direct pendant qu'on regarde le tableau
let arreter
onMounted(() => (arreter = ecouterMessagerie((type) => type !== 'lu' && vue.value === 'detail' && charger())))
onUnmounted(() => arreter?.())

const icone = (v) => REPONSES.find((r) => r.valeur === v)?.icone

function preparerReponse(ligne) {
  if (!s.value?.peutRepondre && !ligne) return (vue.value = 'detail')
  const l = ligne ?? s.value.lignes.find((x) => x.moi)
  pour.value = ligne && !ligne.moi ? ligne : null
  saisie.reponses = { ...(l?.reponses ?? {}) }
  saisie.commentaire = l?.commentaire ?? ''
  vue.value = 'repondre'
}
const choisir = (date, valeur) => (saisie.reponses = { ...saisie.reponses, [date]: valeur })

async function action(fn) {
  envoi.value = true
  erreur.value = ''
  try {
    await fn()
    emit('change')
  } catch (e) {
    erreur.value = e.message
  } finally {
    envoi.value = false
  }
}

const enregistrerReponses = () => action(async () => {
  s.value = await repondreSondage(props.sondageId, saisie.reponses, { commentaire: pour.value ? '' : saisie.commentaire, pour: pour.value?.utilisateurId })
  pour.value = null
  vue.value = 'detail'
})

const relancer = () => action(async () => {
  const { relances } = await relancerSondage(props.sondageId)
  await charger()
  avertir(relances.length ? `Une alerte est partie pour ${relances.join(', ')}.` : 'Tout le monde a déjà répondu.', { icone: 'cloche' })
})

function preparerRetenue(date) {
  const h = horairesParDefaut(s.value)
  Object.assign(retenue, { date, titre: s.value.titre, lieu: s.value.lieu ?? '', journee: h.journee, debut: h.debut || '12:00', fin: h.fin || '16:00', rappel: '1440' })
  vue.value = 'retenir'
}
const valider = () => action(async () => {
  const [a, m, j] = retenue.date.split('-').map(Number)
  const heure = (hm) => { const [h, mn] = hm.split(':').map(Number); return new Date(a, m - 1, j, h, mn) }
  const debut = retenue.journee ? new Date(a, m - 1, j, 0, 0) : heure(retenue.debut)
  const fin = retenue.journee ? new Date(a, m - 1, j, 23, 59) : heure(retenue.fin)
  s.value = await retenirDate(props.sondageId, {
    date: retenue.date, titre: retenue.titre, lieu: retenue.lieu, journeeEntiere: retenue.journee,
    debut: debut.toISOString(), fin: fin.toISOString(), rappel: retenue.rappel === '' ? null : Number(retenue.rappel)
  })
  vue.value = 'detail'
})

async function rouvrir() {
  const question = `Rouvrir le sondage ? La date du ${jourLong(s.value.dateRetenue).toLowerCase()} ne sera plus retenue : le rendez-vous sera retiré de l'agenda et la famille sera prévenue.`
  if (!await confirmer(question, { oui: 'Rouvrir', icone: 'annuler' })) return
  return action(async () => { s.value = await rouvrirSondage(props.sondageId) })
}

const parDate = computed(() => new Map((s.value?.parDate ?? []).map((d) => [d.date, d])))
const reponseDe = (ligne, date) => ligne.reponses[date]
</script>

<template>
  <div class="voile" @click.self="emit('fermer')">
    <section class="fenetre carte" role="dialog" aria-modal="true" :aria-label="s?.titre ?? 'Sondage'">
      <div class="tete">
        <h2><Icone nom="sondage" class="en-ligne" /> {{ s?.titre ?? 'Sondage' }}</h2>
        <BoutonIcone icone="fermer" libelle="Fermer" @click="emit('fermer')" />
      </div>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>

      <template v-if="s">
        <p class="meta">
          <span v-if="s.lieu"><Icone nom="lieu" class="en-ligne" /> {{ s.lieu }}</span>
          <span><Icone nom="horloge" class="en-ligne" /> {{ momentTexte(s) }}</span>
          <span v-if="s.ouvert && s.dateLimite"><Icone nom="cloche" class="en-ligne" /> {{ avantLe(s.dateLimite) }}</span>
          <span>{{ s.repondu }} réponse{{ s.repondu > 1 ? 's' : '' }} sur {{ s.nombre }}</span>
        </p>
        <p v-if="!s.ouvert" class="bandeau-retenu">
          <Icone nom="coche" class="en-ligne" /> <span>Date retenue : <strong>{{ jourLong(s.dateRetenue) }}</strong>, {{ momentTexte(s) }}.</span>
          <RouterLink :to="`/cercles/${cercleId}/agenda`">Voir dans l'agenda</RouterLink>
        </p>

        <!-- Ses réponses (ou celles d'une personne accompagnée, pour un aidant) -->
        <form v-if="vue === 'repondre'" class="repondre" @submit.prevent="enregistrerReponses">
          <p v-if="pour" class="pour"><Avatar :src="pour.avatar" :prenom="pour.prenom" :taille="32" /> <span>Réponses de <strong>{{ pour.prenom }}</strong>, données par vous</span></p>
          <div v-for="d in s.dates" :key="d" class="date-reponse">
            <div class="date-tete"><strong>{{ jourLong(d) }}</strong><span class="aide">{{ parDate.get(d)?.oui ?? 0 }} oui</span></div>
            <div class="segments" role="radiogroup" :aria-label="jourLong(d)">
              <button v-for="r in REPONSES" :key="r.valeur" type="button" role="radio" :class="[r.valeur, { on: saisie.reponses[d] === r.valeur }]" :aria-checked="saisie.reponses[d] === r.valeur" @click="choisir(d, r.valeur)">
                <Icone :nom="r.icone" class="en-ligne" /> {{ r.libelle }}
              </button>
            </div>
          </div>
          <label v-if="!pour">Un mot (facultatif) <input v-model="saisie.commentaire" maxlength="300" placeholder="J'apporte le dessert !" /></label>
          <div class="actions">
            <button type="button" class="secondaire" @click="vue = 'detail'; pour = null">{{ pour ? 'Annuler' : 'Voir les réponses' }}</button>
            <button :disabled="envoi || !Object.keys(saisie.reponses).length"><Icone nom="coche" class="en-ligne" /> {{ envoi ? 'Enregistrement…' : 'Enregistrer' }}</button>
          </div>
        </form>

        <!-- Date retenue : le rendez-vous de l'agenda -->
        <form v-else-if="vue === 'retenir'" class="retenir" @submit.prevent="valider">
          <p class="aide">Un rendez-vous visible de tous est ajouté à l'agenda, un message prévient toute la famille et le sondage est clos.</p>
          <label>Titre du rendez-vous <input v-model="retenue.titre" required maxlength="200" /></label>
          <p class="jour-retenu"><Icone nom="agenda" class="en-ligne" /> {{ jourLong(retenue.date) }}</p>
          <label class="case"><input v-model="retenue.journee" type="checkbox" /> Toute la journée</label>
          <div v-if="!retenue.journee" class="deux">
            <label>Début <input v-model="retenue.debut" type="time" required /></label>
            <label>Fin <input v-model="retenue.fin" type="time" required /></label>
          </div>
          <div class="deux">
            <label>Lieu <input v-model="retenue.lieu" maxlength="200" /></label>
            <label>Alerte
              <select v-model="retenue.rappel">
                <option value="">Pas d'alerte</option>
                <option value="60">1 heure avant</option>
                <option value="1440">La veille</option>
                <option value="2880">2 jours avant</option>
                <option value="10080">Une semaine avant</option>
              </select>
            </label>
          </div>
          <div class="actions">
            <button type="button" class="secondaire" @click="vue = 'detail'">Annuler</button>
            <button :disabled="envoi"><Icone nom="coche" class="en-ligne" /> {{ envoi ? 'Enregistrement…' : 'Retenir cette date' }}</button>
          </div>
        </form>

        <!-- Tableau de toutes les réponses -->
        <template v-else>
          <div class="defile">
            <table class="grille">
              <thead>
                <tr>
                  <th />
                  <th v-for="d in s.dates" :key="d" :class="{ meilleure: d === s.meilleure && s.ouvert, retenue: d === s.dateRetenue }">
                    <span v-if="d === s.meilleure && s.ouvert" class="couronne"><Icone nom="etoile" class="en-ligne" /> La plus choisie</span>
                    <span v-if="d === s.dateRetenue" class="couronne"><Icone nom="coche" class="en-ligne" /> Retenue</span>
                    {{ jourCourt(d) }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in s.lignes" :key="l.utilisateurId">
                  <td class="qui">
                    <div class="qui-contenu">
                      <Avatar :src="l.avatar" :prenom="l.prenom" :taille="32" />
                      <span class="nom-ligne">
                        <strong>{{ l.moi ? 'Vous' : l.prenom }}</strong>
                        <small v-if="l.reponduPar">répondu par {{ l.reponduPar }}</small>
                        <small v-else-if="l.role === 'accompagne'">Personne accompagnée</small>
                        <small v-if="l.commentaire" class="commentaire">« {{ l.commentaire }} »</small>
                      </span>
                      <BoutonIcone v-if="l.modifiable" icone="modifier" :libelle="l.moi ? 'Changer mes réponses' : `Répondre pour ${l.prenom}`" @click="preparerReponse(l.moi ? null : l)" />
                    </div>
                  </td>
                  <td v-for="d in s.dates" :key="d" :class="{ meilleure: d === s.meilleure && s.ouvert, retenue: d === s.dateRetenue }">
                    <span class="case-rep" :class="reponseDe(l, d) ?? 'vide'" :title="REPONSES.find((r) => r.valeur === reponseDe(l, d))?.libelle ?? 'Pas encore répondu'">
                      <Icone v-if="reponseDe(l, d)" :nom="icone(reponseDe(l, d))" />
                    </span>
                  </td>
                </tr>
                <tr class="total">
                  <td>Disponibles</td>
                  <td v-for="d in s.dates" :key="d" :class="{ meilleure: d === s.meilleure && s.ouvert, retenue: d === s.dateRetenue }">
                    {{ parDate.get(d).oui }} oui<small v-if="parDate.get(d).peutEtre"><br>+ {{ parDate.get(d).peutEtre }} peut-être</small>
                  </td>
                </tr>
                <tr v-if="s.ouvert && s.peutGerer">
                  <td />
                  <td v-for="d in s.dates" :key="d" :class="{ meilleure: d === s.meilleure }">
                    <button :class="d === s.meilleure ? '' : 'secondaire'" class="petit" @click="preparerRetenue(d)">Retenir</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="legende aide">
            <span><span class="case-rep oui petite"><Icone nom="coche" /></span> Oui</span>
            <span><span class="case-rep peut_etre petite"><Icone nom="question" /></span> Peut-être</span>
            <span><span class="case-rep non petite"><Icone nom="fermer" /></span> Non</span>
            <span><span class="case-rep vide petite" /> Pas encore répondu</span>
          </div>
          <div class="actions">
            <button v-if="s.ouvert && s.peutGerer && s.attendus.length" class="secondaire" :disabled="envoi" @click="relancer"><Icone nom="cloche" class="en-ligne" /> Relancer {{ s.attendus.length > 3 ? `${s.attendus.length} personnes` : s.attendus.join(', ') }}</button>
            <button v-if="!s.ouvert && s.peutGerer" class="secondaire" :disabled="envoi" @click="rouvrir"><Icone nom="annuler" class="en-ligne" /> Rouvrir le sondage</button>
            <button v-if="s.ouvert && s.peutGerer" class="secondaire" @click="vue = 'modifier'"><Icone nom="modifier" class="en-ligne" /> Modifier le sondage</button>
            <button v-if="s.peutRepondre" @click="preparerReponse(null)"><Icone nom="coche" class="en-ligne" /> {{ Object.keys(s.mesReponses).length ? 'Changer mes réponses' : 'Donner mes disponibilités' }}</button>
          </div>
        </template>
      </template>
    </section>
    <FenetreSondage v-if="vue === 'modifier' && s" :sondage="s" @fermer="vue = 'detail'" @enregistre="(r) => { s = r; vue = 'detail'; emit('change') }" />
  </div>
</template>

<style scoped>
.voile { position: fixed; inset: 0; z-index: 60; background: rgb(35 48 90 / 0.35); display: grid; grid-template-columns: minmax(0, 1fr); place-items: start center; overflow-y: auto; padding: 32px 16px; }
.fenetre { width: min(860px, 100%); margin: 0; padding: 22px; display: flex; flex-direction: column; gap: 12px; }
.tete { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
h2 { margin: 0; color: var(--bleu-nuit); font-size: 1.3rem; display: flex; align-items: center; gap: 8px; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 16px; color: var(--gris); font-size: 0.9rem; margin: 0; }
.bandeau-retenu { background: var(--vert-clair); color: var(--vert); border-radius: 12px; padding: 10px 14px; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.bandeau-retenu a { margin-left: auto; font-weight: 700; color: var(--vert); }
.repondre, .retenir { display: flex; flex-direction: column; gap: 10px; }
.pour { display: flex; align-items: center; gap: 8px; margin: 0; background: #f6f4f0; border-radius: 10px; padding: 8px 12px; }
.date-reponse { background: #faf8f5; border-radius: 12px; padding: 10px 12px; }
.date-tete { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; color: var(--bleu-nuit); }
.date-tete .aide { margin: 0; }
.segments { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.segments button { background: #efece6; color: var(--bleu-nuit); padding: 9px 4px; font-size: 0.92rem; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.segments .oui.on { background: var(--vert); color: white; }
.segments .peut_etre.on { background: #b7791f; color: white; }
.segments .non.on { background: var(--bleu-nuit); color: white; }
.jour-retenu { margin: 0; font-weight: 700; color: var(--bleu-nuit); font-size: 1.1rem; }
.deux { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.case { flex-direction: row; align-items: center; gap: 8px; }
.defile { overflow-x: auto; border-radius: 14px; border: 1px solid #ebe8e3; }
.grille { border-collapse: collapse; width: 100%; background: white; }
.grille th, .grille td { padding: 8px 10px; border-bottom: 1px solid #ebe8e3; text-align: center; white-space: nowrap; }
.grille th { background: #f7f5f1; color: var(--bleu-nuit); font-size: 0.9rem; vertical-align: bottom; }
.grille .meilleure { background: #f1f9f5; }
.grille th.meilleure { background: #e3f3eb; }
.grille .retenue { background: #e3f3eb; }
.couronne { display: block; color: var(--vert); font-size: 0.75rem; font-weight: 700; }
.grille th:first-child, .grille td:first-child { position: sticky; left: 0; z-index: 1; background: white; text-align: left; }
.grille thead th:first-child, .total td:first-child { background: #f7f5f1; }
.qui { white-space: normal !important; min-width: 190px; }
.qui-contenu { display: flex; align-items: center; gap: 8px; }
.qui-contenu .nom-ligne { display: flex; flex-direction: column; flex: 1; }
.qui-contenu > :first-child { flex: none; }
.qui strong { color: var(--bleu-nuit); }
.qui small { color: var(--gris); font-size: 0.78rem; }
.qui .commentaire { font-style: italic; }
.case-rep { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; }
.case-rep.oui { background: var(--vert-clair); color: var(--vert); }
.case-rep.peut_etre { background: #fdf3e1; color: #b7791f; }
.case-rep.non { background: #fbeaea; color: var(--rouge); }
.case-rep.vide { background: #f4f2ee; }
.case-rep.petite { width: 22px; height: 22px; border-radius: 6px; vertical-align: middle; }
.case-rep.petite .icone { width: 14px; height: 14px; }
.total td { font-weight: 700; color: var(--bleu-nuit); background: #fbfaf8; }
.total small { font-weight: 400; color: var(--gris); }
.petit { padding: 6px 12px; font-size: 0.85rem; }
.legende { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0; align-items: center; }
.legende > span { display: inline-flex; align-items: center; gap: 6px; }
.actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
.actions button { display: inline-flex; align-items: center; gap: 6px; }
.erreur { margin: 0; }
@media (max-width: 640px) {
  .voile { padding: 0; }
  .fenetre { border-radius: 0; min-height: 100%; padding: 14px; }
  .qui { min-width: 150px; max-width: 170px; }
  .grille th, .grille td { padding: 6px 6px; }
  .case-rep { width: 30px; height: 30px; }
  .actions button { flex: 1 1 100%; justify-content: center; }
  .deux { grid-template-columns: 1fr; }
}
</style>
