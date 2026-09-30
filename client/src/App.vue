<script setup>
import { ref, onMounted } from 'vue'
import logo from './logo.svg'

const version = ref('')

onMounted(async () => {
  try {
    const res = await fetch('/api/health')
    version.value = (await res.json()).version
  } catch {
    version.value = 'hors ligne'
  }
})
</script>

<template>
  <main>
    <img :src="logo" alt="Trait d'union" class="logo" />
    <p class="slogan">Le lien entre toi et les tiens.</p>
    <p class="version">Version {{ version }}</p>
  </main>
</template>

<style>
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #faf8f5;
  color: #2b2b2b;
}
main {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  text-align: center;
}
.logo {
  max-width: 360px;
  width: 100%;
}
.slogan {
  font-size: 1.5rem;
}
.version {
  font-size: 0.9rem;
  opacity: 0.6;
}
</style>
