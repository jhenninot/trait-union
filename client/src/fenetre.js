import { reactive } from 'vue'

// Fenêtres de dialogue de l'application, à la place de confirm() et alert() du navigateur.
// Une seule fenêtre à la fois, affichée par FenetreDialogue.vue (monté dans App.vue).
export const fenetre = reactive({ ouverte: null })

function ouvrir(options) {
  // Une fenêtre déjà ouverte est refermée comme si l'on avait répondu « non »
  fenetre.ouverte?.repondre(false)
  return new Promise((resolve) => {
    fenetre.ouverte = {
      ...options,
      repondre(reponse) {
        fenetre.ouverte = null
        resolve(reponse)
      }
    }
  })
}

// Demande une confirmation : renvoie true si la personne valide, false sinon.
// confirmer('Supprimer cette photo ?', { oui: 'Supprimer', danger: true, icone: 'effacer' })
export function confirmer(message, { titre = '', oui = 'Oui', non = 'Annuler', danger = false, icone = '' } = {}) {
  return ouvrir({ message, titre, oui, non, danger, icone: icone || (danger ? 'attention' : '') })
}

// Simple message d'information, avec un seul bouton
export function avertir(message, { titre = '', oui = 'D\'accord', icone = 'attention' } = {}) {
  return ouvrir({ message, titre, oui, non: '', icone }).then(() => undefined)
}
