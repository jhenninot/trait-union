<script setup>
import { nextTick, ref, watch } from 'vue'
import { fenetre } from '../fenetre.js'
import { session } from '../session.js'
import Icone from './Icone.vue'

// Fenêtre de confirmation ou d'information, dans le style de l'application.
// Sur l'appareil de la personne accompagnée : très gros texte et gros boutons.
const boutonNon = ref(null)
const boutonOui = ref(null)

watch(() => fenetre.ouverte, async (f) => {
  if (!f) return
  await nextTick()
  // Le focus va sur le bouton le moins risqué
  ;(boutonNon.value ?? boutonOui.value)?.focus()
})

function touche(e) {
  if (e.key === 'Escape') fenetre.ouverte?.repondre(false)
}
</script>

<template>
  <Transition name="fenetre">
    <div v-if="fenetre.ouverte" class="voile" :class="{ accompagne: session.typeSession === 'appareil' }"
      @click.self="fenetre.ouverte.repondre(false)" @keydown="touche">
      <div class="fenetre" role="alertdialog" aria-modal="true" aria-labelledby="fenetre-message">
        <span v-if="fenetre.ouverte.icone" class="pastille" :class="{ danger: fenetre.ouverte.danger }">
          <Icone :nom="fenetre.ouverte.icone" />
        </span>
        <h2 v-if="fenetre.ouverte.titre">{{ fenetre.ouverte.titre }}</h2>
        <p id="fenetre-message">{{ fenetre.ouverte.message }}</p>
        <div class="boutons">
          <button v-if="fenetre.ouverte.non" ref="boutonNon" class="secondaire" @click="fenetre.ouverte.repondre(false)">
            {{ fenetre.ouverte.non }}
          </button>
          <button ref="boutonOui" class="valider" :class="{ rouge: fenetre.ouverte.danger }" @click="fenetre.ouverte.repondre(true)">
            {{ fenetre.ouverte.oui }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.voile {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgb(35 48 90 / 0.45);
}
.fenetre {
  width: 100%;
  max-width: 420px;
  padding: 24px 20px 20px;
  border-radius: 16px;
  background: white;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.25);
  text-align: center;
}
.pastille {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--vert-clair);
  color: var(--vert);
}
.pastille.danger { background: #fbeceb; color: var(--rouge); }
.pastille :deep(svg) { width: 26px; height: 26px; }
h2 { margin: 12px 0 0; font-size: 1.2rem; color: var(--bleu-nuit); }
p { margin: 12px 0 0; color: #2b2b2b; line-height: 1.45; }
.boutons { display: flex; gap: 10px; margin-top: 20px; }
.boutons button { flex: 1; padding: 12px 16px; font-weight: 600; border-radius: 10px; }
.boutons .rouge { background: var(--rouge); color: white; }

/* Appareil de la personne accompagnée : lisible de loin, gros boutons */
.accompagne .fenetre { max-width: 560px; padding: 32px 24px 24px; border-radius: 22px; }
.accompagne .pastille { width: 72px; height: 72px; }
.accompagne .pastille :deep(svg) { width: 36px; height: 36px; }
.accompagne h2 { font-size: 1.6rem; }
.accompagne p { font-size: 1.5rem; font-weight: 700; color: var(--bleu-nuit); }
.accompagne .boutons { gap: 14px; margin-top: 28px; }
.accompagne .boutons button { padding: 18px 12px; font-size: 1.4rem; font-weight: 700; border-radius: 16px; }
@media (max-width: 600px) {
  .accompagne p { font-size: 1.25rem; }
  .accompagne .boutons button { font-size: 1.2rem; padding: 16px 10px; }
}

.fenetre-enter-active, .fenetre-leave-active { transition: opacity 0.15s; }
.fenetre-enter-active .fenetre, .fenetre-leave-active .fenetre { transition: transform 0.15s; }
.fenetre-enter-from, .fenetre-leave-to { opacity: 0; }
.fenetre-enter-from .fenetre, .fenetre-leave-to .fenetre { transform: scale(0.96); }
</style>
