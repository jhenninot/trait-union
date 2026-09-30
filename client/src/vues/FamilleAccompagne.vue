<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api.js'
import { session } from '../session.js'

// « Ma famille » pour la personne accompagnée : les visages et prénoms de son cercle
const personnes = ref([])
const charge = ref(false)

onMounted(async () => {
  const vus = new Set()
  for (const c of session.cercles) {
    const cercle = await api('GET', `/cercles/${c.id}`).catch(() => null)
    for (const m of cercle?.membres ?? []) {
      const cle = `${m.prenom} ${m.nom ?? ''}`
      if (m.role === 'accompagne' || vus.has(cle)) continue
      vus.add(cle)
      personnes.value.push(m)
    }
  }
  charge.value = true
})
</script>

<template>
  <main class="famille">
    <h1>Ma famille</h1>
    <p v-if="charge && !personnes.length" class="vide">Personne pour l'instant.</p>
    <div class="grille">
      <div v-for="p in personnes" :key="p.id" class="personne">
        <span class="initiale" aria-hidden="true">{{ p.prenom.charAt(0) }}</span>
        <span class="prenom">{{ p.prenom }}</span>
        <span v-if="p.nom" class="nom">{{ p.nom }}</span>
      </div>
    </div>
  </main>
</template>

<style scoped>
.famille { max-width: none; flex: 1; padding: 32px 24px; overflow-y: auto; }
h1 { font-size: 2.6rem; text-align: center; margin: 0 0 24px; }
.vide { font-size: 1.6rem; text-align: center; color: var(--gris); }
.grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
.personne {
  background: white;
  border-radius: 24px;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.08);
}
.initiale {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--vert-clair);
  color: var(--vert);
  font-size: 3rem;
  font-weight: 700;
}
.prenom { font-size: 2rem; font-weight: 700; color: var(--bleu-nuit); }
.nom { font-size: 1.3rem; color: var(--gris); }
/* Smartphone : deux personnes par ligne */
@media (max-width: 600px) {
  .famille { padding: 20px 12px; }
  h1 { font-size: 2rem; margin-bottom: 16px; }
  .grille { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .personne { padding: 16px 8px; border-radius: 18px; }
  .initiale { width: 72px; height: 72px; font-size: 2.2rem; }
  .prenom { font-size: 1.4rem; }
  .nom { font-size: 1.05rem; }
}
</style>
