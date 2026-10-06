<script setup>
import { computed, ref, watch } from 'vue'
import { session } from '../session.js'
import { signalement, fermerSignalement, MAX_CAPTURES, contexteTechnique, reduireCapture, envoyerSignalement } from '../signalement.js'
import Modale from './Modale.vue'
import Icone from './Icone.vue'
import BoutonIcone from './BoutonIcone.vue'

// Formulaire « Signaler un problème » : description, capture d'écran (choisie ou collée) et
// informations techniques, envoyés par email aux administrateurs.
const accompagne = computed(() => session.typeSession === 'appareil')
const description = ref('')
const attendu = ref('')
const captures = ref([])
const joindreContexte = ref(true)
const contexte = ref({})
const envoi = ref(false)
const erreur = ref('')
const reference = ref('')

watch(() => signalement.ouvert, (ouvert) => {
  if (!ouvert) return
  description.value = ''
  attendu.value = ''
  captures.value.forEach((c) => URL.revokeObjectURL(c.apercu))
  captures.value = []
  joindreContexte.value = true
  erreur.value = ''
  reference.value = ''
  contexte.value = contexteTechnique()
})

async function ajouter(fichiers) {
  erreur.value = ''
  for (const f of fichiers) {
    if (captures.value.length >= MAX_CAPTURES) { erreur.value = `Au plus ${MAX_CAPTURES} captures d'écran`; break }
    if (!f.type.startsWith('image/')) { erreur.value = 'Seules les images sont acceptées'; continue }
    try { captures.value.push(await reduireCapture(f)) } catch (e) { erreur.value = e.message }
  }
}
const choisir = async (e) => { const f = [...e.target.files]; e.target.value = ''; await ajouter(f) }
const coller = (e) => {
  const f = [...(e.clipboardData?.files ?? [])]
  if (f.length) { e.preventDefault(); ajouter(f) }
}
function retirer(i) { URL.revokeObjectURL(captures.value[i].apercu); captures.value.splice(i, 1) }

async function envoyer() {
  if (envoi.value) return
  envoi.value = true
  erreur.value = ''
  try {
    const r = await envoyerSignalement({
      description: description.value, attendu: attendu.value, captures: captures.value,
      contexte: joindreContexte.value ? contexte.value : null
    })
    reference.value = r.reference
  } catch (e) {
    erreur.value = e.message
  } finally {
    envoi.value = false
  }
}
const fermer = () => { if (!envoi.value) fermerSignalement() }
</script>

<template>
  <Modale v-if="signalement.ouvert" titre="Signaler un problème" @fermer="fermer">
    <div v-if="reference" class="signalement">
      <p>Merci, votre signalement a bien été transmis à l'administrateur.</p>
      <p class="aide">Référence : {{ reference }}</p>
      <div class="actions"><button @click="fermer">Fermer</button></div>
    </div>
    <form v-else class="signalement" :class="{ gros: accompagne }" @submit.prevent="envoyer" @paste="coller">
      <p class="aide">Quelque chose ne marche pas comme prévu ? Racontez-le simplement, l'administrateur recevra votre message.</p>
      <label class="champ">Que s'est-il passé ?
        <textarea v-model="description" rows="4" maxlength="5000" required placeholder="J'ai appuyé sur… et il s'est passé…" />
      </label>
      <label v-if="!accompagne" class="champ">Qu'attendiez-vous ? (facultatif)
        <textarea v-model="attendu" rows="2" maxlength="5000" />
      </label>
      <div v-if="!accompagne" class="champ">
        <span>Captures d'écran (facultatif, vous pouvez aussi les coller)</span>
        <ul v-if="captures.length" class="captures">
          <li v-for="(c, i) in captures" :key="c.apercu">
            <img :src="c.apercu" alt="" />
            <span>{{ c.nom }}</span>
            <BoutonIcone icone="effacer" libelle="Retirer la capture" @click="retirer(i)" />
          </li>
        </ul>
        <label v-if="captures.length < MAX_CAPTURES" class="ajouter-capture">
          <Icone nom="trombone" class="en-ligne" /> Ajouter une capture
          <input type="file" accept="image/*" multiple @change="choisir" />
        </label>
      </div>
      <label class="case"><input v-model="joindreContexte" type="checkbox" /> Joindre les informations techniques (écran, navigateur)</label>
      <details v-if="joindreContexte" class="technique">
        <summary>Voir ce qui sera envoyé</summary>
        <dl><template v-for="(v, k) in contexte" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template></dl>
      </details>
      <p v-if="erreur" class="erreur">{{ erreur }}</p>
      <div class="actions">
        <button :disabled="envoi || description.trim().length < 5">{{ envoi ? 'Envoi…' : 'Envoyer' }}</button>
        <button type="button" class="secondaire" @click="fermer">Annuler</button>
      </div>
    </form>
  </Modale>
</template>

<style scoped>
.signalement { display: flex; flex-direction: column; gap: 14px; }
.champ { display: flex; flex-direction: column; gap: 4px; font-weight: 600; }
.case { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.erreur { margin: 0; color: var(--rouge); }
.aide { margin: 0; color: var(--gris); font-size: 0.9rem; }
textarea { width: 100%; resize: vertical; font: inherit; }
.captures { margin: 6px 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.captures li { display: flex; align-items: center; gap: 10px; padding: 6px; border: 1px solid #ebe8e3; border-radius: 10px; }
.captures img { width: 44px; height: 44px; object-fit: cover; border-radius: 6px; }
.captures span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; }
.ajouter-capture { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; padding: 10px 14px; border: 1px dashed var(--gris); border-radius: 10px; cursor: pointer; color: var(--bleu-nuit); }
.ajouter-capture input { display: none; }
.technique { font-size: 0.85rem; color: var(--gris); }
.technique dl { margin: 8px 0 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; }
.technique dt { font-weight: 600; }
.technique dd { margin: 0; word-break: break-word; white-space: pre-line; }
.gros { font-size: 1.3rem; }
.gros textarea { font-size: 1.3rem; }
</style>
