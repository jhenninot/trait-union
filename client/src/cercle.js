import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from './api.js'

// Chargement du cercle de l'adresse /cercles/:id, partagé par les pages Famille et Personnes accompagnées.
// Le cercle est rechargé quand on en change depuis le menu (la page reste la même).
export function utiliserCercle() {
  const route = useRoute()
  const url = computed(() => `/cercles/${route.params.id}`)
  const cercle = ref(null)
  const erreur = ref('')

  async function charger() {
    try {
      cercle.value = await api('GET', url.value)
    } catch (e) {
      erreur.value = e.message
    }
  }
  watch(url, () => {
    cercle.value = null
    erreur.value = ''
    charger()
  }, { immediate: true })

  async function action(fn) {
    erreur.value = ''
    try {
      await fn()
    } catch (e) {
      erreur.value = e.message
    }
  }

  // Les membres décédés (gardés pour pouvoir annuler une erreur) passent après les autres
  const parDeces = (a, b) => a.decede - b.decede
  const accompagnes = computed(() => cercle.value?.membres.filter((m) => m.role === 'accompagne').sort(parDeces) ?? [])
  const autres = computed(() => cercle.value?.membres.filter((m) => m.role !== 'accompagne').sort(parDeces) ?? [])
  // Personnes accompagnées encore en vie (choix « Pour qui » de l'agenda, tablettes...)
  const accompagnesActifs = computed(() => accompagnes.value.filter((m) => !m.decede))

  return { url, cercle, erreur, charger, action, accompagnes, autres, accompagnesActifs }
}

export const heure = (d) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
export const copier = (texte) => navigator.clipboard?.writeText(texte)
