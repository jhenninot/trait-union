<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api.js'
import { session } from '../session.js'
import { rendezVousAccompagne, debutDuJour, ajouterJours, valeurJour, combiner, horaire, parJour } from '../agenda.js'

// « Mon agenda » sur la tablette de la personne accompagnée : ce qui est prévu
// aujourd'hui en grand, puis les prochains jours, et un ajout très simple.
const JOURS_AFFICHES = 60
const liste = ref([])
const charge = ref(false)
const erreur = ref('')
const saisie = ref(null)

async function charger() {
  const aujourdhui = debutDuJour()
  liste.value = await rendezVousAccompagne(session.cercles, aujourdhui, ajouterJours(aujourdhui, JOURS_AFFICHES))
  charge.value = true
}
onMounted(charger)

const cleAujourdhui = () => valeurJour(new Date())
const aujourdhui = computed(() => liste.value.filter((r) => valeurJour(new Date(r.debut)) <= cleAujourdhui()))
const prochainsJours = computed(() => parJour(liste.value.filter((r) => valeurJour(new Date(r.debut)) > cleAujourdhui())))

const QUAND = [
  { valeur: 0, libelle: 'Aujourd\'hui' },
  { valeur: 1, libelle: 'Demain' },
  { valeur: 'autre', libelle: 'Un autre jour' }
]
const QUI = [
  { valeur: 'tous', emoji: '👨‍👩‍👧', libelle: 'Toute ma famille' },
  { valeur: 'accompagne_aidants', emoji: '🤝', libelle: 'Moi et mes aidants' },
  { valeur: 'accompagne', emoji: '🙂', libelle: 'Moi seulement' }
]

function ajouter() {
  erreur.value = ''
  saisie.value = { titre: '', quand: 0, autreJour: valeurJour(ajouterJours(new Date(), 2)), heure: '', visibilite: 'tous' }
}

async function enregistrer() {
  const s = saisie.value
  erreur.value = ''
  if (!s.titre.trim()) return (erreur.value = 'Écrivez ce qui est prévu.')
  const jour = s.quand === 'autre' ? s.autreJour : valeurJour(ajouterJours(new Date(), s.quand))
  if (!jour) return (erreur.value = 'Choisissez le jour.')
  // Le rendez-vous va dans le cercle de la personne (en général, elle n'en a qu'un)
  const cercle = session.cercles.find((c) => c.role === 'accompagne') ?? session.cercles[0]
  try {
    await api('POST', `/cercles/${cercle.id}/rendez-vous`, {
      titre: s.titre,
      visibilite: s.visibilite,
      journeeEntiere: !s.heure,
      debut: combiner(jour, s.heure || '00:00').toISOString()
    })
    saisie.value = null
    await charger()
  } catch (e) {
    erreur.value = e.message
  }
}

async function supprimer(rdv) {
  if (!confirm(`Effacer « ${rdv.titre} » ?`)) return
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

      <label class="question">À quelle heure ? <span class="facultatif">(facultatif)</span>
        <input v-model="saisie.heure" type="time" class="grand" />
      </label>

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
        <button class="principal" @click="ajouter">+ Ajouter</button>
      </div>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>

      <section class="aujourdhui">
        <h2>Aujourd'hui</h2>
        <p v-if="charge && !aujourdhui.length" class="vide">Rien de prévu aujourd'hui.</p>
        <div v-for="rdv in aujourdhui" :key="rdv.id" class="rdv">
          <span class="heure">{{ horaire(rdv) }}</span>
          <span class="titre">{{ rdv.titre }}</span>
          <span v-if="rdv.lieu" class="lieu">{{ rdv.lieu }}</span>
          <button v-if="rdv.deMoi" class="effacer" @click="supprimer(rdv)">Effacer</button>
        </div>
      </section>

      <section v-if="prochainsJours.length" class="bientot">
        <h2>Les prochains jours</h2>
        <div v-for="g in prochainsJours" :key="g.cle" class="jour">
          <h3>{{ g.titre }}</h3>
          <div v-for="rdv in g.rendezVous" :key="rdv.id" class="rdv">
            <span class="heure">{{ horaire(rdv) }}</span>
            <span class="titre">{{ rdv.titre }}</span>
            <span v-if="rdv.lieu" class="lieu">{{ rdv.lieu }}</span>
            <button v-if="rdv.deMoi" class="effacer" @click="supprimer(rdv)">Effacer</button>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.agenda { max-width: 900px; flex: 1; padding: 24px; overflow-y: auto; }
h1 { font-size: 2.4rem; margin: 0; }
h2 { font-size: 1.9rem; color: var(--bleu-nuit); margin: 28px 0 12px; }
h3 { font-size: 1.5rem; color: var(--bleu-nuit); margin: 20px 0 8px; }
.entete { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
button.principal { font-size: 1.6rem; font-weight: 700; padding: 18px 32px; border-radius: 20px; }
.aujourdhui { background: var(--vert-clair); border-radius: 24px; padding: 4px 20px 20px; margin-top: 20px; }
.aujourdhui .rdv { font-size: 1.3rem; }
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
.boutons { display: flex; gap: 16px; margin-top: 16px; flex-wrap: wrap; }
.retour { font-size: 1.5rem; padding: 18px 32px; border-radius: 20px; background: #f3f0ea; color: var(--bleu-nuit); }
.erreur { font-size: 1.4rem; }
@media (max-width: 600px) {
  .agenda { padding: 16px; }
  h1 { font-size: 1.9rem; }
  button.principal { font-size: 1.3rem; padding: 14px 20px; }
  .rdv { grid-template-columns: 1fr auto; }
  .heure { grid-column: 1; }
  .titre, .lieu { grid-column: 1 / -1; }
  .effacer { grid-column: 2; }
}
</style>
