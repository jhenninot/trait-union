<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { api } from '../api.js'
import Avatar from './Avatar.vue'
import Jeux from './Jeux.vue'

// Rubrique « Jeux » des aidants et des proches : essayer les jeux d'une personne accompagnée, avec
// ses réglages et les photos de sa famille. Rien n'est compté dans ses statistiques.
const route = useRoute()
const cercle = ref(null)
const erreur = ref('')

async function charger() {
  try {
    erreur.value = ''
    cercle.value = await api('GET', `/cercles/${route.params.id}`)
  } catch (e) { erreur.value = e.message }
}
watch(() => route.params.id, charger, { immediate: true })

const accompagnes = computed(() => (cercle.value?.membres ?? []).filter((m) => m.role === 'accompagne' && !m.decede))
const choisi = computed(() => accompagnes.value.find((m) => m.utilisateurId === route.params.pour) ?? null)
</script>

<template>
  <main class="essai">
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <template v-else-if="cercle">
      <template v-if="choisi">
        <p v-if="choisi.jeux && choisi.jeux.actif === false" class="info">Les jeux sont désactivés pour {{ choisi.prenom }} : il n'y a pas accès sur sa tablette.</p>
        <Jeux :key="choisi.utilisateurId" :pour="choisi.utilisateurId" :cercle-id="cercle.id" />
      </template>
      <template v-else>
        <h1>Jeux</h1>
        <p class="sous">Essayez les jeux de la personne accompagnée, tels qu'elle ou il les voit.</p>
        <p v-if="!accompagnes.length" class="sous">Aucune personne accompagnée dans ce cercle pour l'instant.</p>
        <div class="liste">
          <RouterLink v-for="m in accompagnes" :key="m.id" :to="`/cercles/${cercle.id}/jeux/${m.utilisateurId}`" class="carte">
            <Avatar :src="m.avatar" :prenom="m.prenom" :taille="48" />
            <strong>{{ m.prenom }}</strong>
          </RouterLink>
        </div>
      </template>
    </template>
  </main>
</template>

<style scoped>
.essai { flex: 1; padding: 24px; min-width: 0; }
h1 { margin: 0 0 4px; }
.sous { color: var(--gris); margin: 0 0 16px; }
.liste { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; max-width: 760px; }
.carte { display: flex; align-items: center; gap: 12px; background: white; border-radius: 14px; padding: 14px 16px; text-decoration: none; color: var(--bleu-nuit); box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); }
.info { background: #fff7ec; color: #b46a22; border-radius: 12px; padding: 10px 14px; margin: 0 0 12px; }
.erreur { color: var(--rouge); }
</style>
