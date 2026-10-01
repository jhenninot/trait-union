<script setup>
import { session } from '../session.js'
import EcranAccompagne from './EcranAccompagne.vue'
import AccueilAidant from './AccueilAidant.vue'
</script>

<template>
  <EcranAccompagne v-if="session.typeSession === 'appareil'" />
  <AccueilAidant v-else />
</template>
