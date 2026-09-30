// Directive v-balayage : glisser le doigt vers la gauche ou la droite pour changer de photo.
// Valeur : { suivante, precedente } (fonctions). Pendant le geste, la photo suit le doigt.
// Le mouvement vertical reste libre (touch-action: pan-y) pour faire défiler la page.
const SEUIL = 50 // px à parcourir horizontalement pour changer de photo

export const balayage = {
  mounted(el, liaison) {
    el._balayage = liaison.value
    el.style.touchAction = 'pan-y'
    let depart = null
    let apresBalayage = false
    const image = () => el.querySelector('img')
    const deplacerImage = (dx) => {
      const img = image()
      if (!img) return
      img.style.transition = dx ? 'none' : 'transform 0.2s'
      img.style.transform = dx ? `translateX(${dx}px)` : ''
    }
    const fin = (e) => {
      if (!depart || e.pointerId !== depart.id) return
      const dx = e.clientX - depart.x
      const dy = e.clientY - depart.y
      depart = null
      deplacerImage(0)
      if (e.type === 'pointercancel' || Math.abs(dx) < SEUIL || Math.abs(dx) < 1.5 * Math.abs(dy)) return
      apresBalayage = true // le « clic » qui suit le geste ne doit rien déclencher
      setTimeout(() => (apresBalayage = false), 400)
      const { suivante, precedente } = el._balayage ?? {}
      if (dx < 0) suivante?.()
      else precedente?.()
    }
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (e.target.closest('input, textarea, select, button')) return
      depart = { id: e.pointerId, x: e.clientX, y: e.clientY }
    })
    el.addEventListener('pointermove', (e) => {
      if (!depart || e.pointerId !== depart.id) return
      const dx = e.clientX - depart.x
      if (Math.abs(dx) > Math.abs(e.clientY - depart.y)) deplacerImage(dx)
    })
    el.addEventListener('pointerup', fin)
    el.addEventListener('pointercancel', fin)
    el.addEventListener('click', (e) => {
      if (apresBalayage) {
        e.stopPropagation()
        e.preventDefault()
      }
    }, true)
    // Évite que le navigateur « attrape » l'image pour un glisser-déposer à la souris
    el.addEventListener('dragstart', (e) => e.preventDefault())
  },
  updated(el, liaison) {
    el._balayage = liaison.value
  }
}
