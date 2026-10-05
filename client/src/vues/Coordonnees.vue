<script setup>
import { naissance, lienTelephone, lienSms, lienWhatsApp } from '../coordonnees.js'
import { lienMessage } from '../messagerie.js'
import Icone from '../navigation/Icone.vue'

// Téléphone (appel, SMS ou WhatsApp), date de naissance avec l'âge et adresse d'une personne
// Pour une personne inscrite dans un cercle (`membreId` et `cercleId`), un bouton ouvre la messagerie de
// l'application à la place du SMS et de WhatsApp ; `inscrite` sans `membreId` (soi-même) : aucun des deux.
defineProps({ personne: { type: Object, required: true }, membreId: { type: String, default: null }, cercleId: { type: String, default: null }, inscrite: Boolean })
</script>

<template>
  <ul class="coordonnees">
    <li v-if="personne.telephone">
      <Icone nom="telephone" class="en-ligne" />
      <a :href="lienTelephone(personne.telephone)">{{ personne.telephone }}</a>
      <span v-if="inscrite && !(membreId && cercleId)" />
      <span v-else-if="membreId && cercleId" class="contacts">
        <RouterLink :to="lienMessage(cercleId, membreId)" class="contact" title="Envoyer un message" aria-label="Envoyer un message dans l'application"><Icone nom="message" /></RouterLink>
      </span>
      <span v-else class="contacts">
        <a :href="lienSms(personne.telephone)" class="contact" title="Envoyer un SMS" aria-label="Envoyer un SMS"><Icone nom="sms" /></a>
        <a :href="lienWhatsApp(personne.telephone)" class="contact" target="_blank" rel="noopener" title="Écrire sur WhatsApp" aria-label="Écrire sur WhatsApp"><Icone nom="whatsapp" /></a>
      </span>
    </li>
    <li v-if="personne.dateNaissance"><Icone nom="gateau" class="en-ligne" /> {{ naissance(personne.dateNaissance) }}</li>
    <li v-if="personne.adresse" class="adresse"><Icone nom="lieu" class="en-ligne" /> <span>{{ personne.adresse }}</span></li>
  </ul>
</template>

<style scoped>
.coordonnees { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.coordonnees li { display: flex; align-items: baseline; gap: 8px; }
.coordonnees .icone { color: var(--vert); position: relative; top: 0.15em; }
.adresse span { white-space: pre-line; }
.contacts { display: inline-flex; gap: 6px; align-self: center; }
.contact { width: 32px; height: 32px; border-radius: 50%; background: var(--vert-clair); display: grid; place-items: center; }
.coordonnees .contact .icone { top: 0; width: 18px; height: 18px; }
</style>
