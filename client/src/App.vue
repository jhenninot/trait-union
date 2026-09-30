<script setup>
import { useRouter } from 'vue-router'
import { session, deconnecter } from './session.js'
import logo from './logo.svg'

const router = useRouter()

async function seDeconnecter() {
  await deconnecter()
  router.push('/connexion')
}
</script>

<template>
  <header v-if="session.utilisateur && session.typeSession !== 'appareil'" class="entete">
    <RouterLink to="/"><img :src="logo" alt="Trait d'union" class="logo-entete" /></RouterLink>
    <span class="qui">{{ session.utilisateur.prenom }}<span v-if="session.utilisateur.estAdmin"> · admin</span></span>
    <button class="lien" @click="seDeconnecter">Se déconnecter</button>
  </header>
  <RouterView />
</template>

<style>
:root {
  --vert: #2f8f6b;
  --vert-clair: #e7f4ee;
  --bleu-nuit: #23305a;
  --gris: #6b6b78;
  --fond: #faf8f5;
  --rouge: #b3261e;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: var(--fond);
  color: #2b2b2b;
  font-size: 1.05rem;
}
main {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 16px;
}
h1 { color: var(--bleu-nuit); }
.entete {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: white;
  border-bottom: 1px solid #eee;
}
.logo-entete { height: 36px; display: block; }
.qui { margin-left: auto; color: var(--gris); }
.carte {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin: 12px 0;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
}
form { display: flex; flex-direction: column; gap: 12px; }
label { display: flex; flex-direction: column; gap: 4px; font-weight: 500; }
input, select {
  font: inherit;
  padding: 10px 12px;
  border: 1px solid #ccc;
  border-radius: 8px;
  background: white;
}
button {
  font: inherit;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: var(--vert);
  color: white;
  cursor: pointer;
}
button.secondaire { background: var(--vert-clair); color: var(--vert); }
button.danger { background: none; color: var(--rouge); padding: 4px 8px; }
button.lien { background: none; color: var(--vert); padding: 4px 8px; }
button:disabled { opacity: 0.6; cursor: default; }
.erreur { color: var(--rouge); }
.aide { color: var(--gris); font-size: 0.9rem; }
a { color: var(--vert); }
</style>
