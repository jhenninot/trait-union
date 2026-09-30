import { reactive } from 'vue'
import { api } from './api.js'
import { dansAppliAndroid } from './installation.js'

// État de connexion partagé par toutes les vues
export const session = reactive({
  charge: false,
  initialise: true,
  google: false,
  email: false, // envoi d'emails configuré par l'administrateur
  utilisateur: null,
  typeSession: null,
  cercles: []
})

export async function rafraichirSession() {
  const etat = await api('GET', '/auth/etat')
  Object.assign(session, { cercles: [], typeSession: null, email: false }, etat, { charge: true })
  // Google refuse la connexion dans une vue web intégrée (application Android)
  if (dansAppliAndroid()) session.google = false
}

export async function deconnecter() {
  await api('POST', '/auth/deconnexion')
  await rafraichirSession()
}
