<script setup>
import { ref, computed } from 'vue'
import { api } from '../api.js'
import { session } from '../session.js'
import { libellesRoles } from '../roles.js'
import Avatar from './Avatar.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import Icone from '../navigation/Icone.vue'

// Administration : tous les comptes, avec leurs cercles, et suppression d'un compte
const comptes = ref(null)
const recherche = ref('')
const erreur = ref('')
const message = ref('')
const apercu = ref(null) // ce que la suppression va toucher, affiché avant de confirmer
const occupe = ref(false)

async function charger() {
  try {
    comptes.value = await api('GET', '/admin/utilisateurs')
  } catch (e) {
    erreur.value = e.message
  }
}
charger()

// Sans accents ni majuscules, pour chercher « helene » dans « Hélène »
const simplifier = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const affiches = computed(() => {
  const q = simplifier(recherche.value.trim())
  if (!q) return comptes.value ?? []
  return (comptes.value ?? []).filter((c) =>
    simplifier(`${c.prenom} ${c.nom ?? ''} ${c.email ?? ''} ${c.cercles.map((x) => x.nom).join(' ')}`).includes(q))
})

const nomComplet = (c) => [c.prenom, c.nom].filter(Boolean).join(' ')
const date = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const pluriel = (n, mot) => `${n} ${mot}${n > 1 && !mot.endsWith('s') ? 's' : ''}`

async function demanderSuppression(c) {
  erreur.value = ''
  message.value = ''
  try {
    apercu.value = await api('GET', `/admin/utilisateurs/${c.id}/suppression`)
  } catch (e) {
    erreur.value = e.message
  }
}

async function supprimer() {
  occupe.value = true
  try {
    await api('DELETE', `/admin/utilisateurs/${apercu.value.id}`)
    message.value = `Le compte de ${nomComplet(apercu.value)} a été supprimé.`
    apercu.value = null
    await charger()
  } catch (e) {
    apercu.value = { ...apercu.value, refus: e.message }
  } finally {
    occupe.value = false
  }
}
</script>

<template>
  <main>
    <h1>Utilisateurs</h1>
    <p class="aide" v-if="comptes">{{ pluriel(comptes.length, 'compte') }}, personnes accompagnées comprises.</p>

    <label class="recherche">
      <Icone nom="recherche" />
      <input v-model="recherche" type="search" placeholder="Nom, email ou cercle" aria-label="Chercher un utilisateur" />
    </label>

    <p v-if="message" class="succes">{{ message }}</p>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>

    <ul v-if="comptes" class="liste">
      <li v-for="c in affiches" :key="c.id" class="carte compte">
        <Avatar :src="c.avatar" :prenom="c.prenom" :taille="44" :decede="c.decede" />
        <div class="infos">
          <div class="nom">
            <strong>{{ nomComplet(c) }}</strong>
            <span v-if="c.id === session.utilisateur.id" class="etiquette">Vous</span>
            <span v-if="c.estAdmin" class="etiquette admin">Admin</span>
            <span v-if="c.decede" class="etiquette">Décès indiqué{{ c.dateDeces ? ` le ${date(c.dateDeces)}` : '' }}</span>
          </div>
          <span class="aide">{{ c.accompagne ? 'Personne accompagnée, sans email' : c.email }}</span>
          <div class="cercles">
            <span v-for="x in c.cercles" :key="x.id" class="cercle-role">
              <Icone nom="cercle" class="en-ligne" /> {{ x.nom }} · {{ libellesRoles[x.role] }}
            </span>
            <span v-if="!c.cercles.length" class="aide">Aucun cercle</span>
          </div>
          <span class="aide dates">
            Créé le {{ date(c.creeLe) }}<template v-if="c.derniereActivite"> · Dernière activité le {{ date(c.derniereActivite) }}</template>
          </span>
        </div>
        <BoutonIcone v-if="c.id !== session.utilisateur.id" icone="effacer" :libelle="`Supprimer le compte de ${nomComplet(c)}`" danger @click="demanderSuppression(c)" />
      </li>
    </ul>
    <p v-if="comptes && !affiches.length" class="aide">Aucun utilisateur ne correspond.</p>

    <div v-if="apercu" class="voile" @click.self="apercu = null">
      <section class="carte fenetre" role="alertdialog" aria-modal="true" aria-labelledby="titre-suppression">
        <h2 id="titre-suppression">Supprimer le compte de {{ nomComplet(apercu) }} ?</h2>

        <p v-if="apercu.refus" class="refus"><Icone nom="cadenas" class="en-ligne" /> {{ apercu.refus }}</p>
        <template v-else>
          <div v-if="apercu.cercles.length" class="avertissement">
            <p class="titre-avertissement"><Icone nom="attention" /> {{ apercu.prenom }} fait partie de {{ pluriel(apercu.cercles.length, 'cercle') }}</p>
            <ul>
              <li v-for="x in apercu.cercles" :key="x.id">
                <strong>{{ x.nom }}</strong> · {{ libellesRoles[x.role] }}
                <span v-if="x.dernierAidant" class="dernier">Seul aidant de ce cercle : le cercle n'aura plus d'aidant.</span>
              </li>
            </ul>
            <p>Le compte disparaîtra {{ apercu.cercles.length > 1 ? 'de ces cercles' : 'de ce cercle' }} et ne pourra plus se connecter.</p>
          </div>
          <p v-else class="aide">Ce compte ne fait partie d'aucun cercle.</p>

          <ul class="consequences">
            <li v-if="apercu.photos || apercu.rendezVous">
              <Icone nom="coche" class="en-ligne" />
              Gardés dans les cercles :
              <template v-if="apercu.photos">{{ pluriel(apercu.photos, 'photo') }}</template><template v-if="apercu.photos && apercu.rendezVous"> et </template>
              <template v-if="apercu.rendezVous">{{ pluriel(apercu.rendezVous, 'rendez-vous') }}</template> ajoutés par ce compte.
            </li>
            <li v-if="apercu.fichesArbre">
              <Icone nom="arbre" class="en-ligne" />
              Sa fiche dans l'arbre généalogique est gardée, comme une personne sans compte.
            </li>
            <li v-if="apercu.rendezVousPourLui" class="perdu">
              <Icone nom="effacer" class="en-ligne" />
              {{ pluriel(apercu.rendezVousPourLui, 'rendez-vous') }} réservé{{ apercu.rendezVousPourLui > 1 ? 's' : '' }} à cette personne {{ apercu.rendezVousPourLui > 1 ? 'seront supprimés' : 'sera supprimé' }}.
            </li>
          </ul>
          <p class="aide">Cette action est définitive.</p>
        </template>

        <div class="boutons">
          <button v-if="!apercu.refus" class="supprimer" :disabled="occupe" @click="supprimer">Supprimer définitivement</button>
          <button class="secondaire" @click="apercu = null">{{ apercu.refus ? 'Fermer' : 'Annuler' }}</button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.recherche {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  background: white;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 0 12px;
  color: var(--gris);
  margin: 12px 0;
}
.recherche input { border: none; flex: 1; min-width: 0; padding-left: 0; outline: none; }
.liste { list-style: none; padding: 0; margin: 0; }
.compte { display: flex; align-items: flex-start; gap: 12px; }
.infos { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.infos > .aide { overflow-wrap: anywhere; }
.nom { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.etiquette {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f0eee9;
  color: var(--gris);
}
.etiquette.admin { background: #e8ebf5; color: var(--bleu-nuit); }
.cercles { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.cercle-role {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--vert-clair);
  color: var(--vert);
}
.dates { font-size: 0.8rem; }
.succes { color: var(--vert); font-weight: 500; }

.voile {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgb(20 24 40 / 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.fenetre { width: 100%; max-width: 520px; max-height: calc(100vh - 32px); overflow-y: auto; margin: 0; padding: 20px; }
.fenetre h2 { margin: 0 0 14px; font-size: 1.25rem; color: var(--bleu-nuit); }
.avertissement {
  background: #fdf3e6;
  border: 1px solid #f0d2a6;
  border-radius: 10px;
  padding: 12px 14px;
  color: #6b4310;
}
.avertissement p { margin: 6px 0 0; }
.avertissement ul { margin: 8px 0 0; padding-left: 20px; }
.avertissement li { margin: 4px 0; }
.titre-avertissement { display: flex; align-items: center; gap: 8px; font-weight: 600; margin: 0 !important; color: #8a5208; }
.dernier { display: block; color: var(--rouge); font-weight: 500; }
.consequences { list-style: none; padding: 0; margin: 14px 0 8px; display: flex; flex-direction: column; gap: 8px; }
.consequences li { display: flex; align-items: flex-start; gap: 8px; }
.consequences .icone { margin-top: 2px; color: var(--vert); }
.consequences .perdu .icone { color: var(--rouge); }
.refus { display: flex; align-items: center; gap: 8px; color: var(--rouge); font-weight: 500; }
.boutons { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
button.supprimer { background: var(--rouge); }
</style>
