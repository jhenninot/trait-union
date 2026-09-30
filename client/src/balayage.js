// Directive v-balayage : glisser le doigt vers la gauche ou la droite pour changer de photo.
// Valeur : { suivante, precedente } (fonctions). Pendant le geste, la photo suit le doigt ;
// au lâcher, elle sort de l'écran en douceur et la nouvelle arrive du côté opposé.
// Le mouvement vertical reste libre (touch-action: pan-y) pour faire défiler la page.
const SEUIL = 60 // px à parcourir horizontalement pour changer de photo...
const VITESSE = 0.5 // ...ou un geste vif (px/ms) d'au moins 25 px
const SORTIE = 250 // ms
const ENTREE = 320 // ms
const COURBE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
const image = (el) => el.querySelector('img')

function placer(img, dx, opacite, duree = 0) {
  if (!img) return
  img.style.transition = duree ? `transform ${duree}ms ${COURBE}, opacity ${duree}ms ${COURBE}` : 'none'
  img.style.transform = dx ? `translateX(${dx}px)` : ''
  img.style.opacity = opacite === 1 ? '' : String(opacite)
}

async function changer(el, sens) {
  const largeur = el.clientWidth || window.innerWidth
  const ancienne = image(el)
  // La photo actuelle part du côté du geste
  placer(ancienne, -sens * largeur * 0.6, 0, SORTIE)
  await attendre(SORTIE)
  const { suivante, precedente } = el._balayage ?? {}
  if (sens > 0) suivante?.()
  else precedente?.()
  // Laisser Vue afficher la nouvelle photo
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const nouvelle = image(el)
  if (!nouvelle || nouvelle === ancienne) {
    // Pas d'autre photo (début ou fin de la liste) : la photo revient
    placer(ancienne, 0, 1, ENTREE)
    return
  }
  placer(nouvelle, sens * largeur * 0.35, 0)
  nouvelle.getBoundingClientRect() // applique la position de départ avant l'animation
  placer(nouvelle, 0, 1, ENTREE)
  await attendre(ENTREE)
}

export const balayage = {
  mounted(el, liaison) {
    el._balayage = liaison.value
    el.style.touchAction = 'pan-y'
    let depart = null
    let enCours = false
    let apresBalayage = false
    const fin = async (e) => {
      if (!depart || e.pointerId !== depart.id) return
      // Photo agrandie ou pincée (v-zoom) : pas de changement de photo
      if (el.dataset.zoom) {
        depart = null
        return
      }
      const dx = e.clientX - depart.x
      const dy = e.clientY - depart.y
      const vitesse = Math.abs(dx) / Math.max(1, performance.now() - depart.t)
      depart = null
      const horizontal = Math.abs(dx) > 1.5 * Math.abs(dy)
      const valide = e.type !== 'pointercancel' && horizontal && (Math.abs(dx) >= SEUIL || (vitesse >= VITESSE && Math.abs(dx) >= 25))
      if (!valide) {
        placer(image(el), 0, 1, 200) // retour en place
        return
      }
      apresBalayage = true // le « clic » qui suit le geste ne doit rien déclencher
      setTimeout(() => (apresBalayage = false), 400)
      enCours = true
      try {
        await changer(el, dx < 0 ? 1 : -1)
      } finally {
        enCours = false
      }
    }
    el.addEventListener('pointerdown', (e) => {
      // Deuxième doigt (zoom) : le geste en cours est abandonné
      if (depart) {
        depart = null
        placer(image(el), 0, 1)
        return
      }
      if (enCours || el.dataset.zoom || (e.pointerType === 'mouse' && e.button !== 0)) return
      if (e.target.closest('input, textarea, select, button')) return
      depart = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }
    })
    el.addEventListener('pointermove', (e) => {
      if (!depart || e.pointerId !== depart.id) return
      if (el.dataset.zoom) {
        depart = null
        return
      }
      const dx = e.clientX - depart.x
      if (Math.abs(dx) > Math.abs(e.clientY - depart.y)) {
        const largeur = el.clientWidth || window.innerWidth
        placer(image(el), dx, 1 - Math.min(0.4, Math.abs(dx) / largeur))
      }
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

// Charge à l'avance les photos voisines pour qu'elles apparaissent sans attendre
export function prechargerVoisines(liste, index, champ = 'ecran') {
  for (const i of [index - 1, index + 1]) {
    const p = liste[(i + liste.length) % liste.length]
    if (p?.[champ]) new Image().src = p[champ]
  }
}
