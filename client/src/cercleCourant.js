import { ref } from 'vue'

// Dernier cercle consulté (retenu sur cet appareil) : c'est celui de l'accueil et du menu
// quand l'adresse n'en désigne pas un.
const MEMOIRE = 'tu_cercle'
export const cercleMemorise = ref((() => {
  try { return localStorage.getItem(MEMOIRE) } catch { return null }
})())

export function memoriserCercle(id) {
  cercleMemorise.value = id
  try { localStorage.setItem(MEMOIRE, id) } catch { /* stockage indisponible */ }
}
