import { createApp, watch } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import { session, rafraichirSession } from './session.js'
import Accueil from './vues/Accueil.vue'
import Connexion from './vues/Connexion.vue'
import Initialisation from './vues/Initialisation.vue'
import Appareil from './vues/Appareil.vue'
import Invitation from './vues/Invitation.vue'
import Cercle from './vues/Cercle.vue'
import Confidentialite from './vues/Confidentialite.vue'
import AdminEmail from './vues/AdminEmail.vue'
import AdminCercles from './vues/AdminCercles.vue'
import Tablettes from './vues/Tablettes.vue'
import FamilleAccompagne from './vues/FamilleAccompagne.vue'
import ApplicationMobile from './vues/ApplicationMobile.vue'
import Agenda from './vues/Agenda.vue'
import AgendaAccompagne from './vues/AgendaAccompagne.vue'
import Photos from './vues/Photos.vue'
import PhotosAccompagne from './vues/PhotosAccompagne.vue'
import AdminPhotos from './vues/AdminPhotos.vue'
import Recevoir from './vues/Recevoir.vue'
import Profil from './vues/Profil.vue'
import Arbre from './vues/Arbre.vue'
import ArbreAccompagne from './vues/ArbreAccompagne.vue'
import Alertes from './vues/Alertes.vue'
import AdminAlertes from './vues/AdminAlertes.vue'
import AdminPresentation from './vues/AdminPresentation.vue'
import AdminUtilisateurs from './vues/AdminUtilisateurs.vue'
import AdminStatistiques from './vues/AdminStatistiques.vue'
import Presentation from './vues/Presentation.vue'
import { preparerInstallation } from './installation.js'
import { surveillerMisesAJour } from './miseAJour.js'
import { surveillerPartages } from './partage.js'
import { rafraichirAlertes } from './alertes.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Accueil, meta: { connecte: true, appareil: true } },
    { path: '/famille', component: FamilleAccompagne, meta: { connecte: true, appareil: true, seulementAppareil: true } },
    { path: '/agenda', component: AgendaAccompagne, meta: { connecte: true, appareil: true, seulementAppareil: true } },
    { path: '/photos', component: PhotosAccompagne, meta: { connecte: true, appareil: true, seulementAppareil: true } },
    { path: '/cercles/:id', component: Cercle, meta: { connecte: true } },
    { path: '/cercles/:id/agenda', component: Agenda, meta: { connecte: true } },
    { path: '/cercles/:id/photos', component: Photos, meta: { connecte: true } },
    { path: '/cercles/:id/arbre', component: Arbre, meta: { connecte: true } },
    { path: '/mon-arbre', component: ArbreAccompagne, meta: { connecte: true, appareil: true, seulementAppareil: true } },
    { path: '/cercles/:id/tablettes', component: Tablettes, meta: { connecte: true } },
    { path: '/recevoir', component: Recevoir, meta: { connecte: true, appareil: true } },
    { path: '/profil', component: Profil, meta: { connecte: true } },
    { path: '/alertes', component: Alertes, meta: { connecte: true } },
    { path: '/application', component: ApplicationMobile, meta: { connecte: true } },
    { path: '/admin/cercles', component: AdminCercles, meta: { connecte: true, admin: true } },
    { path: '/admin/utilisateurs', component: AdminUtilisateurs, meta: { connecte: true, admin: true } },
    { path: '/admin/statistiques', component: AdminStatistiques, meta: { connecte: true, admin: true } },
    { path: '/admin/email', component: AdminEmail, meta: { connecte: true, admin: true } },
    { path: '/admin/photos', component: AdminPhotos, meta: { connecte: true, admin: true } },
    { path: '/admin/alertes', component: AdminAlertes, meta: { connecte: true, admin: true } },
    { path: '/admin/presentation', component: AdminPresentation, meta: { connecte: true, admin: true } },
    { path: '/connexion', component: Connexion },
    { path: '/bienvenue', component: Initialisation },
    { path: '/appareil', component: Appareil },
    { path: '/invitation/:jeton', component: Invitation },
    { path: '/confidentialite', component: Confidentialite, meta: { publique: true } },
    // Page de présentation, à l'adresse secrète réglée par l'administrateur (jamais indexée)
    { path: '/decouvrir/:cle', component: Presentation, meta: { publique: true, sansMenu: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach(async (to) => {
  if (to.meta.publique) return true
  if (!session.charge) {
    try { await rafraichirSession() } catch { return true }
  }
  if (!session.initialise && to.path !== '/bienvenue') return '/bienvenue'
  if (to.meta.connecte && !session.utilisateur) return '/connexion'
  if (to.meta.admin && !session.utilisateur.estAdmin) return '/'
  // Un appareil de personne accompagnée reste sur ses écrans simples
  if (session.typeSession === 'appareil' && !to.meta.appareil) return '/'
  if (session.typeSession !== 'appareil' && to.meta.seulementAppareil) return '/'
})

preparerInstallation()
surveillerMisesAJour(router)
surveillerPartages(router)
// Abonnement aux alertes renvoyé au serveur à chaque connexion (il suit la session)
watch(() => session.utilisateur?.id, (id) => id && rafraichirAlertes())
createApp(App).use(router).mount('#app')
