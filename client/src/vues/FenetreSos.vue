<script setup>
import { ref, onMounted } from 'vue'
import { session } from '../session.js'
import { api } from '../api.js'
import { lienTelephone } from '../coordonnees.js'
import Modale from '../navigation/Modale.vue'
import Icone from '../navigation/Icone.vue'
import Avatar from './Avatar.vue'

// SOS : les aidants de la personne, avec leur visage, à appeler d'un seul toucher.
// Seuls les aidants (ni proches, ni auxiliaires, ni superviseur) ayant un téléphone sont proposés.
defineEmits(['fermer'])
const aidants = ref([])
const charge = ref(false)
onMounted(async () => {
  const vus = new Set()
  for (const c of session.cercles) {
    const cercle = await api('GET', `/cercles/${c.id}`).catch(() => null)
    for (const m of cercle?.membres ?? []) {
      if (m.role !== 'aidant' || m.moi || m.decede || !m.telephone || vus.has(m.telephone)) continue
      vus.add(m.telephone)
      aidants.value.push(m)
    }
  }
  charge.value = true
})
</script>

<template>
  <Modale titre="Besoin d'aide ? Appelez" @fermer="$emit('fermer')">
    <ul v-if="aidants.length" class="liste-sos">
      <li v-for="a in aidants" :key="a.id">
        <a :href="lienTelephone(a.telephone)" class="ligne-sos">
          <Avatar :src="a.avatar" :prenom="a.prenom" :taille="96" />
          <span class="nom-sos">{{ a.prenom }}<small v-if="a.lien">{{ a.lien }}</small></span>
          <span class="appel-sos"><Icone nom="telephone" class="en-ligne" /> Appeler</span>
        </a>
      </li>
    </ul>
    <p v-else-if="charge" class="vide-sos">Aucun numéro d'aidant n'est enregistré. Demandez à un aidant de l'ajouter.</p>
    <p v-else class="vide-sos">Chargement…</p>
  </Modale>
</template>

<style scoped>
.liste-sos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.ligne-sos {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 12px 16px;
  border-radius: 24px;
  background: var(--vert-clair);
  color: var(--bleu-nuit);
  text-decoration: none;
}
.nom-sos { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 2rem; font-weight: 700; }
.nom-sos small { font-size: 1.2rem; font-weight: 400; color: var(--gris); }
.appel-sos { display: inline-flex; align-items: center; gap: 10px; font-size: 1.6rem; font-weight: 700; padding: 16px 24px; border-radius: 18px; background: var(--vert); color: white; }
.vide-sos { font-size: 1.5rem; text-align: center; }
@media (max-width: 600px) {
  .ligne-sos { gap: 12px; padding: 10px 12px; flex-wrap: wrap; }
  .ligne-sos :deep(.avatar) { width: 72px !important; height: 72px !important; }
  .nom-sos { font-size: 1.6rem; }
  .appel-sos { flex-basis: 100%; justify-content: center; }
}
</style>
