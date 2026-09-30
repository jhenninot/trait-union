import { createApp } from 'vue'
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

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Accueil, meta: { connecte: true } },
    { path: '/cercles/:id', component: Cercle, meta: { connecte: true } },
    { path: '/connexion', component: Connexion },
    { path: '/bienvenue', component: Initialisation },
    { path: '/appareil', component: Appareil },
    { path: '/invitation/:jeton', component: Invitation },
    { path: '/confidentialite', component: Confidentialite, meta: { publique: true } },
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
  // Un appareil de personne accompagnée reste sur son écran d'accueil
  if (session.typeSession === 'appareil' && to.path !== '/') return '/'
})

createApp(App).use(router).mount('#app')
