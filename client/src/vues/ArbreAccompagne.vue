<script setup>
import { ref, computed, onMounted } from 'vue'
import { chargerFamille } from '../famille.js'
import { index } from '../arbre.js'
import { session } from '../session.js'
import Avatar from './Avatar.vue'
import FicheFamille from './FicheFamille.vue'
import Icone from '../navigation/Icone.vue'

// « Mon arbre » de la personne accompagnée, très simple : pas de traits à suivre. Elle en haut
// (avec son conjoint), puis une colonne de couleur par enfant (« La famille de Michel »), les
// générations de haut en bas : « Mon fils », « Mon petit-fils », « Mes arrière-petits-enfants ».
const arbre = ref(null)
const charge = ref(false)
const fiche = ref(null)
const petit = window.matchMedia('(max-width: 600px)').matches
const t = petit ? 56 : 84

onMounted(async () => {
  const { arbres } = await chargerFamille()
  arbre.value = arbres[0] ?? null
  charge.value = true
})

const parId = computed(() => new Map((arbre.value?.personnes ?? []).map((p) => [p.id, p])))
const ix = computed(() => index(arbre.value?.relations ?? []))
const moi = computed(() => parId.value.get(arbre.value?.moi))
const conjoints = (id) => ix.value.conjoints(id).map((c) => parId.value.get(c.id)).filter(Boolean)
const parNaissance = (a, b) => (a.dateNaissance ?? '9999').localeCompare(b.dateNaissance ?? '9999')
const enfantsDe = (id) => ix.value.enfants(id).map((e) => parId.value.get(e)).filter(Boolean).sort(parNaissance)

const PLURIELS = { 2: 'Mes petits-enfants', 3: 'Mes arrière-petits-enfants' }
const branches = computed(() => {
  if (!moi.value) return []
  return enfantsDe(moi.value.id).map((enfant) => {
    const etages = []
    let generation = [enfant]
    let n = 1
    while (generation.length && n < 6) {
      const titre = generation.length === 1
        ? generation[0].lienAide
        : n === 1 ? 'Mes enfants' : PLURIELS[n] ?? 'Mes descendants'
      // Les petits enfants sans conjoint s'affichent ensemble sur une même ligne
      const couples = generation.map((p) => ({ personne: p, conjoints: conjoints(p.id).filter((c) => c.id !== moi.value.id) }))
      etages.push({ titre, couples })
      generation = generation.flatMap((p) => enfantsDe(p.id))
      n++
    }
    return { enfant, etages }
  })
})
const COULEURS = ['#e7f4ee', '#fdf1e3', '#e8ebf5', '#f7e8ef']
</script>

<template>
  <main class="mon-arbre">
    <div class="tete">
      <h1>Mon arbre</h1>
      <RouterLink to="/famille" class="gros-lien"><Icone nom="liste" /> Ma famille</RouterLink>
    </div>
    <p v-if="charge && !branches.length" class="vide">Votre arbre n'est pas encore rempli.</p>
    <template v-if="moi">
      <div class="moi">
        <button type="button" class="perso" @click="fiche = moi">
          <Avatar :src="moi.avatar ?? session.utilisateur.avatar" :prenom="moi.prenom" :taille="t" class="cadre-moi" />
          <strong>{{ moi.prenom }}</strong>
          <span class="badge-moi">Moi</span>
        </button>
        <template v-for="c in conjoints(moi.id)" :key="c.id">
          <span class="et">et</span>
          <button type="button" class="perso" :class="{ decede: c.decede }" @click="fiche = c">
            <Avatar :src="c.avatar" :prenom="c.prenom" :taille="t" :class="{ gris: c.decede }" />
            <strong>{{ c.prenom }}</strong>
            <span class="sous">{{ c.lienAide }}<template v-if="c.decede && (c.dateNaissance || c.dateDeces)">, {{ c.dateNaissance?.slice(0, 4) }} – {{ c.dateDeces?.slice(0, 4) }}</template></span>
          </button>
        </template>
      </div>
      <div class="branches">
        <section v-for="(b, i) in branches" :key="b.enfant.id" class="branche" :style="{ background: COULEURS[i % COULEURS.length] }">
          <h2>La famille de {{ b.enfant.prenom }}</h2>
          <template v-for="(e, j) in b.etages" :key="j">
            <p class="etage">{{ e.titre }}</p>
            <div class="rangee">
              <div v-for="c in e.couples" :key="c.personne.id" class="couple">
                <button type="button" class="perso" :class="{ decede: c.personne.decede }" @click="fiche = c.personne">
                  <Avatar :src="c.personne.avatar" :prenom="c.personne.prenom" :taille="t" :class="{ gris: c.personne.decede }" />
                  <strong>{{ c.personne.prenom }}</strong>
                </button>
                <template v-for="x in c.conjoints" :key="x.id">
                  <span class="et">et</span>
                  <button type="button" class="perso allie" :class="{ decede: x.decede }" @click="fiche = x">
                    <Avatar :src="x.avatar" :prenom="x.prenom" :taille="t" :class="{ gris: x.decede }" />
                    <strong>{{ x.prenom }}</strong>
                  </button>
                </template>
              </div>
            </div>
          </template>
        </section>
      </div>
    </template>
    <FicheFamille v-if="fiche" :personne="fiche" @fermer="fiche = null" />
  </main>
</template>

<style scoped>
.mon-arbre { max-width: none; flex: 1; padding: 24px; overflow-y: auto; }
.tete { position: relative; display: flex; justify-content: center; align-items: center; min-height: 64px; margin-bottom: 8px; }
h1 { font-size: 2.6rem; margin: 0; }
.gros-lien { position: absolute; right: 0; display: flex; align-items: center; gap: 10px; background: var(--vert-clair); color: var(--vert); font-weight: 700; font-size: 1.3rem; border-radius: 18px; padding: 14px 20px; text-decoration: none; }
.gros-lien .icone { font-size: 1.8rem; }
.vide { font-size: 1.6rem; text-align: center; color: var(--gris); }
.moi { display: flex; justify-content: center; align-items: center; gap: 18px; margin-bottom: 16px; }
.perso { background: none; color: inherit; padding: 4px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.perso strong { font-size: 1.4rem; color: var(--bleu-nuit); }
.perso.allie strong { color: #5b6280; }
.perso.decede strong { color: var(--gris); }
.cadre-moi { outline: 5px solid var(--bleu-nuit); }
.badge-moi { font-weight: 700; color: white; background: var(--bleu-nuit); border-radius: 999px; padding: 2px 16px; font-size: 1.1rem; margin-top: -4px; }
.sous { color: var(--gris); font-size: 1rem; }
.gris :deep(img) { filter: grayscale(1); opacity: 0.8; }
.et { color: var(--gris); font-size: 1.1rem; }
.branches { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }
.branche { border-radius: 24px; padding: 14px 16px 18px; display: flex; flex-direction: column; align-items: center; }
h2 { font-size: 1.4rem; color: var(--bleu-nuit); margin: 0 0 4px; text-align: center; }
.etage { color: var(--gris); font-size: 1.05rem; margin: 14px 0 6px; }
.rangee { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 24px; }
.couple { display: flex; align-items: center; gap: 12px; }
@media (max-width: 600px) {
  .mon-arbre { padding: 16px 12px; }
  .tete { flex-direction: column; gap: 10px; }
  h1 { font-size: 2rem; }
  .gros-lien { position: static; font-size: 1.1rem; padding: 10px 16px; }
  .gros-lien .icone { font-size: 1.4rem; }
  .branches { grid-template-columns: 1fr; gap: 12px; }
  .perso strong { font-size: 1.1rem; }
  h2 { font-size: 1.15rem; }
  .etage { font-size: 0.95rem; margin: 8px 0 4px; }
  .rangee { gap: 6px 14px; }
}
</style>
