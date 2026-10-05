<script setup>
import { computed } from 'vue'
import { dateLongue, ageTexte, lienTelephone, lienSms, lienWhatsApp } from '../coordonnees.js'
import { parler, lectureDisponible } from '../voix.js'
import { lienMessage } from '../messagerie.js'
import Avatar from './Avatar.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import Icone from '../navigation/Icone.vue'

// Fiche d'une personne de la famille pour la personne accompagnée, en gros caractères :
// lien (« Mon arrière-petit-fils »), parents, âge, « À savoir », Appeler, et lecture à voix haute.
const props = defineProps({ personne: { type: Object, required: true } })
const emit = defineEmits(['fermer'])
const petit = window.matchMedia('(max-width: 600px)').matches
const p = computed(() => props.personne)
const ans = (date) => ageTexte(date)
const annee = (d) => d?.slice(0, 4)
const lecture = lectureDisponible()
// Phrase de l'arbre (« Léo est votre arrière-petit-fils… ») ou, à défaut, prénom et lien
const texteLu = computed(() => p.value.phrase ?? [p.value.prenom, p.value.lien].filter(Boolean).join(', '))
</script>

<template>
  <div class="voile" @click.self="emit('fermer')">
    <section class="fiche" role="dialog" :aria-label="p.prenom">
      <BoutonIcone class="fermer" icone="fermer" libelle="Fermer" gros @click="emit('fermer')" />
      <Avatar :src="p.avatar" :prenom="p.prenom" :taille="petit ? 110 : 150" :class="{ gris: p.decede }" />
      <h2>{{ p.prenom }} <span v-if="p.nom" class="nom">{{ p.nom }}</span></h2>
      <p v-if="p.lienAide || p.lien" class="lien grand">{{ p.lienAide ?? p.lien }}</p>
      <p v-if="p.filiation" class="qui">{{ p.filiation }}</p>
      <template v-if="!p.decede">
        <a v-if="p.telephone" class="appeler" :href="lienTelephone(p.telephone)">
          <Icone nom="telephone" class="em" />
          <span>Appeler<br /><span class="numero">{{ p.telephone }}</span></span>
        </a>
        <!-- Inscrite dans l'application : la messagerie ; sinon SMS et WhatsApp -->
        <div v-if="p.membreId && p.cercleId && !p.moi" class="ecrire">
          <RouterLink :to="lienMessage(p.cercleId, p.membreId, true)" @click="emit('fermer')"><Icone nom="message" class="em" /> Envoyer un message</RouterLink>
        </div>
        <div v-else-if="p.telephone && !p.membreId" class="ecrire">
          <a :href="lienSms(p.telephone)"><Icone nom="sms" class="em" /> SMS</a>
          <a :href="lienWhatsApp(p.telephone)" target="_blank" rel="noopener"><Icone nom="whatsapp" class="em" /> WhatsApp</a>
        </div>
        <p v-if="p.dateNaissance" class="info">
          <Icone nom="gateau" class="em" />
          <span>{{ dateLongue(p.dateNaissance) }}<br /><strong>{{ ans(p.dateNaissance) }}</strong></span>
        </p>
        <p v-if="p.adresse" class="info">
          <Icone nom="lieu" class="em" />
          <span class="adresse">{{ p.adresse }}</span>
        </p>
      </template>
      <p v-else class="info centre">
        <span>{{ annee(p.dateNaissance) ?? '' }}<template v-if="p.dateNaissance && p.dateDeces"> – </template>{{ annee(p.dateDeces) ?? '' }}</span>
      </p>
      <p v-if="p.aSavoir" class="savoir">{{ p.aSavoir }}</p>
      <button v-if="lecture" type="button" class="ecouter" @click="parler(texteLu)"><Icone nom="son" class="em" /> Écouter</button>
    </section>
  </div>
</template>

<style scoped>
.voile { position: fixed; inset: 0; z-index: 50; background: rgb(35 48 90 / 0.45); display: grid; place-items: center; padding: 24px; }
.fiche { position: relative; background: white; border-radius: 28px; padding: 32px; width: min(560px, 100%); max-height: 100%; overflow-y: auto; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.fermer { position: absolute; top: 16px; right: 16px; }
.gris :deep(img) { filter: grayscale(1); opacity: 0.8; }
h2 { font-size: 2.4rem; margin: 0; color: var(--bleu-nuit); text-align: center; }
h2 .nom { font-size: 1.6rem; color: var(--gris); font-weight: 400; }
.lien { margin: -6px 0 0; padding: 6px 22px; border-radius: 999px; background: var(--vert-clair); color: var(--vert); font-size: 1.6rem; font-weight: 700; text-align: center; }
.qui { margin: 0; font-size: 1.5rem; color: var(--bleu-nuit); text-align: center; }
.appeler { display: flex; align-items: center; gap: 18px; width: 100%; padding: 18px 24px; border-radius: 20px; background: var(--vert); color: white; text-decoration: none; font-size: 1.8rem; font-weight: 700; }
.appeler .icone { font-size: 2.6rem; }
.ecrire { display: flex; gap: 12px; width: 100%; }
.ecrire a { flex: 1; display: flex; align-items: center; justify-content: center; gap: 12px; padding: 14px 12px; border-radius: 20px; background: var(--vert-clair); color: var(--vert); text-decoration: none; font-size: 1.5rem; font-weight: 700; }
.ecrire .icone { font-size: 2rem; }
.numero { font-size: 1.5rem; font-weight: 400; letter-spacing: 0.03em; }
.info { display: flex; align-items: center; gap: 18px; width: 100%; margin: 0; font-size: 1.6rem; color: var(--bleu-nuit); }
.info.centre { justify-content: center; color: var(--gris); }
.info .icone { font-size: 2.4rem; color: var(--vert); flex: none; }
.adresse { white-space: pre-line; }
.savoir { margin: 0; width: 100%; font-size: 1.5rem; line-height: 1.45; background: #fff7ec; border-radius: 18px; padding: 14px 20px; text-align: center; white-space: pre-line; }
.ecouter { display: flex; align-items: center; gap: 12px; font-size: 1.5rem; font-weight: 700; padding: 14px 26px; border-radius: 18px; background: var(--vert-clair); color: var(--vert); }
.ecouter .icone { font-size: 2rem; }
@media (max-width: 600px) {
  .voile { padding: 0; }
  .fiche { border-radius: 0; height: 100%; padding: 24px 16px; gap: 12px; justify-content: center; }
  h2 { font-size: 2rem; }
  h2 .nom { font-size: 1.4rem; }
  .lien { font-size: 1.3rem; }
  .qui { font-size: 1.2rem; }
  .appeler { font-size: 1.5rem; padding: 14px 18px; }
  .numero { font-size: 1.3rem; }
  .ecrire a { font-size: 1.2rem; padding: 12px 8px; gap: 8px; }
  .ecrire .icone { font-size: 1.6rem; }
  .info { font-size: 1.3rem; gap: 14px; }
  .info .icone { font-size: 2rem; }
  .savoir { font-size: 1.15rem; padding: 12px 14px; }
  .ecouter { font-size: 1.2rem; padding: 12px 20px; }
}
</style>
