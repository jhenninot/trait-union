<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api.js'

// Configuration du stockage des photos chez un hébergeur compatible S3 (OVHcloud par défaut)
const config = ref(null) // configuration enregistrée (clé secrète masquée)
const f = ref({})
const verification = ref(null)
const message = ref('')
const erreur = ref('')
const occupe = ref(false)

function remplir(c) {
  config.value = c
  f.value = { actif: c.actif, endpoint: c.endpoint, region: c.region, bucket: c.bucket, cleAcces: c.cleAcces, cleSecrete: '' }
}
onMounted(async () => remplir(await api('GET', '/admin/stockage')))

async function action(fn) {
  erreur.value = ''
  message.value = ''
  occupe.value = true
  try {
    await fn()
  } catch (e) {
    erreur.value = e.message
  } finally {
    occupe.value = false
  }
}

const verifier = () => action(async () => {
  verification.value = await api('POST', '/admin/stockage/verifier', f.value)
  message.value = 'Tout fonctionne : lecture, écriture et suppression réussies.'
})

const enregistrer = () => action(async () => {
  remplir(await api('PUT', '/admin/stockage', f.value))
  message.value = f.value.actif ? 'Configuration enregistrée : le partage de photos est actif.' : 'Configuration enregistrée.'
})

// Adresses S3 d'OVHcloud Object Storage (classe Standard)
const REGIONS_OVH = [
  { libelle: 'Paris, 3 zones (recommandé)', region: 'eu-west-par' },
  { libelle: 'Gravelines, 1 zone', region: 'gra' },
  { libelle: 'Strasbourg, 1 zone', region: 'sbg' },
  { libelle: 'Roubaix, 1 zone', region: 'rbx' }
]
function choisirOvh(r) {
  f.value.region = r.region
  f.value.endpoint = `https://s3.${r.region}.io.cloud.ovh.net`
}
</script>

<template>
  <main>
    <h1>Stockage des photos</h1>
    <p>Les photos partagées ne sont pas gardées sur ce serveur : elles sont envoyées directement par le navigateur
      chez un hébergeur compatible S3, avec des liens temporaires signés par l'application. Ce serveur ne conserve
      que la liste des photos (qui l'a envoyée, dans quel cercle, la légende).</p>

    <details class="carte" :open="!config?.cleSecrete">
      <summary><strong>Comment configurer OVHcloud Object Storage</strong></summary>
      <ol class="etapes">
        <li><strong>Créer un projet Public Cloud</strong> dans l'<a href="https://www.ovh.com/manager/" target="_blank" rel="noopener">espace
          client OVHcloud</a> (facturation à l'usage, environ 0,014 € HT par Go et par mois).</li>
        <li><strong>Créer un utilisateur S3</strong> : Public Cloud → « Object Storage » → onglet « Utilisateurs S3 » →
          « Créer un utilisateur » (si un rôle est demandé : « ObjectStore operator »). Notez tout de suite sa <em>clé d'accès</em> et sa
          <em>clé secrète</em> : la clé secrète n'est affichée qu'une fois.</li>
        <li><strong>Créer le conteneur</strong> : onglet « Mes conteneurs » → « Créer un conteneur », API <em>S3</em>, classe
          <em>Standard</em>, région <em>Paris (3-AZ)</em>, et associez-y l'utilisateur créé si OVHcloud le demande. Laissez-le <strong>privé</strong>.</li>
        <li><strong>Remplir le formulaire ci-dessous</strong>, cliquer sur « Vérifier », cocher « Activer le partage de photos »
          et enregistrer. La vérification autorise aussi l'adresse de l'application à envoyer des photos (règle CORS du conteneur).</li>
      </ol>
      <p class="aide">L'adresse autorisée est celle de la variable <code>APP_URL</code> du <code>.env</code> Dockge, sinon celle avec
        laquelle vous consultez cette page. Si l'adresse de l'application change, refaites « Vérifier » ici.</p>
    </details>

    <form v-if="config" class="carte" @submit.prevent="enregistrer">
      <div>
        <p class="aide">Région OVHcloud (remplit l'adresse et la région) :</p>
        <div class="regions">
          <button v-for="r in REGIONS_OVH" :key="r.region" type="button" class="secondaire" :class="{ choisie: f.region === r.region }" @click="choisirOvh(r)">
            {{ r.libelle }}
          </button>
        </div>
      </div>
      <label>Adresse S3 <input v-model="f.endpoint" required spellcheck="false" placeholder="https://s3.eu-west-par.io.cloud.ovh.net" /></label>
      <label>Région <input v-model="f.region" required spellcheck="false" placeholder="eu-west-par" /></label>
      <label>Nom du conteneur <input v-model="f.bucket" required spellcheck="false" placeholder="trait-union-photos" /></label>
      <label>Clé d'accès <input v-model="f.cleAcces" required autocomplete="off" spellcheck="false" /></label>
      <label>Clé secrète
        <input v-model="f.cleSecrete" type="password" autocomplete="off" spellcheck="false"
          :placeholder="config.cleSecrete ? `Enregistrée (${config.cleSecrete})` : ''" />
        <span v-if="config.cleSecrete" class="aide">Laisser vide pour garder la clé enregistrée.</span>
      </label>
      <div>
        <button type="button" class="secondaire" :disabled="occupe" @click="verifier">{{ occupe ? 'Vérification…' : 'Vérifier' }}</button>
      </div>
      <p v-if="verification" class="aide">Envois autorisés depuis {{ verification.origine }}.</p>
      <label class="case"><input v-model="f.actif" type="checkbox" /> Activer le partage de photos</label>
      <button :disabled="occupe">Enregistrer</button>
    </form>

    <p v-if="message" class="succes">{{ message }}</p>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
  </main>
</template>

<style scoped>
.etapes { padding-left: 20px; line-height: 1.5; }
.etapes li { margin-bottom: 10px; }
summary { cursor: pointer; }
.regions { display: flex; flex-wrap: wrap; gap: 6px; }
.regions .choisie { background: var(--vert); color: white; }
.case { flex-direction: row; align-items: center; gap: 8px; font-weight: normal; }
.succes { color: var(--vert); font-weight: 500; }
code { background: #f0eee9; padding: 1px 4px; border-radius: 4px; }
</style>
