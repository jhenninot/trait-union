<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '../api.js'
import { utiliserCercle } from '../cercle.js'
import { visibilites, valeurJour, valeurHeure, combiner, debutDuJour, horaire, parJour } from '../agenda.js'

// Agenda d'un cercle pour les aidants et les proches : rendez-vous à venir (ou passés),
// ajout et modification. Chacun choisit qui peut voir le rendez-vous qu'il crée.
const { url, cercle, erreur, action, accompagnes } = utiliserCercle()
const liste = ref([])
const passes = ref(false) // afficher les rendez-vous passés plutôt qu'à venir
const formulaire = ref(null) // saisie en cours (ajout ou modification)

const niveaux = computed(() => visibilites(accompagnes.value.length === 1 ? accompagnes.value[0].prenom : null))
const libelleNiveau = (v) => niveaux.value.find((n) => n.valeur === v)?.court

const charger = () => action(async () => {
  const aujourdhui = debutDuJour().toISOString()
  const filtre = passes.value ? `jusqua=${aujourdhui}` : `depuis=${aujourdhui}`
  const resultat = await api('GET', `${url.value}/rendez-vous?${filtre}`)
  liste.value = passes.value ? resultat.reverse() : resultat
})
watch([url, passes], () => {
  liste.value = []
  formulaire.value = null
  charger()
}, { immediate: true })

const groupes = computed(() => parJour(liste.value))

function nouveau() {
  formulaire.value = { id: null, titre: '', jour: valeurJour(new Date()), heure: '', heureFin: '', lieu: '', notes: '', visibilite: 'tous' }
}

function modifier(rdv) {
  const debut = new Date(rdv.debut)
  formulaire.value = {
    id: rdv.id,
    titre: rdv.titre,
    jour: valeurJour(debut),
    heure: rdv.journeeEntiere ? '' : valeurHeure(debut),
    heureFin: rdv.fin ? valeurHeure(new Date(rdv.fin)) : '',
    lieu: rdv.lieu ?? '',
    notes: rdv.notes ?? '',
    visibilite: rdv.visibilite
  }
}

// Sans heure, le rendez-vous dure toute la journée
const enregistrer = () => action(async () => {
  const f = formulaire.value
  const corps = {
    titre: f.titre,
    lieu: f.lieu,
    notes: f.notes,
    visibilite: f.visibilite,
    journeeEntiere: !f.heure,
    debut: combiner(f.jour, f.heure || '00:00').toISOString(),
    fin: f.heure && f.heureFin ? combiner(f.jour, f.heureFin).toISOString() : null
  }
  if (f.id) await api('PUT', `${url.value}/rendez-vous/${f.id}`, corps)
  else await api('POST', `${url.value}/rendez-vous`, corps)
  formulaire.value = null
  await charger()
})

const supprimer = (rdv) => action(async () => {
  if (!confirm(`Supprimer « ${rdv.titre} » ?`)) return
  await api('DELETE', `${url.value}/rendez-vous/${rdv.id}`)
  if (formulaire.value?.id === rdv.id) formulaire.value = null
  await charger()
})
</script>

<template>
  <main>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <template v-if="cercle">
      <p class="aide surtitre">{{ cercle.nom }}</p>
      <div class="titre">
        <h1>Agenda</h1>
        <button v-if="!formulaire" @click="nouveau">Ajouter un rendez-vous</button>
      </div>

      <form v-if="formulaire" class="carte" @submit.prevent="enregistrer">
        <strong>{{ formulaire.id ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous' }}</strong>
        <label>Quoi <input v-model="formulaire.titre" required maxlength="200" placeholder="Ex. Visite chez le Dr Martin" /></label>
        <div class="ligne-champs">
          <label>Jour <input v-model="formulaire.jour" type="date" required /></label>
          <label>Heure <input v-model="formulaire.heure" type="time" /></label>
          <label>Fin <input v-model="formulaire.heureFin" type="time" :disabled="!formulaire.heure" /></label>
        </div>
        <p class="aide">Sans heure, le rendez-vous occupe toute la journée.</p>
        <label>Lieu <input v-model="formulaire.lieu" maxlength="200" /></label>
        <label>Notes <textarea v-model="formulaire.notes" rows="3" maxlength="2000" /></label>
        <fieldset>
          <legend>Qui peut le voir ?</legend>
          <label v-for="n in niveaux" :key="n.valeur" class="choix">
            <input v-model="formulaire.visibilite" type="radio" :value="n.valeur" /> {{ n.libelle }}
          </label>
          <p class="aide">Vous voyez toujours les rendez-vous que vous créez.</p>
        </fieldset>
        <div class="actions">
          <button>Enregistrer</button>
          <button type="button" class="secondaire" @click="formulaire = null">Annuler</button>
        </div>
      </form>

      <div class="bascule">
        <button class="lien" :class="{ actif: !passes }" @click="passes = false">À venir</button>
        <button class="lien" :class="{ actif: passes }" @click="passes = true">Passés</button>
      </div>

      <p v-if="!groupes.length" class="aide">{{ passes ? 'Aucun rendez-vous passé.' : 'Aucun rendez-vous à venir.' }}</p>
      <section v-for="g in groupes" :key="g.cle">
        <h2 class="jour">{{ g.titre }}</h2>
        <div v-for="rdv in g.rendezVous" :key="rdv.id" class="carte rdv">
          <div class="heure">{{ horaire(rdv) }}</div>
          <div class="detail">
            <strong>{{ rdv.titre }}</strong>
            <span v-if="rdv.lieu" class="aide">{{ rdv.lieu }}</span>
            <p v-if="rdv.notes" class="notes">{{ rdv.notes }}</p>
            <span class="aide">
              <span class="pastille" :class="rdv.visibilite">{{ libelleNiveau(rdv.visibilite) }}</span>
              Ajouté par {{ rdv.deMoi ? 'vous' : (rdv.creeParPrenom ?? 'un ancien membre') }}
            </span>
            <div v-if="rdv.peutModifier" class="actions">
              <button class="lien" @click="modifier(rdv)">Modifier</button>
              <button class="danger" @click="supprimer(rdv)">Supprimer</button>
            </div>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.surtitre { margin: 0; }
.titre { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.ligne-champs { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; }
@media (max-width: 480px) { .ligne-champs { grid-template-columns: 1fr 1fr; } .ligne-champs label:first-child { grid-column: 1 / -1; } }
textarea { font: inherit; padding: 10px 12px; border: 1px solid #ccc; border-radius: 8px; resize: vertical; }
fieldset { border: 1px solid #ebe8e3; border-radius: 8px; display: flex; flex-direction: column; gap: 6px; }
legend { font-weight: 500; padding: 0 4px; }
.choix { flex-direction: row; align-items: center; gap: 8px; font-weight: normal; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.bascule { display: flex; gap: 4px; margin: 16px 0 4px; }
.bascule .actif { background: var(--vert-clair); }
.jour { font-size: 1.1rem; color: var(--bleu-nuit); margin: 20px 0 4px; }
.rdv { display: flex; gap: 16px; margin: 8px 0; }
.heure { flex: none; width: 140px; font-weight: 600; color: var(--vert); }
.detail { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.detail .actions { margin-top: 4px; }
.detail .actions button { padding-left: 0; }
.notes { margin: 0; white-space: pre-line; }
.pastille { display: inline-block; border-radius: 999px; padding: 1px 8px; margin-right: 6px; font-size: 0.8rem; background: #eef0f6; color: var(--bleu-nuit); }
.pastille.aidants { background: #fdf0dc; color: #8a5a00; }
.pastille.accompagne, .pastille.accompagne_aidants { background: var(--vert-clair); color: var(--vert); }
@media (max-width: 480px) { .rdv { flex-direction: column; gap: 4px; } .heure { width: auto; } }
</style>
