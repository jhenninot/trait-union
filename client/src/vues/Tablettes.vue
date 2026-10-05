<script setup>
import { ref, watch } from 'vue'
import { api } from '../api.js'
import { utiliserCercle, heure, copier } from '../cercle.js'
import { mentionDeces, lienWhatsAppMessage, lienSmsMessage } from '../coordonnees.js'
import { session } from '../session.js'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import Icone from '../navigation/Icone.vue'
import Modale from '../navigation/Modale.vue'
import UtilisationAccompagne from './UtilisationAccompagne.vue'
import { confirmer } from '../fenetre.js'

// Page « Personnes accompagnées » d'un cercle : personnes accompagnées et configuration de leurs appareils
const { url, cercle, erreur, charger, action, accompagnes } = utiliserCercle()

// Utilisation de l'application par chaque personne accompagnée (aidants seulement)
const utilisation = ref([])
watch(() => cercle.value?.id, async (id) => {
  utilisation.value = []
  if (!id || !cercle.value.peutGerer) return
  try {
    utilisation.value = await api('GET', `${url.value}/utilisation`)
  } catch { /* bloc laissé vide */ }
}, { immediate: true })
const utilisationDe = (m) => utilisation.value.find((u) => u.utilisateurId === m.utilisateurId) ?? null
const codeAppareil = ref(null) // { prenom, code, lien, expireLe }
const envoiApp = ref(null) // { id, prenom, email, telephone, message, erreur }
const texteApplication = (prenom) => `Bonjour ${prenom}, voici l'application Trait d'union pour votre tablette ou votre téléphone.\nAndroid : touchez ${location.origin}/apk, ouvrez le fichier téléchargé et autorisez l'installation si Android le demande. Si l'application demande l'adresse du serveur, saisissez ${location.origin}. Touchez « Le configurer avec un code » et le code à 6 chiffres que je vous donnerai.\niPhone, iPad ou ordinateur : ouvrez ${location.origin}/appareil dans le navigateur et ajoutez la page à l'écran d'accueil.`
const ouvrirEnvoiApp = async (m) => {
  envoiApp.value = { id: m.id, prenom: m.prenom, email: '', telephone: m.telephone ?? '', message: '', erreur: '' }
}
// Le modèle n'a pas accès à « navigator » : on le teste ici
const partageNatif = typeof navigator.share === 'function'
const partagerApp = () => navigator.share({ text: texteApplication(envoiApp.value.prenom) }).catch(() => {})
async function envoyerApp() {
  envoiApp.value.erreur = ''
  envoiApp.value.message = ''
  try {
    const { envoyeA } = await api('POST', `${url.value}/membres/${envoiApp.value.id}/envoi-application`, { email: envoiApp.value.email })
    envoiApp.value.message = `Email envoyé à ${envoyeA}.`
  } catch (e) {
    envoiApp.value.erreur = e.message
  }
}
const nouvelAccompagne = ref({ prenom: '', nom: '' })
const ajoutOuvert = ref(false)

const ajouterAccompagne = () => action(async () => {
  await api('POST', `${url.value}/accompagnes`, nouvelAccompagne.value)
  nouvelAccompagne.value = { prenom: '', nom: '' }
  ajoutOuvert.value = false
  await charger()
})

const genererCode = (m) => action(async () => {
  const { code, expireLe } = await api('POST', `${url.value}/membres/${m.id}/code`)
  codeAppareil.value = { prenom: m.prenom, code, lien: `${location.origin}/appareil?code=${code}`, expireLe }
})

const deconnecterAppareils = (m) => action(async () => {
  if (!await confirmer(`Déconnecter tous les appareils de ${m.prenom} ?`, { oui: 'Déconnecter', danger: true, icone: 'deconnexion' })) return
  await api('POST', `${url.value}/membres/${m.id}/deconnecter`)
  await charger()
})

// Alertes reçues par la personne accompagnée sur ses appareils
const changerAlertes = (m, cle, valeur) => action(async () => {
  const { appareils, ...preferences } = m.alertes
  m.alertes = { ...await api('PUT', `${url.value}/membres/${m.id}/alertes`, { ...preferences, [cle]: valeur }), appareils }
})

// Messagerie de la personne accompagnée : qui peut lui écrire en privé, réponses toutes faites,
// lecture à voix haute, photos et messages vocaux
const nouvelleReponse = ref({})
const changerMessagerie = (m, modifs) => action(async () => {
  m.messagerie = await api('PUT', `${url.value}/membres/${m.id}/messagerie`, { ...m.messagerie, ...modifs })
})
function ajouterReponse(m) {
  const r = (nouvelleReponse.value[m.id] ?? '').trim()
  if (!r) return
  nouvelleReponse.value[m.id] = ''
  changerMessagerie(m, { reponses: [...m.messagerie.reponses, r] })
}

const retirer = (m) => action(async () => {
  if (!await confirmer(`Retirer ${m.prenom} du cercle ?`, { oui: 'Retirer', danger: true })) return
  await api('DELETE', `${url.value}/membres/${m.id}`)
  await charger()
})
// Adresse courte qui télécharge la dernière APK (server/index.js)
const adresseApk = `${location.host}/apk`
</script>

<template>
  <main>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <template v-if="cercle">
      <p class="aide surtitre">{{ cercle.nom }}</p>
      <h1>Personnes accompagnées</h1>
      <p class="aide">Chaque personne accompagnée utilise une tablette (ou un téléphone) avec un écran très simple, sans mot de passe.
        Un cercle peut en réunir plusieurs, un couple par exemple : chaque appareil est configuré pour une seule personne.</p>

      <p v-if="!accompagnes.length" class="aide">Personne pour l'instant.</p>
      <div v-for="m in accompagnes" :key="m.id" class="carte">
        <div class="ligne">
          <strong>{{ m.prenom }} {{ m.nom }}</strong>
          <span v-if="m.decede" class="aide">{{ mentionDeces(m) }}</span>
          <span v-else class="aide">{{ m.appareils }} appareil{{ m.appareils > 1 ? 's' : '' }} connecté{{ m.appareils > 1 ? 's' : '' }}</span>
        </div>
        <template v-if="m.decede">
          <p class="aide">Son compte est désactivé et ses appareils ont été déconnectés.
            En cas d'erreur, annulez le décès depuis <RouterLink :to="url">Famille et aidants</RouterLink>.</p>
        </template>
        <template v-else>
        <p v-if="m.appareilsAMettreAJour" class="mise-a-jour">
          <Icone nom="telecharger" class="en-ligne" />
          Nouvelle version de l'application à installer sur {{ m.appareilsAMettreAJour > 1 ? `${m.appareilsAMettreAJour} de ses appareils` : 'son appareil' }} :
          sur l'appareil de {{ m.prenom }}, ouvrez Chrome à l'adresse <strong>{{ adresseApk }}</strong>,
          puis ouvrez le fichier téléchargé et touchez « Mettre à jour ».
        </p>
        <UtilisationAccompagne v-if="cercle.peutGerer" :utilisation="utilisationDe(m)" :prenom="m.prenom" :appareils="m.appareils" />
        <div v-if="m.alertes" class="alertes">
          <span class="titre-alertes"><Icone nom="cloche" class="en-ligne" /> Alertes</span>
          <label class="case"><input type="checkbox" :checked="m.alertes.rendezVous" @change="changerAlertes(m, 'rendezVous', $event.target.checked)" /> Rappels de rendez-vous</label>
          <label class="case"><input type="checkbox" :checked="m.alertes.photos" @change="changerAlertes(m, 'photos', $event.target.checked)" /> Nouvelles photos</label>
          <label class="case"><input type="checkbox" :checked="m.alertes.anniversaires" @change="changerAlertes(m, 'anniversaires', $event.target.checked)" /> Anniversaires de la famille</label>
          <label class="case"><input type="checkbox" :checked="m.alertes.messages" @change="changerAlertes(m, 'messages', $event.target.checked)" /> Nouveaux messages</label>
          <span class="aide">{{ m.alertes.appareils
            ? `Reçues sur ${m.alertes.appareils} appareil${m.alertes.appareils > 1 ? 's' : ''}.`
            : `Pas encore activées : sur l'appareil de ${m.prenom}, touchez « Recevoir les alertes » sur l'écran d'accueil.` }}</span>
        </div>
        <div v-if="m.messagerie" class="messagerie">
          <span class="titre-alertes"><Icone nom="message" class="en-ligne" /> Messages</span>
          <div class="reglage">
            <span class="libelle-reglage">Qui peut écrire à {{ m.prenom }} en privé</span>
            <label class="case"><input type="radio" :name="`prive-${m.id}`" :checked="m.messagerie.prive === 'tous'" @change="changerMessagerie(m, { prive: 'tous' })" /> Toute la famille du cercle</label>
            <label class="case"><input type="radio" :name="`prive-${m.id}`" :checked="m.messagerie.prive === 'aidants'" @change="changerMessagerie(m, { prive: 'aidants' })" /> Les aidants et auxiliaires seulement</label>
            <label class="case"><input type="radio" :name="`prive-${m.id}`" :checked="m.messagerie.prive === 'personne'" @change="changerMessagerie(m, { prive: 'personne' })" /> Personne (seulement « Toute la famille »)</label>
            <span class="aide">{{ m.prenom }} ne reçoit jamais de message d'une personne extérieure au cercle. Les aidants ne lisent pas ses conversations privées.</span>
          </div>
          <div class="reglage">
            <span class="libelle-reglage">Réponses toutes faites</span>
            <div class="etiquettes">
              <span v-for="r in m.messagerie.reponses" :key="r" class="etiquette">{{ r }}
                <button type="button" class="x" :aria-label="`Retirer « ${r} »`" @click="changerMessagerie(m, { reponses: m.messagerie.reponses.filter((x) => x !== r) })"><Icone nom="fermer" /></button>
              </span>
            </div>
            <form class="ajout-reponse" @submit.prevent="ajouterReponse(m)">
              <input v-model="nouvelleReponse[m.id]" maxlength="40" placeholder="Nouvelle réponse (ex. « J'arrive »)" />
              <button class="secondaire petit">Ajouter</button>
            </form>
          </div>
          <label class="case"><input type="checkbox" :checked="m.messagerie.lectureAuto" @change="changerMessagerie(m, { lectureAuto: $event.target.checked })" /> Lire les nouveaux messages à voix haute dès leur arrivée</label>
          <label class="case"><input type="checkbox" :checked="m.messagerie.vocal" @change="changerMessagerie(m, { vocal: $event.target.checked })" /> {{ m.prenom }} peut envoyer un message vocal ou une photo</label>
        </div>
        <div v-if="cercle.peutGerer" class="actions">
          <button class="secondaire" @click="genererCode(m)">Configurer un appareil</button>
          <button class="secondaire" @click="ouvrirEnvoiApp(m)">Envoyer l'application</button>
          <BoutonIcone v-if="m.appareils" icone="deconnexion" libelle="Déconnecter ses appareils" danger @click="deconnecterAppareils(m)" />
          <BoutonIcone icone="effacer" :libelle="`Retirer ${m.prenom} du cercle`" danger @click="retirer(m)" />
        </div>
        <Modale v-if="envoiApp?.id === m.id" :titre="`Envoyer l'application à ${envoiApp.prenom}`" @fermer="envoiApp = null">
          <div class="envoi-app">
          <p class="aide">Le message contient le lien de l'application, le lien d'installation de l'APK Android et la marche à suivre.
            Le code de connexion se crée avec « Configurer un appareil » et se donne à part.</p>
          <label v-if="session.email" class="champ">Adresse email de {{ envoiApp.prenom }}
            <input v-model="envoiApp.email" type="email" />
          </label>
          <div v-if="session.email" class="actions">
            <button class="secondaire" :disabled="!envoiApp.email" @click="envoyerApp">Envoyer par email</button>
          </div>
          <p v-if="envoiApp.message" class="aide">{{ envoiApp.message }}</p>
          <p v-if="envoiApp.erreur" class="erreur">{{ envoiApp.erreur }}</p>
          <label class="champ">Numéro de téléphone (SMS ou WhatsApp)
            <input v-model="envoiApp.telephone" type="tel" placeholder="06 12 34 56 78" />
          </label>
          <div class="actions">
            <a class="rond" :href="lienWhatsAppMessage(envoiApp.telephone, texteApplication(envoiApp.prenom))" target="_blank" rel="noopener" title="Envoyer par WhatsApp" aria-label="Envoyer par WhatsApp"><Icone nom="whatsapp" /></a>
            <a class="rond" :href="lienSmsMessage(envoiApp.telephone, texteApplication(envoiApp.prenom))" title="Envoyer par SMS" aria-label="Envoyer par SMS"><Icone nom="sms" /></a>
            <BoutonIcone v-if="partageNatif" icone="partager" libelle="Partager avec une autre application" @click="partagerApp" />
          </div>
          </div>
        </Modale>
        </template>
      </div>

      <Modale v-if="codeAppareil" :titre="`Configurer l'appareil de ${codeAppareil.prenom}`" @fermer="codeAppareil = null">
        <p>Sur l'appareil de {{ codeAppareil.prenom }}, ouvrez <strong>{{ codeAppareil.lien }}</strong>
          ou allez sur la page de connexion, choisissez « Le configurer avec un code » et saisissez :</p>
        <p class="code">{{ codeAppareil.code }}</p>
        <p class="aide">Valable une seule fois, jusqu'au {{ heure(codeAppareil.expireLe) }}.</p>
        <div class="actions">
          <BoutonIcone icone="copier" libelle="Copier le lien" @click="copier(codeAppareil.lien)" />
          <button class="secondaire" @click="codeAppareil = null">Fermer</button>
        </div>
      </Modale>

      <button v-if="cercle.peutGerer" class="secondaire" @click="ajoutOuvert = true"><Icone nom="ajouter" class="en-ligne" /> Ajouter une personne accompagnée</button>
      <Modale v-if="ajoutOuvert" titre="Ajouter une personne accompagnée" @fermer="ajoutOuvert = false">
        <form @submit.prevent="ajouterAccompagne">
          <label>Prénom <input v-model="nouvelAccompagne.prenom" required /></label>
          <label>Nom <input v-model="nouvelAccompagne.nom" /></label>
          <div class="actions">
            <button>Ajouter</button>
            <button type="button" class="secondaire" @click="ajoutOuvert = false">Annuler</button>
          </div>
        </form>
      </Modale>
    </template>
  </main>
</template>

<style scoped>
.mise-a-jour {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--vert-clair);
  color: var(--bleu-nuit);
  font-size: 0.95rem;
}
.surtitre { margin: 0; }
.ligne { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.alertes { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #ebe8e3; }
.titre-alertes { font-weight: 600; color: var(--bleu-nuit); }
.messagerie { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #ebe8e3; }
.reglage { display: flex; flex-direction: column; gap: 4px; }
.libelle-reglage { font-weight: 600; font-size: 0.95rem; }
.reglage .aide { margin: 0; }
.etiquettes { display: flex; flex-wrap: wrap; gap: 6px; }
.etiquette { display: inline-flex; align-items: center; gap: 2px; background: var(--vert-clair); color: var(--vert); border-radius: 999px; padding: 3px 4px 3px 12px; font-size: 0.92rem; }
.etiquette .x { background: none; color: var(--vert); padding: 2px; display: grid; }
.etiquette .x .icone { width: 14px; height: 14px; }
.ajout-reponse { flex-direction: row; gap: 8px; margin-top: 4px; }
.ajout-reponse input { flex: 1; min-width: 0; padding: 6px 10px; }
.petit { padding: 6px 12px; font-size: 0.9rem; }
.alertes .aide { flex-basis: 100%; margin: 0; }
.case { flex-direction: row; align-items: center; gap: 6px; font-weight: normal; }
.envoi-app { display: flex; flex-direction: column; gap: 12px; }
.envoi-app input { width: 100%; }
.encart { background: var(--vert-clair); border-radius: 8px; padding: 12px; margin-top: 12px; }
.rond { width: 44px; height: 44px; border-radius: 50%; background: var(--vert-clair); color: var(--vert); display: grid; place-items: center; flex: none; }
.encart .actions { align-items: center; margin-top: 8px; }
.code { font-size: 2.5rem; font-weight: 700; letter-spacing: 0.3em; text-align: center; color: var(--bleu-nuit); margin: 8px 0; }
</style>
