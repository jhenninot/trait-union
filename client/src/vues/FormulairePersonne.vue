<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { api } from '../api.js'
import ChoixAvatar from './ChoixAvatar.vue'
import PhotosJeu from './PhotosJeu.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'

// Ajout, placement ou modification d'une personne de l'arbre généalogique (fenêtre des aidants).
// - ajout : `relation` = { type: 'enfant' | 'parent' | 'conjoint' | 'fratrie', de } ou null (à choisir)
// - placer : `membre` = un membre du cercle pas encore dans l'arbre
// - modif : `personne` = la fiche à modifier
const props = defineProps({
  base: { type: String, required: true }, // /cercles/<id>/arbre
  arbre: { type: Object, required: true }, // { personnes, ix, accompagnes }
  personne: { type: Object, default: null },
  relation: { type: Object, default: null },
  membre: { type: Object, default: null }
})
const emit = defineEmits(['fini', 'annuler'])

const parId = computed(() => new Map(props.arbre.personnes.map((p) => [p.id, p])))
const nomDe = (id) => parId.value.get(id)?.prenom ?? ''
const p = props.personne
const compte = Boolean(p?.compte)
// Les coordonnées d'un compte se modifient dans son profil, sauf pour une personne accompagnée
const coordonneesModifiables = !compte || p?.role === 'accompagne'

const f = reactive({
  prenom: p?.prenom ?? '',
  nom: p?.nom ?? (props.relation?.type === 'enfant' ? parId.value.get(props.relation.de)?.nom ?? '' : ''),
  genre: p?.genre ?? '',
  dateNaissance: p?.dateNaissance ?? '',
  decede: p?.decede ?? false,
  dateDeces: p?.dateDeces ?? '',
  telephone: p?.telephone ?? '',
  adresse: p?.adresse ?? '',
  aSavoir: p?.aSavoir ?? '',
  visibleAide: p?.visibleAide ?? true
})

// Lien avec une personne déjà dans l'arbre (choisi dans le formulaire si on ne part pas d'une fiche)
const lien = reactive({ type: props.relation?.type ?? 'enfant', de: props.relation?.de ?? '', autreParent: '', maries: false })
const choisirLien = !props.personne && !props.relation && props.arbre.personnes.length > 0
const autresPersonnes = computed(() => [...props.arbre.personnes].sort((a, b) => a.prenom.localeCompare(b.prenom)))
// Autre parent proposé pour un enfant : le conjoint actuel de la personne (le premier non séparé)
const conjointsDe = computed(() => lien.de ? props.arbre.ix.conjoints(lien.de) : [])
watch(() => [lien.type, lien.de], () => {
  const c = conjointsDe.value.find((x) => !x.separes) ?? conjointsDe.value[0]
  lien.autreParent = lien.type === 'enfant' && c ? c.id : ''
}, { immediate: true })

const titre = computed(() => {
  if (p) return `Modifier la fiche de ${p.prenom}`
  if (props.membre) return `Placer ${props.membre.prenom} dans l'arbre`
  if (!props.relation) return 'Ajouter une personne'
  const de = nomDe(props.relation.de)
  return {
    enfant: `Ajouter un enfant de ${de}`,
    parent: `Ajouter un parent de ${de}`,
    conjoint: `Ajouter le conjoint de ${de}`,
    fratrie: `Ajouter un frère ou une sœur de ${de}`
  }[props.relation.type]
})
const aides = computed(() => props.arbre.accompagnes.map((a) => a.prenom).join(' et ') || 'la personne accompagnée')
const avatar = ref(p ? { avatar: p.avatar, avatarChoix: p.avatarChoix } : null)
const photosJeu = ref(p?.photosJeu ?? [])
const aujourdhui = new Date().toISOString().slice(0, 10)
const erreur = ref('')
const enCours = ref(false)

async function enregistrer() {
  erreur.value = ''
  enCours.value = true
  try {
    const corps = { genre: f.genre || null, decede: f.decede, dateDeces: f.decede ? f.dateDeces : '', aSavoir: f.aSavoir, visibleAide: f.visibleAide }
    if (!compte && !props.membre) Object.assign(corps, { prenom: f.prenom, nom: f.nom })
    if (coordonneesModifiables && !props.membre) Object.assign(corps, { dateNaissance: f.dateNaissance, telephone: f.telephone, adresse: f.adresse })
    if (p) {
      await api('PUT', `${props.base}/personnes/${p.id}`, corps)
      emit('fini', p.id)
      return
    }
    if (props.membre) corps.membreId = props.membre.id
    if (lien.de) corps.relation = { type: lien.type, de: lien.de, autreParent: lien.autreParent || undefined, maries: lien.type === 'conjoint' ? lien.maries : undefined }
    const { id } = await api('POST', `${props.base}/personnes`, corps)
    emit('fini', id)
  } catch (e) {
    erreur.value = e.message
  } finally {
    enCours.value = false
  }
}
</script>

<template>
  <div class="voile" @click.self="emit('annuler')">
    <form class="fenetre carte" @submit.prevent="enregistrer">
      <div class="tete">
        <h2>{{ titre }}</h2>
        <BoutonIcone icone="fermer" libelle="Fermer" @click="emit('annuler')" />
      </div>

      <p v-if="compte" class="aide">Le prénom, le nom et les coordonnées de {{ p.prenom }} viennent de son compte{{ coordonneesModifiables ? '' : ' : elle les modifie dans « Mon profil »' }}.</p>

      <div v-if="!compte && !membre" class="deux">
        <label>Prénom <input v-model="f.prenom" required maxlength="80" autocomplete="off" /></label>
        <label>Nom <input v-model="f.nom" maxlength="80" autocomplete="off" /></label>
      </div>

      <fieldset v-if="choisirLien || membre" class="lien">
        <legend>Place dans l'arbre</legend>
        <div class="deux">
          <select v-model="lien.type" aria-label="Lien">
            <option value="enfant">Enfant de</option>
            <option value="parent">Parent de</option>
            <option value="conjoint">Conjoint de</option>
            <option value="fratrie">Frère ou sœur de</option>
          </select>
          <select v-model="lien.de" aria-label="Personne" :required="Boolean(membre) && arbre.personnes.length > 0">
            <option value="">{{ membre ? 'Choisir…' : 'Personne (sans lien pour l\'instant)' }}</option>
            <option v-for="x in autresPersonnes" :key="x.id" :value="x.id">{{ x.prenom }} {{ x.nom ?? '' }}</option>
          </select>
        </div>
      </fieldset>

      <label v-if="lien.type === 'conjoint' && lien.de && !p" class="case"><input v-model="lien.maries" type="checkbox" /> Mariés</label>

      <div class="deux">
        <div class="champ">
          <span class="libelle">Il ou elle</span>
          <div class="choix-genre" role="radiogroup" aria-label="Il ou elle">
            <button v-for="[v, t] in [['homme', 'Homme ou garçon'], ['femme', 'Femme ou fille'], ['', 'Ne pas préciser']]" :key="v"
              type="button" role="radio" :aria-checked="f.genre === v" :class="{ on: f.genre === v }" @click="f.genre = v">{{ t }}</button>
          </div>
          <span class="aide">Pour dire « petit-fils » ou « petite-fille ».</span>
        </div>
        <label v-if="lien.type === 'enfant' && lien.de && !p">Autre parent
          <select v-model="lien.autreParent">
            <option v-for="c in conjointsDe" :key="c.id" :value="c.id">{{ nomDe(c.id) }}</option>
            <option value="">Personne d'autre</option>
          </select>
        </label>
      </div>

      <div class="deux">
        <label v-if="coordonneesModifiables && !membre">Date de naissance <input v-model="f.dateNaissance" type="date" min="1800-01-01" :max="aujourdhui" /></label>
        <div v-if="!membre" class="champ">
          <label class="case"><input v-model="f.decede" type="checkbox" /> Personne décédée</label>
          <label v-if="f.decede">Date du décès <input v-model="f.dateDeces" type="date" min="1800-01-01" :max="aujourdhui" /></label>
          <span v-if="compte && f.decede && !p.decede" class="aide">Son compte sera désactivé : plus de connexion, d'alertes ni de messages. Rien n'est effacé : décochez pour annuler une erreur.</span>
          <span v-else-if="compte && !f.decede && p.decede" class="aide">Son compte sera réactivé ; {{ p.prenom }} devra se reconnecter.</span>
        </div>
      </div>

      <div v-if="coordonneesModifiables && !membre && !f.decede" class="deux">
        <label>Téléphone <input v-model="f.telephone" type="tel" maxlength="30" placeholder="Facultatif" /></label>
        <label>Adresse <textarea v-model="f.adresse" rows="2" maxlength="300" placeholder="Facultatif" /></label>
      </div>

      <label>À savoir pour {{ aides }}
        <textarea v-model="f.aSavoir" rows="2" maxlength="500" placeholder="Il adore les dinosaures. Il vous appelle « Mamie »." />
        <span class="aide">Quelques mots affichés sur sa fiche et lus à voix haute pour aider à se souvenir.</span>
      </label>
      <label class="case"><input v-model="f.visibleAide" type="checkbox" /> Montrer dans « Ma famille » de {{ aides }}</label>

      <div v-if="p && !compte" class="champ">
        <span class="libelle">Photo de contact</span>
        <ChoixAvatar :base="`${base}/personnes/${p.id}`" :avatar="avatar.avatar" :choix="avatar.avatarChoix" :prenom="f.prenom" @change="avatar = $event" />
      </div>
      <div v-if="p" class="champ">
        <span class="libelle">Photos pour les jeux</span>
        <PhotosJeu :base="`${base}/personnes/${p.id}`" :photos="photosJeu" @change="photosJeu = $event; p.photosJeu = $event" />
      </div>
      <p v-else-if="!membre" class="aide">Vous pourrez ajouter sa photo de contact et d'autres photos pour les jeux ensuite, depuis sa fiche.</p>

      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <div class="actions">
        <button type="submit" :disabled="enCours">Enregistrer</button>
        <button type="button" class="secondaire" @click="emit('annuler')">Annuler</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.voile { position: fixed; inset: 0; z-index: 60; background: rgb(35 48 90 / 0.35); display: grid; place-items: start center; overflow-y: auto; padding: 32px 16px; }
.fenetre { width: min(660px, 100%); margin: 0; padding: 22px; }
.tete { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
h2 { margin: 0; color: var(--bleu-nuit); font-size: 1.3rem; }
.deux { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; align-items: start; }
.champ { display: flex; flex-direction: column; gap: 4px; }
.libelle { font-weight: 500; }
.choix-genre { display: flex; border: 1px solid #ccc; border-radius: 8px; overflow: hidden; }
.choix-genre button { flex: 1; border-radius: 0; background: white; color: inherit; padding: 9px 4px; font-size: 0.85rem; border-left: 1px solid #ccc; }
.choix-genre button:first-child { border-left: none; }
.choix-genre button.on { background: var(--vert); color: white; }
.case { flex-direction: row; align-items: center; gap: 10px; }
.case input { width: 20px; height: 20px; }
textarea { font: inherit; padding: 10px 12px; border: 1px solid #ccc; border-radius: 8px; resize: vertical; }
fieldset.lien { border: 1px solid #e6e2db; border-radius: 10px; padding: 8px 12px 12px; margin: 0; }
legend { font-weight: 600; padding: 0 6px; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
@media (max-width: 600px) {
  .voile { padding: 0; }
  .fenetre { border-radius: 0; min-height: 100%; padding: 16px; }
  .deux { grid-template-columns: 1fr; }
}
</style>
