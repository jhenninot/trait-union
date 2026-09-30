<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '../api.js'
import { session } from '../session.js'
import { rendezVousAccompagne, debutDuJour, ajouterJours, valeurJour, combiner, horaire, parJour, nomDuJour, periode, decaler, duJour, titreRdv } from '../agenda.js'
import Calendrier from './Calendrier.vue'
import { parler, lectureDisponible } from '../voix.js'

// « Mon agenda » sur la tablette de la personne accompagnée. Par défaut une liste :
// ce qui est prévu aujourd'hui en grand, puis les prochains jours. Vues semaine et
// mois en plus, et un ajout très simple.
const JOURS_AFFICHES = 30
const VUES = [
  { valeur: 'liste', libelle: 'Liste' },
  { valeur: 'semaine', libelle: 'Semaine' },
  { valeur: 'mois', libelle: 'Mois' }
]
const vue = ref('liste')
const reference = ref(new Date())
const jourChoisi = ref(valeurJour(new Date()))
const liste = ref([])
const charge = ref(false)
const erreur = ref('')
const saisie = ref(null)

async function charger() {
  const aujourdhui = debutDuJour()
  const { debut, fin } = vue.value === 'liste'
    ? { debut: aujourdhui, fin: ajouterJours(aujourdhui, JOURS_AFFICHES) }
    : periode(vue.value, reference.value)
  liste.value = await rendezVousAccompagne(session.cercles, debut, fin)
  charge.value = true
}
watch([vue, reference], charger, { immediate: true })

// En changeant de vue, on revient à aujourd'hui
function choisirVue(v) {
  vue.value = v
  reference.value = new Date()
  jourChoisi.value = valeurJour(new Date())
}

function naviguer(sens) {
  reference.value = decaler(vue.value, reference.value, sens)
  const { debut, fin } = periode(vue.value, reference.value)
  const aujourdhui = new Date()
  const choisi = aujourdhui >= debut && aujourdhui < fin ? aujourdhui : vue.value === 'mois' ? reference.value : debut
  jourChoisi.value = valeurJour(choisi)
}

// Sections affichées sous le calendrier (ou la liste) : [{ cle, titre, enAvant, rendezVous }]
const sections = computed(() => {
  const cleAujourdhui = valeurJour(new Date())
  if (vue.value !== 'liste') {
    const cle = jourChoisi.value
    return [{ cle, titre: nomDuJour(combiner(cle)), enAvant: true, rendezVous: duJour(liste.value, cle) }]
  }
  const aujourdhui = liste.value.filter((r) => valeurJour(new Date(r.debut)) <= cleAujourdhui)
  const ensuite = parJour(liste.value.filter((r) => valeurJour(new Date(r.debut)) > cleAujourdhui))
  return [{ cle: cleAujourdhui, titre: 'Aujourd\'hui', enAvant: true, rendezVous: aujourdhui }, ...ensuite]
})

const QUAND = [
  { valeur: 0, libelle: 'Aujourd\'hui' },
  { valeur: 1, libelle: 'Demain' },
  { valeur: 'autre', libelle: 'Un autre jour' }
]
const HORAIRE = [
  { valeur: true, libelle: 'Toute la journée' },
  { valeur: false, libelle: 'À une heure précise' }
]
const REPETITION = [
  { valeur: 'aucune', libelle: 'Une seule fois' },
  { valeur: 'quotidienne', libelle: 'Chaque jour' },
  { valeur: 'hebdomadaire', libelle: 'Chaque semaine' },
  { valeur: 'mensuelle', libelle: 'Chaque mois' }
]
const QUI = [
  { valeur: 'tous', emoji: '👨‍👩‍👧', libelle: 'Toute ma famille' },
  { valeur: 'accompagne_aidants', emoji: '🤝', libelle: 'Moi et mes aidants' },
  { valeur: 'accompagne', emoji: '🙂', libelle: 'Moi seulement' }
]

function ajouter() {
  erreur.value = ''
  // Dans le calendrier, le jour sélectionné est proposé
  const jour = vue.value === 'liste' ? null : jourChoisi.value
  const ecart = jour ? Math.round((combiner(jour) - debutDuJour()) / 86_400_000) : 0
  const quand = ecart === 0 || ecart === 1 ? ecart : 'autre'
  saisie.value = {
    titre: '', quand, autreJour: jour ?? valeurJour(ajouterJours(new Date(), 2)),
    plusieursJours: false, jourFin: '',
    journeeEntiere: false, heure: '10:00', heureFin: '11:00',
    recurrence: 'aucune', visibilite: 'tous'
  }
}

// L'heure de fin suit l'heure de début (une heure plus tard)
watch(() => saisie.value?.heure, (heure) => {
  const s = saisie.value
  if (!s || !heure) return
  const [h, m] = heure.split(':').map(Number)
  if (!s.heureFin || s.heureFin <= heure) s.heureFin = h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

async function enregistrer() {
  const s = saisie.value
  erreur.value = ''
  if (!s.titre.trim()) return (erreur.value = 'Écrivez ce qui est prévu.')
  const jour = s.quand === 'autre' ? s.autreJour : valeurJour(ajouterJours(new Date(), s.quand))
  if (!jour) return (erreur.value = 'Choisissez le jour.')
  const jourFin = s.plusieursJours && s.jourFin ? s.jourFin : jour
  if (jourFin < jour) return (erreur.value = 'Le dernier jour doit être après le premier.')
  if (!s.journeeEntiere && (!s.heure || !s.heureFin)) return (erreur.value = 'Choisissez les heures.')
  const debut = s.journeeEntiere ? combiner(jour) : combiner(jour, s.heure)
  const fin = s.journeeEntiere ? combiner(jourFin, '23:59') : combiner(jourFin, s.heureFin)
  if (fin <= debut) return (erreur.value = 'L\'heure de fin doit être après l\'heure de début.')
  // Le rendez-vous va dans le cercle de la personne (en général, elle n'en a qu'un)
  const cercle = session.cercles.find((c) => c.role === 'accompagne') ?? session.cercles[0]
  try {
    await api('POST', `/cercles/${cercle.id}/rendez-vous`, {
      titre: s.titre,
      visibilite: s.visibilite,
      journeeEntiere: s.journeeEntiere,
      debut: debut.toISOString(),
      fin: fin.toISOString(),
      recurrence: s.recurrence
    })
    saisie.value = null
    await charger()
  } catch (e) {
    erreur.value = e.message
  }
}

// Les prochains rendez-vous lus à voix haute (phrase préparée par le serveur)
const lecture = lectureDisponible()
async function ecouterAgenda() {
  parler((await api('POST', '/voix/intention', { intention: 'agenda' })).texte)
}

async function supprimer(rdv) {
  const serie = rdv.recurrence !== 'aucune' ? ' (toutes les fois)' : ''
  if (!confirm(`Effacer « ${rdv.titre} »${serie} ?`)) return
  await api('DELETE', `/cercles/${rdv.cercleId}/rendez-vous/${rdv.id}`).catch((e) => (erreur.value = e.message))
  await charger()
}
</script>

<template>
  <main class="agenda">
    <form v-if="saisie" class="saisie" @submit.prevent="enregistrer">
      <h1>Nouveau rendez-vous</h1>
      <label class="question">Qu'est-ce qui est prévu ?
        <input v-model="saisie.titre" class="grand" maxlength="200" placeholder="Ex. Coiffeur" />
      </label>

      <p class="question">Quel jour ?</p>
      <div class="choix">
        <button v-for="q in QUAND" :key="q.valeur" type="button" :class="{ choisi: saisie.quand === q.valeur }" @click="saisie.quand = q.valeur">
          {{ q.libelle }}
        </button>
      </div>
      <input v-if="saisie.quand === 'autre'" v-model="saisie.autreJour" type="date" class="grand" aria-label="Jour" />
      <button v-if="!saisie.plusieursJours" type="button" class="lien-simple" @click="saisie.plusieursJours = true">+ Sur plusieurs jours</button>
      <label v-else class="question">Jusqu'à quel jour ?
        <input v-model="saisie.jourFin" type="date" class="grand" />
      </label>

      <p class="question">À quelle heure ?</p>
      <div class="choix deux">
        <button v-for="q in HORAIRE" :key="q.libelle" type="button" :class="{ choisi: saisie.journeeEntiere === q.valeur }" @click="saisie.journeeEntiere = q.valeur">
          {{ q.libelle }}
        </button>
      </div>
      <div v-if="!saisie.journeeEntiere" class="heures">
        <label>De <input v-model="saisie.heure" type="time" class="grand" /></label>
        <label>à <input v-model="saisie.heureFin" type="time" class="grand" /></label>
      </div>

      <p class="question">Ça se répète ?</p>
      <div class="choix quatre">
        <button v-for="q in REPETITION" :key="q.valeur" type="button" :class="{ choisi: saisie.recurrence === q.valeur }" @click="saisie.recurrence = q.valeur">
          {{ q.libelle }}
        </button>
      </div>

      <p class="question">Qui peut le voir ?</p>
      <div class="choix">
        <button v-for="q in QUI" :key="q.valeur" type="button" :class="{ choisi: saisie.visibilite === q.valeur }" @click="saisie.visibilite = q.valeur">
          <span class="emoji" aria-hidden="true">{{ q.emoji }}</span>{{ q.libelle }}
        </button>
      </div>

      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <div class="boutons">
        <button class="principal">Enregistrer</button>
        <button type="button" class="retour" @click="saisie = null">Annuler</button>
      </div>
    </form>

    <template v-else>
      <div class="entete">
        <h1>Mon agenda</h1>
        <button v-if="lecture" class="principal ecouter" title="Écouter mes prochains rendez-vous" @click="ecouterAgenda"><span aria-hidden="true">🔊</span><span class="texte-ecouter"> Écouter</span></button>
        <button class="principal" @click="ajouter">+ Ajouter</button>
      </div>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>

      <div class="vues" role="tablist">
        <button v-for="v in VUES" :key="v.valeur" role="tab" :aria-selected="vue === v.valeur" :class="{ actif: vue === v.valeur }" @click="choisirVue(v.valeur)">
          {{ v.libelle }}
        </button>
      </div>

      <Calendrier v-if="vue !== 'liste'" grand :vue="vue" :reference="reference" :rendez-vous="liste" :jour-choisi="jourChoisi" @naviguer="naviguer" @choisir-jour="jourChoisi = $event" />

      <template v-for="(g, i) in sections" :key="g.cle">
        <h2 v-if="vue === 'liste' && i === 1">Les prochains jours</h2>
        <section :class="g.enAvant ? 'aujourdhui' : 'jour'">
          <component :is="g.enAvant ? 'h2' : 'h3'">{{ g.titre }}</component>
          <p v-if="g.enAvant && charge && !g.rendezVous.length" class="vide">Rien de prévu{{ vue === 'liste' ? ' aujourd\'hui' : ' ce jour-là' }}.</p>
          <div v-for="rdv in g.rendezVous" :key="rdv.cle" class="rdv" :class="{ masque: rdv.masque }">
            <span class="heure">{{ horaire(rdv) }}</span>
            <span class="titre">{{ titreRdv(rdv) }}</span>
            <span v-if="rdv.lieu" class="lieu">{{ rdv.lieu }}</span>
            <button v-if="rdv.deMoi" class="effacer" @click="supprimer(rdv)">Effacer</button>
          </div>
        </section>
      </template>
    </template>
  </main>
</template>

<style scoped>
.agenda { max-width: 1200px; flex: 1; padding: 24px; overflow-y: auto; }
h1 { font-size: 2.4rem; margin: 0; }
h2 { font-size: 1.9rem; color: var(--bleu-nuit); margin: 28px 0 12px; }
h3 { font-size: 1.5rem; color: var(--bleu-nuit); margin: 20px 0 8px; }
.entete { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
button.principal { font-size: 1.6rem; font-weight: 700; padding: 18px 32px; border-radius: 20px; }
button.ecouter { margin-left: auto; background: var(--vert-clair); color: var(--vert); }
.aujourdhui { background: var(--vert-clair); border-radius: 24px; padding: 4px 20px 20px; margin-top: 20px; }
.aujourdhui .rdv { font-size: 1.3rem; }
.vues { display: flex; gap: 10px; margin-top: 16px; }
.vues button { flex: 1; font-size: 1.4rem; font-weight: 600; padding: 14px; border-radius: 16px; background: #f3f0ea; color: var(--bleu-nuit); }
.vues button.actif { background: var(--bleu-nuit); color: white; }
.rdv.masque .titre { color: var(--gris); font-style: italic; font-weight: 600; }
.vide { font-size: 1.6rem; color: var(--gris); margin: 0; }
.rdv {
  background: white;
  border-radius: 20px;
  padding: 16px 20px;
  margin: 10px 0;
  display: grid;
  grid-template-columns: auto 1fr auto;
  column-gap: 20px;
  align-items: center;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.06);
  font-size: 1.1rem;
}
.heure { font-size: 1.6em; font-weight: 700; color: var(--vert); }
.titre { font-size: 1.6em; font-weight: 700; color: var(--bleu-nuit); }
.lieu { grid-column: 2; color: var(--gris); font-size: 1.2em; }
.effacer { grid-column: 3; grid-row: 1; background: none; color: var(--rouge); font-size: 1.1rem; }
.saisie { gap: 14px; }
.question { font-size: 1.6rem; font-weight: 700; color: var(--bleu-nuit); margin: 12px 0 0; gap: 10px; }
.facultatif { font-weight: normal; color: var(--gris); font-size: 1.2rem; }
input.grand { font-size: 1.7rem; padding: 16px 18px; border-radius: 16px; border-width: 2px; }
.choix { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.choix button {
  font-size: 1.5rem;
  font-weight: 600;
  padding: 20px 12px;
  border-radius: 20px;
  background: #f3f0ea;
  color: var(--bleu-nuit);
  border: 3px solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.choix button.choisi { background: var(--vert); color: white; }
.emoji { font-size: 2rem; }
.choix.deux { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.choix.quatre { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.heures { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.heures label { font-size: 1.4rem; font-weight: 600; color: var(--bleu-nuit); min-width: 0; }
.heures input { width: 100%; min-width: 0; }
.lien-simple { align-self: flex-start; background: none; color: var(--vert); font-size: 1.3rem; font-weight: 600; padding: 4px 0; }
.boutons { display: flex; gap: 16px; margin-top: 16px; flex-wrap: wrap; }
.retour { font-weight: 700; font-size: 1.5rem; padding: 18px 32px; border-radius: 20px; background: #f3f0ea; color: var(--bleu-nuit); }
.erreur { font-size: 1.4rem; }
@media (max-width: 600px) {
  .agenda { padding: 16px 12px; }
  h1 { font-size: 1.7rem; }
  h2 { font-size: 1.5rem; margin: 20px 0 8px; }
  h3 { font-size: 1.25rem; }
  .entete { gap: 8px; }
  button.principal { font-size: 1.2rem; padding: 12px 18px; white-space: nowrap; }
  .texte-ecouter { display: none; }
  button.ecouter { padding: 12px 14px; }
  .boutons button { flex: 1; }
  .vues { gap: 6px; margin-top: 12px; }
  .vues button { font-size: 1.1rem; padding: 12px 4px; }
  .aujourdhui { padding: 2px 12px 12px; border-radius: 18px; }
  .aujourdhui .rdv, .rdv { font-size: 0.95rem; padding: 12px 14px; border-radius: 16px; }
  .question { font-size: 1.3rem; }
  input.grand { font-size: 1.4rem; padding: 12px 14px; }
  .choix { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .choix.quatre { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .heures label { font-size: 1.15rem; }
  .lien-simple { font-size: 1.1rem; }
  .choix button { font-size: 1.05rem; padding: 14px 4px; border-radius: 16px; }
  .emoji { font-size: 1.7rem; }
  .retour { font-size: 1.2rem; padding: 14px 18px; }
  .rdv { grid-template-columns: 1fr auto; }
  .heure { grid-column: 1; }
  .titre, .lieu { grid-column: 1 / -1; }
  .effacer { grid-column: 2; }
}
</style>
