<script setup>
import { ref, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import Icone from '../navigation/Icone.vue'

// Console d'administration : une page à onglets qui regroupe toutes les rubriques d'administration.
const route = useRoute()
const barre = ref(null)

const onglets = [
  { chemin: '/admin/statistiques', nom: 'Statistiques', icone: 'statistiques' },
  { chemin: '/admin/cercles', nom: 'Cercles', icone: 'cercle' },
  { chemin: '/admin/utilisateurs', nom: 'Utilisateurs', icone: 'famille' },
  { chemin: '/admin/journal', nom: 'Journal', icone: 'journal' },
  { chemin: '/admin/email', nom: 'Emails', icone: 'email' },
  { chemin: '/admin/photos', nom: 'Photos', icone: 'nuage' },
  { chemin: '/admin/alertes', nom: 'Alertes', icone: 'cloche' },
  { chemin: '/admin/messagerie', nom: 'Messagerie', icone: 'message' },
  { chemin: '/admin/presentation', nom: 'Présentation', icone: 'oeil' }
]

// Garde l'onglet actif visible quand la barre défile (téléphone)
watch(() => route.path, async () => {
  await nextTick()
  barre.value?.querySelector('.actif')?.scrollIntoView({ block: 'nearest', inline: 'center' })
}, { immediate: true })
</script>

<template>
  <div class="console">
    <p class="titre-console"><Icone nom="bouclier" class="en-ligne" /> Console d'administration</p>
    <nav ref="barre" class="onglets-admin" aria-label="Rubriques d'administration">
      <RouterLink v-for="o in onglets" :key="o.chemin" :to="o.chemin" class="onglet" :class="{ actif: route.path === o.chemin }">
        <Icone :nom="o.icone" class="en-ligne" /> {{ o.nom }}
      </RouterLink>
    </nav>
    <RouterView />
  </div>
</template>

<style scoped>
.console { max-width: 1100px; margin: 0 auto; padding: 16px 16px 0; }
.titre-console { margin: 0 0 8px; font-weight: 700; color: var(--bleu-nuit); font-size: 1.1rem; }
.onglets-admin {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  border-bottom: 1px solid #ebe8e3;
  scrollbar-width: thin;
}
.onglet {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 10px 10px 0 0;
  color: #3a3a44;
  text-decoration: none;
  font-weight: 500;
  white-space: nowrap;
  border-bottom: 3px solid transparent;
}
.onglet:hover { background: #f5f3ef; }
.onglet.actif { color: var(--vert); border-bottom-color: var(--vert); background: var(--vert-clair); }
</style>
