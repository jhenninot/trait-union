<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import { session, deconnecter } from '../session.js'
import { aLesDroits, estAuxiliaire } from '../roles.js'
import { cercleMemorise, memoriserCercle } from '../cercleCourant.js'
import { etatMessagerie } from '../messagerie.js'
import logo from '../logo.svg'
import icone from '../icone.svg'
import Icone from './Icone.vue'
import { ouvrirAide } from '../aide.js'
import Avatar from '../vues/Avatar.vue'

// Menu des aidants, proches et administrateurs : barre latérale sur grand écran,
// barre d'onglets en bas et panneau « Plus » sur téléphone.
const route = useRoute()
const router = useRouter()
const ouvert = ref(false) // panneau du menu ouvert sur téléphone
const tousLesCercles = ref([]) // pour un administrateur, y compris ceux dont il n'est pas membre


async function chargerCercles() {
  if (session.utilisateur?.estAdmin) tousLesCercles.value = await api('GET', '/cercles').catch(() => [])
}
chargerCercles()
// La liste change quand on crée ou rejoint un cercle
watch(() => session.cercles, chargerCercles)

// Cercles proposés dans le sélecteur : ceux dont on est membre, puis les autres pour un admin
const choix = computed(() => {
  const miens = session.cercles.filter((c) => c.role !== 'accompagne')
  const ids = new Set(miens.map((c) => c.id))
  return [...miens, ...tousLesCercles.value.filter((c) => !ids.has(c.id))]
})

// Cercle courant : celui de l'adresse, sinon le dernier consulté, sinon le premier
const cercleId = computed(() => {
  if (route.params.id) return route.params.id
  const memoire = cercleMemorise.value
  if (choix.value.some((c) => c.id === memoire)) return memoire
  return choix.value[0]?.id ?? null
})
const cercle = computed(() => choix.value.find((c) => c.id === cercleId.value) ?? null)
const peutGerer = computed(() => session.utilisateur.estAdmin || aLesDroits(cercle.value?.role, 'aidant'))
// Les auxiliaires de vie n'ont pas accès aux photos ni à l'arbre généalogique
const voitPhotos = computed(() => peutGerer.value || !estAuxiliaire(cercle.value?.role))
// La messagerie est réservée aux membres du cercle (pas à un administrateur qui n'en fait pas partie)
const voitMessages = computed(() => Boolean(cercle.value?.role))
// Sondages de dates : comme le fil « Toute la famille », sans les auxiliaires
const voitSondages = computed(() => voitMessages.value && !estAuxiliaire(cercle.value?.role))
// Jeux : un sous-menu par personne accompagnée, pour essayer ses jeux
const aides = ref([])
const voitJeux = computed(() => Boolean(cercle.value) && voitPhotos.value)
const dansTablettes = computed(() => cercle.value && route.path.startsWith(`/cercles/${cercle.value.id}/tablettes`))
const dansJeux = computed(() => cercle.value && route.path.startsWith(`/cercles/${cercle.value.id}/jeux`))
watch(() => [cercleId.value, voitJeux.value || peutGerer.value], async ([id, voit]) => {
  aides.value = []
  if (!id || !voit) return
  const c = await api('GET', `/cercles/${id}`).catch(() => null)
  if (c && id === cercleId.value) aides.value = c.membres.filter((m) => m.role === 'accompagne' && !m.decede)
}, { immediate: true })
const nonLus = computed(() => etatMessagerie.parCercle[cercleId.value] ?? 0)

watch(() => route.params.id, (id) => id && memoriserCercle(id), { immediate: true })
watch(() => route.fullPath, () => (ouvert.value = false))

// Changer de cercle garde la même rubrique (Accueil, Famille, Arbre, Agenda, Photos ou Personnes accompagnées)
function changerCercle(id) {
  if (route.path === '/') return memoriserCercle(id)
  let rubrique = route.path.match(/\/(agenda|photos|tablettes|arbre|messages|sondages)$/)?.[0] ?? ''
  if (route.path.includes('/tablettes')) rubrique = '/tablettes'
  if (route.path.includes('/jeux')) rubrique = '/jeux'
  const cible = choix.value.find((c) => c.id === id)
  if ((rubrique === '/photos' || rubrique === '/arbre' || rubrique === '/sondages' || rubrique === '/jeux') && !session.utilisateur.estAdmin && estAuxiliaire(cible?.role)) rubrique = ''
  router.push(`/cercles/${id}${rubrique}`)
}

async function seDeconnecter() {
  await deconnecter()
  router.push('/connexion')
}

const estActif = (chemin) => route.path === chemin
</script>

<template>
  <!-- Téléphone : en-tête avec le cercle courant -->
  <header class="entete-mobile">
    <RouterLink to="/"><img :src="icone" alt="Trait d'union" class="icone-appli" /></RouterLink>
    <select v-if="choix.length" class="selecteur" :value="cercleId" aria-label="Cercle" @change="changerCercle($event.target.value)">
      <option v-for="c in choix" :key="c.id" :value="c.id">{{ c.nom }}</option>
    </select>
    <button class="aide-mobile" aria-label="Aide sur cet écran" @click="ouvrirAide"><Icone nom="question" /></button>
  </header>

  <div v-if="ouvert" class="voile" @click="ouvert = false" />
  <nav class="menu" :class="{ ouvert }" aria-label="Menu principal">
    <div class="haut-menu">
      <RouterLink to="/"><img :src="logo" alt="Trait d'union" class="logo" /></RouterLink>
      <button class="fermer" aria-label="Fermer le menu" @click="ouvert = false"><Icone nom="fermer" /></button>
    </div>

    <select v-if="choix.length" class="selecteur" :value="cercleId" aria-label="Cercle" @change="changerCercle($event.target.value)">
      <option v-for="c in choix" :key="c.id" :value="c.id">{{ c.nom }}</option>
    </select>

    <RouterLink to="/" class="lien" :class="{ actif: estActif('/') }"><Icone nom="accueil" /> Accueil</RouterLink>
    <template v-if="cercle">
      <RouterLink v-if="voitMessages" :to="`/cercles/${cercle.id}/messages`" class="lien" :class="{ actif: estActif(`/cercles/${cercle.id}/messages`) }">
        <Icone nom="message" /> Messages<span v-if="nonLus" class="badge">{{ nonLus }}</span>
      </RouterLink>
      <RouterLink v-if="voitSondages" :to="`/cercles/${cercle.id}/sondages`" class="lien" :class="{ actif: estActif(`/cercles/${cercle.id}/sondages`) }">
        <Icone nom="sondage" /> Sondages
      </RouterLink>
      <RouterLink :to="`/cercles/${cercle.id}`" class="lien" :class="{ actif: estActif(`/cercles/${cercle.id}`) }">
        <Icone nom="famille" /> Famille et aidants
      </RouterLink>
      <RouterLink v-if="voitPhotos" :to="`/cercles/${cercle.id}/arbre`" class="lien" :class="{ actif: estActif(`/cercles/${cercle.id}/arbre`) }">
        <Icone nom="arbre" /> Arbre généalogique
      </RouterLink>
      <RouterLink :to="`/cercles/${cercle.id}/agenda`" class="lien" :class="{ actif: estActif(`/cercles/${cercle.id}/agenda`) }">
        <Icone nom="agenda" /> Agenda
      </RouterLink>
      <RouterLink v-if="voitPhotos" :to="`/cercles/${cercle.id}/photos`" class="lien" :class="{ actif: estActif(`/cercles/${cercle.id}/photos`) }">
        <Icone nom="photo" /> Photos
      </RouterLink>
      <RouterLink v-if="voitJeux" :to="`/cercles/${cercle.id}/jeux`" class="lien" :class="{ actif: estActif(`/cercles/${cercle.id}/jeux`) }">
        <Icone nom="jeux" /> Jeux
      </RouterLink>
      <template v-if="voitJeux && dansJeux">
        <RouterLink v-for="a in aides" :key="a.id" :to="`/cercles/${cercle.id}/jeux/${a.utilisateurId}`" class="lien sous-lien" :class="{ actif: estActif(`/cercles/${cercle.id}/jeux/${a.utilisateurId}`) }">
          {{ a.prenom }}
        </RouterLink>
      </template>
      <RouterLink v-if="peutGerer" :to="`/cercles/${cercle.id}/tablettes`" class="lien" :class="{ actif: estActif(`/cercles/${cercle.id}/tablettes`) }">
        <Icone nom="compte" /> Personnes accompagnées
      </RouterLink>
      <template v-if="peutGerer && dansTablettes">
        <RouterLink v-for="a in aides" :key="a.id" :to="`/cercles/${cercle.id}/tablettes/${a.id}`" class="lien sous-lien" :class="{ actif: estActif(`/cercles/${cercle.id}/tablettes/${a.id}`) }">
          {{ a.prenom }}
        </RouterLink>
      </template>
    </template>

    <template v-if="session.utilisateur.estAdmin">
      <p class="titre-section">Administration</p>
      <RouterLink to="/admin/cercles" class="lien" :class="{ actif: estActif('/admin/cercles') }"><Icone nom="cercle" /> Tous les cercles</RouterLink>
      <RouterLink to="/admin/utilisateurs" class="lien" :class="{ actif: estActif('/admin/utilisateurs') }"><Icone nom="famille" /> Utilisateurs</RouterLink>
      <RouterLink to="/admin/statistiques" class="lien" :class="{ actif: estActif('/admin/statistiques') }"><Icone nom="statistiques" /> Statistiques</RouterLink>
      <RouterLink to="/admin/journal" class="lien" :class="{ actif: estActif('/admin/journal') }"><Icone nom="journal" /> Journal</RouterLink>
      <RouterLink to="/admin/email" class="lien" :class="{ actif: estActif('/admin/email') }"><Icone nom="email" /> Envoi d'emails</RouterLink>
      <RouterLink to="/admin/photos" class="lien" :class="{ actif: estActif('/admin/photos') }"><Icone nom="nuage" /> Stockage des photos</RouterLink>
      <RouterLink to="/admin/alertes" class="lien" :class="{ actif: estActif('/admin/alertes') }"><Icone nom="cloche" /> Alertes</RouterLink>
      <RouterLink to="/admin/messagerie" class="lien" :class="{ actif: estActif('/admin/messagerie') }"><Icone nom="message" /> Messagerie</RouterLink>
      <RouterLink to="/admin/presentation" class="lien" :class="{ actif: estActif('/admin/presentation') }"><Icone nom="oeil" /> Page de présentation</RouterLink>
    </template>

    <div class="bas-menu">
      <button class="lien" @click="ouvrirAide"><Icone nom="question" /> Aide sur cet écran</button>
      <RouterLink to="/alertes" class="lien" :class="{ actif: estActif('/alertes') }"><Icone nom="cloche" /> Mes alertes</RouterLink>
      <RouterLink to="/application" class="lien" :class="{ actif: estActif('/application') }"><Icone nom="mobile" /> Application mobile</RouterLink>
      <RouterLink to="/profil" class="lien qui" :class="{ actif: estActif('/profil') }" title="Mon profil">
        <Avatar :src="session.utilisateur.avatar" :prenom="session.utilisateur.prenom" :taille="28" />
        <span>{{ session.utilisateur.prenom }}<span v-if="session.utilisateur.estAdmin"> · admin</span></span>
      </RouterLink>
      <button class="lien" @click="seDeconnecter"><Icone nom="deconnexion" /> Se déconnecter</button>
    </div>
  </nav>

  <!-- Téléphone : onglets en bas (Personnes accompagnées reste accessible par « Plus ») -->
  <nav class="onglets" aria-label="Raccourcis">
    <RouterLink to="/" :class="{ actif: estActif('/') }"><Icone nom="accueil" />Accueil</RouterLink>
    <RouterLink v-if="cercle && voitMessages" :to="`/cercles/${cercle.id}/messages`" :class="{ actif: estActif(`/cercles/${cercle.id}/messages`) }">
      <span class="pictogramme"><Icone nom="message" /><span v-if="nonLus" class="badge">{{ nonLus }}</span></span>Messages
    </RouterLink>
    <RouterLink v-else-if="cercle" :to="`/cercles/${cercle.id}`" :class="{ actif: estActif(`/cercles/${cercle.id}`) }"><Icone nom="famille" />Famille</RouterLink>
    <RouterLink v-if="cercle" :to="`/cercles/${cercle.id}/agenda`" :class="{ actif: estActif(`/cercles/${cercle.id}/agenda`) }"><Icone nom="agenda" />Agenda</RouterLink>
    <RouterLink v-if="cercle && voitPhotos" :to="`/cercles/${cercle.id}/photos`" :class="{ actif: estActif(`/cercles/${cercle.id}/photos`) }"><Icone nom="photo" />Photos</RouterLink>
    <button :class="{ actif: ouvert }" @click="ouvert = !ouvert"><Icone nom="plus" />Plus</button>
  </nav>
</template>

<style scoped>
.menu {
  width: 260px;
  flex: none;
  background: white;
  border-right: 1px solid #ebe8e3;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}
.haut-menu { display: flex; align-items: center; justify-content: space-between; margin: 0 8px 12px; }
.logo { height: 40px; display: block; }
.fermer { display: none; background: none; color: var(--gris); padding: 4px; }
.selecteur {
  width: 100%;
  margin-bottom: 12px;
  font-weight: 600;
  color: var(--bleu-nuit);
  border-color: #ebe8e3;
  border-radius: 10px;
}
.lien {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  color: #3a3a44;
  text-decoration: none;
  font-weight: 500;
  background: none;
  text-align: left;
  width: 100%;
  margin: 0;
}
.lien:hover { background: #f5f3ef; }
.lien.actif { background: var(--vert-clair); color: var(--vert); }
.sous-lien { padding-left: 46px; padding-top: 6px; padding-bottom: 6px; font-size: 0.95rem; }
.qui { padding-top: 6px; padding-bottom: 6px; }
.qui .avatar { margin: 0 -4px; }
.titre-section {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gris);
  margin: 18px 12px 4px;
}
.bas-menu { margin-top: auto; border-top: 1px solid #ebe8e3; padding-top: 10px; }
.badge { margin-left: auto; background: var(--rouge); color: white; border-radius: 999px; font-size: 0.75rem; font-weight: 700; min-width: 20px; height: 20px; padding: 0 6px; display: inline-grid; place-items: center; }
.entete-mobile, .onglets, .voile, .aide-mobile { display: none; }

@media (max-width: 760px) {
  .entete-mobile {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: white;
    border-bottom: 1px solid #ebe8e3;
    position: sticky;
    top: 0;
    z-index: 5;
  }
  .icone-appli { height: 32px; display: block; }
  .aide-mobile { display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border-radius: 50%; background: var(--vert-clair); color: var(--vert); flex: none; }
  .entete-mobile .selecteur { margin: 0 0 0 auto; width: auto; max-width: 55%; padding: 6px 10px; }
  .menu {
    display: none;
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(320px, 85vw);
    height: auto;
    z-index: 20;
    border: none;
    box-shadow: -8px 0 24px rgb(0 0 0 / 0.15);
  }
  .menu.ouvert { display: flex; }
  .fermer { display: block; }
  .voile { display: block; position: fixed; inset: 0; background: rgb(20 25 45 / 0.45); z-index: 15; }
  .onglets {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 10;
    background: white;
    border-top: 1px solid #ebe8e3;
    padding: 6px 4px calc(8px + env(safe-area-inset-bottom));
  }
  .onglets a, .onglets button {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 4px 0;
    font-size: 0.75rem;
    color: var(--gris);
    text-decoration: none;
    background: none;
  }
  .onglets .icone { width: 24px; height: 24px; }
  .pictogramme { position: relative; display: inline-flex; }
  .pictogramme .badge { position: absolute; top: -6px; right: -12px; min-width: 17px; height: 17px; font-size: 0.68rem; padding: 0 4px; }
  .onglets .actif { color: var(--vert); font-weight: 600; }
}
</style>
