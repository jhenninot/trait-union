<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import { index, disposer, dates, GROUPES } from '../arbre.js'
import { libellesRoles } from '../roles.js'
import Avatar from './Avatar.vue'
import FichePersonne from './FichePersonne.vue'
import FormulairePersonne from './FormulairePersonne.vue'
import Icone from '../navigation/Icone.vue'

// « Arbre généalogique » d'un cercle : les aidants l'administrent, les proches le consultent.
// Sur ordinateur, l'arbre entier ; sur téléphone, une branche à la fois (parents, la personne
// et son conjoint, ses enfants) ; et une vue en liste par génération.
const route = useRoute()
const router = useRouter()
const base = computed(() => `/cercles/${route.params.id}`)
const nomCercle = ref('')
const donnees = ref(null)
const erreur = ref('')
const choisie = ref(null) // personne dont la fiche est ouverte (ou au centre sur téléphone)
const vue = ref(null) // personne accompagnée depuis laquelle on lit les liens
const affichage = ref('arbre') // 'arbre' ou 'liste'
const formulaire = ref(null) // props de FormulairePersonne
const ficheOuverte = ref(false)
const historique = ref([]) // personnes centrées successivement (téléphone)

const mq = window.matchMedia('(max-width: 760px)')
const telephone = ref(mq.matches)
const suivre = (e) => (telephone.value = e.matches)
onMounted(() => mq.addEventListener('change', suivre))
onUnmounted(() => mq.removeEventListener('change', suivre))

async function charger() {
  erreur.value = ''
  try {
    const [d, c] = await Promise.all([api('GET', `${base.value}/arbre`), api('GET', base.value)])
    donnees.value = d
    nomCercle.value = c.nom
    if (!d.accompagnes.some((a) => a.id === vue.value)) vue.value = d.accompagnes[0]?.id ?? null
    if (choisie.value && !d.personnes.some((p) => p.id === choisie.value)) choisie.value = null
    if (!choisie.value) {
      const demandee = route.query.personne
      choisie.value = d.personnes.some((p) => p.id === demandee) ? demandee : (vue.value ?? d.personnes[0]?.id ?? null)
      if (demandee) ficheOuverte.value = true
    }
  } catch (e) {
    erreur.value = e.message
  }
}
watch(() => route.params.id, () => { choisie.value = null; historique.value = []; charger() }, { immediate: true })

const ix = computed(() => index(donnees.value?.relations ?? []))
const arbre = computed(() => ({ ...donnees.value, ix: ix.value }))
const parId = computed(() => new Map((donnees.value?.personnes ?? []).map((p) => [p.id, p])))
const personneChoisie = computed(() => parId.value.get(choisie.value) ?? null)
const lienDe = (p) => (vue.value && p.id !== vue.value ? p.liens?.[vue.value]?.lien : null)

// --- Ordinateur : l'arbre entier
const L = 150
const H = 172
const disposition = computed(() => donnees.value ? disposer(donnees.value.personnes, donnees.value.relations, { L, H }) : null)

// La toile défile dans les deux sens (barres de défilement ou glisser à la souris) et ramène
// la personne choisie en vue, par exemple quand la fiche s'ouvre et rétrécit la toile.
const toile = ref(null)
let glisse = null
function debutGlisse(e) {
  if (e.button !== 0 || e.pointerType !== 'mouse') return
  glisse = { x: e.clientX, y: e.clientY, l: toile.value.scrollLeft, t: toile.value.scrollTop, bouge: false }
}
function glisser(e) {
  if (!glisse) return
  const dx = e.clientX - glisse.x
  const dy = e.clientY - glisse.y
  if (!glisse.bouge && Math.hypot(dx, dy) < 6) return
  glisse.bouge = true
  toile.value.scrollLeft = glisse.l - dx
  toile.value.scrollTop = glisse.t - dy
}
function finGlisse() {
  // Un glisser ne doit pas ouvrir la fiche de la carte sous la souris
  if (glisse?.bouge) toile.value.addEventListener('click', (e) => e.stopPropagation(), { capture: true, once: true })
  glisse = null
}
async function montrer(id, centrer = false) {
  await nextTick()
  const t = toile.value
  const pos = disposition.value?.pos.get(id)
  if (!t || !pos) return
  const offset = t.querySelector('.dessin').offsetLeft
  const x = pos.x + 10 + offset
  const y = pos.y + 10
  const marge = 24
  if (centrer) {
    t.scrollLeft = x + L / 2 - t.clientWidth / 2
    t.scrollTop = 0
    return
  }
  const gauche = Math.min(t.scrollLeft, x - marge)
  t.scrollTo({
    left: Math.max(gauche, x + L + marge - t.clientWidth),
    top: Math.max(Math.min(t.scrollTop, y - marge), y + H + marge - t.clientHeight),
    behavior: 'smooth'
  })
}
watch([choisie, ficheOuverte], () => { if (ficheOuverte.value) montrer(choisie.value) })
let centre = false
watch(disposition, () => { if (!centre && disposition.value && vue.value) { centre = true; montrer(vue.value, true) } })

function choisir(id) {
  if (telephone.value && affichage.value === 'arbre' && id !== choisie.value) {
    historique.value = [...historique.value, choisie.value].filter(Boolean).slice(-4)
    choisie.value = id
    return
  }
  choisie.value = id
  ficheOuverte.value = true
}

// --- Téléphone : une branche
const branche = computed(() => {
  const id = choisie.value
  if (!id || !parId.value.has(id)) return null
  const get = (x) => parId.value.get(x)
  return {
    parents: ix.value.parents(id).map(get).filter(Boolean),
    conjoints: ix.value.conjoints(id).map((c) => get(c.id)).filter(Boolean),
    enfants: ix.value.enfants(id).map(get).filter(Boolean).sort((a, b) => (a.dateNaissance ?? '9').localeCompare(b.dateNaissance ?? '9')),
    fratrie: [...new Set(ix.value.parents(id).flatMap((q) => ix.value.enfants(q)))].filter((x) => x !== id).map(get).filter(Boolean)
  }
})
const miettes = computed(() => [...historique.value.map((id) => parId.value.get(id)).filter(Boolean), personneChoisie.value].filter(Boolean).slice(-3))
function revenir(id) {
  const i = historique.value.indexOf(id)
  historique.value = historique.value.slice(0, Math.max(0, i))
  choisie.value = id
}

// --- Liste par génération, vue depuis la personne accompagnée choisie
const liste = computed(() => {
  if (!donnees.value) return []
  const groupes = new Map()
  for (const p of donnees.value.personnes) {
    if (p.id === vue.value) continue
    const g = p.liens?.[vue.value]?.groupe ?? 'sans'
    if (!groupes.has(g)) groupes.set(g, [])
    groupes.get(g).push(p)
  }
  const titres = [...GROUPES.map(([k, , t]) => [k, t]), ['sans', 'Sans lien connu']]
  return titres.filter(([k]) => groupes.has(k)).map(([k, t]) => [t, groupes.get(k).sort((a, b) => (a.dateNaissance ?? '9').localeCompare(b.dateNaissance ?? '9'))])
})

// --- Formulaires
const ajouter = (type) => { formulaire.value = { relation: type ? { type, de: choisie.value } : null } }
const placer = (membre) => { formulaire.value = { membre } }
const modifier = () => { formulaire.value = { personne: personneChoisie.value } }
async function fini(id) {
  formulaire.value = null
  await charger()
  if (id) {
    choisie.value = id
    ficheOuverte.value = true
  }
}
</script>

<template>
  <main class="arbre-page">
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <template v-if="donnees">
      <p class="aide surtitre">{{ nomCercle }}</p>
      <div class="titre">
        <h1>{{ telephone ? 'Arbre' : 'Arbre généalogique' }}</h1>
        <div class="outils">
          <div class="bascule" role="tablist" aria-label="Affichage">
            <button type="button" role="tab" :aria-selected="affichage === 'arbre'" :class="{ on: affichage === 'arbre' }" @click="affichage = 'arbre'">
              <Icone nom="arbre" class="en-ligne" /><span v-if="!telephone"> Arbre</span></button>
            <button type="button" role="tab" :aria-selected="affichage === 'liste'" :class="{ on: affichage === 'liste' }" @click="affichage = 'liste'">
              <Icone nom="liste" class="en-ligne" /><span v-if="!telephone"> Liste</span></button>
          </div>
          <button v-if="donnees.peutGerer && !telephone" type="button" @click="ajouter(null)"><Icone nom="ajouter" class="en-ligne" /> Ajouter une personne</button>
        </div>
      </div>

      <div class="legende">
        <span><Icone nom="mobile" class="en-ligne" /> Utilise l'appli</span>
        <span><i class="carre" /> Personne accompagnée</span>
        <span><Icone nom="oeilBarre" class="en-ligne" /> Caché à l'aidé</span>
        <label v-if="donnees.accompagnes.length > 1" class="vu-depuis">Liens vus par
          <select v-model="vue"><option v-for="a in donnees.accompagnes" :key="a.id" :value="a.id">{{ a.prenom }}</option></select>
        </label>
      </div>

      <div v-if="!donnees.personnes.length" class="carte vide">
        <p><strong>L'arbre est vide.</strong></p>
        <p class="aide">Commencez par placer la personne accompagnée, puis ajoutez sa famille à partir de sa fiche : son conjoint, ses enfants, ses petits-enfants… Les jeunes enfants et ceux qui n'utilisent pas l'appli ont aussi leur fiche.</p>
        <div v-if="donnees.peutGerer" class="actions">
          <button v-for="m in donnees.nonPlaces.filter((m) => m.role === 'accompagne')" :key="m.id" type="button" @click="placer(m)">Placer {{ m.prenom }}</button>
          <button type="button" class="secondaire" @click="ajouter(null)">Ajouter une personne</button>
        </div>
      </div>

      <div v-else class="contenu" :class="{ avecFiche: ficheOuverte && personneChoisie && !telephone }">
        <div class="gauche">
          <!-- Ordinateur : arbre entier -->
          <div v-if="affichage === 'arbre' && !telephone" ref="toile" class="toile carte" @pointerdown="debutGlisse" @pointermove="glisser" @pointerup="finGlisse" @pointerleave="finGlisse">
            <div class="dessin" :style="{ width: `${disposition.largeur + 20}px`, height: `${disposition.hauteur + 20}px` }">
              <svg class="traits" :width="disposition.largeur + 20" :height="disposition.hauteur + 20" aria-hidden="true">
                <path v-for="(t, i) in disposition.traits" :key="i" :d="t.d" :class="{ separes: t.separes }" />
              </svg>
              <button
                v-for="p in donnees.personnes"
                :key="p.id"
                type="button"
                class="noeud"
                :class="{ aidee: p.role === 'accompagne', decede: p.decede, choisie: ficheOuverte && p.id === choisie }"
                :style="{ left: `${disposition.pos.get(p.id).x + 10}px`, top: `${disposition.pos.get(p.id).y + 10}px`, width: `${L}px`, height: `${H}px` }"
                @click="choisir(p.id)"
              >
                <span v-if="p.compte" class="marque" title="Utilise l'appli"><Icone nom="mobile" /></span>
                <span v-if="!p.visibleAide" class="marque cache" title="Caché à l'aidé"><Icone nom="oeilBarre" /></span>
                <Avatar :src="p.avatar" :prenom="p.prenom" :taille="52" :class="{ gris: p.decede }" />
                <strong>{{ p.prenom }}</strong>
                <span class="nom">{{ p.nom }}</span>
                <span class="dates">{{ dates(p) }}</span>
                <span v-if="p.role === 'accompagne'" class="pastille aidee">Accompagnée</span>
                <span v-else-if="lienDe(p)" class="pastille">{{ lienDe(p) }}</span>
              </button>
            </div>
          </div>

          <!-- Téléphone : une branche autour d'une personne -->
          <div v-else-if="affichage === 'arbre' && branche" class="branche">
            <div v-if="miettes.length > 1" class="miettes">
              <template v-for="(m, i) in miettes" :key="m.id">
                <Icone v-if="i" nom="suivant" class="en-ligne" />
                <button v-if="i < miettes.length - 1" type="button" class="lien" @click="revenir(m.id)">{{ m.prenom }}</button>
                <strong v-else>{{ m.prenom }}</strong>
              </template>
            </div>
            <template v-if="branche.parents.length">
              <p class="etage"><Icone nom="haut" class="en-ligne" /> Parents</p>
              <div class="rangee">
                <button v-for="p in branche.parents" :key="p.id" type="button" class="mini" :class="{ aidee: p.role === 'accompagne', decede: p.decede }" @click="choisir(p.id)">
                  <span v-if="p.compte" class="marque"><Icone nom="mobile" /></span>
                  <Avatar :src="p.avatar" :prenom="p.prenom" :taille="44" :class="{ gris: p.decede }" /><strong>{{ p.prenom }}</strong>
                  <span class="dates">{{ dates(p) }}</span><span v-if="lienDe(p)" class="pastille">{{ lienDe(p) }}</span>
                </button>
              </div>
              <div class="trait-v" />
            </template>
            <div class="rangee centre">
              <button type="button" class="mini grand choisie" :class="{ aidee: personneChoisie.role === 'accompagne', decede: personneChoisie.decede }" @click="ficheOuverte = true">
                <span v-if="personneChoisie.compte" class="marque"><Icone nom="mobile" /></span>
                <Avatar :src="personneChoisie.avatar" :prenom="personneChoisie.prenom" :taille="64" :class="{ gris: personneChoisie.decede }" />
                <strong>{{ personneChoisie.prenom }}</strong><span class="nom">{{ personneChoisie.nom }}</span>
                <span class="dates">{{ dates(personneChoisie) }}</span>
                <span v-if="personneChoisie.role === 'accompagne'" class="pastille aidee">Accompagnée</span>
                <span v-else-if="lienDe(personneChoisie)" class="pastille">{{ lienDe(personneChoisie) }}</span>
              </button>
              <template v-for="c in branche.conjoints" :key="c.id">
                <Icone nom="coeur" class="coeur" />
                <button type="button" class="mini" :class="{ aidee: c.role === 'accompagne', decede: c.decede }" @click="choisir(c.id)">
                  <span v-if="c.compte" class="marque"><Icone nom="mobile" /></span>
                  <Avatar :src="c.avatar" :prenom="c.prenom" :taille="44" :class="{ gris: c.decede }" /><strong>{{ c.prenom }}</strong>
                  <span class="dates">{{ dates(c) }}</span><span v-if="lienDe(c)" class="pastille">{{ lienDe(c) }}</span>
                </button>
              </template>
            </div>
            <template v-if="branche.enfants.length || donnees.peutGerer">
              <div class="trait-v" />
              <p class="etage"><Icone nom="bas" class="en-ligne" /> Enfants</p>
              <div class="rangee enveloppe">
                <button v-for="p in branche.enfants" :key="p.id" type="button" class="mini" :class="{ aidee: p.role === 'accompagne', decede: p.decede }" @click="choisir(p.id)">
                  <span v-if="p.compte" class="marque"><Icone nom="mobile" /></span>
                  <Avatar :src="p.avatar" :prenom="p.prenom" :taille="44" :class="{ gris: p.decede }" /><strong>{{ p.prenom }}</strong>
                  <span class="dates">{{ dates(p) }}</span><span v-if="lienDe(p)" class="pastille">{{ lienDe(p) }}</span>
                </button>
                <button v-if="donnees.peutGerer" type="button" class="mini ajout" @click="ajouter('enfant')"><Icone nom="ajouter" /><span>Ajouter un enfant</span></button>
              </div>
            </template>
            <p v-if="branche.fratrie.length" class="fratrie">
              <span class="aide">Frères et sœurs :</span>
              <button v-for="f in branche.fratrie" :key="f.id" type="button" class="puce" @click="choisir(f.id)">{{ f.prenom }}</button>
            </p>
            <p class="aide centre-txt">Touchez une personne pour voir ses parents et ses enfants.</p>
            <div class="actions">
              <button v-if="donnees.peutGerer" type="button" @click="ajouter(null)"><Icone nom="ajouter" class="en-ligne" /> Ajouter une personne</button>
              <button type="button" class="secondaire" @click="ficheOuverte = true"><Icone nom="compte" class="en-ligne" /> Fiche de {{ personneChoisie.prenom }}</button>
            </div>
          </div>

          <!-- Liste par génération -->
          <div v-else-if="affichage === 'liste'" class="liste">
            <section v-for="[titre, ps] in liste" :key="titre" class="carte">
              <h2>{{ titre }}</h2>
              <button v-for="p in ps" :key="p.id" type="button" class="ligne-personne" @click="choisir(p.id)">
                <Avatar :src="p.avatar" :prenom="p.prenom" :taille="40" :class="{ gris: p.decede }" />
                <span class="grandit"><strong>{{ p.prenom }} {{ p.nom }}</strong><span class="aide"> {{ dates(p) }}</span>
                  <span v-if="p.filiation" class="aide bloc">{{ p.filiation }}</span></span>
                <span v-if="lienDe(p)" class="pastille">{{ lienDe(p) }}</span>
                <Icone v-if="p.compte" nom="mobile" class="marque-liste" />
              </button>
            </section>
          </div>

          <section v-if="donnees.nonPlaces.length" class="carte non-places">
            <h2><Icone nom="famille" /> Pas encore dans l'arbre</h2>
            <p class="aide">Ces membres du cercle n'ont pas encore leur place dans l'arbre. Leur lien reste celui choisi à la main.</p>
            <div v-for="m in donnees.nonPlaces" :key="m.id" class="ligne-membre">
              <span class="grandit"><strong>{{ m.prenom }} {{ m.nom }}</strong>
                <span v-if="m.lien" class="pastille">{{ m.lien }}</span>
                <span class="aide bloc">{{ libellesRoles[m.role] }}</span></span>
              <button v-if="donnees.peutGerer" type="button" class="secondaire petit" @click="placer(m)">Placer dans l'arbre</button>
            </div>
            <p class="aide">Les auxiliaires de vie n'apparaissent pas dans l'arbre.</p>
          </section>
        </div>

        <div v-if="ficheOuverte && personneChoisie" class="droite" :class="{ plein: telephone }">
          <FichePersonne
            :base="base"
            :arbre="arbre"
            :personne="personneChoisie"
            :vue="vue"
            @fermer="ficheOuverte = false"
            @choisir="(id) => { choisie = id }"
            @ajouter="ajouter"
            @modifier="modifier"
            @change="charger"
          />
        </div>
      </div>
    </template>

    <FormulairePersonne v-if="formulaire" :base="`${base}/arbre`" :arbre="arbre" v-bind="formulaire" @fini="fini" @annuler="formulaire = null" />
  </main>
</template>

<style scoped>
.arbre-page { max-width: none; padding: 24px 28px; }
.surtitre { margin: 0; }
.titre { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.titre h1 { margin: 4px 0; }
.outils { display: flex; gap: 12px; align-items: center; }
.bascule { display: inline-flex; background: #efece6; border-radius: 10px; padding: 3px; }
.bascule button { background: none; color: var(--gris); padding: 6px 12px; font-size: 0.9rem; }
.bascule button.on { background: white; color: var(--vert); font-weight: 600; box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
.legende { display: flex; gap: 18px; color: var(--gris); font-size: 0.85rem; align-items: center; flex-wrap: wrap; margin: 8px 0 12px; }
.carre { display: inline-block; width: 14px; height: 14px; border-radius: 4px; border: 3px solid var(--bleu-nuit); vertical-align: -2px; }
.vu-depuis { flex-direction: row; align-items: center; gap: 8px; margin-left: auto; font-weight: 400; }
.vu-depuis select { padding: 4px 8px; }
.vide .actions, .actions { display: flex; gap: 10px; flex-wrap: wrap; }
.contenu { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; }
.contenu.avecFiche { grid-template-columns: minmax(0, 1fr) 340px; }
.droite { position: sticky; top: 16px; }
.toile { position: relative; overflow: auto; padding: 0; margin: 0 0 16px; max-height: calc(100vh - 170px); cursor: grab; }
.toile:active { cursor: grabbing; }
.dessin { position: relative; margin: 0 auto; }
.traits { position: absolute; left: 10px; top: 10px; }
.traits path { fill: none; stroke: #c9c4bb; stroke-width: 2; }
.traits path.separes { stroke-dasharray: 6 5; }
.noeud {
  position: absolute;
  background: var(--fond);
  color: inherit;
  border: 1px solid #ebe8e3;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-align: center;
  padding: 8px 6px;
}
.noeud:hover { border-color: var(--vert); }
.noeud strong { color: var(--bleu-nuit); margin-top: 6px; }
.nom { font-size: 0.8rem; color: var(--gris); }
.dates { font-size: 0.8rem; color: var(--gris); margin-bottom: 4px; }
.pastille { background: var(--vert-clair); color: var(--vert); border-radius: 999px; padding: 1px 10px; font-size: 0.78rem; font-weight: 600; }
.noeud .pastille { max-width: 100%; font-size: 0.74rem; line-height: 1.25; padding: 1px 8px; }
.pastille.aidee { background: var(--bleu-nuit); color: white; }
.noeud.aidee, .mini.aidee { border: 3px solid var(--bleu-nuit); background: white; }
.noeud.decede, .mini.decede { background: #f3f2f0; }
.noeud.decede strong, .mini.decede strong { color: var(--gris); }
.noeud.choisie { outline: 3px solid var(--vert); outline-offset: 2px; background: white; }
.gris :deep(img) { filter: grayscale(1); opacity: 0.8; }
.marque { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border-radius: 50%; background: var(--vert-clair); color: var(--vert); display: grid; place-items: center; }
.marque :deep(.icone) { width: 15px; height: 15px; }
.marque.cache { left: 8px; right: auto; background: #e7e5e1; color: var(--gris); }
.non-places h2, .liste h2 { font-size: 1.05rem; color: var(--bleu-nuit); margin: 0 0 6px; display: flex; gap: 10px; align-items: center; }
.ligne-membre { display: flex; gap: 12px; align-items: center; padding: 8px 0; }
.grandit { flex: 1; min-width: 0; }
.bloc { display: block; }
button.petit { padding: 7px 12px; font-size: 0.88rem; }
.ligne-personne { display: flex; gap: 12px; align-items: center; width: 100%; background: none; color: inherit; text-align: left; padding: 8px 0; border-radius: 0; border-top: 1px solid #f1eee9; }
.ligne-personne:first-of-type { border-top: none; }
.marque-liste { color: var(--vert); }
/* Téléphone */
.branche { display: flex; flex-direction: column; align-items: stretch; }
.miettes { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; color: var(--gris); }
.miettes strong { color: var(--bleu-nuit); }
.etage { color: var(--gris); font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em; margin: 8px 0 6px; text-align: center; }
.rangee { display: flex; gap: 10px; justify-content: center; align-items: center; }
.rangee.enveloppe { flex-wrap: wrap; }
.mini { position: relative; background: white; color: inherit; border: 1px solid #ebe8e3; border-radius: 14px; width: 108px; padding: 10px 4px; display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; }
.mini strong { color: var(--bleu-nuit); margin-top: 4px; }
.mini .pastille { font-size: 0.68rem; padding: 1px 6px; }
.mini .marque { top: 5px; right: 5px; width: 22px; height: 22px; }
.mini.grand { width: 150px; padding: 12px 6px; }
.mini.choisie { outline: 3px solid var(--vert); outline-offset: 1px; }
.mini.ajout { border: 2px dashed #b8dccb; color: var(--vert); justify-content: center; min-height: 120px; font-size: 0.8rem; gap: 6px; background: transparent; }
.coeur { color: #d0707a; }
.trait-v { width: 2px; height: 18px; background: #c9c4bb; margin: 4px auto; }
.fratrie { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: center; margin: 12px 0 0; }
.puce { padding: 3px 10px; border-radius: 999px; background: #f3f0ea; color: var(--bleu-nuit); font-size: 0.88rem; }
.centre-txt { text-align: center; }
.droite.plein { position: fixed; inset: 0; z-index: 55; overflow-y: auto; background: var(--fond); padding: 12px; }
@media (max-width: 760px) {
  .arbre-page { padding: 16px; }
  .legende { display: none; }
  .actions button { flex: 1; }
}
</style>
