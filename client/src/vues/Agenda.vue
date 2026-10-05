<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import { utiliserCercle } from '../cercle.js'
import { motDecede } from '../coordonnees.js'
import { RECURRENCES, texteRecurrence, choixRappels, texteRappel, visibilites, valeurJour, valeurHeure, combiner, debutDuJour, horaire, parJour, nomDuJour, periode, decaler, duJour, titreRdv } from '../agenda.js'
import Calendrier from './Calendrier.vue'
import Icone from '../navigation/Icone.vue'
import Modale from '../navigation/Modale.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import { confirmer } from '../fenetre.js'

// Agenda d'un cercle pour les aidants et les proches : vue mois, semaine ou liste
// (à venir ou passés), ajout et modification. Chacun choisit qui peut voir le
// rendez-vous qu'il crée ; les autres le voient comme « Rendez-vous privé ».
const { url, cercle, erreur, action, accompagnes, accompagnesActifs } = utiliserCercle()
const liste = ref([])
const passes = ref(false) // afficher les rendez-vous passés plutôt qu'à venir
const formulaire = ref(null) // saisie en cours (ajout ou modification)

// Vue choisie (retenue sur cet appareil), période affichée et jour sélectionné
const VUES = [{ valeur: 'mois', libelle: 'Mois' }, { valeur: 'semaine', libelle: 'Semaine' }, { valeur: 'liste', libelle: 'Liste' }]
const MEMOIRE_VUE = 'tu_vue_agenda'
const vue = ref((() => {
  try { return localStorage.getItem(MEMOIRE_VUE) || 'mois' } catch { return 'mois' }
})())
watch(vue, (v) => { try { localStorage.setItem(MEMOIRE_VUE, v) } catch { /* stockage indisponible */ } })
const reference = ref(new Date())
const jourChoisi = ref(valeurJour(new Date()))

function naviguer(sens) {
  reference.value = decaler(vue.value, reference.value, sens)
  const { debut, fin } = periode(vue.value, reference.value)
  // Aujourd'hui s'il est dans la période, sinon le début de la semaine ou le 1er du mois
  const aujourdhui = new Date()
  const choisi = aujourdhui >= debut && aujourdhui < fin ? aujourdhui : vue.value === 'mois' ? reference.value : debut
  jourChoisi.value = valeurJour(choisi)
}

// Avec plusieurs personnes accompagnées, un rendez-vous qui leur est destiné peut n'en
// concerner qu'une (accompagneId) ; les autres ne le voient pas.
// Une personne accompagnée décédée n'est plus proposée (sauf pour un rendez-vous qui la concernait)
const plusieurs = computed(() => accompagnesActifs.value.length > 1)
const prenomAccompagne = (id) => accompagnes.value.find((m) => m.utilisateurId === id)?.prenom
const pourQui = (id) => (id && prenomAccompagne(id)) || (plusieurs.value ? 'Personnes accompagnées' : accompagnesActifs.value[0]?.prenom)
const genreDe = (id) => accompagnes.value.find((m) => m.utilisateurId === id)?.genre ?? null
const choixPourQui = computed(() => accompagnes.value.filter((m) => !m.decede || m.utilisateurId === formulaire.value?.accompagneId))
const niveaux = computed(() => visibilites(pourQui(formulaire.value?.accompagneId)))
const pourAccompagne = (v) => v === 'accompagne' || v === 'accompagne_aidants'
const libelleNiveau = (rdv) => visibilites(rdv.accompagnePrenom ?? pourQui(null)).find((n) => n.valeur === rdv.visibilite)?.court
// Une auxiliaire de vie ne voit que les rendez-vous cochés « auxiliaires » (et les siens)
const suisAuxiliaire = computed(() => !cercle.value?.peutGerer && cercle.value?.monRole === 'auxiliaire')

const charger = () => action(async () => {
  let filtre
  if (vue.value === 'liste') {
    // Liste : les trois prochains mois, ou les trois derniers
    const aujourdhui = debutDuJour()
    const autre = new Date(aujourdhui)
    autre.setMonth(autre.getMonth() + (passes.value ? -3 : 3))
    filtre = passes.value
      ? `depuis=${autre.toISOString()}&jusqua=${aujourdhui.toISOString()}`
      : `depuis=${aujourdhui.toISOString()}&jusqua=${autre.toISOString()}`
  } else {
    const { debut, fin } = periode(vue.value, reference.value)
    filtre = `depuis=${debut.toISOString()}&jusqua=${fin.toISOString()}`
  }
  const resultat = await api('GET', `${url.value}/rendez-vous?${filtre}`)
  liste.value = vue.value === 'liste' && passes.value ? resultat.reverse() : resultat
})
watch([url, passes, vue, reference], charger, { immediate: true })
watch(url, () => (formulaire.value = null))

// Liste : tous les jours chargés ; semaine et mois : le détail du jour sélectionné
const groupes = computed(() => {
  if (vue.value === 'liste') return parJour(liste.value)
  return [{ cle: jourChoisi.value, titre: nomDuJour(combiner(jourChoisi.value)), rendezVous: duJour(liste.value, jourChoisi.value) }]
})

// Heure + 1 h (sans dépasser 23h59)
function uneHeureApres(heure) {
  const [h, m] = heure.split(':').map(Number)
  return h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function nouveau(jourVise) {
  // Clic droit ou appui long sur un jour du calendrier : on part de ce jour
  if (typeof jourVise === 'string') jourChoisi.value = jourVise
  const jour = typeof jourVise === 'string' ? jourVise : vue.value === 'liste' ? valeurJour(new Date()) : jourChoisi.value
  formulaire.value = {
    id: null, titre: '', journeeEntiere: false,
    jour, heure: '09:00', jourFin: jour, heureFin: '10:00',
    recurrence: 'aucune', intervalle: 1, recurrenceFin: '',
    lieu: '', notes: '', rappel: null,
    visibilite: suisAuxiliaire.value ? 'aidants' : 'tous',
    accompagneId: null,
    auxiliaires: suisAuxiliaire.value
  }
}

// « Ajouter un rendez-vous » depuis l'accueil (?ajouter=1) : le formulaire s'ouvre une fois le cercle chargé
const route = useRoute()
const router = useRouter()
watch([cercle, () => route.query.ajouter], ([c, ajouter]) => {
  if (!c || !ajouter) return
  nouveau()
  router.replace({ query: { ...route.query, ajouter: undefined } })
}, { immediate: true })

// Le formulaire part de la date choisie. Pour un rendez-vous répété, on choisit ensuite
// si la modification vaut pour cette date, cette date et les suivantes, ou toute la série.
const PORTEES = [
  { valeur: 'occurrence', libelle: 'Cette date seulement' },
  { valeur: 'suivantes', libelle: 'Cette date et les suivantes' },
  { valeur: 'serie', libelle: 'Toute la série' }
]
function modifier(rdv) {
  const debut = new Date(rdv.debut)
  const fin = rdv.fin ? new Date(rdv.fin) : debut
  const estSerie = rdv.recurrence !== 'aucune'
  formulaire.value = {
    id: rdv.id,
    occurrence: rdv.occurrence,
    estSerie,
    portee: estSerie ? 'occurrence' : 'serie',
    // Seul l'auteur change qui peut voir le rendez-vous
    visibiliteModifiable: rdv.deMoi,
    titre: rdv.titre,
    journeeEntiere: rdv.journeeEntiere,
    jour: valeurJour(debut),
    heure: rdv.journeeEntiere ? '09:00' : valeurHeure(debut),
    jourFin: valeurJour(fin),
    heureFin: rdv.journeeEntiere || !rdv.fin ? uneHeureApres(valeurHeure(debut)) : valeurHeure(fin),
    recurrence: rdv.recurrence,
    intervalle: rdv.intervalle,
    recurrenceFin: rdv.recurrenceFin ? valeurJour(new Date(rdv.recurrenceFin)) : '',
    lieu: rdv.lieu ?? '',
    notes: rdv.notes ?? '',
    rappel: rdv.rappel ?? null,
    visibilite: rdv.visibilite,
    accompagneId: rdv.accompagneId ?? null,
    auxiliaires: rdv.auxiliaires
  }
}

// La fin suit le début : même jour au minimum, une heure plus tard par défaut
watch(() => formulaire.value?.jour, (jour, avant) => {
  const f = formulaire.value
  if (!f || !jour) return
  if (!f.jourFin || f.jourFin < jour || f.jourFin === avant) f.jourFin = jour
})
watch(() => formulaire.value?.heure, (heure, avant) => {
  const f = formulaire.value
  if (!f || !heure || !avant || f.jourFin !== f.jour) return
  if (f.heureFin === uneHeureApres(avant) || f.heureFin <= heure) f.heureFin = uneHeureApres(heure)
})

// Journée entière : l'alerte part à 9 h (le matin même, la veille...)
const rappels = computed(() => formulaire.value ? choixRappels(formulaire.value.journeeEntiere, formulaire.value.rappel) : [])
watch(() => [formulaire.value, formulaire.value?.journeeEntiere], ([f, journee], [avant]) => {
  // Seulement quand on change le choix, pas en ouvrant le formulaire
  if (!f || f !== avant || f.rappel == null) return
  if (journee) f.rappel = f.rappel >= 1440 ? f.rappel : 0
  else if (!rappels.value.some((r) => r.valeur === f.rappel)) f.rappel = 60
})

const uniteIntervalle = computed(() => {
  const r = RECURRENCES.find((x) => x.valeur === formulaire.value?.recurrence)
  return r?.unite?.[formulaire.value.intervalle > 1 ? 1 : 0] ?? ''
})

const enregistrer = () => action(async () => {
  const f = formulaire.value
  const debut = f.journeeEntiere ? combiner(f.jour) : combiner(f.jour, f.heure)
  const fin = f.journeeEntiere ? combiner(f.jourFin, '23:59') : combiner(f.jourFin, f.heureFin)
  if (fin < debut) throw new Error('La fin doit être après le début')
  const corps = {
    titre: f.titre,
    lieu: f.lieu,
    notes: f.notes,
    rappel: f.rappel,
    visibilite: f.visibilite,
    accompagneId: pourAccompagne(f.visibilite) ? f.accompagneId : null,
    auxiliaires: f.auxiliaires,
    journeeEntiere: f.journeeEntiere,
    debut: debut.toISOString(),
    fin: fin.toISOString(),
    recurrence: f.portee === 'occurrence' ? 'aucune' : f.recurrence,
    intervalle: f.intervalle,
    recurrenceFin: f.recurrence !== 'aucune' && f.recurrenceFin ? combiner(f.recurrenceFin, '23:59').toISOString() : null,
    portee: f.portee,
    occurrence: f.occurrence
  }
  if (f.id) await api('PUT', `${url.value}/rendez-vous/${f.id}`, corps)
  else await api('POST', `${url.value}/rendez-vous`, corps)
  formulaire.value = null
  await charger()
})

// Un rendez-vous répété demande quoi supprimer (choix affiché dans sa carte)
const suppression = ref(null) // clé de la répétition dont on affiche le choix
async function supprimer(rdv) {
  if (rdv.recurrence !== 'aucune') return (suppression.value = rdv.cle)
  if (await confirmer(`Supprimer « ${rdv.titre} » ?`, { oui: 'Supprimer', danger: true, icone: 'effacer' })) confirmerSuppression(rdv, 'serie')
}
const confirmerSuppression = (rdv, portee) => action(async () => {
  await api('DELETE', `${url.value}/rendez-vous/${rdv.id}?portee=${portee}&occurrence=${rdv.occurrence}`)
  suppression.value = null
  if (formulaire.value?.id === rdv.id) formulaire.value = null
  await charger()
})
</script>

<template>
  <main class="agenda">
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <template v-if="cercle">
      <p class="aide surtitre">{{ cercle.nom }}</p>
      <div class="titre">
        <h1>Agenda</h1>
        <button @click="nouveau()"><Icone nom="ajouter" class="en-ligne" /> Ajouter un rendez-vous</button>
      </div>

      <Modale v-if="formulaire" large :titre="formulaire.id ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'" @fermer="formulaire = null">
      <form @submit.prevent="enregistrer">
        <label>Quoi <input v-model="formulaire.titre" required maxlength="200" placeholder="Ex. Visite chez le Dr Martin" /></label>
        <label class="choix"><input v-model="formulaire.journeeEntiere" type="checkbox" /> Journée entière</label>
        <div class="ligne-champs">
          <label>Début <input v-model="formulaire.jour" type="date" required /></label>
          <label v-if="!formulaire.journeeEntiere">Heure <input v-model="formulaire.heure" type="time" required /></label>
        </div>
        <div class="ligne-champs">
          <label>Fin <input v-model="formulaire.jourFin" type="date" :min="formulaire.jour" required /></label>
          <label v-if="!formulaire.journeeEntiere">Heure <input v-model="formulaire.heureFin" type="time" required /></label>
        </div>
        <fieldset v-if="formulaire.estSerie">
          <legend>Ce rendez-vous se répète. Modifier :</legend>
          <label v-for="p in PORTEES" :key="p.valeur" class="choix">
            <input v-model="formulaire.portee" type="radio" :value="p.valeur" /> {{ p.libelle }}
          </label>
        </fieldset>
        <div v-if="formulaire.portee !== 'occurrence'" class="ligne-champs">
          <label>Répétition
            <select v-model="formulaire.recurrence">
              <option v-for="r in RECURRENCES" :key="r.valeur" :value="r.valeur">{{ r.libelle }}</option>
            </select>
          </label>
          <template v-if="formulaire.recurrence !== 'aucune'">
            <label>Tous les <span class="intervalle"><input v-model.number="formulaire.intervalle" type="number" min="1" max="99" required /> {{ uniteIntervalle }}</span></label>
            <label>Jusqu'au <input v-model="formulaire.recurrenceFin" type="date" :min="formulaire.jour" /></label>
          </template>
        </div>
        <p v-if="formulaire.portee !== 'occurrence' && formulaire.recurrence !== 'aucune'" class="aide">Sans date, la répétition continue indéfiniment.</p>
        <label>Alerte
          <select v-model="formulaire.rappel">
            <option v-for="r in rappels" :key="String(r.valeur)" :value="r.valeur">{{ r.libelle }}</option>
          </select>
          <span class="aide">Envoyée sur le téléphone de chaque personne qui voit ce rendez-vous et a activé les alertes (<RouterLink to="/alertes">Mes alertes</RouterLink>).</span>
        </label>
        <label>Lieu <input v-model="formulaire.lieu" maxlength="200" /></label>
        <label>Notes <textarea v-model="formulaire.notes" rows="3" maxlength="2000" /></label>
        <fieldset :disabled="formulaire.id && !formulaire.visibiliteModifiable">
          <legend>Qui peut le voir ?</legend>
          <p v-if="formulaire.id && !formulaire.visibiliteModifiable" class="aide">Seule la personne qui a créé ce rendez-vous peut changer qui le voit.</p>
          <label v-for="n in niveaux" :key="n.valeur" class="choix">
            <input v-model="formulaire.visibilite" type="radio" :value="n.valeur" /> {{ n.libelle }}
          </label>
          <label v-if="plusieurs && pourAccompagne(formulaire.visibilite)" class="pour-qui">Pour qui
            <select v-model="formulaire.accompagneId">
              <option :value="null">Toutes</option>
              <option v-for="m in choixPourQui" :key="m.id" :value="m.utilisateurId">{{ m.prenom }} {{ m.nom }}{{ m.decede ? ` (${motDecede(m.genre)})` : '' }}</option>
            </select>
          </label>
          <label class="choix auxiliaires">
            <input v-model="formulaire.auxiliaires" type="checkbox" :disabled="suisAuxiliaire" /> Visible aussi par les auxiliaires de vie
          </label>
          <p class="aide">Vous voyez toujours les rendez-vous que vous créez.</p>
        </fieldset>
        <p v-if="erreur" class="erreur">{{ erreur }}</p>
        <div class="actions">
          <button>Enregistrer</button>
          <button type="button" class="secondaire" @click="formulaire = null">Annuler</button>
        </div>
      </form>
      </Modale>

      <div class="vues" role="tablist">
        <button v-for="v in VUES" :key="v.valeur" role="tab" :aria-selected="vue === v.valeur" :class="{ actif: vue === v.valeur }" @click="vue = v.valeur">
          {{ v.libelle }}
        </button>
      </div>

      <template v-if="vue === 'liste'">
        <div class="bascule">
          <button class="lien" :class="{ actif: !passes }" @click="passes = false">À venir</button>
          <button class="lien" :class="{ actif: passes }" @click="passes = true">Passés</button>
        </div>
        <p v-if="!groupes.length" class="aide">{{ passes ? 'Aucun rendez-vous ces trois derniers mois.' : 'Aucun rendez-vous dans les trois prochains mois.' }}</p>
      </template>
      <Calendrier v-else :vue="vue" :reference="reference" :rendez-vous="liste" :jour-choisi="jourChoisi" @naviguer="naviguer" @choisir-jour="jourChoisi = $event" @ajouter-jour="nouveau" />

      <section v-for="g in groupes" :key="g.cle">
        <h2 class="jour">{{ g.titre }}</h2>
        <p v-if="!g.rendezVous.length" class="aide">Rien de prévu ce jour-là.</p>
        <div v-for="rdv in g.rendezVous" :key="rdv.cle" class="carte rdv">
          <div class="heure">{{ horaire(rdv) }}</div>
          <div v-if="rdv.masque" class="detail">
            <strong class="prive">{{ titreRdv(rdv) }}</strong>
            <span class="aide">Vous n'avez pas accès aux détails de ce rendez-vous.</span>
          </div>
          <div v-else class="detail">
            <strong>{{ rdv.titre }}</strong>
            <span v-if="rdv.lieu" class="aide">{{ rdv.lieu }}</span>
            <span v-if="texteRecurrence(rdv)" class="aide"><Icone nom="repeter" class="en-ligne" /> {{ texteRecurrence(rdv) }}</span>
            <span v-if="texteRappel(rdv)" class="aide"><Icone nom="cloche" class="en-ligne" /> {{ texteRappel(rdv) }}</span>
            <p v-if="rdv.notes" class="notes">{{ rdv.notes }}</p>
            <span class="aide">
              <span class="pastille" :class="rdv.visibilite">{{ libelleNiveau(rdv) }}</span>
              <span v-if="rdv.auxiliaires" class="pastille auxiliaire">Auxiliaires</span>
              <span v-if="rdv.accompagneDecede" class="pastille decede">{{ rdv.accompagnePrenom }} est {{ motDecede(genreDe(rdv.accompagneId)) }}</span>
              Ajouté par {{ rdv.deMoi ? 'vous' : (rdv.creeParPrenom ?? 'un ancien membre') }}<template v-if="rdv.creeParDecede"> ({{ motDecede(null) }})</template><template v-if="rdv.modifieParPrenom">, modifié par {{ rdv.modifieParPrenom }}</template>
            </span>
            <div v-if="suppression === rdv.cle" class="actions choix-suppression">
              <span>Supprimer :</span>
              <button class="danger" @click="confirmerSuppression(rdv, 'occurrence')">Cette date</button>
              <button class="danger" @click="confirmerSuppression(rdv, 'suivantes')">Cette date et les suivantes</button>
              <button class="danger" @click="confirmerSuppression(rdv, 'serie')">Toute la série</button>
              <button class="lien" @click="suppression = null">Annuler</button>
            </div>
            <div v-else-if="rdv.peutModifier" class="actions">
              <BoutonIcone icone="modifier" libelle="Modifier" @click="modifier(rdv)" />
              <BoutonIcone icone="effacer" libelle="Supprimer" danger @click="supprimer(rdv)" />
            </div>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.agenda { max-width: 1000px; }
.surtitre { margin: 0; }
.titre { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.ligne-champs { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; }
.intervalle { display: flex; align-items: center; gap: 6px; font-weight: normal; }
.intervalle input { width: 70px; }
.choix-suppression { align-items: center; background: #fdf0ee; border-radius: 8px; padding: 6px 10px; }
@media (max-width: 480px) { .ligne-champs { grid-template-columns: 1fr 1fr; } .ligne-champs label:first-child { grid-column: 1 / -1; } }
textarea { font: inherit; padding: 10px 12px; border: 1px solid #ccc; border-radius: 8px; resize: vertical; }
fieldset { border: 1px solid #ebe8e3; border-radius: 8px; display: flex; flex-direction: column; gap: 6px; }
legend { font-weight: 500; padding: 0 4px; }
.choix { flex-direction: row; align-items: center; gap: 8px; font-weight: normal; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.vues { display: inline-flex; background: white; border-radius: 10px; padding: 3px; margin-top: 12px; box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
.vues button { background: none; color: var(--gris); padding: 6px 16px; }
.vues button.actif { background: var(--vert); color: white; }
.prive { color: var(--gris); font-style: italic; }
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
.pastille.auxiliaire { background: #f1e8f7; color: #6b3d8a; }
.pastille.decede { background: #ebe9e5; color: #5f5d58; }
.pour-qui { margin: 2px 0 6px; padding-left: 26px; }
.pour-qui select { width: 100%; max-width: 100%; }
/* Un fieldset s'élargit par défaut à son contenu (longue liste « Pour qui ») */
fieldset { min-width: 0; }
.choix.auxiliaires { border-top: 1px solid #ebe8e3; padding-top: 8px; margin-top: 2px; }
@media (max-width: 480px) { .rdv { flex-direction: column; gap: 4px; } .heure { width: auto; } }
</style>
