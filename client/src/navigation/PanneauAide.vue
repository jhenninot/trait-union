<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { aide, fermerAide, fiche } from '../aide.js'
import { session } from '../session.js'
import { ouvrirSignalement } from '../signalement.js'
import Icone from './Icone.vue'

// Panneau d'aide contextuelle : la fiche de l'écran affiché (voir aide.js).
// Sur l'appareil de la personne accompagnée : gros caractères, phrases courtes.
const route = useRoute()
const accompagne = computed(() => session.typeSession === 'appareil')
const contenu = computed(() => fiche(route.path, accompagne.value))

const touche = (e) => { if (e.key === 'Escape') fermerAide() }
watch(() => aide.ouverte, (ouverte) => {
  if (ouverte) document.addEventListener('keydown', touche)
  else document.removeEventListener('keydown', touche)
})
// Changer d'écran ferme la fiche : elle ne correspondrait plus
watch(() => route.fullPath, fermerAide)
onBeforeUnmount(() => document.removeEventListener('keydown', touche))
</script>

<template>
  <Transition name="aide-voile">
    <div v-if="aide.ouverte" class="voile" @click="fermerAide" />
  </Transition>
  <Transition name="aide-panneau">
    <aside v-if="aide.ouverte" class="panneau" :class="{ accompagne }" role="dialog" aria-modal="true" :aria-label="`Aide : ${contenu.titre}`">
      <header>
        <span class="pastille"><Icone :nom="contenu.icone" /></span>
        <div class="titre">
          <span class="etiquette">Aide</span>
          <h2>{{ contenu.titre }}</h2>
        </div>
        <button class="fermer" aria-label="Fermer l'aide" @click="fermerAide"><Icone nom="fermer" /></button>
      </header>

      <div class="corps">
        <p class="intro">{{ contenu.intro }}</p>

        <section v-if="contenu.comment.length">
          <h3>Comment faire…</h3>
          <details v-for="c in contenu.comment" :key="c.q">
            <summary>{{ c.q }}</summary>
            <p>{{ c.r }}</p>
          </details>
        </section>

        <section v-if="contenu.astuces?.length">
          <h3>Astuces</h3>
          <ul class="astuces">
            <li v-for="a in contenu.astuces" :key="a"><Icone nom="etoile" />{{ a }}</li>
          </ul>
        </section>

        <section v-if="contenu.voix?.length">
          <h3>À la voix</h3>
          <p class="legende">Touchez « Parler » en bas de l'écran et dites par exemple :</p>
          <ul class="voix">
            <li v-for="v in contenu.voix" :key="v">« {{ v }} »</li>
          </ul>
        </section>

        <section class="signaler">
          <h3>Un problème ?</h3>
          <button type="button" class="lien-signaler" @click="ouvrirSignalement"><Icone nom="bug" class="en-ligne" /> Signaler un problème</button>
        </section>
      </div>

      <footer v-if="accompagne">
        <button class="ok" @click="fermerAide">J'ai compris</button>
      </footer>
    </aside>
  </Transition>
</template>

<style scoped>
.voile { position: fixed; inset: 0; z-index: 150; background: rgb(35 48 90 / 0.4); }
.panneau {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 151;
  width: min(420px, 100vw);
  display: flex;
  flex-direction: column;
  background: var(--fond);
  box-shadow: -12px 0 32px rgb(0 0 0 / 0.2);
}
header { display: flex; align-items: center; gap: 12px; padding: 16px; background: white; border-bottom: 1px solid #ebe8e3; }
.pastille { width: 44px; height: 44px; flex: none; border-radius: 14px; display: grid; place-items: center; background: var(--vert-clair); color: var(--vert); }
.titre { flex: 1; min-width: 0; }
.etiquette { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vert); }
h2 { margin: 2px 0 0; font-size: 1.2rem; color: var(--bleu-nuit); }
.fermer { width: 38px; height: 38px; padding: 0; border-radius: 50%; display: grid; place-items: center; background: #f3f0ea; color: var(--gris); }
.corps { flex: 1; overflow-y: auto; padding: 16px 16px calc(32px + env(safe-area-inset-bottom)); }
.intro { margin: 0 0 20px; line-height: 1.55; color: #3a3a44; }
section { margin-bottom: 22px; }
h3 { margin: 0 0 8px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--gris); }
details { background: white; border: 1px solid #ebe8e3; border-radius: 12px; margin-bottom: 8px; }
summary { list-style: none; cursor: pointer; padding: 12px 14px; font-weight: 600; display: flex; justify-content: space-between; gap: 8px; }
summary::-webkit-details-marker { display: none; }
summary::after { content: '+'; color: var(--vert); font-weight: 700; }
details[open] summary::after { content: '−'; }
details p { margin: 0; padding: 0 14px 14px; line-height: 1.55; color: #3a3a44; }
.astuces, .voix { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.astuces li { display: flex; gap: 10px; line-height: 1.5; color: #3a3a44; font-size: 0.95rem; }
.astuces .icone { width: 16px; height: 16px; margin-top: 3px; color: var(--vert); }
.legende { margin: 0 0 8px; color: var(--gris); font-size: 0.9rem; }
.voix li { padding: 10px 14px; border-radius: 10px; background: var(--vert-clair); color: var(--vert); font-style: italic; }
.lien-signaler { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-radius: 12px; background: white; border: 1px solid #ebe8e3; color: var(--bleu-nuit); font-weight: 600; }
.accompagne .lien-signaler { font-size: 1.3rem; padding: 18px; }
footer { display: none; }

/* Appareil de la personne accompagnée : lisible de loin, gros boutons */
.accompagne { width: min(640px, 100vw); }
.accompagne header { padding: 20px; }
.accompagne .pastille { width: 64px; height: 64px; border-radius: 20px; }
.accompagne .pastille :deep(svg) { width: 34px; height: 34px; }
.accompagne h2 { font-size: 1.8rem; }
.accompagne .etiquette { font-size: 0.95rem; }
.accompagne .fermer { width: 56px; height: 56px; }
.accompagne .corps { padding: 20px; }
.accompagne .intro { font-size: 1.5rem; font-weight: 700; color: var(--bleu-nuit); line-height: 1.4; }
.accompagne h3 { font-size: 1.1rem; }
.accompagne summary { font-size: 1.35rem; padding: 18px; }
.accompagne details p { font-size: 1.35rem; padding: 0 18px 18px; line-height: 1.5; }
.accompagne .legende { font-size: 1.2rem; }
.accompagne .voix li { font-size: 1.35rem; padding: 14px 18px; }
.accompagne footer { display: block; padding: 14px 20px calc(14px + env(safe-area-inset-bottom)); background: white; border-top: 1px solid #ebe8e3; }
.ok { width: 100%; padding: 20px; font-size: 1.5rem; font-weight: 700; border-radius: 16px; }
@media (max-width: 600px) {
  .accompagne .intro { font-size: 1.25rem; }
  .accompagne summary, .accompagne details p { font-size: 1.15rem; }
  .accompagne h2 { font-size: 1.5rem; }
}

.aide-voile-enter-active, .aide-voile-leave-active { transition: opacity 0.2s; }
.aide-voile-enter-from, .aide-voile-leave-to { opacity: 0; }
.aide-panneau-enter-active, .aide-panneau-leave-active { transition: transform 0.25s ease; }
.aide-panneau-enter-from, .aide-panneau-leave-to { transform: translateX(100%); }
</style>
