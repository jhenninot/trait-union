<script setup>
import { ref, computed } from 'vue'
import { api } from '../api.js'
import Icone from '../navigation/Icone.vue'

// Administration : statistiques d'utilisation de toute l'application (reprises de la console
// Super Admin de FamilyGest et adaptées aux modules de Trait d'union). Uniquement des nombres
// calculés par le serveur (server/statistiques.js), aucun contenu ni donnée personnelle.
const stats = ref(null)
const erreur = ref('')
const occupe = ref(false)

async function charger() {
  occupe.value = true
  erreur.value = ''
  try {
    stats.value = await api('GET', '/admin/statistiques')
  } catch (e) {
    erreur.value = e.message
  } finally {
    occupe.value = false
  }
}
charger()

// --- Mise en forme

const nombre = (n) => new Intl.NumberFormat('fr-FR').format(n ?? 0)
const pluriel = (n, un, plusieurs = `${un}s`) => `${nombre(n)} ${n > 1 ? plusieurs : un}`
function octets(n) {
  if (!n) return '0 Mo'
  const unites = ['octets', 'Ko', 'Mo', 'Go', 'To']
  const i = Math.min(unites.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: i >= 3 ? 2 : 1 }).format(n / 1024 ** i)} ${unites[i]}`
}
const jourCourt = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const dateLongue = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
function ilYA(d) {
  if (!d) return 'Jamais'
  const jours = Math.floor((Date.now() - new Date(d)) / 86400000)
  if (jours <= 0) return 'Aujourd\'hui'
  if (jours === 1) return 'Hier'
  if (jours < 60) return `Il y a ${jours} jours`
  return `Le ${dateLongue(d)}`
}
const enSommeil = (c) => !c.derniereActivite || Date.now() - new Date(c.derniereActivite) > 30 * 86400000
const pourcent = (n, total) => (total ? `${Math.round((n / total) * 100)} %` : '')

// --- Tuiles

const ajouts30 = computed(() => {
  const m = stats.value?.modules
  return m ? m.agenda.n30 + m.photos.n30 + m.albums.n30 + m.arbre.n30 : 0
})

// --- Activité par semaine (barres empilées en SVG)

const SERIES = [
  { cle: 'agenda', nom: 'Rendez-vous', couleur: '#2f8f6b' },
  { cle: 'photos', nom: 'Photos et albums', couleur: '#4a63b5' },
  { cle: 'arbre', nom: 'Arbre généalogique', couleur: '#d9822b' },
  { cle: 'voix', nom: 'Commandes vocales', couleur: '#a35ca8' }
]
const L = 720
const H = 220
const MARGE = { haut: 22, bas: 26, gauche: 8, droite: 8 }
const survol = ref(null) // index de la semaine sous le pointeur

const graphe = computed(() => {
  const semaines = stats.value?.semaines ?? []
  const max = Math.max(1, ...semaines.map((s) => s.total))
  const pas = (L - MARGE.gauche - MARGE.droite) / Math.max(1, semaines.length)
  const largeur = Math.min(40, pas * 0.62)
  const hauteurUtile = H - MARGE.haut - MARGE.bas
  return semaines.map((s, i) => {
    const x = MARGE.gauche + i * pas + (pas - largeur) / 2
    let y = H - MARGE.bas
    const segments = []
    for (const serie of SERIES) {
      const h = (s[serie.cle] / max) * hauteurUtile
      if (h > 0) {
        y -= h
        // 2 px de fond entre deux segments empilés
        segments.push({ ...serie, x, y: y + 1, h: Math.max(1, h - 2), valeur: s[serie.cle] })
      }
    }
    return { ...s, i, x, largeur, pas, haut: y, colonneX: MARGE.gauche + i * pas, segments }
  })
})
const semaineSurvolee = computed(() => (survol.value === null ? null : graphe.value[survol.value]))

// --- Utilisation par module (30 jours, tendance, cercles)

const MODULES = [
  { cle: 'agenda', nom: 'Rendez-vous ajoutés', icone: 'agenda' },
  { cle: 'photos', nom: 'Photos partagées', icone: 'photo' },
  { cle: 'albums', nom: 'Albums créés', icone: 'albums' },
  { cle: 'arbre', nom: 'Personnes ajoutées à l\'arbre', icone: 'arbre' },
  { cle: 'invitations', nom: 'Invitations envoyées', icone: 'email' },
  { cle: 'messages', nom: 'Messages envoyés', icone: 'message' },
  { cle: 'voix', nom: 'Commandes vocales', icone: 'micro' },
  { cle: 'jeux', nom: 'Parties de jeux', icone: 'jeux' },
  { cle: 'alertes', nom: 'Alertes reçues', icone: 'cloche', sansCercle: true }
]
const lignesModules = computed(() => {
  const m = stats.value?.modules ?? {}
  const lignes = MODULES.map((x) => ({ ...x, ...(m[x.cle] ?? { n30: 0, avant: 0, cercles: 0 }) }))
  const max = Math.max(1, ...lignes.filter((l) => !l.sansCercle).map((l) => l.n30))
  return lignes.map((l) => ({ ...l, largeur: l.n30 ? Math.max(2, Math.min(100, (l.n30 / max) * 100)) : 0 }))
})
function tendance(l) {
  if (!l.avant && !l.n30) return { sens: 'stable', texte: '–' }
  if (!l.avant) return { sens: 'hausse', texte: 'Nouveau' }
  const p = Math.round(((l.n30 - l.avant) / l.avant) * 100)
  if (p === 0) return { sens: 'stable', texte: '=' }
  return { sens: p > 0 ? 'hausse' : 'baisse', texte: `${p > 0 ? '+' : ''}${p} %` }
}

// --- Rôles

const ROLES = [
  { cle: 'accompagne', nom: 'Personnes accompagnées', icone: 'coeur' },
  { cle: 'aidant', nom: 'Aidants', icone: 'bouclier' },
  { cle: 'superviseur', nom: 'Superviseurs techniques', icone: 'bouclier' },
  { cle: 'proche', nom: 'Proches', icone: 'famille' },
  { cle: 'auxiliaire', nom: 'Auxiliaires de vie', icone: 'compte' }
]

// --- Versions de l'application Android

const versions = computed(() => {
  const a = stats.value?.appareils
  if (!a) return []
  const max = Math.max(1, ...a.versions.map((v) => v.n))
  const derniere = a.derniereApk?.version
  return a.versions.map((v) => ({
    ...v,
    libelle: v.version ? `Version ${v.version}` : 'Sans numéro',
    aJour: derniere ? v.version >= derniere : null,
    largeur: Math.max(4, (v.n / max) * 100)
  }))
})
const appareilsAJour = computed(() => versions.value.filter((v) => v.aJour).reduce((s, v) => s + v.n, 0))

// --- Cercles

const tri = ref('activite')
const cercles = computed(() => {
  const liste = [...(stats.value?.cercles ?? [])]
  const date = (c) => (c.derniereActivite ? new Date(c.derniereActivite).getTime() : 0)
  const total = (c) => Object.values(c.membres).reduce((s, n) => s + n, 0)
  if (tri.value === 'activite') liste.sort((a, b) => date(b) - date(a))
  if (tri.value === 'membres') liste.sort((a, b) => total(b) - total(a))
  if (tri.value === 'photos') liste.sort((a, b) => b.volume - a.volume)
  if (tri.value === 'nom') liste.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  return liste
})
const cerclesEnSommeil = computed(() => (stats.value?.cercles ?? []).filter(enSommeil).length)
</script>

<template>
  <main class="statistiques">
    <div class="entete">
      <div>
        <h1>Statistiques</h1>
        <p class="aide" v-if="stats">
          Toute l'application, calculées le {{ dateLongue(stats.calculeLe) }} à {{ heure(stats.calculeLe) }}.
          Uniquement des nombres : aucun contenu ni donnée personnelle.
        </p>
      </div>
      <button class="secondaire" :disabled="occupe" @click="charger">Actualiser</button>
    </div>

    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <p v-if="!stats && !erreur" class="aide">Calcul des statistiques…</p>

    <template v-if="stats">
      <!-- Vue d'ensemble -->
      <section class="tuiles">
        <div class="tuile">
          <span class="valeur">{{ nombre(stats.cerclesActifs) }}<small> / {{ nombre(stats.cerclesTotal) }}</small></span>
          <span class="libelle"><Icone nom="cercle" class="en-ligne" /> Cercles actifs sur 30 jours</span>
          <span class="detail" v-if="cerclesEnSommeil">{{ pluriel(cerclesEnSommeil, 'cercle') }} en sommeil</span>
        </div>
        <div class="tuile">
          <span class="valeur">{{ nombre(stats.comptes.actifs30) }}<small> / {{ nombre(stats.comptes.total) }}</small></span>
          <span class="libelle"><Icone nom="famille" class="en-ligne" /> Utilisateurs actifs sur 30 jours</span>
          <span class="detail">{{ nombre(stats.comptes.actifs7) }} cette semaine</span>
        </div>
        <div class="tuile">
          <span class="valeur">{{ nombre(ajouts30) }}</span>
          <span class="libelle"><Icone nom="ajouter" class="en-ligne" /> Ajouts sur 30 jours</span>
          <span class="detail">Rendez-vous, photos, albums, arbre</span>
        </div>
        <div class="tuile">
          <span class="valeur">{{ octets(stats.photos.volume) }}</span>
          <span class="libelle"><Icone nom="nuage" class="en-ligne" /> Photos stockées</span>
          <span class="detail">{{ pluriel(stats.photos.total, 'photo') }} · +{{ octets(stats.photos.volume30) }} en 30 jours</span>
        </div>
        <div class="tuile">
          <span class="valeur">{{ nombre(stats.voix.n30) }}</span>
          <span class="libelle"><Icone nom="micro" class="en-ligne" /> Commandes vocales sur 30 jours</span>
          <span class="detail">{{ pluriel(stats.voix.cercles, 'cercle') }} · {{ nombre(stats.voix.n7) }} cette semaine</span>
        </div>
        <div class="tuile">
          <span class="valeur">{{ nombre(stats.alertes.recues30) }}</span>
          <span class="libelle"><Icone nom="cloche" class="en-ligne" /> Alertes reçues sur 30 jours</span>
          <span class="detail">{{ pluriel(stats.alertes.appareils.web + stats.alertes.appareils.android, 'appareil inscrit', 'appareils inscrits') }}</span>
        </div>
      </section>

      <!-- Activité par semaine -->
      <section class="carte bloc">
        <div class="titre-bloc">
          <h2><Icone nom="statistiques" /> Activité des 12 dernières semaines</h2>
          <span class="aide">Éléments ajoutés et commandes vocales, par semaine</span>
        </div>
        <ul class="legende">
          <li v-for="s in SERIES" :key="s.cle"><span class="pastille" :style="{ background: s.couleur }" /> {{ s.nom }}</li>
        </ul>
        <div class="graphe">
          <svg :viewBox="`0 0 ${L} ${H}`" role="img" aria-label="Activité par semaine, barres empilées par module" @mouseleave="survol = null">
            <line :x1="MARGE.gauche" :x2="L - MARGE.droite" :y1="H - MARGE.bas" :y2="H - MARGE.bas" class="axe" />
            <g v-for="s in graphe" :key="s.i" @mouseenter="survol = s.i" @focus="survol = s.i" tabindex="0">
              <rect :x="s.colonneX" :y="0" :width="s.pas" :height="H" class="zone" :class="{ active: survol === s.i }" />
              <rect v-for="seg in s.segments" :key="seg.cle" :x="seg.x" :y="seg.y" :width="s.largeur" :height="seg.h" :fill="seg.couleur" rx="2" />
              <text v-if="s.total" :x="s.x + s.largeur / 2" :y="s.haut - 6" class="valeur-barre">{{ s.total }}</text>
              <text :x="s.x + s.largeur / 2" :y="H - 8" class="date-barre" :class="{ secondaire: s.i % 3 !== 2 }">{{ jourCourt(s.debut) }}</text>
            </g>
          </svg>
          <div v-if="semaineSurvolee" class="info-bulle"
            :style="{ left: `${((semaineSurvolee.colonneX + semaineSurvolee.pas / 2) / L) * 100}%` }">
            <strong>Semaine du {{ jourCourt(semaineSurvolee.debut) }}</strong>
            <span v-for="serie in SERIES" :key="serie.cle"><span class="pastille" :style="{ background: serie.couleur }" /> {{ serie.nom }} : {{ semaineSurvolee[serie.cle] }}</span>
          </div>
        </div>
      </section>

      <!-- Utilisation par module -->
      <section class="carte bloc">
        <div class="titre-bloc">
          <h2><Icone nom="liste" /> Utilisation par module</h2>
          <span class="aide">30 derniers jours, comparés aux 30 jours d'avant</span>
        </div>
        <div class="tableau-modules" role="table">
          <div class="ligne-module tete" role="row">
            <span role="columnheader">Module</span>
            <span role="columnheader" class="barre-cellule" />
            <span role="columnheader" class="nb">30 jours</span>
            <span role="columnheader" class="nb">Tendance</span>
            <span role="columnheader" class="nb">Cercles</span>
          </div>
          <div v-for="l in lignesModules" :key="l.cle" class="ligne-module" role="row">
            <span role="cell" class="nom-module"><Icone :nom="l.icone" /> {{ l.nom }}</span>
            <span role="cell" class="barre-cellule"><span class="piste"><span class="barre" :style="{ width: `${l.largeur}%` }" /></span></span>
            <span role="cell" class="nb fort">{{ nombre(l.n30) }}</span>
            <span role="cell" class="nb tendance" :class="tendance(l).sens">
              <Icone v-if="tendance(l).sens !== 'stable'" :nom="tendance(l).sens" class="en-ligne" /> {{ tendance(l).texte }}
            </span>
            <span role="cell" class="nb">
              <template v-if="l.sansCercle">–</template>
              <template v-else>{{ l.cercles }} / {{ stats.cerclesTotal }} <small class="aide pourcent">{{ pourcent(l.cercles, stats.cerclesTotal) }}</small></template>
            </span>
          </div>
        </div>
      </section>

      <!-- Comptes et rôles -->
      <section class="carte bloc">
        <div class="titre-bloc">
          <h2><Icone nom="famille" /> Comptes et rôles</h2>
          <span class="aide">Une personne présente dans plusieurs cercles compte une fois par rôle</span>
        </div>
        <div class="roles">
          <div v-for="r in ROLES" :key="r.cle" class="role">
            <Icone :nom="r.icone" />
            <div>
              <strong>{{ nombre(stats.roles[r.cle].comptes) }}</strong> {{ r.nom.toLowerCase() }}
              <span class="aide">{{ nombre(stats.roles[r.cle].actifs30) }} actifs sur 30 jours</span>
            </div>
            <span class="piste petite"><span class="barre" :style="{ width: pourcent(stats.roles[r.cle].actifs30, stats.roles[r.cle].comptes) || '0' }" /></span>
          </div>
        </div>
        <dl class="faits">
          <div><dt>Nouveaux comptes (30 jours)</dt><dd>{{ nombre(stats.comptes.nouveaux30) }}</dd></div>
          <div><dt>Administrateurs</dt><dd>{{ nombre(stats.comptes.admins) }}</dd></div>
          <div><dt>Connexion avec Google</dt><dd>{{ nombre(stats.comptes.google) }}</dd></div>
          <div><dt>Comptes sans cercle</dt><dd>{{ nombre(stats.comptes.sansCercle) }}</dd></div>
          <div><dt>Avatar choisi</dt><dd>{{ nombre(stats.comptes.avatars) }} <small>{{ pourcent(stats.comptes.avatars, stats.comptes.total) }}</small></dd></div>
          <div><dt>Téléphone renseigné</dt><dd>{{ nombre(stats.comptes.telephones) }} <small>{{ pourcent(stats.comptes.telephones, stats.comptes.total) }}</small></dd></div>
          <div><dt>Invitations en attente</dt><dd>{{ nombre(stats.invitations.enAttente) }}</dd></div>
          <div><dt>Invitations acceptées (30 jours)</dt><dd>{{ nombre(stats.invitations.acceptees30) }} / {{ nombre(stats.invitations.envoyees30) }}</dd></div>
          <div v-if="stats.invitations.expirees"><dt>Invitations expirées</dt><dd>{{ nombre(stats.invitations.expirees) }}</dd></div>
          <div v-if="stats.comptes.desactives"><dt>Comptes désactivés</dt><dd>{{ nombre(stats.comptes.desactives) }}</dd></div>
        </dl>
      </section>

      <!-- Appareils et application mobile -->
      <section class="carte bloc">
        <div class="titre-bloc">
          <h2><Icone nom="mobile" /> Appareils et application mobile</h2>
          <span class="aide">Connexions en cours</span>
        </div>
        <dl class="faits">
          <div><dt>Appareils des personnes accompagnées</dt><dd>{{ nombre(stats.appareils.parType.appareil.n) }}</dd></div>
          <div><dt>Connexions des aidants et proches</dt><dd>{{ nombre(stats.appareils.parType.mot_de_passe.n + stats.appareils.parType.google.n) }}</dd></div>
          <div><dt>Navigateur ou PWA</dt><dd>{{ nombre(stats.appareils.navigateur) }}</dd></div>
          <div><dt>Application Android</dt><dd>{{ nombre(stats.appareils.apk) }}</dd></div>
          <div><dt>Codes d'appareil créés (30 jours)</dt><dd>{{ nombre(stats.appareils.codesCrees30) }}</dd></div>
          <div><dt>Codes d'appareil utilisés (30 jours)</dt><dd>{{ nombre(stats.appareils.codesUtilises30) }}</dd></div>
        </dl>
        <template v-if="versions.length">
          <h3>Versions de l'application Android installées</h3>
          <p class="aide" v-if="stats.appareils.derniereApk">
            Dernière version publiée : {{ stats.appareils.derniereApk.nom }} ({{ stats.appareils.derniereApk.version }}).
            {{ nombre(appareilsAJour) }} sur {{ nombre(stats.appareils.apk) }} à jour.
          </p>
          <ul class="versions">
            <li v-for="v in versions" :key="v.version">
              <span class="nom-version">{{ v.libelle }}</span>
              <span class="piste"><span class="barre" :class="{ ancienne: v.aJour === false }" :style="{ width: `${v.largeur}%` }" /></span>
              <span class="nb fort">{{ v.n }}</span>
              <span class="etat-version" :class="{ ancienne: v.aJour === false }">
                <template v-if="v.aJour === true"><Icone nom="coche" class="en-ligne" /> À jour</template>
                <template v-else-if="v.aJour === false"><Icone nom="attention" class="en-ligne" /> À mettre à jour</template>
              </span>
            </li>
          </ul>
        </template>
      </section>

      <!-- Détail des modules -->
      <section class="modules">
        <div class="carte module">
          <h2><Icone nom="agenda" /> Agenda</h2>
          <dl>
            <div><dt>Rendez-vous</dt><dd>{{ nombre(stats.agenda.total) }}</dd></div>
            <div><dt>À venir ou répétés</dt><dd>{{ nombre(stats.agenda.aVenir) }}</dd></div>
            <div><dt>Répétés</dt><dd>{{ nombre(stats.agenda.repetes) }}</dd></div>
            <div><dt>Avec un rappel</dt><dd>{{ nombre(stats.agenda.rappels) }}</dd></div>
            <div><dt>Ouverts aux auxiliaires</dt><dd>{{ nombre(stats.agenda.auxiliaires) }}</dd></div>
          </dl>
          <p class="sous-titre">Qui les voit</p>
          <div class="repartition" role="img" :aria-label="`Tout le cercle ${stats.agenda.tous}, aidants ${stats.agenda.aidants}, accompagné ${stats.agenda.accompagne}, accompagné et aidants ${stats.agenda.accompagneAidants}`">
            <span v-for="(v, i) in [stats.agenda.tous, stats.agenda.aidants, stats.agenda.accompagne, stats.agenda.accompagneAidants]" :key="i"
              :style="{ flex: v, background: SERIES[i].couleur }" :title="v" />
          </div>
          <ul class="legende petite">
            <li><span class="pastille" :style="{ background: SERIES[0].couleur }" /> Tout le cercle {{ stats.agenda.tous }}</li>
            <li><span class="pastille" :style="{ background: SERIES[1].couleur }" /> Aidants {{ stats.agenda.aidants }}</li>
            <li><span class="pastille" :style="{ background: SERIES[2].couleur }" /> Accompagné {{ stats.agenda.accompagne }}</li>
            <li><span class="pastille" :style="{ background: SERIES[3].couleur }" /> Accompagné et aidants {{ stats.agenda.accompagneAidants }}</li>
          </ul>
        </div>

        <div class="carte module">
          <h2><Icone nom="photo" /> Photos</h2>
          <dl>
            <div><dt>Photos</dt><dd>{{ nombre(stats.photos.total) }}</dd></div>
            <div><dt>Volume chez OVHcloud</dt><dd>{{ octets(stats.photos.volume) }}</dd></div>
            <div><dt>Taille moyenne</dt><dd>{{ stats.photos.total ? octets(stats.photos.volume / stats.photos.total) : '–' }}</dd></div>
            <div><dt>Albums</dt><dd>{{ nombre(stats.photos.albums) }}</dd></div>
            <div><dt>Photos sans album</dt><dd>{{ nombre(stats.photos.sansAlbum) }}</dd></div>
            <div><dt>Cercles qui partagent des photos</dt><dd>{{ stats.photos.cercles }} / {{ stats.cerclesTotal }}</dd></div>
            <div v-if="stats.photos.inacheves"><dt>Envois inachevés</dt><dd>{{ nombre(stats.photos.inacheves) }}</dd></div>
          </dl>
        </div>

        <div class="carte module">
          <h2><Icone nom="cloche" /> Alertes</h2>
          <dl>
            <div><dt>Appareils inscrits (navigateur, PWA)</dt><dd>{{ nombre(stats.alertes.appareils.web) }}</dd></div>
            <div><dt>Appareils inscrits (Android)</dt><dd>{{ nombre(stats.alertes.appareils.android) }}</dd></div>
            <div><dt>Comptes qui reçoivent des alertes</dt><dd>{{ nombre(stats.alertes.comptes) }} <small>{{ pourcent(stats.alertes.comptes, stats.comptes.total) }}</small></dd></div>
            <div><dt>Alertes reçues (30 jours)</dt><dd>{{ nombre(stats.alertes.recues30) }}</dd></div>
            <div><dt>Rappels de rendez-vous (30 jours)</dt><dd>{{ nombre(stats.alertes.rappels30) }}</dd></div>
            <div><dt>Comptes qui ont coupé une catégorie</dt><dd>{{ nombre(stats.alertes.reglages) }}</dd></div>
          </dl>
        </div>

        <div class="carte module">
          <h2><Icone nom="gateau" /> Anniversaires</h2>
          <dl>
            <div><dt>Comptes avec une date de naissance</dt><dd>{{ nombre(stats.anniversaires.comptes) }} <small>{{ pourcent(stats.anniversaires.comptes, stats.comptes.total) }}</small></dd></div>
            <div><dt>Personnes sans compte avec une date</dt><dd>{{ nombre(stats.anniversaires.sansCompte) }}</dd></div>
            <div><dt>Anniversaires ce mois-ci (comptes)</dt><dd>{{ nombre(stats.anniversaires.ceMois) }}</dd></div>
            <div><dt>Anniversaires fêtés en {{ stats.anniversaires.annee }}</dt><dd>{{ nombre(stats.anniversaires.fetes) }}</dd></div>
          </dl>
        </div>

        <div class="carte module">
          <h2><Icone nom="arbre" /> Arbre généalogique</h2>
          <dl>
            <div><dt>Personnes dans les arbres</dt><dd>{{ nombre(stats.arbre.total) }}</dd></div>
            <div><dt>Dont sans compte</dt><dd>{{ nombre(stats.arbre.sansCompte) }}</dd></div>
            <div><dt>Dont défunts</dt><dd>{{ nombre(stats.arbre.defunts) }}</dd></div>
            <div><dt>Liens (parents, couples)</dt><dd>{{ nombre(stats.arbre.liens) }}</dd></div>
            <div><dt>Fiches avec « À savoir »</dt><dd>{{ nombre(stats.arbre.aSavoir) }}</dd></div>
            <div><dt>Cercles avec un arbre</dt><dd>{{ stats.arbre.cercles }} / {{ stats.cerclesTotal }}</dd></div>
          </dl>
        </div>

        <div class="carte module">
          <h2><Icone nom="jeux" /> Jeux</h2>
          <dl>
            <div><dt>Parties (7 jours)</dt><dd>{{ nombre(stats.jeux.n7) }}</dd></div>
            <div><dt>Parties (30 jours)</dt><dd>{{ nombre(stats.jeux.n30) }}</dd></div>
            <div><dt>Cercles qui y jouent</dt><dd>{{ stats.jeux.cercles }} / {{ stats.cerclesTotal }}</dd></div>
            <div><dt>Dernière partie</dt><dd>{{ ilYA(stats.jeux.derniere) }}</dd></div>
          </dl>
          <p class="aide note">« Qui est-ce ? » et « Quel âge ? » : une partie est comptée au démarrage, rien d'autre n'est retenu.</p>
        </div>

        <div class="carte module">
          <h2><Icone nom="micro" /> Voix</h2>
          <dl>
            <div><dt>Commandes (7 jours)</dt><dd>{{ nombre(stats.voix.n7) }}</dd></div>
            <div><dt>Commandes (30 jours)</dt><dd>{{ nombre(stats.voix.n30) }}</dd></div>
            <div><dt>Cercles qui s'en servent</dt><dd>{{ stats.voix.cercles }} / {{ stats.cerclesTotal }}</dd></div>
            <div><dt>Dernière utilisation</dt><dd>{{ ilYA(stats.voix.derniere) }}</dd></div>
          </dl>
          <p class="aide note">Lecture à voix haute et commandes, comptées à partir de cette version.</p>
        </div>

        <div class="carte module">
          <h2><Icone nom="oeil" /> Page de présentation</h2>
          <dl>
            <div><dt>État</dt><dd>{{ stats.presentation.actif ? 'En ligne' : 'Désactivée' }}</dd></div>
            <div><dt>Visites (30 jours)</dt><dd>{{ nombre(stats.presentation.n30) }}</dd></div>
            <div><dt>Visites au total</dt><dd>{{ nombre(stats.presentation.visites) }}</dd></div>
            <div v-if="stats.presentation.depuis"><dt>Comptées depuis le</dt><dd>{{ dateLongue(stats.presentation.depuis) }}</dd></div>
            <div><dt>Dernière visite</dt><dd>{{ ilYA(stats.presentation.derniere) }}</dd></div>
          </dl>
        </div>
      </section>

      <!-- Par cercle -->
      <section class="carte bloc">
        <div class="titre-bloc">
          <h2><Icone nom="cercle" /> Par cercle</h2>
          <label class="tri">
            Trier par
            <select v-model="tri">
              <option value="activite">Dernière activité</option>
              <option value="membres">Nombre de membres</option>
              <option value="photos">Volume de photos</option>
              <option value="nom">Nom</option>
            </select>
          </label>
        </div>
        <table class="table-cercles">
          <thead>
            <tr>
              <th>Cercle</th>
              <th title="Accompagnés · aidants · proches · auxiliaires">Membres</th>
              <th class="nb">Actifs 30 j</th>
              <th>Dernière activité</th>
              <th class="nb">Photos</th>
              <th class="nb">Rendez-vous 30 j</th>
              <th class="nb">Arbre</th>
              <th class="nb">Voix 30 j</th>
              <th class="nb">Appareils de l'aidé</th>
              <th class="nb">Invitations</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in cercles" :key="c.id">
              <td class="nom-cercle">
                <RouterLink :to="`/cercles/${c.id}`">{{ c.nom }}</RouterLink>
                <span class="aide">Créé le {{ dateLongue(c.creeLe) }}</span>
              </td>
              <td data-label="Membres">
                <span class="membres">
                  <span title="Personnes accompagnées"><Icone nom="coeur" class="en-ligne" /> {{ c.membres.accompagne }}</span>
                  <span title="Aidants"><Icone nom="bouclier" class="en-ligne" /> {{ c.membres.aidant }}</span>
                  <span v-if="c.membres.superviseur" title="Superviseurs techniques"><Icone nom="bouclier" class="en-ligne" /> {{ c.membres.superviseur }}</span>
                  <span title="Proches"><Icone nom="famille" class="en-ligne" /> {{ c.membres.proche }}</span>
                  <span v-if="c.membres.auxiliaire" title="Auxiliaires de vie"><Icone nom="compte" class="en-ligne" /> {{ c.membres.auxiliaire }}</span>
                </span>
              </td>
              <td class="nb" data-label="Actifs 30 j">{{ c.actifs30 }}</td>
              <td data-label="Dernière activité">
                <span>{{ ilYA(c.derniereActivite) }} <span v-if="enSommeil(c)" class="sommeil">En sommeil</span></span>
              </td>
              <td class="nb" data-label="Photos"><span>{{ nombre(c.photos) }} <small class="aide">{{ octets(c.volume) }}</small></span></td>
              <td class="nb" data-label="Rendez-vous 30 j"><span>{{ c.rendezVous30 }} <small class="aide">sur {{ c.rendezVous }}</small></span></td>
              <td class="nb" data-label="Arbre">{{ c.arbre }}</td>
              <td class="nb" data-label="Voix 30 j">{{ c.voix30 }}</td>
              <td class="nb" data-label="Appareils de l'aidé">{{ c.appareils }}</td>
              <td class="nb" data-label="Invitations en attente">{{ c.invitations }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!cercles.length" class="aide">Aucun cercle pour l'instant.</p>
      </section>

      <p class="aide confidentialite">
        <Icone nom="cadenas" class="en-ligne" />
        Ces statistiques ne contiennent que des nombres et des dates : ni nom de personne, ni titre de rendez-vous, ni photo.
        Un utilisateur est « actif » s'il a ouvert l'application ; un cercle est « en sommeil » sans visite ni ajout depuis 30 jours.
      </p>
    </template>
  </main>
</template>

<style scoped>
.statistiques { max-width: 1100px; padding: 28px 32px; }
.entete { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.entete h1 { margin: 0 0 4px; }
.entete .aide { margin: 0; }
h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 1.05rem; color: var(--bleu-nuit); }
h3 { font-size: 0.95rem; color: var(--bleu-nuit); margin: 18px 0 4px; }

.tuiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 20px 0 8px; }
.tuile {
  display: flex; flex-direction: column; gap: 3px;
  background: white; border-radius: 12px; padding: 14px 16px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
}
.valeur { font-size: 1.7rem; font-weight: 700; color: var(--bleu-nuit); }
.valeur small { font-size: 0.95rem; font-weight: 600; color: var(--gris); }
.libelle { font-size: 0.88rem; color: #2b2b2b; display: flex; align-items: center; gap: 6px; }
.libelle .icone { color: var(--vert); }
.detail { font-size: 0.8rem; color: var(--gris); }

.bloc { padding: 18px 20px; }
.titre-bloc { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 16px; margin-bottom: 12px; }

.legende { list-style: none; padding: 0; margin: 0 0 8px; display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 0.85rem; color: #2b2b2b; }
.legende li { display: flex; align-items: center; gap: 6px; }
.legende.petite { font-size: 0.8rem; gap: 4px 12px; margin-top: 8px; }
.pastille { display: inline-block; width: 10px; height: 10px; border-radius: 3px; flex: none; }

.graphe { position: relative; }
.graphe svg { width: 100%; height: auto; display: block; overflow: visible; }
.axe { stroke: #d8d6d0; stroke-width: 1; }
.zone { fill: transparent; }
.zone.active { fill: rgb(35 48 90 / 0.05); }
.graphe g { outline: none; cursor: default; }
.valeur-barre { font-size: 11px; font-weight: 600; fill: #4a4a55; text-anchor: middle; }
.date-barre { font-size: 11px; fill: var(--gris); text-anchor: middle; }
.info-bulle {
  position: absolute; top: 0; transform: translateX(-50%);
  display: flex; flex-direction: column; gap: 3px;
  background: white; border: 1px solid #e3e1db; border-radius: 8px; padding: 8px 10px;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.12); font-size: 0.8rem; white-space: nowrap; pointer-events: none;
}
.info-bulle span { display: flex; align-items: center; gap: 6px; }

.ligne-module {
  display: grid; grid-template-columns: minmax(12rem, 1.4fr) 2fr 5rem 6rem 7rem;
  align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid #efede8; font-size: 0.92rem;
}
.ligne-module:last-child { border-bottom: none; }
.ligne-module.tete { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--gris); padding-top: 0; }
.nom-module { display: flex; align-items: center; gap: 8px; min-width: 0; }
.nom-module .icone { color: var(--vert); }
.nb { text-align: right; justify-content: flex-end; }
.fort { font-weight: 700; }
.piste { display: block; height: 10px; border-radius: 999px; background: #efede8; overflow: hidden; flex: 1; }
.piste.petite { height: 6px; }
.barre { display: block; height: 100%; border-radius: 999px; background: var(--vert); }
.barre.ancienne { background: #d9822b; }
.tendance { font-weight: 600; display: flex; align-items: center; gap: 4px; }
.tendance.hausse { color: var(--vert); }
.tendance.baisse { color: var(--rouge); }
.tendance.stable { color: var(--gris); }

.roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.role {
  display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; align-items: center;
  background: var(--fond); border-radius: 10px; padding: 12px;
}
.role > .icone { color: var(--vert); }
.role strong { font-size: 1.2rem; color: var(--bleu-nuit); }
.role .aide { display: block; font-size: 0.8rem; }
.role .piste { grid-column: 1 / -1; }

.faits { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 0 24px; margin: 14px 0 0; }
.faits div, .module dl div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #efede8; font-size: 0.9rem; }
dt { color: #4a4a55; }
dd { margin: 0; font-weight: 700; color: var(--bleu-nuit); white-space: nowrap; }
dd small { font-weight: 400; color: var(--gris); }

.versions { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-direction: column; gap: 6px; }
.versions li { display: grid; grid-template-columns: 7rem 1fr 3rem 9rem; align-items: center; gap: 10px; font-size: 0.9rem; }
.etat-version { color: var(--vert); font-size: 0.82rem; display: flex; align-items: center; gap: 4px; }
.etat-version.ancienne { color: #a35a12; }

.modules { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 0 12px; }
.module { padding: 18px 20px; }
.module dl { margin: 10px 0 0; }
.module dl div:last-child { border-bottom: none; }
.sous-titre { margin: 12px 0 6px; font-size: 0.82rem; font-weight: 600; color: var(--gris); }
.repartition { display: flex; gap: 2px; height: 12px; border-radius: 4px; overflow: hidden; background: #efede8; }
.note { margin: 8px 0 0; font-size: 0.8rem; }

.tri { flex-direction: row; align-items: center; gap: 8px; font-weight: 400; font-size: 0.88rem; color: var(--gris); }
.tri select { padding: 6px 10px; font-size: 0.88rem; }
.table-cercles { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.table-cercles th {
  text-align: left; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
  color: var(--gris); padding: 0 8px 8px; border-bottom: 1px solid #e3e1db; vertical-align: bottom;
}
.table-cercles td { padding: 10px 8px; border-bottom: 1px solid #efede8; vertical-align: middle; }
.table-cercles .nb { text-align: right; white-space: nowrap; }
.table-cercles small { display: block; font-size: 0.75rem; }
.nom-cercle a { font-weight: 600; color: var(--bleu-nuit); text-decoration: none; }
.nom-cercle .aide { display: block; font-size: 0.75rem; }
.membres { display: flex; flex-wrap: wrap; gap: 4px 10px; white-space: nowrap; color: #4a4a55; }
.membres .icone { color: var(--vert); }
.sommeil {
  display: inline-block; margin-left: 4px; font-size: 0.72rem; font-weight: 600;
  padding: 1px 8px; border-radius: 999px; background: #fdf3e6; color: #8a5208;
}
.confidentialite { display: flex; gap: 8px; align-items: flex-start; margin-top: 16px; }
.confidentialite .icone { margin-top: 2px; }

@media (max-width: 900px) {
  .statistiques { padding: 20px 16px; }
  .ligne-module { grid-template-columns: minmax(0, 1fr) 3rem 5.2rem 3rem; gap: 6px; font-size: 0.86rem; }
  .pourcent { display: none; }
  .ligne-module.tete { font-size: 0.62rem; letter-spacing: 0; }
  .barre-cellule { grid-column: 1 / -1; grid-row: 2; }
  .ligne-module.tete .barre-cellule { display: none; }

  /* Tableau des cercles en fiches */
  .table-cercles thead { display: none; }
  .table-cercles, .table-cercles tbody, .table-cercles tr, .table-cercles td { display: block; }
  .table-cercles tr { padding: 10px 0; border-bottom: 1px solid #e3e1db; }
  .table-cercles td { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 4px 0; border: none; text-align: right; }
  .table-cercles td.nom-cercle { display: block; text-align: left; padding-bottom: 6px; }
  .table-cercles td[data-label]::before { content: attr(data-label); color: var(--gris); text-align: left; font-weight: 400; }
  .table-cercles small { display: inline; margin-left: 4px; }
}
@media (max-width: 600px) {
  .entete { flex-direction: column; }
  .tuiles { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .tuile { padding: 10px 12px; }
  .valeur { font-size: 1.3rem; }
  .libelle { font-size: 0.78rem; }
  .libelle .icone { display: none; }
  .detail { font-size: 0.72rem; }
  .bloc, .module { padding: 14px; }
  .modules { grid-template-columns: 1fr; }
  .date-barre.secondaire { display: none; }
  .valeur-barre, .date-barre { font-size: 18px; }
  .versions li { grid-template-columns: 6rem 1fr 2.4rem; }
  .etat-version { grid-column: 1 / -1; }
}
</style>
