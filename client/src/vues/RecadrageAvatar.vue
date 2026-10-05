<script setup>
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ouvrirImage, recadrer } from '../avatars.js'
import Icone from '../navigation/Icone.vue'

// Recadrage d'une photo de profil, comme sur WhatsApp : la photo se déplace au doigt
// (ou à la souris) sous un cercle, se zoome en pinçant, à la molette ou avec le curseur,
// et peut être pivotée d'un quart de tour. Seul le carré autour du cercle est envoyé.
const props = defineProps({ fichier: { type: File, required: true } })
const emit = defineEmits(['valider', 'annuler'])

const zone = ref(null)
const ecran = ref(null)
const erreur = ref('')
const enCours = ref(false)
const pret = ref(false)

let bitmap = null
// Image affichée (le bitmap, ou une copie pivotée), et position du carré découpé
// en pixels de cette image : centre (cx, cy), côté = petit côté / zoom.
const etat = reactive({ source: null, cx: 0, cy: 0, zoom: 1 })
const taille = ref(0) // côté de la zone d'affichage, en pixels CSS

const petitCote = () => Math.min(etat.source.width, etat.source.height)
const zoomMax = computed(() => (etat.source ? Math.max(1, Math.min(6, petitCote() / 80)) : 1))
const cote = () => petitCote() / etat.zoom
const echelle = () => taille.value / cote() // pixels CSS par pixel d'image

function borner() {
  const c = cote()
  const { width: l, height: h } = etat.source
  etat.cx = Math.min(Math.max(etat.cx, c / 2), l - c / 2)
  etat.cy = Math.min(Math.max(etat.cy, c / 2), h - c / 2)
}

function centrer() {
  etat.cx = etat.source.width / 2
  etat.cy = etat.source.height / 2
  etat.zoom = 1
}

// Zoome en gardant fixe le point (px, py) de la zone, par défaut son centre
function zoomer(zoom, px = taille.value / 2, py = taille.value / 2) {
  const k = echelle()
  const x = etat.cx - cote() / 2 + px / k
  const y = etat.cy - cote() / 2 + py / k
  etat.zoom = Math.min(Math.max(zoom, 1), zoomMax.value)
  const k2 = echelle()
  etat.cx = x - px / k2 + cote() / 2
  etat.cy = y - py / k2 + cote() / 2
  borner()
}

function deplacer(dx, dy) {
  const k = echelle()
  etat.cx -= dx / k
  etat.cy -= dy / k
  borner()
}

function dessiner() {
  const canvas = ecran.value
  if (!canvas || !etat.source || !taille.value) return
  const ratio = window.devicePixelRatio || 1
  const s = taille.value
  if (canvas.width !== Math.round(s * ratio)) {
    canvas.width = canvas.height = Math.round(s * ratio)
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, s, s)
  const k = echelle()
  const c = cote()
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(etat.source, -(etat.cx - c / 2) * k, -(etat.cy - c / 2) * k, etat.source.width * k, etat.source.height * k)
  // Voile autour du cercle, comme la future pastille d'avatar
  ctx.beginPath()
  ctx.rect(0, 0, s, s)
  ctx.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2)
  ctx.fillStyle = 'rgb(0 0 0 / 0.55)'
  ctx.fill('evenodd')
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgb(255 255 255 / 0.9)'
  ctx.lineWidth = 2
  ctx.stroke()
}

watch(() => [etat.cx, etat.cy, etat.zoom, etat.source, taille.value], dessiner)

function mesurer() {
  if (zone.value) taille.value = zone.value.clientWidth
}

// Quart de tour dans le sens des aiguilles d'une montre
function pivoter() {
  const { width: l, height: h } = etat.source
  const canvas = document.createElement('canvas')
  canvas.width = h
  canvas.height = l
  const ctx = canvas.getContext('2d')
  ctx.translate(h, 0)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(etat.source, 0, 0)
  etat.source = markRaw(canvas)
  centrer()
}

// Doigts ou souris : un pointeur déplace, deux pointeurs zooment (pincement)
const pointeurs = new Map()
const position = (e) => {
  const r = ecran.value.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function appui(e) {
  ecran.value.setPointerCapture(e.pointerId)
  pointeurs.set(e.pointerId, position(e))
}

function glisse(e) {
  if (!pointeurs.has(e.pointerId)) return
  const avant = [...pointeurs.values()]
  pointeurs.set(e.pointerId, position(e))
  const apres = [...pointeurs.values()]
  if (apres.length === 1) {
    deplacer(apres[0].x - avant[0].x, apres[0].y - avant[0].y)
  } else if (apres.length >= 2) {
    const milieu = (p) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 })
    const ecart = (p) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1
    const m1 = milieu(avant)
    const m2 = milieu(apres)
    zoomer(etat.zoom * ecart(apres) / ecart(avant), m2.x, m2.y)
    deplacer(m2.x - m1.x, m2.y - m1.y)
  }
}

function lache(e) {
  pointeurs.delete(e.pointerId)
}

function molette(e) {
  const p = position(e)
  zoomer(etat.zoom * Math.exp(-e.deltaY * 0.002), p.x, p.y)
}

function touche(e) {
  const pas = 20
  const actions = {
    Escape: () => emit('annuler'),
    ArrowLeft: () => deplacer(pas, 0),
    ArrowRight: () => deplacer(-pas, 0),
    ArrowUp: () => deplacer(0, pas),
    ArrowDown: () => deplacer(0, -pas),
    '+': () => zoomer(etat.zoom * 1.1),
    '-': () => zoomer(etat.zoom / 1.1)
  }
  if (actions[e.key]) {
    e.preventDefault()
    actions[e.key]()
  }
}

async function valider() {
  enCours.value = true
  erreur.value = ''
  try {
    const c = cote()
    emit('valider', await recadrer(etat.source, { sx: etat.cx - c / 2, sy: etat.cy - c / 2, cote: c }))
  } catch (e) {
    erreur.value = e.message
    enCours.value = false
  }
}

const curseur = computed({
  get: () => etat.zoom,
  set: (v) => zoomer(Number(v))
})

onMounted(async () => {
  window.addEventListener('resize', mesurer)
  try {
    bitmap = await ouvrirImage(props.fichier)
    etat.source = markRaw(bitmap)
    centrer()
    pret.value = true
    await nextTick()
    mesurer()
    zone.value?.focus()
  } catch (e) {
    erreur.value = e.message
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', mesurer)
  bitmap?.close()
})
</script>

<template>
  <div class="voile" @keydown="touche">
    <div class="fenetre" role="dialog" aria-modal="true" aria-labelledby="recadrage-titre">
      <h2 id="recadrage-titre">Recadrer la photo</h2>
      <p class="aide">Déplacez la photo et zoomez pour placer le visage dans le cercle.</p>

      <div ref="zone" class="zone" tabindex="0" aria-label="Photo à recadrer : flèches pour déplacer, + et - pour zoomer">
        <canvas
          v-if="pret"
          ref="ecran"
          @pointerdown="appui"
          @pointermove="glisse"
          @pointerup="lache"
          @pointercancel="lache"
          @wheel.prevent="molette"
        />
        <p v-else-if="!erreur" class="chargement">Ouverture de la photo…</p>
      </div>

      <div v-if="pret" class="reglages">
        <button type="button" class="icone" aria-label="Dézoomer" :disabled="etat.zoom <= 1" @click="zoomer(etat.zoom / 1.25)">
          <Icone nom="loupe_moins" />
        </button>
        <input v-model="curseur" type="range" min="1" :max="zoomMax" step="0.01" aria-label="Zoom" />
        <button type="button" class="icone" aria-label="Zoomer" :disabled="etat.zoom >= zoomMax" @click="zoomer(etat.zoom * 1.25)">
          <Icone nom="loupe_plus" />
        </button>
        <button type="button" class="icone" aria-label="Pivoter d'un quart de tour" title="Pivoter" @click="pivoter">
          <Icone nom="pivoter" />
        </button>
      </div>

      <p v-if="erreur" class="erreur">{{ erreur }}</p>

      <div class="boutons">
        <button type="button" class="secondaire" @click="emit('annuler')">Annuler</button>
        <button type="button" :disabled="!pret || enCours" @click="valider">
          <Icone nom="coche" /> Valider
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.voile {
  position: fixed;
  inset: 0;
  z-index: 190;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgb(35 48 90 / 0.6);
}
.fenetre {
  width: 100%;
  max-width: 420px;
  max-height: 100%;
  overflow-y: auto;
  padding: 20px;
  border-radius: 16px;
  background: white;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.25);
}
h2 { margin: 0; font-size: 1.2rem; color: var(--bleu-nuit); }
.aide { margin: 6px 0 14px; }
.zone {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: #111;
  outline-offset: 3px;
}
.zone canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
.zone canvas:active { cursor: grabbing; }
.chargement { margin: 0; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: white; }
.reglages { display: flex; align-items: center; gap: 6px; margin-top: 12px; }
.reglages input { flex: 1; accent-color: var(--vert); }
button.icone {
  display: inline-flex;
  padding: 8px;
  background: none;
  color: var(--bleu-nuit);
}
button.icone :deep(svg) { width: 22px; height: 22px; }
.erreur { margin: 10px 0 0; }
.boutons { display: flex; gap: 10px; margin-top: 16px; }
.boutons button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 16px;
  font-weight: 600;
  border-radius: 10px;
}
.boutons button :deep(svg) { width: 18px; height: 18px; }
</style>
