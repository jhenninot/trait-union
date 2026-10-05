<script setup>
import { ref, onMounted } from 'vue'
import { installation, installer, APK_URL, dansAppliAndroid, estIOS, estAndroid, modeAutonome } from '../installation.js'
import { etatApplication, verifierApplication, miseAJourDisponible, telechargementDirect, telechargerApk, adresseCourte } from '../application.js'
import { copier } from '../cercle.js'
import BoutonIcone from '../navigation/BoutonIcone.vue'

const android = dansAppliAndroid()
const autonome = modeAutonome()
const ios = estIOS()
const surAndroid = estAndroid()
const adresse = location.origin

onMounted(verifierApplication)
const copie = ref(false)
async function copierAdresse() {
  await copier(`https://${adresseCourte()}`)
  copie.value = true
}
const date = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

// La page de démarrage de l'application Android est servie en local (https://localhost)
function changerDeServeur() {
  location.href = 'https://localhost/?changer'
}
</script>

<template>
  <main>
    <h1>Application mobile</h1>

    <section v-if="android" class="carte">
      <h2>Vous utilisez l'application Android</h2>
      <p>Elle est reliée au serveur <strong>{{ adresse }}</strong>.</p>
      <button class="secondaire" @click="changerDeServeur">Changer de serveur</button>
    </section>

    <section v-if="android && etatApplication.derniere" class="carte">
      <h2>{{ miseAJourDisponible ? 'Une nouvelle version est disponible' : 'Votre application est à jour' }}</h2>
      <p>Version installée : <strong>{{ etatApplication.installee ? `0.1.${etatApplication.installee}` : 'ancienne version' }}</strong><br />
        Dernière version : <strong>{{ etatApplication.derniere.nom }}</strong>, publiée le {{ date(etatApplication.derniere.publieeLe) }}</p>
      <template v-if="miseAJourDisponible">
        <template v-if="telechargementDirect()">
          <button @click="telechargerApk">Télécharger la nouvelle version</button>
          <p class="aide">Le navigateur télécharge le fichier : ouvrez-le et touchez « Mettre à jour ».
            Vos réglages et votre connexion sont conservés.</p>
        </template>
        <template v-else>
          <p>Cette version de l'application ne sait pas encore télécharger la mise à jour elle-même. Une seule fois :</p>
          <ol class="aide">
            <li>Ouvrez Chrome (ou un autre navigateur) sur ce téléphone.</li>
            <li>Tapez l'adresse <strong>{{ adresseCourte() }}</strong>
              <BoutonIcone icone="copier" libelle="Copier l'adresse" @click="copierAdresse" />
              <span v-if="copie"> copiée.</span></li>
            <li>Ouvrez le fichier téléchargé et touchez « Mettre à jour ». Vos réglages et votre connexion sont conservés.</li>
          </ol>
          <p class="aide">Les prochaines fois, un bouton Télécharger suffira.</p>
        </template>
      </template>
    </section>

    <template v-else>
      <section class="carte">
        <h2>Sur l'écran d'accueil</h2>
        <p v-if="autonome || installation.installee">Trait d'union est installé sur cet appareil.</p>
        <template v-else>
          <p>Ajoutez Trait d'union à l'écran d'accueil de ce téléphone, de cette tablette ou de cet ordinateur :
            il s'ouvre alors comme une application, en plein écran.</p>
          <button v-if="installation.invite" @click="installer">Installer sur cet appareil</button>
          <p v-else-if="ios" class="aide">Sur iPhone et iPad, dans Safari : touchez le bouton Partager
            (carré avec une flèche), puis « Sur l'écran d'accueil ».</p>
          <p v-else class="aide">Dans le menu du navigateur, choisissez « Installer l'application »
            ou « Ajouter à l'écran d'accueil ».</p>
        </template>
      </section>

      <section v-if="!ios" class="carte">
        <h2>Application Android</h2>
        <p>Pour les téléphones et tablettes Android, une application à installer est aussi disponible.
          C'est la solution conseillée pour la tablette de la personne accompagnée.</p>
        <a class="bouton" :href="APK_URL">Télécharger l'application (APK)</a>
        <ol class="aide">
          <li>Ouvrez le fichier téléchargé{{ surAndroid ? '' : ' sur la tablette ou le téléphone' }} ;
            Android demande d'autoriser l'installation d'applications depuis cette source.</li>
          <li>Si l'application demande l'adresse du serveur, saisissez : <strong>{{ adresse }}</strong></li>
          <li>Pour une personne accompagnée, touchez « Le configurer avec un code » et saisissez le code
            à 6 chiffres créé dans la rubrique Personnes accompagnées.</li>
        </ol>
      </section>
    </template>
  </main>
</template>

<style scoped>
h2 { font-size: 1.15rem; margin-top: 0; color: var(--bleu-nuit); }
.carte { margin-bottom: 16px; }
.bouton {
  display: inline-block;
  background: var(--vert);
  color: white;
  text-decoration: none;
  font-weight: 600;
  padding: 12px 18px;
  border-radius: 10px;
}
ol { padding-left: 20px; margin-top: 16px; }
li { margin-bottom: 6px; }
</style>
