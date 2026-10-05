<script setup>
import { ref, reactive, watch, onUnmounted } from 'vue'
import { api } from '../api.js'
import { confirmer } from '../fenetre.js'
import Icone from '../navigation/Icone.vue'

// Administration : journal des erreurs du serveur et du navigateur (server/journal.js). Les textes
// sont nettoyés avant d'être écrits : ni mot de passe, ni jeton, ni contenu de message.
const donnees = ref(null)
const lignes = ref([])
const ouverte = ref(null)
const erreur = ref('')
const occupe = ref(false)
const filtres = reactive({ niveau: '', source: '', module: '', q: '' })

async function charger(suite = false) {
  occupe.value = true
  erreur.value = ''
  try {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(filtres)) if (v.trim()) params.set(k, v.trim())
    if (suite && lignes.value.length) params.set('avant', lignes.value.at(-1).creeLe)
    const r = await api('GET', `/admin/journal?${params}`)
    donnees.value = r
    lignes.value = suite ? [...lignes.value, ...r.lignes] : r.lignes
  } catch (e) {
    erreur.value = e.message
  } finally {
    occupe.value = false
  }
}
charger()

let delai
watch(filtres, () => {
  clearTimeout(delai)
  delai = setTimeout(() => charger(), 300)
})
onUnmounted(() => clearTimeout(delai))

async function vider() {
  if (!await confirmer('Effacer tout le journal ?', { oui: 'Vider le journal', danger: true })) return
  try {
    await api('DELETE', '/admin/journal')
    ouverte.value = null
    await charger()
  } catch (e) {
    erreur.value = e.message
  }
}

// Export des lignes affichées (mêmes filtres) dans un fichier à transmettre
async function exporter(format) {
  erreur.value = ''
  try {
    const params = new URLSearchParams({ format })
    for (const [k, v] of Object.entries(filtres)) if (v.trim()) params.set(k, v.trim())
    const reponse = await fetch(`/api/admin/journal/export?${params}`)
    if (!reponse.ok) throw new Error('L\'export du journal a échoué')
    const nom = /filename="([^"]+)"/.exec(reponse.headers.get('Content-Disposition') ?? '')?.[1] ?? `journal.${format}`
    const lien = document.createElement('a')
    lien.href = URL.createObjectURL(await reponse.blob())
    lien.download = nom
    lien.click()
    setTimeout(() => URL.revokeObjectURL(lien.href), 10_000)
  } catch (e) {
    erreur.value = e.message
  }
}

const LIBELLES = { erreur: 'Erreur', avertissement: 'Avertissement', info: 'Info' }
const date = (d) => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
</script>

<template>
  <main>
    <h1>Journal</h1>
    <section class="carte">
      <p>Les erreurs du serveur et celles vues par le navigateur des utilisateurs (envoi de photos, emails, alertes...),
        ainsi que, en info, ce que contient chaque photo envoyée (lieu trouvé ou non, sans les coordonnées).
        Ni mot de passe, ni contenu de message n'y figure. Les lignes sont effacées automatiquement après
        {{ donnees?.jours ?? 30 }} jours.</p>
      <p v-if="donnees" class="aide">
        {{ donnees.total }} ligne{{ donnees.total > 1 ? 's' : '' }} en mémoire,
        dont {{ donnees.erreurs24h }} erreur{{ donnees.erreurs24h > 1 ? 's' : '' }} ces dernières 24 heures.
      </p>
    </section>

    <section class="carte filtres">
      <label>Niveau
        <select v-model="filtres.niveau">
          <option value="">Tous</option>
          <option value="erreur">Erreurs</option>
          <option value="avertissement">Avertissements</option>
          <option value="info">Infos</option>
        </select>
      </label>
      <label>Origine
        <select v-model="filtres.source">
          <option value="">Toutes</option>
          <option value="serveur">Serveur</option>
          <option value="navigateur">Navigateur</option>
        </select>
      </label>
      <label>Module
        <select v-model="filtres.module">
          <option value="">Tous</option>
          <option v-for="m in donnees?.modules ?? []" :key="m" :value="m">{{ m }}</option>
        </select>
      </label>
      <label class="recherche">Recherche
        <input v-model="filtres.q" type="search" placeholder="Un mot du message" />
      </label>
    </section>

    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <p v-else-if="donnees && !lignes.length" class="aide vide">Aucune ligne pour ces filtres.</p>

    <ul v-if="lignes.length" class="liste">
      <li v-for="l in lignes" :key="l.id" class="carte ligne" :class="l.niveau">
        <button class="resume" type="button" :aria-expanded="ouverte === l.id" @click="ouverte = ouverte === l.id ? null : l.id">
          <span class="entete">
            <span class="etiquette" :class="l.niveau"><Icone v-if="l.niveau !== 'info'" nom="attention" class="em" /> {{ LIBELLES[l.niveau] }}</span>
            <span class="etiquette">{{ l.module }}</span>
            <span class="etiquette">{{ l.source }}</span>
            <span class="aide quand">{{ date(l.creeLe) }}</span>
          </span>
          <span class="texte">{{ l.message }}</span>
        </button>
        <div v-if="ouverte === l.id" class="detail">
          <p v-if="l.utilisateur" class="aide">Compte : {{ l.utilisateur }}</p>
          <pre v-if="l.details">{{ l.details }}</pre>
          <p v-else class="aide">Pas de détail technique.</p>
        </div>
      </li>
    </ul>
    <button v-if="donnees?.suite" class="secondaire" :disabled="occupe" @click="charger(true)">Afficher plus</button>
    <div v-if="donnees?.total" class="exports">
      <button class="secondaire" @click="exporter('txt')"><Icone nom="telecharger" class="em" /> Exporter en texte</button>
      <button class="secondaire" @click="exporter('json')"><Icone nom="telecharger" class="em" /> Exporter en JSON</button>
    </div>
    <button v-if="donnees?.total" class="secondaire danger" @click="vider"><Icone nom="effacer" class="em" /> Vider le journal</button>
  </main>
</template>

<style scoped>
.filtres { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.filtres label { margin: 0; }
.liste { list-style: none; padding: 0; margin: 12px 0; display: flex; flex-direction: column; gap: 8px; }
.ligne { margin: 0; padding: 0; border-left: 4px solid #ccc; }
.ligne.erreur { border-left-color: var(--rouge); }
.ligne.avertissement { border-left-color: #d9922b; }
.resume { all: unset; display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; cursor: pointer; box-sizing: border-box; width: 100%; }
.entete { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.etiquette { font-size: 0.75rem; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #f0eee9; color: var(--gris); display: inline-flex; align-items: center; gap: 4px; }
.etiquette.erreur { background: #fbe9e7; color: var(--rouge); }
.etiquette.avertissement { background: #fdf3e6; color: #6b4310; }
.quand { margin-left: auto; font-size: 0.8rem; }
.texte { overflow-wrap: anywhere; }
.detail { padding: 0 14px 12px; }
.detail pre { margin: 6px 0 0; padding: 10px; background: #f6f5f1; border-radius: 8px; font-size: 0.8rem; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 320px; overflow: auto; }
.vide { margin: 16px 0; }
.danger { color: var(--rouge); }
.exports { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
</style>
