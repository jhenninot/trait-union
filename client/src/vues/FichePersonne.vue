<script setup>
import { ref, reactive, computed } from 'vue'
import { api } from '../api.js'
import { copier, heure } from '../cercle.js'
import { libellesRoles } from '../roles.js'
import { dateLongue, motDecede, lienWhatsAppMessage, lienSmsMessage } from '../coordonnees.js'
import { dates } from '../arbre.js'
import Avatar from './Avatar.vue'
import Coordonnees from './Coordonnees.vue'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import Icone from '../navigation/Icone.vue'
import Modale from '../navigation/Modale.vue'
import { confirmer } from '../fenetre.js'

// Fiche d'une personne de l'arbre généalogique (panneau à droite sur ordinateur, plein écran
// sur téléphone) : informations, liens, et pour les aidants les actions sur l'arbre.
const props = defineProps({
  base: { type: String, required: true }, // /cercles/<id>
  arbre: { type: Object, required: true }, // { personnes, ix, accompagnes, peutGerer }
  personne: { type: Object, required: true },
  vue: { type: String, default: null } // personne accompagnée depuis laquelle on lit les liens
})
const emit = defineEmits(['fermer', 'ajouter', 'modifier', 'choisir', 'change'])

const parId = computed(() => new Map(props.arbre.personnes.map((p) => [p.id, p])))
const p = computed(() => props.personne)
const ix = computed(() => props.arbre.ix)
const vueDe = computed(() => props.arbre.accompagnes.find((a) => a.id === props.vue))
const lien = computed(() => props.vue && props.vue !== p.value.id ? p.value.liens?.[props.vue]?.lien : null)
const libelleLien = computed(() => {
  if (!lien.value) return null
  return / de /.test(lien.value) || lien.value.startsWith('De la') ? lien.value : `${lien.value} de ${vueDe.value?.prenom}`
})

// Proches immédiats, cliquables
const proches = computed(() => {
  const nom = (id) => parId.value.get(id)
  const parents = ix.value.parents(p.value.id).map(nom).filter(Boolean)
  const conjoints = ix.value.conjoints(p.value.id).map((c) => ({ ...nom(c.id), separes: c.separes, relation: c.relation })).filter((c) => c.id)
  const enfants = ix.value.enfants(p.value.id).map(nom).filter(Boolean)
  const fratrie = [...new Set(ix.value.parents(p.value.id).flatMap((q) => ix.value.enfants(q)))].filter((id) => id !== p.value.id).map(nom).filter(Boolean)
  return [['Parents', parents], ['Conjoint', conjoints], ['Frères et sœurs', fratrie], ['Enfants', enfants]].filter(([, l]) => l.length)
})
const nbParents = computed(() => ix.value.parents(p.value.id).length)

const erreur = ref('')
async function action(fn) {
  erreur.value = ''
  try {
    await fn()
    emit('change')
  } catch (e) {
    erreur.value = e.message
  }
}

// Relier à une personne déjà dans l'arbre
const relier = ref(null) // { type, autre }
const enregistrerLien = () => action(async () => {
  const { type, autre } = relier.value
  const corps = type === 'parentDe' ? { type: 'parent', a: p.value.id, b: autre }
    : type === 'enfantDe' ? { type: 'parent', a: autre, b: p.value.id }
    : { type: 'conjoint', a: p.value.id, b: autre }
  await api('POST', `${props.base}/arbre/relations`, corps)
  relier.value = null
})
const relationsListe = computed(() => props.arbre.relations
  .filter((r) => r.a === p.value.id || r.b === p.value.id)
  .map((r) => {
    const autre = parId.value.get(r.a === p.value.id ? r.b : r.a)
    const texte = r.type === 'conjoint' ? `En couple avec ${autre?.prenom}` : r.a === p.value.id ? `Parent de ${autre?.prenom}` : `Enfant de ${autre?.prenom}`
    return { ...r, texte }
  }))
const retirerLien = (r) => action(async () => {
  if (!await confirmer(`Retirer le lien « ${r.texte} » ?`, { oui: 'Retirer', danger: true })) return
  await api('DELETE', `${props.base}/arbre/relations/${r.id}`)
})
const changerSepares = (r) => action(() => api('PUT', `${props.base}/arbre/relations/${r.id}`, { separes: !r.separes }))
const retirer = () => action(async () => {
  const membre = p.value.compte ? ` ${p.value.prenom} reste membre du cercle.` : ''
  if (!await confirmer(`Retirer ${p.value.prenom} de l'arbre, avec ses liens ?${membre}`, { oui: 'Retirer', danger: true })) return
  await api('DELETE', `${props.base}/arbre/personnes/${p.value.id}`)
  emit('fermer')
})

// Invitation : le compte créé sera rattaché à cette fiche
const invitation = reactive({ ouverte: false, role: 'proche', email: '', lien: null, expireLe: null, telephone: '', emailEnvoye: null, erreurEmail: null })
const inviter = () => action(async () => {
  const r = await api('POST', `${props.base}/invitations`, { role: invitation.role, email: invitation.email || undefined, personneId: p.value.id })
  Object.assign(invitation, { lien: `${location.origin}/invitation/${r.jeton}`, expireLe: r.expireLe, telephone: invitation.telephone || p.value.telephone || '', emailEnvoye: r.emailEnvoye, erreurEmail: r.erreurEmail })
})
const texteInvitation = () => `Bonjour ${p.value.prenom}, je vous invite à rejoindre le cercle de ${aides.value} sur Trait d'union (${libellesRoles[invitation.role].toLowerCase()}). Voici votre lien personnel, valable une seule fois jusqu'au ${heure(invitation.expireLe)} : ${invitation.lien}`
const partageNatif = typeof navigator.share === 'function' // « navigator » n'est pas accessible dans le modèle
const partager = () => navigator.share({ text: texteInvitation() }).catch(() => {})
const aides = computed(() => props.arbre.accompagnes.map((a) => a.prenom).join(' et ') || 'la personne accompagnée')
</script>

<template>
  <aside class="fiche carte" :aria-label="`Fiche de ${p.prenom}`">
    <div class="tete">
      <span class="aide">Fiche</span>
      <BoutonIcone icone="fermer" libelle="Fermer la fiche" @click="emit('fermer')" />
    </div>
    <div class="identite">
      <Avatar :src="p.avatar" :prenom="p.prenom" :taille="80" :class="{ gris: p.decede }" />
      <div>
        <h2>{{ p.prenom }} {{ p.nom }}</h2>
        <span v-if="p.role === 'accompagne'" class="pastille aidee">Personne accompagnée</span>
        <span v-else-if="libelleLien" class="pastille">{{ libelleLien }}</span>
      </div>
    </div>
    <p v-if="p.filiation" class="aide">{{ p.filiation }}</p>

    <ul v-if="p.decede" class="infos">
      <li v-if="p.decede"><Icone nom="gateau" class="en-ligne" />
        <span>{{ p.dateNaissance ? dateLongue(p.dateNaissance) : '?' }} – {{ p.dateDeces ? dateLongue(p.dateDeces) : motDecede(p.genre) }}</span></li>
    </ul>
    <Coordonnees v-if="!p.decede" :personne="p" :inscrite="p.compte" :membre-id="!p.moi ? p.membreId : null" :cercle-id="props.base.split('/').pop()" />
    <Coordonnees v-else-if="p.adresse" :personne="{ adresse: p.adresse }" />

    <template v-if="p.aSavoir">
      <p class="sous-titre">À savoir pour {{ aides }}</p>
      <p class="savoir">{{ p.aSavoir }}</p>
    </template>
    <p class="etat" :class="{ gris: !p.visibleAide }">
      <Icone :nom="p.visibleAide ? 'oeil' : 'oeilBarre'" class="en-ligne" />
      {{ p.visibleAide ? `Visible dans « Ma famille » de ${aides}` : `Caché à ${aides}` }}
    </p>
    <p class="etat gris">
      <Icone :nom="p.compte && !p.decede ? 'mobile' : 'compte'" class="en-ligne" />
      <template v-if="p.compte && p.decede">Compte désactivé depuis son décès (en cas d'erreur : Modifier, puis décocher « Personne décédée »)</template>
      <template v-else>{{ p.compte ? `Utilise l'appli (${libellesRoles[p.role]?.toLowerCase() ?? 'membre'})` : 'N\'utilise pas l\'appli' }}</template>
    </p>

    <div v-for="[titre, liste] in proches" :key="titre" class="proches">
      <span class="aide">{{ titre }} :</span>
      <button v-for="x in liste" :key="x.id" type="button" class="puce" @click="emit('choisir', x.id)">{{ x.prenom }}<template v-if="x.separes"> (séparés)</template></button>
    </div>

    <template v-if="arbre.peutGerer">
      <div class="actions">
        <button type="button" class="secondaire petit" @click="emit('modifier')"><Icone nom="modifier" class="en-ligne" /> Modifier</button>
        <button v-if="!p.compte && !p.decede" type="button" class="secondaire petit" @click="invitation.ouverte = !invitation.ouverte"><Icone nom="email" class="en-ligne" /> Inviter dans l'appli</button>
      </div>

      <div v-if="invitation.ouverte" class="encart">
        <template v-if="!invitation.lien">
          <p class="aide">En acceptant, son compte reprend cette fiche : {{ p.prenom }} garde sa place dans l'arbre et pourra modifier ses coordonnées.</p>
          <label>Rôle
            <select v-model="invitation.role"><option value="proche">Proche</option><option value="aidant">Aidant</option></select>
          </label>
          <label>Email (facultatif) <input v-model="invitation.email" type="email" placeholder="Pour lui envoyer le lien par email" /></label>
          <div><button type="button" class="petit" @click="inviter">Créer l'invitation</button></div>
        </template>
        <template v-else>
          <p v-if="invitation.emailEnvoye">Invitation envoyée par email à <strong>{{ invitation.emailEnvoye }}</strong>. Vous pouvez aussi transmettre ce lien :</p>
          <p v-else>Envoyez ce lien à {{ p.prenom }} :</p>
          <p v-if="invitation.erreurEmail" class="erreur">L'email n'est pas parti : {{ invitation.erreurEmail }}</p>
          <div class="ligne-lien">
            <input :value="invitation.lien" readonly @focus="$event.target.select()" />
            <BoutonIcone icone="copier" libelle="Copier le lien" @click="copier(invitation.lien)" />
          </div>
          <label>Son numéro de téléphone (facultatif) <input v-model="invitation.telephone" type="tel" placeholder="06 12 34 56 78" /></label>
          <div class="envoi-invitation">
            <a class="rond" :href="lienWhatsAppMessage(invitation.telephone, texteInvitation())" target="_blank" rel="noopener" title="Envoyer par WhatsApp" aria-label="Envoyer l'invitation par WhatsApp"><Icone nom="whatsapp" /></a>
            <a class="rond" :href="lienSmsMessage(invitation.telephone, texteInvitation())" title="Envoyer par SMS" aria-label="Envoyer l'invitation par SMS"><Icone nom="sms" /></a>
            <BoutonIcone v-if="partageNatif" icone="partager" libelle="Partager avec une autre application" @click="partager" />
          </div>
        </template>
      </div>

      <p class="sous-titre">Ajouter à partir de {{ p.prenom }}</p>
      <div class="actions">
        <button v-if="nbParents < 2" type="button" class="secondaire petit" @click="emit('ajouter', 'parent')"><Icone nom="ajouter" class="en-ligne" /> Un parent</button>
        <button type="button" class="secondaire petit" @click="emit('ajouter', 'conjoint')"><Icone nom="ajouter" class="en-ligne" /> Un conjoint</button>
        <button v-if="nbParents" type="button" class="secondaire petit" @click="emit('ajouter', 'fratrie')"><Icone nom="ajouter" class="en-ligne" /> Un frère ou une sœur</button>
        <button type="button" class="secondaire petit" @click="emit('ajouter', 'enfant')"><Icone nom="ajouter" class="en-ligne" /> Un enfant</button>
      </div>

      <details class="liens">
        <summary>Liens de {{ p.prenom }}</summary>
        <ul>
          <li v-for="r in relationsListe" :key="r.id">
            <span>{{ r.texte }}<template v-if="r.separes"> (séparés)</template></span>
            <button v-if="r.type === 'conjoint'" type="button" class="lien" @click="changerSepares(r)">{{ r.separes ? 'Ensemble' : 'Séparés' }}</button>
            <BoutonIcone icone="effacer" :libelle="`Retirer le lien ${r.texte}`" danger @click="retirerLien(r)" />
          </li>
        </ul>
        <Modale v-if="relier" :titre="`Relier ${p.prenom}`" @fermer="relier = null">
        <form class="relier" @submit.prevent="enregistrerLien">
          <select v-model="relier.type" aria-label="Lien">
            <option value="enfantDe">{{ p.prenom }} est l'enfant de</option>
            <option value="parentDe">{{ p.prenom }} est le parent de</option>
            <option value="conjoint">{{ p.prenom }} est en couple avec</option>
          </select>
          <select v-model="relier.autre" required aria-label="Personne">
            <option value="" disabled>Choisir…</option>
            <option v-for="x in arbre.personnes.filter((x) => x.id !== p.id)" :key="x.id" :value="x.id">{{ x.prenom }} {{ x.nom ?? '' }}</option>
          </select>
          <div class="actions"><button type="submit">Relier</button> <button type="button" class="secondaire" @click="relier = null">Annuler</button></div>
        </form>
        </Modale>
        <button type="button" class="lien" @click="relier = { type: 'enfantDe', autre: '' }">Relier à une personne déjà dans l'arbre</button>
      </details>

      <button type="button" class="danger" @click="retirer">Retirer de l'arbre</button>
    </template>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
  </aside>
</template>

<style scoped>
.fiche { margin: 0; display: flex; flex-direction: column; gap: 8px; }
.tete { display: flex; justify-content: space-between; align-items: center; }
.identite { display: flex; gap: 14px; align-items: center; }
h2 { margin: 0 0 6px; color: var(--bleu-nuit); font-size: 1.3rem; }
.gris :deep(img) { filter: grayscale(1); opacity: 0.8; }
.pastille { display: inline-block; background: var(--vert-clair); color: var(--vert); border-radius: 999px; padding: 2px 10px; font-size: 0.85rem; font-weight: 600; }
.pastille.aidee { background: var(--bleu-nuit); color: white; }
.infos { list-style: none; margin: 0; padding: 0; }
.infos li { display: flex; gap: 8px; align-items: baseline; }
.infos .icone { color: var(--vert); }
.sous-titre { font-weight: 700; color: var(--bleu-nuit); margin: 10px 0 0; font-size: 0.95rem; }
.savoir { background: #fff7ec; border-left: 4px solid #f2a65a; border-radius: 6px; padding: 8px 12px; margin: 0; line-height: 1.4; white-space: pre-line; }
.etat { margin: 0; color: var(--vert); font-size: 0.9rem; }
.etat.gris { color: var(--gris); }
.proches { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.puce { padding: 3px 10px; border-radius: 999px; background: #f3f0ea; color: var(--bleu-nuit); font-size: 0.88rem; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
button.petit { padding: 7px 12px; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 6px; }
.encart { background: #f4f7fc; border: 1px solid #dfe5f2; border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.encart p { margin: 0; }
.ligne-lien { display: flex; gap: 8px; align-items: center; }
.ligne-lien input { flex: 1; min-width: 0; }
.liens summary { cursor: pointer; color: var(--vert); font-size: 0.92rem; }
.liens ul { list-style: none; padding: 0; margin: 8px 0; }
.liens li { display: flex; align-items: center; gap: 8px; justify-content: space-between; padding: 2px 0; }
.liens li span { flex: 1; }
.relier { gap: 8px; margin-top: 6px; }
.danger { align-self: flex-start; }
.envoi-invitation { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.rond { width: 44px; height: 44px; border-radius: 50%; background: white; color: var(--vert); display: grid; place-items: center; flex: none; }
</style>
