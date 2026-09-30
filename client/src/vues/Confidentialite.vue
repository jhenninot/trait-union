<template>
  <main class="texte">
    <h1>Politique de confidentialité</h1>
    <p class="aide">Dernière mise à jour : 30 septembre 2026 (photos)</p>

    <p>Trait d'union est une application privée qui aide une personne accompagnée (atteinte de la maladie
      d'Alzheimer ou d'une maladie apparentée), ses aidants et sa famille à garder le lien. Elle est
      hébergée sur un serveur personnel géré par son administrateur, qui est le responsable du traitement
      des données.</p>

    <h2>Données collectées</h2>
    <ul>
      <li><strong>Compte</strong> : prénom, nom (facultatif), adresse email et empreinte chiffrée du mot de passe
        (le mot de passe lui-même n'est jamais conservé).</li>
      <li><strong>Connexion avec Google</strong> : si vous choisissez cette option, nous recevons de Google uniquement
        votre identifiant de compte, votre adresse email (et le fait qu'elle soit vérifiée), votre prénom et votre nom.
        Nous n'accédons à aucune autre donnée de votre compte Google (contacts, agenda, fichiers…).</li>
      <li><strong>Cercles</strong> : les cercles auxquels vous appartenez et votre rôle (personne accompagnée, aidant, proche).</li>
      <li><strong>Personne accompagnée</strong> : prénom et nom saisis par un aidant ; elle n'a ni email ni mot de passe.</li>
      <li><strong>Photos</strong> : les photos envoyées dans un cercle, leur légende, qui les a envoyées et quand.</li>
      <li><strong>Sessions</strong> : date d'expiration de vos connexions et, le cas échéant, le nom donné à l'appareil.</li>
    </ul>

    <h2>Utilisation</h2>
    <p>Ces données servent uniquement à vous identifier, à sécuriser l'accès et à faire fonctionner les cercles.
      Elles ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires, ni transmises à des tiers.
      Aucun outil de mesure d'audience ni cookie publicitaire n'est utilisé : le seul cookie déposé sert à
      maintenir votre connexion.</p>

    <h2>Qui voit quoi</h2>
    <p>Les membres d'un cercle voient les prénoms, noms et rôles des autres membres de ce cercle. Les adresses email
      ne sont visibles que des aidants du cercle et de l'administrateur.</p>

    <h2>Stockage des photos</h2>
    <p>Les photos ne sont pas conservées sur le serveur de l'application : elles sont envoyées directement chez un
      hébergeur de stockage choisi par l'administrateur (par défaut OVHcloud, en France), dans un espace privé.
      Elles ne sont affichées qu'aux membres du cercle, par des liens temporaires valables quelques heures.
      La personne qui a envoyé une photo, ou un aidant du cercle, peut la supprimer à tout moment.</p>

    <h2>Conservation et suppression</h2>
    <p>Les données sont conservées tant que votre compte existe. Un aidant peut retirer un membre d'un cercle ;
      pour supprimer votre compte, demandez-le à l'administrateur de l'application ou à l'aidant qui vous a invité.</p>

    <h2>Vos droits</h2>
    <p>Conformément au RGPD, vous pouvez accéder à vos données, les rectifier, les supprimer, vous opposer à leur
      traitement ou demander leur portabilité en contactant l'administrateur de l'application. Vous pouvez aussi
      adresser une réclamation à la CNIL (<a href="https://www.cnil.fr" rel="noopener">cnil.fr</a>).</p>

    <h2>Sécurité</h2>
    <p>Les échanges sont chiffrés (HTTPS), les mots de passe sont stockés sous forme d'empreinte et les jetons de
      connexion ne sont jamais conservés en clair.</p>

    <p><RouterLink to="/">Retour à l'application</RouterLink></p>
  </main>
</template>

<style scoped>
.texte { line-height: 1.55; }
.texte li { margin-bottom: 6px; }
</style>
