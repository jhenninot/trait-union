import { reactive } from 'vue'

// Aide contextuelle : le bouton « ? » ouvre la fiche de l'écran affiché (à quoi il sert,
// « comment faire… », astuces, phrases à dire à la voix). Affichée par navigation/PanneauAide.vue.
// Pour une nouvelle page : ajouter sa fiche dans FICHES (ou FICHES_ACCOMPAGNE) et sa règle dans rubrique().
export const aide = reactive({ ouverte: false })

export const ouvrirAide = () => { aide.ouverte = true }
export const fermerAide = () => { aide.ouverte = false }

const FICHES = {
  accueil: {
    titre: 'Accueil', icone: 'accueil',
    intro: 'Le tableau de bord de votre cercle : ce qui arrive bientôt, les nouvelles photos, la personne accompagnée et les moyens de la joindre.',
    comment: [
      { q: 'Appeler ou écrire à un proche', r: 'Les boutons téléphone, SMS et WhatsApp à côté de chaque nom ouvrent directement l\'application de votre appareil.' },
      { q: 'Changer de cercle', r: 'Utilisez la liste déroulante en haut du menu (ou en haut de l\'écran sur téléphone). L\'écran garde la même rubrique.' },
      { q: 'Voir comment la personne accompagnée utilise sa tablette', r: 'Le bloc « Personne accompagnée » indique si elle s\'est servie de l\'appareil ces derniers jours. Le détail est dans « Personnes accompagnées ».' },
      { q: 'Que veut dire l\'alerte « Aucun aidant » ?', r: 'Le cercle n\'a plus personne pour le gérer. Un membre qui peut le faire doit se définir comme aidant (« Changer mon rôle » dans « Famille et aidants »).' },
      { q: 'Signaler un problème', r: 'En bas du menu, « Signaler un problème » envoie un message aux administrateurs, avec une capture d\'écran si vous le souhaitez.' }
    ],
    astuces: ['Les boutons « Ajouter un rendez-vous » et « Ajouter des photos » vous évitent de passer par le menu.', 'Le menu suit cet ordre : Accueil, Messages, Agenda, Photos, Famille et aidants, Personnes accompagnées, puis Jeux et Sondages.']
  },
  famille: {
    titre: 'Famille et aidants', icone: 'famille',
    intro: 'Tous les membres du cercle, avec leurs coordonnées, et les invitations pour faire entrer de nouvelles personnes.',
    comment: [
      { q: 'Inviter un aidant, un proche ou une auxiliaire de vie', r: 'Touchez le bouton d\'invitation du rôle voulu. Un lien est créé : envoyez-le par email, SMS ou WhatsApp. La personne choisit son mot de passe en l\'ouvrant.' },
      { q: 'Quelle différence entre les rôles ?', r: 'Un aidant gère le cercle. Un proche suit la vie de la famille. Une auxiliaire de vie ne voit ni les photos ni l\'arbre, seulement les rendez-vous qui lui sont destinés. Un superviseur technique a les droits d\'un aidant, sauf l\'accès à la conversation « Les aidants » et au cahier de liaison.' },
      { q: 'Changer le rôle d\'un membre', r: 'Un aidant ou un superviseur touche le bouton « Changer le rôle » à côté du membre et choisit son nouveau rôle. Le rôle de la personne accompagnée ne peut pas être changé. Vous pouvez aussi changer votre propre rôle, même si vous êtes le seul aidant.' },
      { q: 'Savoir si une invitation a été acceptée', r: 'Vous recevez l\'alerte « Invitations acceptées » quand la personne que vous avez invitée a créé son compte (à activer dans « Mes alertes »).' },
      { q: 'Compléter une fiche', r: 'Touchez un membre pour renseigner son téléphone, sa date de naissance, son adresse et son lien avec la personne accompagnée (fils, petite-fille…).' },
      { q: 'Indiquer un décès', r: 'Dans la fiche de la personne : le compte est conservé en mémoire, sans plus d\'alertes ni de messages. L\'action peut être annulée.' }
    ],
    astuces: ['Chacun ne voit de vos coordonnées que ce que son rôle permet : une auxiliaire ne voit que le téléphone.']
  },
  agenda: {
    titre: 'Agenda', icone: 'agenda',
    intro: 'Les rendez-vous du cercle : médecin, visites, anniversaires, sorties. Ils apparaissent aussi sur la tablette de la personne accompagnée.',
    comment: [
      { q: 'Ajouter un rendez-vous', r: 'Touchez « Ajouter un rendez-vous », donnez un titre, le jour et les horaires (la fin est obligatoire). « Journée entière » couvre de minuit à minuit, sur un ou plusieurs jours.' },
      { q: 'Choisir qui voit le rendez-vous', r: 'Le niveau de visibilité décide qui le voit : toute la famille, les aidants seulement, la personne accompagnée seulement, ou elle et les aidants. Les autres voient « Rendez-vous privé ». Seul l\'auteur peut changer ce niveau.' },
      { q: 'Répéter un rendez-vous', r: 'Choisissez une répétition (chaque jour, semaine, mois ou année). En modifiant ou supprimant, vous décidez : « Cette date », « Cette date et les suivantes » ou « Toute la série ».' },
      { q: 'Prévenir l\'auxiliaire de vie', r: 'Cochez l\'option « auxiliaires » : elle ne verra que ces rendez-vous.' },
      { q: 'Recevoir un rappel', r: 'Dans le formulaire, ajoutez une alerte : vous la recevez sur votre téléphone avant le rendez-vous (voir « Mes alertes »).' }
    ],
    astuces: ['Sur téléphone, glissez le doigt pour passer d\'un mois ou d\'une semaine à l\'autre.', 'Vous pouvez modifier les rendez-vous des autres si vous êtes aidant ; « Modifié par … » indique qui est intervenu.']
  },
  photos: {
    titre: 'Photos', icone: 'photo',
    intro: 'Les photos partagées avec la famille. Elles défilent sur la tablette de la personne accompagnée, en album ou en diaporama.',
    comment: [
      { q: 'Ajouter des photos', r: 'Touchez le bouton d\'ajout, choisissez une ou plusieurs photos, ajoutez une légende (qui, où, quand) et un album si vous le souhaitez.' },
      { q: 'Classer dans un album', r: 'Créez un album avec « + Nouvel album… » puis choisissez-le à l\'envoi ou plus tard. Les photos sans album vont dans « Non classé ».' },
      { q: 'Envoyer une photo depuis une autre application', r: 'Dans la galerie de votre téléphone, touchez Partager puis Trait d\'union : la photo arrive ici, avec le choix de l\'album.' },
      { q: 'Enregistrer une photo sur mon appareil', r: 'Ouvrez la photo puis touchez « Télécharger ». Dans l\'application Android, elle arrive dans la galerie (dossier « Trait d\'union ») ; dans un navigateur, dans les téléchargements. Les photos reçues dans la messagerie se téléchargent aussi, en les ouvrant en grand.' },
      { q: 'Trier les photos par date', r: 'Au-dessus de la grille, « Trier par » propose la date d\'envoi ou la date de prise de vue, récentes ou anciennes d\'abord. La date de prise de vue est lue dans la photo à l\'envoi ; pour les photos plus anciennes, c\'est la date d\'envoi qui est utilisée.' },
      { q: 'Voir où une photo a été prise', r: 'Si la photo contient sa position GPS, ouvrez-la puis touchez « Voir sur la carte ». Le bouton « Carte » au-dessus de la grille montre sur une carte toutes les photos localisées de l\'album ; touchez un repère puis sa miniature pour ouvrir la photo. La position est lue à l\'envoi : les photos plus anciennes n\'en ont pas. Attention : Google Photos retire la position quand on partage une photo vers une autre application, sauf si l\'option « position » est activée dans son menu de partage. Dans l\'application Android, « Ajouter des photos » ouvre le gestionnaire de fichiers et demande une fois l\'autorisation de lire la position des photos : acceptez-la pour garder le lieu.' },
      { q: 'Sélectionner plusieurs photos', r: 'Restez appuyé sur une photo (ou touchez « Sélectionner »), puis touchez les autres. La barre du haut permet de tout sélectionner, partager, télécharger, ranger dans un album ou supprimer. Seuls l\'auteur d\'une photo et les aidants peuvent la déplacer ou la supprimer.' },
      { q: 'Agrandir une photo', r: 'Ouverte en grand, pincez avec deux doigts pour zoomer (jusqu\'à douze fois), ou tournez la molette de la souris sur ordinateur. Glissez ensuite pour déplacer la photo.' },
      { q: 'Retirer une photo', r: 'Ouvrez-la puis supprimez-la. Seuls son auteur et les aidants peuvent le faire.' }
    ],
    astuces: ['Une légende simple aide beaucoup la personne accompagnée à reconnaître la photo.', 'Les auxiliaires de vie n\'ont pas accès aux photos.']
  },
  messages: {
    titre: 'Messages', icone: 'message',
    intro: 'Les conversations du cercle, comme un groupe de discussion : toute la famille, les aidants, le cahier de liaison et des échanges privés.',
    comment: [
      { q: 'Écrire à toute la famille', r: 'Ouvrez « Toute la famille » : la personne accompagnée y lit et y répond aussi. Une réponse reste dans la conversation où elle a été écrite.' },
      { q: 'À quoi sert le cahier de liaison ?', r: 'Aux échanges entre aidants et auxiliaires de vie : ce qui s\'est passé dans la journée, les soins, les courses.' },
      { q: 'Envoyer une photo, un message vocal ou un émoji', r: 'Utilisez le trombone, le micro ou le bouton émoji à côté du champ de texte. Touchez un message pour y réagir.' },
      { q: 'Créer un groupe', r: 'Touchez « Nouveau groupe », donnez-lui un titre et choisissez ses membres.' },
      { q: 'Écrire en privé', r: 'Choisissez une personne : la conversation est visible par vous deux seulement. Les aidants ne lisent pas les messages privés de la personne accompagnée.' }
    ],
    astuces: ['Un ding vous prévient quand un message arrive dans la conversation ouverte ; le bouton haut-parleur le coupe.', 'Un aidant peut retirer un message qui ne devrait pas rester.']
  },
  sondages: {
    titre: 'Sondages', icone: 'sondage',
    intro: 'Trouver une date commune pour se retrouver : chacun indique ses disponibilités, y compris la personne accompagnée.',
    comment: [
      { q: 'Proposer des dates', r: 'Touchez « Nouveau sondage », donnez un titre et ajoutez plusieurs dates possibles.' },
      { q: 'Répondre à un sondage', r: 'Ouvrez-le et indiquez pour chaque date si vous êtes disponible.' },
      { q: 'Clore le sondage', r: 'Choisissez la date retenue : un rendez-vous est alors créé dans l\'agenda. Un sondage clos peut être rouvert.' }
    ],
    astuces: ['Le sondage apparaît aussi dans la conversation « Toute la famille ».']
  },
  arbre: {
    titre: 'Arbre généalogique', icone: 'arbre',
    intro: 'La famille de la personne accompagnée, avec les liens de parenté calculés pour elle : « votre petite-fille », « votre neveu »…',
    comment: [
      { q: 'Ajouter une personne', r: 'Touchez « Ajouter une personne », même si elle n\'a pas de compte, puis reliez-la à ses parents ou à son conjoint.' },
      { q: 'Placer quelqu\'un qui n\'est pas encore dans l\'arbre', r: 'Il apparaît dans « Pas encore dans l\'arbre » : touchez « Placer dans l\'arbre ».' },
      { q: 'Cacher une personne à la personne accompagnée', r: 'Dans la fiche, choisissez de la masquer : elle n\'apparaîtra pas dans « Ma famille » ni dans l\'arbre de la tablette.' }
    ],
    astuces: ['Touchez une personne pour voir sa fiche en gros caractères, telle que la personne accompagnée la verra.']
  },
  jeux: {
    titre: 'Jeux', icone: 'jeux',
    intro: 'Essayez les jeux d\'une personne accompagnée, tels qu\'elle les voit sur sa tablette. Choisissez la personne dans le sous-menu « Jeux ».',
    comment: [
      { q: 'Quels jeux existent ?', r: '« Qui est-ce ? » (retrouver un prénom), « Quel âge ? » (deviner une tranche d\'âge) et « Quelle est cette chanson ? » (quiz musical) et « Il y a longtemps… » (retrouver les grands événements de la jeunesse de la personne). Chacun existe aussi en version avec score.' },
      { q: 'Activer ou régler les jeux', r: 'Dans « Personnes accompagnées », onglet « Jeux » de la personne : accès, jeux proposés, niveau, nombre de questions, préférences musicales.' },
      { q: 'Remettre les scores à zéro', r: 'Dans le même onglet, « Remettre à zéro » pour chaque jeu avec score. Les points comptent aussi le bonus de rapidité.' },
      { q: 'Partager un score avec la famille', r: 'À la fin d\'un jeu avec score, « Partager mon score avec la famille » envoie un message dans « Toute la famille » (par exemple : « Léa a marqué 600 points sur 1000 »). Tout le monde peut le faire, la personne accompagnée comme ses proches.' }
    ],
    astuces: ['Vos essais ne comptent pas dans les scores de la personne accompagnée.']
  },
  tablettes: {
    titre: 'Personnes accompagnées', icone: 'compte',
    intro: 'Tout ce qui concerne la tablette ou le téléphone de la personne accompagnée : branchement de l\'appareil et réglages qui lui sont propres.',
    comment: [
      { q: 'Configurer un appareil', r: 'Touchez « Configurer un appareil » : un code à 6 chiffres est créé. Installez l\'application sur la tablette, ouvrez-la et saisissez ce code.' },
      { q: 'Envoyer l\'application', r: 'Utilisez « Envoyer l\'application » pour transmettre le lien d\'installation par email, SMS ou WhatsApp.' },
      { q: 'Où sont les réglages ?', r: 'Choisissez la personne dans le sous-menu « Personnes accompagnées » : ses réglages sont rangés en cinq onglets, Appareils, Alertes, Agenda, Jeux et Messages.' },
      { q: 'Régler les alertes et la messagerie', r: 'Onglet « Alertes » : quelles alertes reçoit la tablette (rappels de rendez-vous, nouvelles photos, nouveaux messages, anniversaires). Onglet « Messages » : qui peut lui écrire en privé et la lecture à voix haute des nouveaux messages.' },
      { q: 'Retirer l\'agenda à une personne', r: 'Onglet « Agenda » : décochez l\'accès si la personne n\'a pas besoin qu\'on gère son agenda. Sur sa tablette, le bouton « Mon agenda », le programme du jour, les rappels de rendez-vous et les questions vocales sur l\'agenda disparaissent. Les rendez-vous du cercle restent visibles pour les aidants.' },
      { q: 'Régler les jeux', r: 'Onglet « Jeux » : jeux proposés (avec ou sans score), niveau, nombre de questions, personnes extérieures à la famille ou décédées, préférences musicales, remise à zéro des scores. Le score peut être partagé dans « Toute la famille » à la fin de chaque jeu avec score.' },
      { q: 'Préparer des réponses toutes faites', r: 'Ajoutez des phrases comme « J\'arrive » : la personne les envoie d\'un seul toucher.' },
      { q: 'Suivre l\'utilisation', r: 'Un bloc indique les jours où la tablette a servi, pour s\'assurer qu\'elle est bien utilisée.' }
    ],
    astuces: ['Le bouton SOS de la tablette appelle les aidants qui ont un numéro de téléphone : pensez à le renseigner dans leur fiche.', 'Un cercle peut accompagner plusieurs personnes : chacune a ses propres réglages et ne voit pas les rendez-vous destinés aux autres.']
  },
  profil: {
    titre: 'Mon profil', icone: 'compte',
    intro: 'Vos informations personnelles, telles que la famille les voit.',
    comment: [
      { q: 'Choisir mon avatar', r: 'Prenez l\'un des modèles proposés ou envoyez une photo, que vous pouvez recadrer.' },
      { q: 'Renseigner mes coordonnées', r: 'Téléphone, date de naissance et adresse. Votre anniversaire est alors rappelé à la famille.' },
      { q: 'Préciser mon lien avec la personne accompagnée', r: 'Indiquez par exemple « fils » ou « petite-fille » : il s\'affiche sur sa fiche.' }
    ],
    astuces: ['Les aidants peuvent aussi choisir l\'avatar de la personne accompagnée.']
  },
  alertes: {
    titre: 'Mes alertes', icone: 'cloche',
    intro: 'Les notifications que vous recevez : rappels de rendez-vous, nouvelles photos, messages, anniversaires.',
    comment: [
      { q: 'Activer les alertes sur cet appareil', r: 'Touchez « Activer les alertes ici » et acceptez la demande du navigateur ou du téléphone. Chaque appareil s\'active séparément.' },
      { q: 'Vérifier que ça marche', r: 'Touchez « Envoyer une alerte d\'essai ».' },
      { q: 'Choisir ce que je reçois', r: 'Cochez ou décochez chaque type d\'alerte dans « Ce que je reçois » : rendez-vous, photos, messages, anniversaires, invitations acceptées.' }
    ],
    astuces: ['Sur iPhone, les alertes demandent d\'abord d\'ajouter Trait d\'union à l\'écran d\'accueil.']
  },
  application: {
    titre: 'Application mobile', icone: 'mobile',
    intro: 'Installer Trait d\'union sur un téléphone ou une tablette, et la garder à jour.',
    comment: [
      { q: 'Installer sur l\'écran d\'accueil', r: 'Depuis le navigateur, utilisez « Ajouter à l\'écran d\'accueil » : l\'application s\'ouvre ensuite en plein écran.' },
      { q: 'Installer l\'application Android', r: 'Téléchargez le fichier proposé sur cette page puis ouvrez-le. Autorisez l\'installation d\'applications de cette source si Android le demande.' },
      { q: 'Le conseil d\'installation', r: 'À la première connexion, une carte vous propose d\'installer l\'application : touchez « Installer » (ou suivez le guide sur Safari). Si vous la fermez, elle revient au bout de 7 jours.' },
      { q: 'Mettre à jour', r: 'Un bandeau signale une nouvelle version ; cette page indique si votre application est à jour.' }
    ],
    astuces: ['La version Android permet de partager des photos depuis la galerie et d\'utiliser la voix.']
  },
  recevoir: {
    titre: 'Photos reçues', icone: 'photo',
    intro: 'Les photos que vous venez de partager vers Trait d\'union depuis une autre application.',
    comment: [
      { q: 'Les envoyer à la famille', r: 'Vérifiez l\'aperçu, choisissez un album (ou « Non classé »), ajoutez une légende puis validez.' }
    ],
    astuces: []
  },
  admin: {
    titre: 'Administration', icone: 'bouclier',
    intro: 'Les réglages réservés à l\'administrateur, réunis dans une seule page à onglets : statistiques, cercles, utilisateurs, journal, emails, photos, alertes, messagerie et présentation.',
    comment: [
      { q: 'Renommer un cercle', r: 'Onglet « Cercles » : touchez le bouton de renommage du cercle, saisissez le nouveau nom dans la fenêtre puis validez.' },
      { q: 'Activer la commande vocale en langage naturel', r: 'Dans la page « Famille et aidants » du cercle (administrateur global seulement) : saisissez la clé API Mistral du cercle et activez l\'option. Quand les mots-clés ne comprennent pas une phrase, un petit modèle de Mistral (UE) choisit l\'action ; seule la phrase dite lui est envoyée. Retirer la clé désactive l\'option, les mots-clés continuent de fonctionner.' },
      { q: 'Où régler l\'envoi des invitations par email ?', r: 'Dans « Envoi d\'emails » : renseignez la clé du service d\'envoi puis envoyez un message d\'essai.' },
      { q: 'Où sont stockées les photos ?', r: '« Stockage des photos » : indiquez les accès de votre stockage en ligne et touchez « Vérifier ». Rien n\'est conservé sur le serveur.' },
      { q: 'Supprimer un compte', r: 'Dans « Utilisateurs » : une alerte indique les cercles concernés et si la personne est le seul aidant d\'une personne accompagnée.' },
      { q: 'Voir pourquoi un envoi de photo a échoué ?', r: 'Dans « Journal » : filtrez par niveau « Erreur » ou par module « photos ». Les erreurs du serveur et celles vues par le navigateur de la personne y figurent, avec l\'heure et le compte concerné.' },
      { q: 'Montrer l\'application à d\'autres', r: '« Page de présentation » règle l\'adresse secrète de la page de découverte, qui n\'est jamais référencée par les moteurs de recherche.' }
    ],
    astuces: ['« Statistiques » ne montre que des chiffres agrégés, jamais le contenu des échanges.', 'Le « Journal » ne garde ni mot de passe, ni contenu de message ; il s\'efface tout seul après 30 jours.']
  },
  adminJournal: {
    titre: 'Journal', icone: 'journal',
    intro: 'Les erreurs du serveur et du navigateur des utilisateurs, pour comprendre ce qui ne fonctionne pas (envoi de photos, emails, alertes...).',
    comment: [
      { q: 'Filtrer', r: 'Choisissez un niveau, un module ou une origine, ou cherchez un mot. Touchez une ligne pour voir le détail technique.' },
      { q: 'Voir plus ancien', r: 'Touchez « Afficher plus » en bas de la liste.' },
      { q: 'Savoir pourquoi une photo n\'a pas de lieu', r: 'Filtrez le module « photos » et le niveau « Infos » : chaque envoi indique d\'où vient la photo (choisie, partagée vers la PWA ou l\'APK) et si un lieu et une date ont été trouvés dedans. Les coordonnées ne sont jamais écrites.' },
      { q: 'Transmettre le journal', r: 'Touchez « Exporter en texte » ou « Exporter en JSON » en bas de la page : le fichier reprend les filtres choisis.' },
      { q: 'Vider le journal', r: '« Vider le journal » efface tout, après confirmation.' }
    ],
    astuces: ['Les lignes les plus anciennes sont effacées automatiquement après 30 jours.']
  },
  general: {
    titre: 'Trait d\'union', icone: 'question',
    intro: 'Trait d\'union aide les personnes malades et leurs aidants à garder le lien avec leurs proches.',
    comment: [
      { q: 'Naviguer', r: 'Le menu (en bas sur téléphone, à gauche sur ordinateur) donne accès à toutes les rubriques.' }
    ],
    astuces: []
  }
}

// Fiches de l'appareil de la personne accompagnée : phrases courtes, vouvoiement, gros caractères.
const FICHES_ACCOMPAGNE = {
  accueil: {
    titre: 'Mon accueil', icone: 'accueil',
    intro: 'Ici, vous voyez ce qui se passe aujourd\'hui. Les gros boutons du bas vous mènent partout.',
    comment: [
      { q: 'Écouter ma journée', r: 'Touchez « Écouter » : la tablette vous lit la date, l\'heure et ce qui est prévu.' },
      { q: 'Voir mes nouvelles photos', r: 'Touchez la ligne des nouvelles photos pour les ouvrir.' },
      { q: 'Appeler à l\'aide', r: 'Touchez le bouton « SOS » : les visages de vos aidants s\'affichent. Touchez « Appeler » sous celui que vous voulez joindre : le téléphone compose le numéro.' },
      { q: 'Parler à la tablette', r: 'Touchez « Parler » et dites une phrase comme vous le feriez à quelqu\'un : la tablette comprend aussi les phrases de tous les jours.' }
    ],
    voix: ['Qu\'est-ce que j\'ai aujourd\'hui ?', 'Quelle heure est-il ?', 'Quel âge a Marie ?', 'C\'est quand l\'anniversaire de Paul ?', 'Appelle Léa']
  },
  agenda: {
    titre: 'Mon agenda', icone: 'agenda',
    intro: 'Vos rendez-vous et les visites de votre famille.',
    comment: [
      { q: 'Ajouter un rendez-vous', r: 'Touchez « Ajouter », dites ce que c\'est, choisissez le jour, puis touchez « Enregistrer ».' },
      { q: 'Écouter mes rendez-vous', r: 'Touchez le bouton haut-parleur : la tablette vous les lit.' },
      { q: 'Effacer ou changer un rendez-vous', r: 'Touchez-le. Pour un rendez-vous qui se répète, choisissez « Ce jour-là » ou « Toutes les fois ».' }
    ],
    voix: ['Qu\'est-ce que j\'ai demain ?', 'Quels sont mes rendez-vous ?']
  },
  photos: {
    titre: 'Mes photos', icone: 'photo',
    intro: 'Les photos que votre famille vous envoie.',
    comment: [
      { q: 'Voir les photos', r: 'Touchez un album, puis faites glisser le doigt ou touchez les flèches pour passer à la suivante.' },
      { q: 'Lancer le diaporama', r: 'Touchez « Diaporama » : les photos défilent toutes seules. Touchez l\'écran pour arrêter.' },
      { q: 'Écouter la légende', r: 'Touchez le haut-parleur : la tablette lit ce qui est écrit sous la photo.' },
      { q: 'Envoyer une photo à ma famille', r: 'Touchez le bouton « Partager » sous la photo.' },
      { q: 'Savoir où une photo a été prise', r: 'Quand la photo a un lieu, touchez le bouton avec le repère sous la photo : une carte s\'ouvre.' },
      { q: 'Garder une photo sur la tablette', r: 'Touchez le bouton avec la flèche vers le bas sous la photo : elle est enregistrée dans la galerie de la tablette.' },
      { q: 'Agrandir une photo', r: 'Pincez la photo avec deux doigts pour la voir plus grande, puis faites-la glisser.' }
    ],
    voix: ['Montre-moi les photos']
  },
  famille: {
    titre: 'Ma famille', icone: 'famille',
    intro: 'Toutes les personnes de votre famille, avec leur photo et leur lien avec vous.',
    comment: [
      { q: 'Voir une personne', r: 'Touchez son nom : sa fiche s\'affiche en grand, avec son numéro de téléphone.' },
      { q: 'Voir mon arbre de famille', r: 'Touchez « Mon arbre » : vous voyez qui est le fils, la petite-fille, le neveu de qui.' }
    ],
    voix: ['Qui est Marie ?', 'Montre-moi ma famille', 'Qui est le fils de Paul ?', 'Quel âge a Marie ?']
  },
  arbre: {
    titre: 'Mon arbre', icone: 'arbre',
    intro: 'Votre famille dessinée en arbre : parents, enfants, petits-enfants.',
    comment: [
      { q: 'Voir une personne', r: 'Touchez un nom pour voir sa fiche.' },
      { q: 'Revenir à la liste', r: 'Touchez « Ma famille ».' }
    ],
    voix: []
  },
  jeux: {
    titre: 'Jeux', icone: 'jeux',
    intro: 'Des petits jeux avec les photos de votre famille. Il n\'y a pas de mauvaise réponse : on vous donne toujours la réponse avec le sourire.',
    comment: [
      { q: 'Jouer à « Qui est-ce ? »', r: 'Regardez la photo et touchez le prénom qui convient.' },
      { q: 'Jouer à « Quel âge ? »', r: 'Regardez la photo et touchez l\'âge qui convient. Pas besoin d\'être précis.' },
      { q: 'Jouer à « Quelle est cette chanson ? »', r: 'Écoutez l\'extrait de musique, puis touchez le titre qui convient. Touchez « Réécouter » pour l\'entendre encore, et « J\'aime » ou « J\'aime moins » à la fin.' },
      { q: 'Jouer pour marquer des points', r: 'Certains jeux comptent des points : plus vous répondez vite, plus vous gagnez. À la fin, vous voyez votre meilleur score et les trois meilleurs scores.' },
      { q: 'Montrer mon score à la famille', r: 'À la fin d\'un jeu avec score, touchez « Partager mon score avec la famille » : votre score arrive dans les messages de toute la famille.' },
      { q: 'Si je ne sais pas', r: 'Touchez « Je ne sais pas » : on vous donne la réponse.' },
      { q: 'Écouter', r: 'Touchez le haut-parleur : la tablette lit la question ou la réponse.' }
    ],
    voix: []
  },
  messages: {
    titre: 'Mes messages', icone: 'message',
    intro: 'Les messages de votre famille, comme sur un téléphone. Un rond vert indique un nouveau message.',
    comment: [
      { q: 'Lire un message', r: 'Touchez la conversation. Touchez « Écouter » pour que la tablette lise le message.' },
      { q: 'Écrire un message', r: 'Touchez « Écrire », puis écrivez votre texte ou choisissez une phrase toute faite, et touchez « Envoyer ».' },
      { q: 'Écrire à une personne seulement', r: 'Touchez « Écrire à quelqu\'un » puis son nom.' },
      { q: 'Effacer un de mes messages', r: 'Touchez « Effacer » sous votre message et confirmez.' }
    ],
    voix: ['Lis mes messages']
  },
  recevoir: {
    titre: 'Photos reçues', icone: 'photo',
    intro: 'Vous venez de choisir une photo à envoyer à votre famille.',
    comment: [
      { q: 'Envoyer la photo', r: 'Vérifiez la photo, choisissez un album si vous voulez, puis touchez le bouton pour l\'envoyer.' }
    ],
    voix: []
  },
  general: {
    titre: 'Aide', icone: 'question',
    intro: 'Touchez un gros bouton en bas de l\'écran pour aller où vous voulez.',
    comment: [
      { q: 'Parler à la tablette', r: 'Touchez « Parler » et dites par exemple « Qu\'est-ce que j\'ai aujourd\'hui ? ».' },
      { q: 'Appeler à l\'aide', r: 'Sur l\'accueil, touchez « SOS » puis « Appeler » sous le visage d\'un aidant.' }
    ],
    voix: ['Qu\'est-ce que j\'ai aujourd\'hui ?']
  }
}

// Rubrique correspondant à l'adresse affichée
export function rubrique(chemin, accompagne) {
  if (accompagne) {
    if (chemin === '/') return 'accueil'
    if (chemin === '/mon-arbre') return 'arbre'
    const cle = chemin.slice(1)
    return FICHES_ACCOMPAGNE[cle] ? cle : 'general'
  }
  if (chemin === '/') return 'accueil'
  if (chemin === '/admin/journal') return 'adminJournal'
  if (chemin.startsWith('/admin/')) return 'admin'
  const suite = chemin.match(/^\/cercles\/[^/]+(?:\/(\w+))?$/)
  if (suite) return suite[1] ? (FICHES[suite[1]] ? suite[1] : 'general') : 'famille'
  const cle = chemin.slice(1)
  return FICHES[cle] ? cle : 'general'
}

export function fiche(chemin, accompagne) {
  const cle = rubrique(chemin, accompagne)
  return (accompagne ? FICHES_ACCOMPAGNE : FICHES)[cle]
}
