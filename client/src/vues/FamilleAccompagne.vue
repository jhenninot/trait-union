<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api.js'
import { session } from '../session.js'
import { dateLongue, age, ans as nbAns, lienTelephone } from '../coordonnees.js'
import Avatar from './Avatar.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import Icone from '../navigation/Icone.vue'

// « Ma famille » pour la personne accompagnée : les visages et prénoms de son cercle.
// Toucher une personne ouvre sa fiche : téléphone, date de naissance et âge, adresse.
const personnes = ref([])
const charge = ref(false)
const fiche = ref(null)
const ans = (date) => nbAns(age(date))
// Visages plus petits sur smartphone (deux personnes par ligne)
const petit = window.matchMedia('(max-width: 600px)').matches
const taille = petit ? 88 : 132

onMounted(async () => {
  const vus = new Set()
  for (const c of session.cercles) {
    const cercle = await api('GET', `/cercles/${c.id}`).catch(() => null)
    for (const m of cercle?.membres ?? []) {
      const cle = `${m.prenom} ${m.nom ?? ''}`
      // Les autres personnes accompagnées du cercle (un conjoint, par exemple) y figurent aussi
      if (m.moi || vus.has(cle)) continue
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
      <button v-for="p in personnes" :key="p.id" type="button" class="personne" @click="fiche = p">
        <Avatar :src="p.avatar" :prenom="p.prenom" :taille="taille" />
        <span class="prenom">{{ p.prenom }}</span>
        <span v-if="p.nom" class="nom">{{ p.nom }}</span>
      </button>
    </div>

    <div v-if="fiche" class="voile" @click.self="fiche = null">
      <section class="fiche" role="dialog" :aria-label="fiche.prenom">
        <BoutonIcone class="fermer" icone="fermer" libelle="Fermer" gros @click="fiche = null" />
        <Avatar :src="fiche.avatar" :prenom="fiche.prenom" :taille="petit ? 110 : 150" />
        <h2>{{ fiche.prenom }} <span v-if="fiche.nom" class="nom">{{ fiche.nom }}</span></h2>
        <a v-if="fiche.telephone" class="appeler" :href="lienTelephone(fiche.telephone)">
          <Icone nom="telephone" class="em" />
          <span>Appeler<br /><span class="numero">{{ fiche.telephone }}</span></span>
        </a>
        <p v-if="fiche.dateNaissance" class="info">
          <Icone nom="gateau" class="em" />
          <span>{{ dateLongue(fiche.dateNaissance) }}<br /><strong>{{ ans(fiche.dateNaissance) }}</strong></span>
        </p>
        <p v-if="fiche.adresse" class="info">
          <Icone nom="lieu" class="em" />
          <span class="adresse">{{ fiche.adresse }}</span>
        </p>
      </section>
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
  color: inherit;
  border-radius: 24px;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.08);
}
.prenom { font-size: 2rem; font-weight: 700; color: var(--bleu-nuit); }
.nom { font-size: 1.3rem; color: var(--gris); font-weight: 400; }

/* Fiche d'une personne, en gros caractères */
.voile {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgb(35 48 90 / 0.45);
  display: grid;
  place-items: center;
  padding: 24px;
}
.fiche {
  position: relative;
  background: white;
  border-radius: 28px;
  padding: 32px;
  width: min(560px, 100%);
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}
.fermer { position: absolute; top: 16px; right: 16px; }
h2 { font-size: 2.4rem; margin: 0; color: var(--bleu-nuit); text-align: center; }
h2 .nom { font-size: 1.6rem; }
.appeler {
  display: flex;
  align-items: center;
  gap: 18px;
  width: 100%;
  padding: 18px 24px;
  border-radius: 20px;
  background: var(--vert);
  color: white;
  text-decoration: none;
  font-size: 1.8rem;
  font-weight: 700;
}
.appeler .icone { font-size: 2.6rem; }
.numero { font-size: 1.5rem; font-weight: 400; letter-spacing: 0.03em; }
.info { display: flex; align-items: center; gap: 18px; width: 100%; margin: 0; font-size: 1.6rem; color: var(--bleu-nuit); }
.info .icone { font-size: 2.4rem; color: var(--vert); flex: none; }
.adresse { white-space: pre-line; }

/* Smartphone : deux personnes par ligne, fiche en plein écran */
@media (max-width: 600px) {
  .famille { padding: 20px 12px; }
  h1 { font-size: 2rem; margin-bottom: 16px; }
  .grille { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .personne { padding: 16px 8px; border-radius: 18px; }
  .prenom { font-size: 1.4rem; }
  .nom { font-size: 1.05rem; }
  .voile { padding: 0; }
  .fiche { border-radius: 0; height: 100%; padding: 24px 16px; gap: 14px; justify-content: center; }
  h2 { font-size: 2rem; }
  h2 .nom { font-size: 1.4rem; }
  .appeler { font-size: 1.5rem; padding: 14px 18px; }
  .numero { font-size: 1.3rem; }
  .info { font-size: 1.3rem; gap: 14px; }
  .info .icone { font-size: 2rem; }
}
</style>
