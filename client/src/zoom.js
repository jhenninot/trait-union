// Directive v-zoom : écarter deux doigts sur la photo pour l'agrandir (jusqu'à 5 fois), puis la
// déplacer avec un doigt ; resserrer les doigts pour revenir. Valeur : true quand le zoom est
// permis (visionneuse en plein écran). À poser sur le même élément que v-balayage : tant que la
// photo est agrandie, glisser le doigt la déplace au lieu de changer de photo (el.dataset.zoom).
const MAX = 5

const image = (el) => el.querySelector('img')
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const milieu = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

function appliquer(el, duree = 0) {
  const z = el._zoom
  const img = z.img
  if (!img) return
  img.style.transition = duree ? `transform ${duree}ms ease-out` : 'none'
  img.style.transform = z.echelle === 1 ? '' : `translate(${z.x}px, ${z.y}px) scale(${z.echelle})`
  if (z.echelle > 1 || z.geste?.type === 'pincer') el.dataset.zoom = 'oui'
  else delete el.dataset.zoom
}

// La photo agrandie ne doit pas quitter l'écran : on limite le déplacement
function borner(z) {
  // Taille affichée sans zoom
  const mx = Math.max(0, ((z.echelle - 1) * z.img.offsetWidth) / 2)
  const my = Math.max(0, ((z.echelle - 1) * z.img.offsetHeight) / 2)
  z.x = Math.min(mx, Math.max(-mx, z.x))
  z.y = Math.min(my, Math.max(-my, z.y))
}

function reinitialiser(el, duree = 0) {
  const z = el._zoom
  Object.assign(z, { echelle: 1, x: 0, y: 0, geste: null })
  appliquer(el, duree)
}

// Centre de la photo à l'écran, sans la transformation
function centre(z) {
  const r = z.img.getBoundingClientRect()
  return { x: r.left + r.width / 2 - z.x, y: r.top + r.height / 2 - z.y }
}

function commencer(el) {
  const z = el._zoom
  const points = [...z.pointeurs.values()]
  if (points.length >= 2) {
    const m = milieu(points[0], points[1])
    const c = centre(z)
    // Point de la photo (dans son repère, sans zoom) qui se trouve sous les doigts
    z.geste = { type: 'pincer', d0: distance(points[0], points[1]), e0: z.echelle, q: { x: (m.x - c.x - z.x) / z.echelle, y: (m.y - c.y - z.y) / z.echelle }, c }
  } else if (points.length === 1 && z.echelle > 1) {
    z.geste = { type: 'deplacer', p0: points[0], x0: z.x, y0: z.y }
  } else {
    z.geste = null
  }
}

export const zoom = {
  mounted(el, liaison) {
    el._zoom = { actif: liaison.value, img: image(el), echelle: 1, x: 0, y: 0, pointeurs: new Map(), geste: null, bouge: false }
    const z = el._zoom
    el.style.touchAction = z.actif ? 'none' : 'pan-y'

    el.addEventListener('pointerdown', (e) => {
      if (!z.actif || e.target.closest('button')) return
      z.pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      z.bouge = false
      commencer(el)
      if (z.geste?.type === 'pincer') el.dataset.zoom = 'oui' // v-balayage s'arrête
    })

    el.addEventListener('pointermove', (e) => {
      if (!z.pointeurs.has(e.pointerId)) return
      z.pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const g = z.geste
      if (!g) return
      if (g.type === 'pincer') {
        const [a, b] = [...z.pointeurs.values()]
        const m = milieu(a, b)
        z.echelle = Math.min(MAX, Math.max(1, (g.e0 * distance(a, b)) / g.d0))
        // Le point de la photo pris entre les doigts reste sous les doigts
        z.x = m.x - g.c.x - g.q.x * z.echelle
        z.y = m.y - g.c.y - g.q.y * z.echelle
      } else {
        z.x = g.x0 + e.clientX - g.p0.x
        z.y = g.y0 + e.clientY - g.p0.y
      }
      borner(z)
      appliquer(el)
      z.bouge = true
    })

    const fin = (e) => {
      if (!z.pointeurs.delete(e.pointerId)) return
      // Simple toucher ou glissé sans zoom : v-balayage s'en occupe, on ne touche pas à la photo
      if (!el.dataset.zoom) {
        z.geste = null
        return
      }
      if (z.echelle < 1.05 && z.pointeurs.size < 2) reinitialiser(el, 150)
      else {
        commencer(el)
        appliquer(el)
      }
      // Le « clic » qui suit un geste ne doit pas quitter le plein écran
      if (z.bouge && !z.pointeurs.size) setTimeout(() => (z.bouge = false), 400)
    }
    el.addEventListener('pointerup', fin)
    el.addEventListener('pointercancel', fin)
    el.addEventListener('click', (e) => {
      if (z.bouge) {
        e.stopPropagation()
        e.preventDefault()
      }
    }, true)
  },
  updated(el, liaison) {
    const z = el._zoom
    z.actif = liaison.value
    // En plein écran, le navigateur ne doit ni défiler ni zoomer la page : les doigts sont pour la photo
    el.style.touchAction = z.actif ? 'none' : 'pan-y'
    const img = image(el)
    // Autre photo (sans transformation) : on repart de la taille normale
    if (img !== z.img) {
      z.img = img
      z.pointeurs.clear()
      Object.assign(z, { echelle: 1, x: 0, y: 0, geste: null })
      delete el.dataset.zoom
    } else if (!z.actif && z.echelle !== 1) {
      // Sortie du plein écran
      z.pointeurs.clear()
      reinitialiser(el)
    }
  }
}
