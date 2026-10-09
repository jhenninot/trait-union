<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { api } from '../api.js'
import { utiliserCercle, heure, copier } from '../cercle.js'
import { mentionDeces, lienWhatsAppMessage, lienSmsMessage } from '../coordonnees.js'
import { session } from '../session.js'
import BoutonIcone from '../navigation/BoutonIcone.vue'
import Icone from '../navigation/Icone.vue'
import Modale from '../navigation/Modale.vue'
import UtilisationAccompagne from './UtilisationAccompagne.vue'
import { confirmer, avertir } from '../fenetre.js'

// Page « Personnes accompagnées » d'un cercle : personnes accompagnées et configuration de leurs appareils
const { url, cercle, erreur, charger, action, accompagnes } = utiliserCercle()

// Sans personne choisie : la liste des personnes accompagnées. Avec /tablettes/<membre> (sous-menu de
// la barre latérale) : les réglages de cette personne, rangés en onglets.
const route = useRoute()
const choisi = computed(() => accompagnes.value.find((m) => m.id === route.params.membre) ?? null)
const ONGLETS = [
  { cle: 'appareils', libelle: 'Appareils', icone: 'mobile' },
  { cle: 'alertes', libelle: 'Alertes', icone: 'cloche' },
  { cle: 'agenda', libelle: 'Agenda', icone: 'agenda' },
  { cle: 'jeux', libelle: 'Jeux', icone: 'jeux' },
  { cle: 'messages', libelle: 'Messages', icone: 'message' }
]
const onglet = ref('appareils')
watch(() => route.params.membre, () => { onglet.value = 'appareils' })

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
// Agenda de la personne accompagnée : proposé ou non sur sa tablette
const changerAgenda = (m, actif) => action(async () => {
  m.agendaActif = (await api('PUT', `${url.value}/membres/${m.id}/agenda`, { actif })).actif
})
// Jeux de la personne accompagnée : accès, jeux proposés, nombre de propositions et de questions
const changerJeux = (m, modifs) => action(async () => {
  m.jeux = await api('PUT', `${url.value}/membres/${m.id}/jeux`, { ...m.jeux, ...modifs })
})
// Remise à zéro des scores d'un jeu (tous les joueurs)
const JEUX_SCORE = [['musique', 'Quiz musical'], ['qui', 'Qui est-ce ?'], ['age', 'Quel âge ?'], ['souvenirs', 'Il y a longtemps…']]
const remettreAZero = (m, [jeu, nom]) => action(async () => {
  if (!await confirmer(`Effacer tous les scores de « ${nom} » pour ${m.prenom} ? Les meilleurs scores de toute la famille seront remis à zéro.`, { oui: 'Effacer les scores', danger: true })) return
  const { effaces } = await api('DELETE', `${url.value}/membres/${m.id}/scores/${jeu}`)
  await avertir(effaces ? `Scores de « ${nom} » effacés (${effaces}).` : `Il n'y avait aucun score pour « ${nom} ».`, { icone: 'coche' })
})
// Chansons du quiz musical : celles choisies par les aidants et les réactions de la personne
const chansons = ref({}) // par membre : { chansons: [...], styles: [...] }
const nouvelleChanson = ref(null) // { membre, type: 'chanson' | 'artiste' | 'style', titre, artiste, style }
const libelleChanson = (c) => c.type === 'style' ? `Style : ${c.style}` : c.type === 'artiste' ? `${c.artiste} (tous ses titres)` : `${c.titre}, ${c.artiste}`
// La réponse est attendue AVANT de recopier la liste : plusieurs chargements en parallèle (un par
// personne accompagnée) ne doivent pas s'écraser les uns les autres.
const garderChansons = (m, liste) => { chansons.value = { ...chansons.value, [m.id]: liste } }
const chargerChansons = async (m) => {
  try { garderChansons(m, await api('GET', `${url.value}/membres/${m.id}/chansons`)) } catch { /* liste laissée vide */ }
}
watch(() => cercle.value?.membres, (liste) => {
  if (cercle.value?.peutGerer) (liste ?? []).filter((m) => m.jeux).forEach(chargerChansons)
}, { immediate: true })
const ajouterChanson = () => action(async () => {
  const { membre, ...choix } = nouvelleChanson.value
  garderChansons(membre, await api('POST', `${url.value}/membres/${membre.id}/chansons`, choix))
  nouvelleChanson.value = null
})
const retirerChanson = (m, c) => action(async () => {
  garderChansons(m, await api('DELETE', `${url.value}/membres/${m.id}/chansons/${c.id}`))
})
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
      <RouterLink v-if="choisi" :to="`${url}/tablettes`" class="retour-liste"><Icone nom="precedent" class="en-ligne" /> Personnes accompagnées</RouterLink>
      <h1>{{ choisi ? `${choisi.prenom} ${choisi.nom ?? ''}` : 'Personnes accompagnées' }}</h1>
      <p v-if="!choisi" class="aide">Chaque personne accompagnée utilise une tablette (ou un téléphone) avec un écran très simple, sans mot de passe.
        Un cercle peut en réunir plusieurs, un couple par exemple : chaque appareil est configuré pour une seule personne.</p>

      <template v-if="!choisi">
        <p v-if="!accompagnes.length" class="aide">Personne pour l'instant.</p>
        <RouterLink v-for="m in accompagnes" :key="m.id" :to="`${url}/tablettes/${m.id}`" class="carte resume">
          <strong>{{ m.prenom }} {{ m.nom }}</strong>
          <span v-if="m.decede" class="aide">{{ mentionDeces(m) }}</span>
          <span v-else class="aide">{{ m.appareils }} appareil{{ m.appareils > 1 ? 's' : '' }} connecté{{ m.appareils > 1 ? 's' : '' }}</span>
          <Icone nom="suivant" class="fleche" />
        </RouterLink>
      </template>
      <p v-else-if="!choisi" class="aide">Personne introuvable.</p>
      <div v-for="m in (choisi ? [choisi] : [])" :key="m.id" class="carte">
        <div class="ligne">
          <span v-if="m.decede" class="aide">{{ mentionDeces(m) }}</span>
          <span v-else class="aide">{{ m.appareils }} appareil{{ m.appareils > 1 ? 's' : '' }} connecté{{ m.appareils > 1 ? 's' : '' }}</span>
        </div>
        <template v-if="m.decede">
          <p class="aide">Son compte est désactivé et ses appareils ont été déconnectés.
            En cas d'erreur, annulez le décès depuis <RouterLink :to="url">Famille et aidants</RouterLink>.</p>
        </template>
        <template v-else>
        <div class="onglets" role="tablist">
          <button v-for="o in ONGLETS" :key="o.cle" type="button" role="tab" :aria-selected="onglet === o.cle" :class="{ actif: onglet === o.cle }" @click="onglet = o.cle"><Icone :nom="o.icone" class="en-ligne" /> {{ o.libelle }}</button>
        </div>
        <template v-if="onglet === 'appareils'">
        <p v-if="m.appareilsAMettreAJour" class="mise-a-jour">
          <Icone nom="telecharger" class="en-ligne" />
          Nouvelle version de l'application à installer sur {{ m.appareilsAMettreAJour > 1 ? `${m.appareilsAMettreAJour} de ses appareils` : 'son appareil' }} :
          sur l'appareil de {{ m.prenom }}, ouvrez Chrome à l'adresse <strong>{{ adresseApk }}</strong>,
          puis ouvrez le fichier téléchargé et touchez « Mettre à jour ».
        </p>
        <UtilisationAccompagne v-if="cercle.peutGerer" :utilisation="utilisationDe(m)" :prenom="m.prenom" :appareils="m.appareils" />
        <div v-if="cercle.peutGerer" class="actions">
          <button class="secondaire" @click="genererCode(m)">Configurer un appareil</button>
          <button class="secondaire" @click="ouvrirEnvoiApp(m)">Envoyer l'application</button>
          <BoutonIcone v-if="m.appareils" icone="deconnexion" libelle="Déconnecter ses appareils" danger @click="deconnecterAppareils(m)" />
          <BoutonIcone icone="effacer" :libelle="`Retirer ${m.prenom} du cercle`" danger @click="retirer(m)" />
        </div>
        </template>
        <template v-else-if="onglet === 'alertes'">
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
        </template>
        <template v-else-if="onglet === 'agenda'">
        <div class="messagerie">
          <span class="titre-alertes"><Icone nom="agenda" class="en-ligne" /> Agenda</span>
          <label class="case"><input type="checkbox" :checked="m.agendaActif !== false" @change="changerAgenda(m, $event.target.checked)" /> {{ m.prenom }} a accès à son agenda</label>
          <span class="aide">{{ m.agendaActif !== false
            ? `${m.prenom} voit « Mon agenda », le programme du jour sur l'accueil et peut interroger l'assistant vocal sur ses rendez-vous.`
            : `Sur la tablette de ${m.prenom} : plus de bouton « Mon agenda », plus de programme du jour, plus de rappels de rendez-vous ni de questions sur l'agenda dans l'assistant vocal. Les rendez-vous restent visibles dans l'agenda des aidants.` }}</span>
        </div>
        </template>
        <template v-else-if="onglet === 'jeux'">
        <div v-if="m.jeux" class="messagerie">
          <span class="titre-alertes"><Icone nom="jeux" class="en-ligne" /> Jeux</span>
          <label class="case"><input type="checkbox" :checked="m.jeux.actif" @change="changerJeux(m, { actif: $event.target.checked })" /> {{ m.prenom }} a accès aux jeux</label>
          <template v-if="m.jeux.actif">
            <label class="case"><input type="checkbox" :checked="m.jeux.qui" @change="changerJeux(m, { qui: $event.target.checked })" /> « Qui est-ce ? » : retrouver un prénom</label>
            <label class="case"><input type="checkbox" :checked="m.jeux.age" @change="changerJeux(m, { age: $event.target.checked })" /> « Quel âge ? » : deviner une tranche d'âge</label>
            <label v-if="m.jeux.age || m.jeux.ageScore" class="case"><input type="checkbox" :checked="m.jeux.ageDecennie" @change="changerJeux(m, { ageDecennie: $event.target.checked })" /> « Quel âge ? » : réponses par tranches de 10 ans (« 30 à 39 ans ») au lieu de grandes tranches (enfant, adulte, senior)</label>
            <label class="case"><input type="checkbox" :checked="m.jeux.souvenirs" @change="changerJeux(m, { souvenirs: $event.target.checked })" /> « Il y a longtemps… » : retrouver les événements de sa jeunesse (d'après sa date de naissance)</label>
            <label class="case"><input type="checkbox" :checked="m.jeux.musique" @change="changerJeux(m, { musique: $event.target.checked })" /> « Quelle est cette chanson ? » : quiz musical</label>
            <label class="case"><input type="checkbox" :checked="m.jeux.musiqueScore" @change="changerJeux(m, { musiqueScore: $event.target.checked })" /> « Quiz musical avec score » : points et bonus de rapidité (pour les joueurs qui aiment la compétition)</label>
            <label class="case"><input type="checkbox" :checked="m.jeux.quiScore" @change="changerJeux(m, { quiScore: $event.target.checked })" /> « Qui est-ce ? avec score » : points et bonus de rapidité</label>
            <label class="case"><input type="checkbox" :checked="m.jeux.ageScore" @change="changerJeux(m, { ageScore: $event.target.checked })" /> « Quel âge ? avec score » : points et bonus de rapidité</label>
            <label class="case"><input type="checkbox" :checked="m.jeux.souvenirsScore" @change="changerJeux(m, { souvenirsScore: $event.target.checked })" /> « Il y a longtemps… avec score » : points et bonus de rapidité</label>
            <div class="reglage">
              <span class="libelle-reglage">Scores</span>
              <div class="etiquettes">
                <button v-for="j in JEUX_SCORE" :key="j[0]" type="button" class="secondaire petit" @click="remettreAZero(m, j)">Remettre à zéro : {{ j[1] }}</button>
              </div>
            </div>
            <label class="case"><input type="checkbox" :checked="m.jeux.exterieurs" @change="changerJeux(m, { exterieurs: $event.target.checked })" /> Inclure les personnes extérieures à la famille (« Qui est-ce ? » et « Quel âge ? ») : elles se gèrent dans la rubrique « Jeux » du menu</label>
            <label class="case"><input type="checkbox" :checked="m.jeux.decedes" @change="changerJeux(m, { decedes: $event.target.checked })" /> Proposer aussi des personnes décédées (« Qui est-ce ? » seulement)</label>
            <div class="reglage">
              <span class="libelle-reglage">Niveau</span>
              <label class="case"><input type="radio" :name="`niveau-${m.id}`" :checked="m.jeux.niveau === 2" @change="changerJeux(m, { niveau: 2 })" /> Très facile (2 propositions)</label>
              <label class="case"><input type="radio" :name="`niveau-${m.id}`" :checked="m.jeux.niveau === 3" @change="changerJeux(m, { niveau: 3 })" /> Normal (3 propositions)</label>
            </div>
            <div class="reglage">
              <span class="libelle-reglage">Questions par partie (jusqu'à 20 chansons pour le quiz musical)</span>
              <label v-for="n in [3, 5, 8, 10, 15, 20]" :key="n" class="case"><input type="radio" :name="`questions-${m.id}`" :checked="m.jeux.questions === n" @change="changerJeux(m, { questions: n })" /> {{ n }} questions</label>
            </div>
          </template>
          <div v-if="m.jeux.actif && (m.jeux.musique || m.jeux.musiqueScore)" class="reglage">
            <span class="libelle-reglage">Préférences musicales de {{ m.prenom }}</span>
            <p class="aide">Une chanson, un artiste (tous ses titres) ou un style : le quiz les mélange avec des succès de sa jeunesse (d'après sa date de naissance). Les extraits viennent d'iTunes : il faut une connexion Internet.</p>
            <div class="etiquettes">
              <span v-for="c in chansons[m.id]?.chansons ?? []" :key="c.id" class="etiquette">
                {{ libelleChanson(c) }}
                <small v-if="c.reaction === 'aime'"> · aime</small><small v-else-if="c.reaction === 'moins'"> · aime moins</small>
                <button type="button" class="x" :aria-label="`Retirer « ${c.titre} »`" @click="retirerChanson(m, c)"><Icone nom="fermer" /></button>
              </span>
            </div>
            <button type="button" class="secondaire petit" @click="nouvelleChanson = { membre: m, type: 'chanson', titre: '', artiste: '', style: '' }"><Icone nom="ajouter" class="en-ligne" /> Ajouter une préférence</button>
          </div>
          <span class="aide">Les jeux utilisent les photos et les dates de naissance de l'arbre de la famille. Par défaut, les personnes décédées ne sont pas proposées.</span>
        </div>
        </template>
        <template v-else-if="onglet === 'messages'">
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
        </template>
        <Modale v-if="nouvelleChanson?.membre.id === m.id" :titre="`Préférence musicale de ${m.prenom}`" @fermer="nouvelleChanson = null">
          <form class="envoi-app" @submit.prevent="ajouterChanson">
            <div class="reglage">
              <label class="case"><input v-model="nouvelleChanson.type" type="radio" value="chanson" /> Une chanson</label>
              <label class="case"><input v-model="nouvelleChanson.type" type="radio" value="artiste" /> Un artiste (tous ses titres)</label>
              <label class="case"><input v-model="nouvelleChanson.type" type="radio" value="style" /> Un style musical</label>
            </div>
            <label v-if="nouvelleChanson.type === 'chanson'" class="champ">Titre <input v-model="nouvelleChanson.titre" required maxlength="120" placeholder="La Bohème" /></label>
            <label v-if="nouvelleChanson.type !== 'style'" class="champ">Artiste <input v-model="nouvelleChanson.artiste" required maxlength="120" placeholder="Charles Aznavour" /></label>
            <label v-else class="champ">Style
              <select v-model="nouvelleChanson.style" required>
                <option value="" disabled>Choisir un style</option>
                <option v-for="s in chansons[m.id]?.styles ?? []" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
            <div class="actions"><button>Ajouter</button><button type="button" class="secondaire" @click="nouvelleChanson = null">Annuler</button></div>
          </form>
        </Modale>
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

      <button v-if="cercle.peutGerer && !choisi" class="secondaire" @click="ajoutOuvert = true"><Icone nom="ajouter" class="en-ligne" /> Ajouter une personne accompagnée</button>
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
.retour-liste { display: inline-flex; align-items: center; gap: 6px; font-size: 0.95rem; text-decoration: none; margin: 4px 0; }
.resume { display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit; flex-wrap: wrap; }
.resume strong { flex: 1; min-width: 40%; }
.resume .fleche { width: 20px; height: 20px; color: var(--gris); }
.onglets { display: flex; gap: 4px; overflow-x: auto; border-bottom: 1px solid #ebe8e3; margin: 8px 0 12px; }
.onglets button { background: none; color: var(--gris); border-radius: 8px 8px 0 0; padding: 8px 14px; font-weight: 600; white-space: nowrap; border-bottom: 3px solid transparent; }
.onglets button.actif { color: var(--vert); border-bottom-color: var(--vert); }
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
.envoi-app input[type="radio"], .envoi-app input[type="checkbox"] { width: auto; flex: none; }
.encart { background: var(--vert-clair); border-radius: 8px; padding: 12px; margin-top: 12px; }
.rond { width: 44px; height: 44px; border-radius: 50%; background: var(--vert-clair); color: var(--vert); display: grid; place-items: center; flex: none; }
.encart .actions { align-items: center; margin-top: 8px; }
.code { font-size: 2.5rem; font-weight: 700; letter-spacing: 0.3em; text-align: center; color: var(--bleu-nuit); margin: 8px 0; }
@media (max-width: 600px) { .onglets button { padding: 8px 8px; font-size: 0.85rem; } .onglets .icone { display: none; } }
</style>
