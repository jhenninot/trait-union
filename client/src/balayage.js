// Directive v-balayage : visionneuse en carrousel, comme Google Photos. Les photos sont posées
// côte à côte sur une « piste » : pendant que le doigt glisse, la photo actuelle et sa voisine
// avancent ensemble ; au lâcher, la piste finit le mouvement en douceur (ou revient en place).
// Tout autre changement de photo (flèches, clavier, diaporama) glisse de la même façon.
//
// Gabarit attendu dans l'élément :
//   <div class="piste">
//     <div v-for="d in diapos(liste, index)" :key="d.cle" :data-role="d.role" :data-id="d.photo.id">
//       <img ...>
//     </div>
//   </div>
// Valeur : { suivante, precedente } (fonctions), et duree (ms) pour les changements sans geste.
// Le mouvement vertical reste libre (touch-action: pan-y) pour faire défiler la page.
const SEUIL = 60 // px à parcourir horizontalement pour changer de photo...
const VITESSE = 0.5 // ...ou un geste vif (px/ms) d'au moins 25 px
const ECART = 24 // px entre deux photos sur la piste
const DUREE = 380 // ms, changement par flèche ou diaporama
const DUREE_LACHER = 300 // ms, fin du mouvement après le geste
const COURBE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'

const pisteDe = (el) => el.querySelector('.piste')
const diapo = (p, role) => p?.querySelector(`:scope > [data-role="${role}"]`)
const pas = (p) => p.offsetWidth + ECART

// Position réelle de la piste à l'écran, même au milieu d'une animation
function decalage(p) {
  const t = getComputedStyle(p).transform
  return t && t !== 'none' ? new DOMMatrixReadOnly(t).m41 : 0
}

function poser(p, x, duree = 0) {
  p.style.transition = duree ? `transform ${duree}ms ${COURBE}` : 'none'
  p.style.transform = x ? `translateX(${x}px)` : ''
}

// Chaque photo occupe toute la piste ; les voisines sont rangées à gauche et à droite
const POSITIONS = { avant: `translateX(calc(-100% - ${ECART}px))`, courante: '', apres: `translateX(calc(100% + ${ECART}px))` }
function ranger(p) {
  Object.assign(p.style, { position: 'relative', userSelect: 'none', willChange: 'transform' })
  for (const d of p.children) {
    Object.assign(d.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transform: POSITIONS[d.dataset.role] ?? '',
      pointerEvents: d.dataset.role === 'courante' ? '' : 'none'
    })
  }
}

const lireIds = (p) => ({
  avant: diapo(p, 'avant')?.dataset.id,
  courante: diapo(p, 'courante')?.dataset.id,
  apres: diapo(p, 'apres')?.dataset.id
})

export const balayage = {
  mounted(el, liaison) {
    const b = (el._balayage = { valeur: liaison.value, depart: null, sensVoulu: 0, retour: null, apresBalayage: false })
    el.style.touchAction = 'pan-y'
    const p0 = pisteDe(el)
    if (p0) {
      ranger(p0)
      b.ids = lireIds(p0)
    }

    const fin = (e) => {
      const d = b.depart
      if (!d || e.pointerId !== d.id) return
      b.depart = null
      const p = pisteDe(el)
      if (!p) return
      // Photo agrandie ou pincée (v-zoom) : pas de changement de photo
      if (el.dataset.zoom) return poser(p, 0)
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      const x = decalage(p)
      const vitesse = Math.abs(dx) / Math.max(1, performance.now() - d.t)
      const sens = x < 0 ? 1 : -1 // la voisine qui apparaît
      const horizontal = d.glisse && Math.abs(dx) > 1.5 * Math.abs(dy)
      const vif = vitesse >= VITESSE && Math.abs(dx) >= 25 && Math.sign(dx) === -sens
      const valide = e.type !== 'pointercancel' && horizontal && (Math.abs(x) >= SEUIL || vif)
      if (d.glisse) {
        b.apresBalayage = true // le « clic » qui suit le geste ne doit rien déclencher
        setTimeout(() => (b.apresBalayage = false), 400)
      }
      if (!valide || !diapo(p, sens > 0 ? 'apres' : 'avant')) return poser(p, 0, 250) // retour en place
      // La photo change : updated() reprend la piste là où elle est et finit le mouvement
      b.sensVoulu = sens
      b.dureeProchaine = DUREE_LACHER
      clearTimeout(b.retour)
      b.retour = setTimeout(() => poser(p, 0, 250), 600) // la photo n'a pas changé
      if (sens > 0) b.valeur?.suivante?.()
      else b.valeur?.precedente?.()
    }

    el.addEventListener('pointerdown', (e) => {
      const p = pisteDe(el)
      // Deuxième doigt (zoom) : le geste en cours est abandonné
      if (b.depart) {
        b.depart = null
        if (p) poser(p, 0, 200)
        return
      }
      if (!p || el.dataset.zoom || (e.pointerType === 'mouse' && e.button !== 0)) return
      if (e.target.closest('input, textarea, select, button, a')) return
      // On rattrape la piste au vol si elle glisse encore
      const x0 = decalage(p)
      poser(p, x0)
      b.depart = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), x0, glisse: false }
    })
    el.addEventListener('pointermove', (e) => {
      const d = b.depart
      if (!d || e.pointerId !== d.id) return
      const p = pisteDe(el)
      if (!p || el.dataset.zoom) {
        b.depart = null
        return
      }
      const dx = e.clientX - d.x
      if (!d.glisse && Math.abs(dx) < 6) return
      if (!d.glisse && Math.abs(dx) <= Math.abs(e.clientY - d.y)) return
      d.glisse = true
      let x = d.x0 + dx
      // Pas de photo de ce côté : la piste résiste
      if ((x < 0 && !diapo(p, 'apres')) || (x > 0 && !diapo(p, 'avant'))) x /= 3
      poser(p, x)
    })
    el.addEventListener('pointerup', fin)
    el.addEventListener('pointercancel', fin)
    el.addEventListener('click', (e) => {
      if (b.apresBalayage) {
        e.stopPropagation()
        e.preventDefault()
      }
    }, true)
    // Évite que le navigateur « attrape » l'image pour un glisser-déposer à la souris
    el.addEventListener('dragstart', (e) => e.preventDefault())
  },
  updated(el, liaison) {
    const b = el._balayage
    b.valeur = liaison.value
    const p = pisteDe(el)
    if (!p) return
    ranger(p)
    const avant = b.ids
    const ids = (b.ids = lireIds(p))
    if (!avant || ids.courante === avant.courante) return
    clearTimeout(b.retour)
    // D'où vient la nouvelle photo ? (avec deux photos en boucle, c'est la même des deux côtés)
    let sens = ids.courante === avant.apres ? 1 : ids.courante === avant.avant ? -1 : 0
    if (avant.apres === avant.avant && sens) sens = b.sensVoulu || 1
    const duree = b.dureeProchaine ?? b.valeur?.duree ?? DUREE
    b.sensVoulu = 0
    b.dureeProchaine = null
    if (!sens || b.depart) {
      // Autre photo ouverte, liste rechargée, ou doigt posé : pas d'animation
      b.depart = null
      return poser(p, 0)
    }
    // La photo affichée à l'écran ne bouge pas d'un pixel : seule la piste a été réorganisée.
    // On la décale d'un cran pour compenser, puis elle glisse jusqu'à la nouvelle photo.
    poser(p, decalage(p) + sens * pas(p))
    p.getBoundingClientRect() // applique la position de départ avant l'animation
    poser(p, 0, duree)
  }
}

// Photos à poser sur la piste : la photo i et ses voisines (boucle : la liste tourne en rond)
export function diapos(liste, i, boucle = false) {
  const n = liste.length
  const courante = i == null ? null : liste[i]
  if (!courante) return []
  const r = [{ role: 'courante', photo: courante, cle: courante.id }]
  if (n < 2) return r
  const voisine = (j) => (boucle ? liste[(j + n) % n] : liste[j])
  const apres = voisine(i + 1)
  const avant = voisine(i - 1)
  if (apres) r.push({ role: 'apres', photo: apres, cle: apres.id })
  if (avant) r.push({ role: 'avant', photo: avant, cle: avant === apres ? `${avant.id}-bis` : avant.id })
  return r
}

// Les voisines directes sont déjà sur la piste : on charge à l'avance les suivantes
export function prechargerVoisines(liste, index, champ = 'ecran') {
  if (liste.length < 4) return
  for (const i of [index - 2, index + 2]) {
    const p = liste[(i + liste.length) % liste.length]
    if (p?.[champ]) new Image().src = p[champ]
  }
}
