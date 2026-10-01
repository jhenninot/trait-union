<script setup>
import { ref, computed, onMounted } from 'vue'
import { chargerFamille } from '../famille.js'
import { GROUPES, titreConjoint } from '../arbre.js'
import Avatar from './Avatar.vue'
import FicheFamille from './FicheFamille.vue'
import Icone from '../navigation/Icone.vue'

// « Ma famille » pour la personne accompagnée : les visages et prénoms de sa famille, rangés
// par génération quand l'arbre généalogique est rempli (« Mes enfants », « Mes petits-enfants »…).
// Toucher une personne ouvre sa fiche : lien, téléphone, âge, adresse, « À savoir ».
const personnes = ref([])
const arbres = ref([])
const charge = ref(false)
const fiche = ref(null)
// Visages plus petits sur smartphone (deux personnes par ligne)
const petit = window.matchMedia('(max-width: 600px)').matches
const taille = petit ? 88 : 120

onMounted(async () => {
  const f = await chargerFamille()
  personnes.value = f.personnes
  arbres.value = f.arbres
  charge.value = true
})

const parNaissance = (a, b) => (a.dateNaissance ?? '9999').localeCompare(b.dateNaissance ?? '9999')
const groupes = computed(() => {
  if (!arbres.value.length) return [[null, personnes.value]]
  const titres = [...GROUPES.map(([k, t]) => [k, t]), ['aide', 'Ceux qui m\'aident']]
  const liste = []
  for (const [cle, titre] of titres) {
    const ps = personnes.value.filter((p) => (p.groupe ?? 'famille') === cle || (cle === 'famille' && p.groupe === 'allies'))
    if (cle === 'allies' || !ps.length) continue
    liste.push([cle === 'conjoint' ? titreConjoint(ps) : titre, ps.sort(parNaissance)])
  }
  return liste
})
// « Mon arbre » : seulement s'il y a des enfants à montrer
const aUnArbre = computed(() => personnes.value.some((p) => p.groupe === 'enfants'))
const pastille = (p) => p.decede ? `${p.genre === 'homme' ? 'Décédé' : 'Décédée'}${p.dateDeces ? ` en ${p.dateDeces.slice(0, 4)}` : ''}` : p.lien
</script>

<template>
  <main class="famille">
    <div class="tete">
      <h1>Ma famille</h1>
      <RouterLink v-if="aUnArbre" to="/mon-arbre" class="gros-lien"><Icone nom="arbre" /> Mon arbre</RouterLink>
    </div>
    <p v-if="charge && !personnes.length" class="vide">Personne pour l'instant.</p>
    <template v-for="[titre, ps] in groupes" :key="titre ?? 'tous'">
      <h2 v-if="titre" class="groupe">{{ titre }}</h2>
      <div class="grille">
        <button v-for="p in ps" :key="p.id" type="button" class="personne" :class="{ decede: p.decede }" @click="fiche = p">
          <Avatar :src="p.avatar" :prenom="p.prenom" :taille="taille" :class="{ gris: p.decede }" />
          <span class="prenom">{{ p.prenom }}</span>
          <span v-if="p.nom && !titre" class="nom">{{ p.nom }}</span>
          <span v-if="pastille(p)" class="lien">{{ pastille(p) }}</span>
        </button>
      </div>
    </template>

    <FicheFamille v-if="fiche" :personne="fiche" @fermer="fiche = null" />
  </main>
</template>

<style scoped>
.famille { max-width: none; flex: 1; padding: 32px 24px; overflow-y: auto; }
.tete { position: relative; display: flex; justify-content: center; align-items: center; margin: 0 0 16px; min-height: 64px; }
h1 { font-size: 2.6rem; text-align: center; margin: 0; }
.gros-lien { position: absolute; right: 0; display: flex; align-items: center; gap: 10px; background: var(--vert-clair); color: var(--vert); font-weight: 700; font-size: 1.3rem; border-radius: 18px; padding: 14px 20px; text-decoration: none; }
.gros-lien .icone { font-size: 1.8rem; }
.groupe { color: var(--bleu-nuit); font-size: 1.6rem; margin: 20px 0 12px; }
.vide { font-size: 1.6rem; text-align: center; color: var(--gris); }
.grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 18px; }
.personne {
  background: white;
  color: inherit;
  border-radius: 24px;
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.08);
}
.personne.decede { background: #f6f5f3; }
.gris :deep(img) { filter: grayscale(1); opacity: 0.8; }
.prenom { font-size: 1.9rem; font-weight: 700; color: var(--bleu-nuit); }
.decede .prenom { color: var(--gris); }
.nom { font-size: 1.3rem; color: var(--gris); font-weight: 400; }
.lien { margin-top: 4px; padding: 4px 16px; border-radius: 999px; background: var(--vert-clair); color: var(--vert); font-size: 1.2rem; font-weight: 700; text-align: center; }
.decede .lien { background: #e9e7e3; color: var(--gris); }

/* Smartphone : deux personnes par ligne */
@media (max-width: 600px) {
  .famille { padding: 20px 12px; }
  .tete { flex-direction: column; gap: 10px; }
  h1 { font-size: 2rem; }
  .gros-lien { position: static; font-size: 1.1rem; padding: 10px 16px; }
  .gros-lien .icone { font-size: 1.4rem; }
  .groupe { font-size: 1.25rem; margin: 14px 0 8px; }
  .grille { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .personne { padding: 14px 6px; border-radius: 18px; }
  .prenom { font-size: 1.4rem; }
  .nom { font-size: 1.05rem; }
  .lien { font-size: 0.95rem; padding: 3px 10px; }
}
</style>
