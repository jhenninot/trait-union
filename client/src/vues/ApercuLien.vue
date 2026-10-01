<script setup>
// Aperçu d'un lien collé dans un message (titre, description, image, site), comme WhatsApp.
// L'image passe par le serveur ; toucher l'aperçu ouvre le lien.
defineEmits(['charge']) // image chargée (le fil peut descendre)
defineProps({
  lien: { type: Object, required: true }, // { url, titre, description, site, image }
  grand: { type: Boolean, default: false } // écran de la personne accompagnée
})
</script>

<template>
  <a :href="lien.url" target="_blank" rel="noopener noreferrer" class="apercu-lien" :class="{ grand }" @click.stop>
    <img v-if="lien.image" :src="lien.image" alt="" @load="$emit('charge')" @error="$event.target.style.display = 'none'" />
    <span class="corps">
      <small v-if="lien.site">{{ lien.site }}</small>
      <strong v-if="lien.titre">{{ lien.titre }}</strong>
      <span v-if="lien.description" class="description">{{ lien.description }}</span>
    </span>
  </a>
</template>

<style scoped>
.apercu-lien { display: flex; flex-direction: column; margin: 6px 0 4px; border-radius: 10px; overflow: hidden; background: rgb(0 0 0 / 0.05); color: inherit; text-decoration: none; max-width: 340px; border-left: 4px solid var(--vert); }
.apercu-lien img { display: block; width: 100%; max-height: 180px; object-fit: cover; background: #eee; }
.corps { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; min-width: 0; }
small { font-size: 0.75rem; opacity: 0.75; text-transform: lowercase; }
strong { font-size: 0.92rem; line-height: 1.3; }
.description { font-size: 0.82rem; opacity: 0.85; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.grand { max-width: 560px; border-left-width: 6px; border-radius: 16px; margin: 10px 0 6px; }
.grand img { max-height: 240px; }
.grand .corps { padding: 12px 16px; gap: 4px; }
.grand small { font-size: 1rem; }
.grand strong { font-size: 1.35rem; }
.grand .description { font-size: 1.1rem; }
@media (max-width: 600px) {
  .grand strong { font-size: 1.1rem; }
  .grand .description { font-size: 0.95rem; }
  .grand img { max-height: 170px; }
}
</style>
