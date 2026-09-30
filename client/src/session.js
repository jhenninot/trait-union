import { reactive } from 'vue'
import { api } from './api.js'

// État de connexion partagé par toutes les vues
export const session = reactive({
  charge: false,
  initialise: true,
  google: false,
  utilisateur: null,
  typeSession: null,
  cercles: []
})

export async function rafraichirSession() {
  const etat = await api('GET', '/auth/etat')
  Object.assign(session, { cercles: [], typeSession: null }, etat, { charge: true })
}

export async function deconnecter() {
  await api('POST', '/auth/deconnexion')
  await rafraichirSession()
}
