<script setup>
// Page de présentation de Trait d'union, à l'adresse secrète /decouvrir/<clé> réglée par
// l'administrateur (AdminPresentation.vue). Jamais indexée (robots.txt, meta et en-tête
// X-Robots-Tag). Bouton « Me contacter » seulement s'il est activé ; son lien n'est décodé
// qu'au clic (robots collecteurs d'adresses). Les écrans montrés sont des données d'exemple.
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import logo from '../logo.svg'
import Icone from '../navigation/Icone.vue'

const route = useRoute()
const etat = ref('chargement') // chargement, introuvable, prete
const lienContact = ref(null)

const aujourdhui = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

const QUESTIONS = [
  'Est-ce que maman sait qu\'elle a rendez-vous chez le médecin jeudi ?',
  'Qui passe la voir cette semaine ?',
  'A-t-elle vu les photos des petits-enfants ?',
  'Quelqu\'un a-t-il pensé à racheter du lait ?'
]

// Les trois bénéfices mis en avant ; le reste est présenté plus bas
const ESSENTIEL = [
  {
    icone: 'tablette',
    couleur: 'vert',
    titre: 'Un écran tout simple, tablette ou smartphone',
    texte: 'La date et l\'heure en grand, le moment de la journée, ses rendez-vous, ses photos, sa famille et ses messages : de gros boutons, rien d\'autre. Un bouton lui lit sa journée à voix haute.'
  },
  {
    icone: 'agenda',
    couleur: 'bleu',
    titre: 'Un agenda partagé par tous',
    texte: 'Médecin, kiné, visites, toilette, médicaments : chacun ajoute les rendez-vous, avec une alerte avant l\'heure. Elle voit les siens, et le reste n\'encombre pas son écran.'
  },
  {
    icone: 'photo',
    couleur: 'orange',
    titre: 'Les photos de la famille',
    texte: 'Les petits-enfants envoient leurs photos depuis leur téléphone, rangées en albums. Elles arrivent sur sa tablette ou son smartphone, en grand et en diaporama, avec le prénom de qui les a envoyées.'
  }
]

const ROLES = [
  { icone: 'compte', nom: 'Les personnes accompagnées', texte: 'Une ou plusieurs par cercle, un couple par exemple. Pas d\'email ni de mot de passe : un aidant tape un code à 6 chiffres sur sa tablette ou son smartphone, qui reste ensuite connecté.' },
  { icone: 'coeur', nom: 'Les aidants', texte: 'Ils gèrent le cercle : invitations, arbre de la famille, appareils (lien d\'installation de l\'application envoyé par email, SMS ou WhatsApp, avec la marche à suivre) et coordonnées des personnes accompagnées, réglages de leurs alertes.' },
  { icone: 'famille', nom: 'Les proches', texte: 'Enfants, petits-enfants, amis : ils suivent l\'agenda, partagent leurs photos, écrivent à toute la famille, consultent l\'arbre et gardent le contact, même de loin.' },
  { icone: 'maison', nom: 'Les auxiliaires de vie', texte: 'Ils voient seulement les rendez-vous qui les concernent et le téléphone de chacun, et tiennent le cahier de liaison avec les aidants. Ni les photos de famille, ni l\'arbre, ni les messages de la famille.' }
]

// Arbre d'exemple, vu par la personne accompagnée : les liens sont calculés par l'application
const ARBRE = [
  {
    famille: 'La famille de Michel',
    couleur: 'vert',
    generations: [
      { lien: 'Mon fils', personnes: [{ prenom: 'Michel', avatar: 'mature-man-fair-grey' }, { prenom: 'Anne', avatar: 'mature-woman-fair-auburn', allie: true }] },
      { lien: 'Mon petit-fils', personnes: [{ prenom: 'Julien', avatar: 'adult-man-fair-glasses' }] },
      { lien: 'Mon arrière-petit-fils', personnes: [{ prenom: 'Léo', avatar: 'baby', age: '4 mois' }] }
    ]
  },
  {
    famille: 'La famille de Sylvie',
    couleur: 'orange',
    generations: [
      { lien: 'Ma fille', personnes: [{ prenom: 'Sylvie', avatar: 'mature-woman-black-short' }, { prenom: 'Pierre', avatar: 'mature-man-fair-silver', allie: true }] },
      { lien: 'Ma petite-fille', personnes: [{ prenom: 'Claire', avatar: 'young-woman-fair-ginger' }] }
    ]
  }
]
const ARBRE_POINTS = [
  'Les liens se calculent tout seuls : « mon fils », « ma petite-fille », « mon gendre »',
  'Des personnes sans compte : un bébé, un oncle sans smartphone',
  'Les disparus gardent leur place, sans alerte d\'anniversaire',
  'L\'âge des bébés en mois, en semaines ou en jours'
]

const TABLEAU_POINTS = [
  'Appeler, envoyer un SMS ou un message WhatsApp en un geste',
  'Savoir si la personne accompagnée a vu les nouvelles photos',
  'Les messages non lus, en tête de l\'accueil',
  'Un appareil à relier ou une alerte à activer : c\'est dans « À faire »',
  'Plusieurs cercles pour un même compte, chacun avec son rôle'
]

// Messagerie d'exemple, vue par la personne accompagnée : ses conversations, puis un fil
const CONVERSATIONS = [
  { titre: 'Toute la famille', groupe: true, apercu: 'Claire : On arrive à 15h avec Lucas !', heure: '10:12', nonLus: 2 },
  { titre: 'Michel', avatar: 'mature-man-fair-grey', apercu: 'Je t\'appelle ce soir, Maman.', heure: 'Hier', nonLus: 0 }
]
const FIL = [
  { prenom: 'Claire', avatar: 'young-woman-fair-ginger', texte: 'On arrive à 15h avec Lucas !' },
  { prenom: 'Julien', avatar: 'adult-man-fair-glasses', photo: true, texte: 'Léo a fait ses premiers pas' },
  { prenom: 'Vous', avatar: 'senior-woman-fair-glasses', moi: true, rapide: 'Je t\'embrasse' }
]
const MESSAGES_POINTS = [
  '« Toute la famille », personnes accompagnées comprises, et des conversations à deux',
  'Pour elle : gros boutons « Écouter » et « Écrire », réponses toutes faites, message vocal ou photo',
  'Une pastille pour les messages non lus, et « Vu par Claire et Michel »',
  'Le cahier de liaison, entre aidants et auxiliaires de vie : passages, repas, courses à prévoir',
  'Une photo reçue se range en un geste dans un album du cercle'
]

// Sondage de dates d'exemple, vu par la personne accompagnée : une ligne par jour proposé
const SONDAGE = [
  { jour: 'Samedi 10 octobre', choix: 'non' },
  { jour: 'Dimanche 11 octobre', choix: 'peut_etre' },
  { jour: 'Samedi 17 octobre', choix: 'oui' }
]
const SONDAGE_CHOIX = [
  { valeur: 'oui', libelle: 'Oui', icone: 'coche' },
  { valeur: 'peut_etre', libelle: 'Peut-être', icone: 'question' },
  { valeur: 'non', libelle: 'Non', icone: 'fermer' }
]
const SONDAGE_POINTS = [
  'Aidants et proches proposent les jours, le moment et le lieu',
  'Oui, peut-être ou non pour chaque jour, et un petit mot',
  'Un aidant peut répondre à la place de la personne accompagnée',
  'Bouton « Relancer », et une alerte la veille de la date limite',
  'La date choisie part dans l\'agenda de tous ; le sondage peut être rouvert'
]

// Jeu d'exemple, vu par la personne accompagnée : une photo, trois prénoms, une réponse toujours bienveillante
const JEUX_CHOIX = ['Claire', 'Sylvie', 'Marie']
const JEUX_POINTS = [
  '« Qui est-ce ? » : retrouver le prénom d\'un proche, parmi trois',
  '« Quel âge ? » : deviner une tranche d\'âge, sans avoir à être précis',
  '« Quelle est cette chanson ? » : un extrait de musique de sa jeunesse, avec « J\'aime » ou « J\'aime moins »',
  'Les aidants ajoutent les chansons préférées de la personne, qui passent en premier',
  'Chaque jeu se règle par personne, ou se coupe tout à fait',
  'Ni score ni chrono : une erreur ou « Je ne sais pas » donne la réponse avec le sourire',
  'La question et la réponse sont lues à voix haute, avec le lien de parenté',
  'Les photos viennent de l\'arbre de la famille, les proches d\'abord'
]

// Agenda d'exemple : chaque rendez-vous a son niveau de visibilité
const RENDEZ_VOUS = [
  { heure: '09h00', titre: 'Toilette', visibilite: [{ nom: 'Aidants', classe: 'aidants' }, { nom: 'Auxiliaires', classe: 'auxiliaires' }], alerte: '15 minutes avant' },
  { heure: '11h30', titre: 'Kinésithérapeute', visibilite: [{ nom: 'Jeanne + aidants', classe: 'accompagne' }], alerte: '1 heure avant' },
  { heure: '15h00', titre: 'Visite de Claire et Lucas', visibilite: [{ nom: 'Tous', classe: 'tous' }] }
]

const AUSSI = [
  { icone: 'cloche', titre: 'Des alertes qui arrivent', texte: 'Rappel avant un rendez-vous, nouveaux messages, nouvelles photos, anniversaire du jour : sur le téléphone de chacun, et sur la tablette ou le smartphone de la personne accompagnée, même écran éteint.' },
  { icone: 'gateau', titre: 'Les anniversaires', texte: 'Le matin, son écran lui rappelle à qui souhaiter son anniversaire, avec l\'âge. Toute la famille reçoit la même alerte.' },
  { icone: 'telephone', titre: 'Les coordonnées de chacun', texte: 'Téléphone, adresse, âge et lien avec elle : une fiche en gros caractères, lue à voix haute, pour qu\'elle sache qui est qui, et qui appeler.' },
  { icone: 'compte', titre: 'Un visage pour chacun', texte: 'Une photo ou un avatar illustré pour chaque membre, pour reconnaître tout le monde d\'un coup d\'oeil.' },
  { icone: 'partager', titre: 'Partager depuis le téléphone', texte: 'Sur Android, « Partager » depuis la galerie envoie directement des photos dans un album du cercle.' },
  { icone: 'micro', titre: 'Commandes vocales', texte: 'Elle appuie sur « Parler » et demande « Qu\'est-ce que je fais aujourd\'hui ? », « Lis mes messages » ou « Montre-moi les photos » : l\'appareil répond à voix haute et ouvre le bon écran. Sans intelligence artificielle.' },
  { icone: 'mobile', titre: 'Sur tous les écrans', texte: 'Ordinateur, téléphone ou tablette : application installable sur iPhone et Android, et application Android dédiée.' },
  { icone: 'repeter', titre: 'Toujours à jour', texte: 'Quand une nouvelle version de l\'application Android sort, chacun est prévenu, et les aidants voient quels appareils mettre à jour.' }
]

const ETAPES = [
  { titre: 'Créer le cercle', texte: 'Un cercle par famille, avec une ou plusieurs personnes accompagnées et leurs aidants.' },
  { titre: 'Inviter la famille', texte: 'Un lien d\'invitation, envoyé en un geste par email, SMS ou WhatsApp, avec un message déjà rédigé. Chacun choisit son mot de passe, puis complète son profil : photo, téléphone, lien avec la personne accompagnée.' },
  { titre: 'Installer son appareil', texte: 'Un code à 6 chiffres sur sa tablette ou son smartphone, et c\'est prêt. Rien à retenir pour elle.' }
]

onMounted(async () => {
  try {
    // Compteur de visites (visible seulement par l'administrateur) : une fois par onglet,
    // jamais pour l'aperçu ouvert depuis l'administration (?apercu=1)
    const cle = String(route.params.cle || '')
    const memoire = `tu_presentation_${cle.slice(0, 8)}`
    let compter = route.query.apercu !== '1'
    try {
      if (sessionStorage.getItem(memoire)) compter = false
    } catch { /* stockage indisponible : on compte */ }
    const res = await fetch(`/api/presentation/${encodeURIComponent(cle)}${compter ? '?compter=1' : ''}`)
    if (!res.ok) throw new Error('introuvable')
    if (compter) {
      try { sessionStorage.setItem(memoire, '1') } catch { /* sans effet */ }
    }
    lienContact.value = (await res.json()).contact || null
    etat.value = 'prete'
  } catch {
    etat.value = 'introuvable'
  }
})

function contacter() {
  if (!lienContact.value) return
  const lien = atob(lienContact.value)
  if (lien.startsWith('mailto:')) window.location.href = lien
  else window.open(lien, '_blank', 'noopener')
}
</script>

<template>
  <div class="presentation">
    <p v-if="etat === 'chargement'" class="attente">Chargement…</p>

    <!-- Lien inconnu ou page désactivée : rien ne laisse deviner son existence -->
    <p v-else-if="etat === 'introuvable'" class="attente">Cette page n'existe pas.</p>

    <template v-else>
      <header class="haut">
        <div class="marque"><img :src="logo" alt="Trait d'union, le lien entre toi et les tiens" /></div>

        <div class="haut-grille">
          <div>
            <h1>Le lien entre toi et les tiens</h1>
            <p class="chapeau">Trait d'union réunit la personne accompagnée, ses aidants et toute la famille dans un même
              cercle : l'agenda, les photos, les nouvelles. Elle, elle n'a qu'un écran tout simple, sur tablette ou
              smartphone, avec de gros boutons et une voix pour lui lire sa journée. Chez elle comme en EHPAD.</p>
            <div class="appel">
              <button v-if="lienContact" type="button" class="bouton-contact" @click="contacter">
                <Icone nom="message" /> Me contacter
              </button>
              <span class="note">Application privée, sur invitation uniquement.</span>
            </div>
          </div>

          <!-- Tablette et smartphone de la personne accompagnée (données d'exemple) -->
          <div class="appareils" aria-hidden="true">
            <div class="tablette">
              <div class="ecran">
                <div class="ecran-haut">
                  <strong class="bonjour">Bonjour Jeanne</strong>
                  <span class="date">Nous sommes {{ aujourdhui }}</span>
                  <span class="heure">10:30</span>
                  <span class="moment">C'est le matin.</span>
                  <span class="ecouter"><Icone nom="son" /> Écouter ma journée</span>
                </div>
                <div class="paves">
                  <div class="pave rdv">
                    <span class="pave-titre"><Icone nom="agenda" /> Cet après-midi</span>
                    <strong>15h00 · Visite de Claire et Lucas</strong>
                  </div>
                  <div class="pave anniversaire">
                    <span class="pave-titre"><Icone nom="gateau" /> Anniversaire aujourd'hui</span>
                    <strong><img class="rond" src="/avatars/senior-man-fair-beard.webp" alt="" /> Paul · 86 ans</strong>
                  </div>
                </div>
                <div class="barre">
                  <span class="bouton actif"><Icone nom="accueil" />Accueil</span>
                  <span class="bouton"><Icone nom="agenda" />Mon agenda</span>
                  <span class="bouton"><Icone nom="photo" />Mes photos</span>
                  <span class="bouton"><Icone nom="famille" />Ma famille</span>
                  <span class="bouton"><span class="avec-pastille"><Icone nom="message" /><i>2</i></span>Mes messages</span>
                  <span class="bouton parler"><Icone nom="micro" />Parler</span>
                </div>
              </div>
            </div>
            <div class="smartphone">
              <div class="ecran">
                <div class="ecran-haut">
                  <strong class="bonjour">Bonjour Jeanne</strong>
                  <span class="heure">10:30</span>
                  <span class="moment">C'est le matin.</span>
                  <span class="ecouter"><Icone nom="son" /> Écouter ma journée</span>
                </div>
                <div class="pave anniversaire">
                  <span class="pave-titre"><Icone nom="gateau" /> Anniversaire</span>
                  <strong>Paul · 86 ans</strong>
                </div>
                <div class="barre">
                  <span class="bouton actif"><Icone nom="accueil" /></span>
                  <span class="bouton"><Icone nom="agenda" /></span>
                  <span class="bouton"><Icone nom="photo" /></span>
                  <span class="bouton"><Icone nom="famille" /></span>
                  <span class="bouton"><span class="avec-pastille"><Icone nom="message" /><i>2</i></span></span>
                  <span class="bouton parler"><Icone nom="micro" /></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- Les questions qu'on ne se pose plus -->
      <section class="questions">
        <p class="surtitre">Les questions de tous les jours</p>
        <p v-for="q in QUESTIONS" :key="q" class="question">« {{ q }} »</p>
        <p class="reponse">Avec Trait d'union, toute la famille a la réponse, et elle aussi.</p>
      </section>

      <!-- L'essentiel -->
      <section class="section">
        <h2>L'essentiel</h2>
        <div class="essentiel">
          <article v-for="e in ESSENTIEL" :key="e.titre" class="carte-pres">
            <span class="pictogramme" :class="e.couleur"><Icone :nom="e.icone" /></span>
            <h3>{{ e.titre }}</h3>
            <p>{{ e.texte }}</p>
          </article>
        </div>
      </section>

      <!-- L'arbre de la famille -->
      <section class="section">
        <div class="encadre inverse">
          <div class="demo-arbre" aria-hidden="true">
            <div class="arbre-couple">
              <span class="arbre-personne moi"><img src="/avatars/senior-woman-fair-glasses.webp" alt="" /><strong>Jeanne</strong><em>Moi</em></span>
              <span class="arbre-et">et</span>
              <span class="arbre-personne defunt"><img src="/avatars/senior-man-fair-glasses.webp" alt="" /><strong>Robert</strong><small>Mon mari, 1938 - 2015</small></span>
            </div>
            <div class="arbre-branches">
              <div v-for="b in ARBRE" :key="b.famille" class="arbre-branche" :class="b.couleur">
                <strong class="arbre-famille">{{ b.famille }}</strong>
                <template v-for="g in b.generations" :key="g.lien">
                  <span class="arbre-lien">{{ g.lien }}</span>
                  <div class="arbre-generation">
                    <span v-for="per in g.personnes" :key="per.prenom" class="arbre-personne" :class="{ allie: per.allie }">
                      <img :src="`/avatars/${per.avatar}.webp`" alt="" />
                      <strong>{{ per.prenom }}</strong>
                      <small v-if="per.age">{{ per.age }}</small>
                    </span>
                  </div>
                </template>
              </div>
            </div>
          </div>
          <div>
            <span class="pastille">L'arbre de la famille</span>
            <h2>Qui est qui, sans avoir à le demander</h2>
            <p>Les aidants dessinent l'arbre de la famille, et chacun y trouve sa place. Sur son écran, elle voit ses
              enfants, ses petits-enfants et leurs conjoints, avec leur visage et ce qu'ils sont pour elle. Une fiche en
              gros caractères, lue à voix haute, rappelle l'âge de chacun, où il habite et comment l'appeler.</p>
            <ul class="points">
              <li v-for="pt in ARBRE_POINTS" :key="pt"><Icone nom="coche" class="en-ligne" /> {{ pt }}</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- La messagerie de la famille -->
      <section class="section">
        <div class="encadre">
          <div>
            <span class="pastille">La messagerie</span>
            <h2>Des nouvelles de chacun, dans un même fil</h2>
            <p>Chaque cercle a sa conversation « Toute la famille », comme un groupe WhatsApp, mais réservé au cercle et
              pensé pour elle : elle voit qui écrit, avec son visage et son prénom, se fait lire les messages à voix haute
              et écrit d'un geste. Les aidants ont aussi leur conversation à eux, et chacun peut écrire en privé.</p>
            <ul class="points">
              <li v-for="pt in MESSAGES_POINTS" :key="pt"><Icone nom="coche" class="en-ligne" /> {{ pt }}</li>
            </ul>
          </div>
          <div class="demo-messages" aria-hidden="true">
            <span class="demo-titre">Mes messages</span>
            <div v-for="c in CONVERSATIONS" :key="c.titre" class="demo-conv">
              <span v-if="c.groupe" class="demo-groupe"><Icone nom="famille" /></span>
              <img v-else :src="`/avatars/${c.avatar}.webp`" alt="" />
              <div><strong>{{ c.titre }}</strong><span>{{ c.apercu }}</span></div>
              <span class="demo-conv-droite"><small :class="{ nouveau: c.nonLus }">{{ c.heure }}</small><b v-if="c.nonLus">{{ c.nonLus }}</b></span>
            </div>
            <div class="demo-fil">
              <div v-for="m in FIL" :key="m.prenom" class="demo-msg" :class="{ moi: m.moi }">
                <img :src="`/avatars/${m.avatar}.webp`" alt="" />
                <div class="demo-bulle" :class="{ rapide: m.rapide }">
                  <strong>{{ m.prenom }}</strong>
                  <span v-if="m.photo" class="demo-photo"><img src="/avatars/baby.webp" alt="" /></span>
                  <span v-if="m.texte">{{ m.texte }}</span>
                  <span v-if="m.rapide" class="demo-rapide">{{ m.rapide }}</span>
                  <span v-if="!m.moi" class="demo-ecouter"><Icone nom="son" class="en-ligne" /> Écouter</span>
                </div>
              </div>
              <span class="demo-repondre"><Icone nom="message" class="en-ligne" /> Écrire</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Sondage de dates -->
      <section class="section">
        <div class="encadre inverse">
          <div class="demo-sondage" aria-hidden="true">
            <span class="demo-titre">On cherche une date</span>
            <strong class="sondage-titre">Réunion de famille pour les 86 ans de Paul</strong>
            <span class="sondage-meta"><Icone nom="lieu" class="en-ligne" /> Chez Claire · à midi</span>
            <div v-for="l in SONDAGE" :key="l.jour" class="sondage-ligne">
              <strong>{{ l.jour }}</strong>
              <div class="sondage-choix">
                <span v-for="c in SONDAGE_CHOIX" :key="c.valeur" :class="[c.valeur, { on: l.choix === c.valeur }]"><Icone :nom="c.icone" class="en-ligne" />{{ c.libelle }}</span>
              </div>
            </div>
            <span class="demo-repondre"><Icone nom="coche" class="en-ligne" /> C'est bon</span>
          </div>
          <div>
            <span class="pastille">Sondage de dates</span>
            <h2>Trouver une date qui convient à tous</h2>
            <p>Un repas d'anniversaire, une réunion de famille : on propose quelques jours dans « Toute la famille », et
              chacun dit quand il peut venir. Elle aussi répond depuis son écran, en touchant Oui, Peut-être ou Non pour
              chaque jour. Le meilleur jour se voit tout de suite, et il n'y a plus qu'à le retenir.</p>
            <ul class="points">
              <li v-for="pt in SONDAGE_POINTS" :key="pt"><Icone nom="coche" class="en-ligne" /> {{ pt }}</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Les jeux -->
      <section class="section">
        <div class="encadre">
          <div>
            <span class="pastille">Les jeux</span>
            <h2>Reconnaître les siens, sans jamais se tromper</h2>
            <p>Sur sa tablette ou son smartphone, elle joue avec les photos de sa famille : retrouver un prénom, deviner
              un âge, reconnaître une chanson d'autrefois. Il n'y a pas de mauvaise réponse. Quand elle hésite, l'application lui dit qui c'est et comment il
              ou elle s'appelle, comme une petite leçon de souvenirs plutôt qu'un examen.</p>
            <ul class="points">
              <li v-for="pt in JEUX_POINTS" :key="pt"><Icone nom="coche" class="en-ligne" /> {{ pt }}</li>
            </ul>
          </div>
          <div class="demo-jeux" aria-hidden="true">
            <span class="demo-titre">Qui est-ce ?</span>
            <img class="jeux-photo" src="/avatars/young-woman-fair-ginger.webp" alt="" />
            <strong class="jeux-question">Quel est son prénom ?</strong>
            <div class="jeux-reponses"><span v-for="c in JEUX_CHOIX" :key="c">{{ c }}</span></div>
            <span class="jeux-pas-sur"><Icone nom="question" class="en-ligne" /> Je ne sais pas</span>
          </div>
        </div>
      </section>

      <!-- Chacun sa place : rôles et visibilité de l'agenda -->
      <section class="section">
        <div class="encadre">
          <div>
            <span class="pastille">Chacun sa place</span>
            <h2>Chacun voit ce qui le concerne</h2>
            <p>Un cercle réunit tous ceux qui entourent une ou plusieurs personnes accompagnées, chacun avec son rôle. Pour chaque rendez-vous,
              celui qui l'ajoute choisit qui le voit : tout le cercle, les aidants seulement, la personne accompagnée
              et ses aidants, et s'il concerne les auxiliaires de vie.</p>
            <ul class="roles">
              <li v-for="r in ROLES" :key="r.nom">
                <span class="role-icone"><Icone :nom="r.icone" /></span>
                <div><strong>{{ r.nom }}</strong><span>{{ r.texte }}</span></div>
              </li>
            </ul>
          </div>
          <div class="demo-agenda" aria-hidden="true">
            <span class="demo-titre">Agenda · aujourd'hui</span>
            <div v-for="r in RENDEZ_VOUS" :key="r.titre" class="demo-rdv">
              <span class="demo-heure">{{ r.heure }}</span>
              <div>
                <strong>{{ r.titre }}</strong>
                <span v-if="r.alerte" class="demo-alerte"><Icone nom="cloche" class="en-ligne" /> Alerte {{ r.alerte }}</span>
                <span class="etiquettes">
                  <span v-for="v in r.visibilite" :key="v.nom" class="etiquette" :class="v.classe">{{ v.nom }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Tableau de bord des aidants -->
      <section class="section">
        <div class="encadre inverse">
          <div class="demo-tableau" aria-hidden="true">
            <span class="demo-titre">Accueil des aidants</span>
            <div class="tableau-anniversaire">
              <img src="/avatars/senior-man-fair-beard.webp" alt="" />
              <div><strong>Anniversaire de Paul aujourd'hui</strong><span>Paul fête ses 86 ans</span></div>
              <span class="tableau-bouton"><Icone nom="telephone" class="en-ligne" /> Appeler</span>
            </div>
            <div class="tableau-bloc a-faire">
              <strong><Icone nom="cloche" class="en-ligne" /> À faire</strong>
              <span>Paul n'a pas encore d'appareil relié</span>
            </div>
            <div class="tableau-bloc">
              <strong><Icone nom="compte" class="en-ligne" /> Personnes accompagnées</strong>
              <div v-for="pa in [{ prenom: 'Jeanne', age: 82, avatar: 'senior-woman-fair-glasses', photos: 'A regardé toutes les photos', vu: true }, { prenom: 'Paul', age: 86, avatar: 'senior-man-fair-beard', photos: '4 photos pas encore vues', vu: false }]" :key="pa.prenom" class="tableau-personne">
                <img :src="`/avatars/${pa.avatar}.webp`" alt="" />
                <div>
                  <strong>{{ pa.prenom }} · {{ pa.age }} ans</strong>
                  <span :class="pa.vu ? 'vu' : 'pas-vu'"><Icone :nom="pa.vu ? 'coche' : 'photo'" class="en-ligne" /> {{ pa.photos }}</span>
                </div>
                <span class="tableau-rond"><Icone nom="telephone" /></span>
                <span class="tableau-rond"><Icone nom="message" /></span>
              </div>
            </div>
          </div>
          <div>
            <span class="pastille">Pour les aidants</span>
            <h2>Tout le cercle d'un coup d'oeil</h2>
            <p>En ouvrant l'application, aidants et proches voient ce qui compte aujourd'hui : les anniversaires du jour,
              ce qu'il reste à faire, les prochains rendez-vous, les nouvelles photos, et des nouvelles de chaque personne
              accompagnée.</p>
            <ul class="points">
              <li v-for="pt in TABLEAU_POINTS" :key="pt"><Icone nom="coche" class="en-ligne" /> {{ pt }}</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Pour qui -->
      <section class="section">
        <h2>Pour qui ?</h2>
        <div class="pour-qui">
          <article class="carte-pres ligne">
            <span class="pictogramme vert"><Icone nom="coeur" /></span>
            <div>
              <h3>Les aidants</h3>
              <p>Un seul endroit pour organiser la semaine, prévenir tout le monde et ne rien oublier, sans multiplier les
                messages et les coups de fil.</p>
            </div>
          </article>
          <article class="carte-pres ligne">
            <span class="pictogramme bleu"><Icone nom="famille" /></span>
            <div>
              <h3>La famille éloignée</h3>
              <p>Petits-enfants, frères et soeurs, amis : garder le contact, envoyer des photos et savoir quand passer la voir.</p>
            </div>
          </article>
          <article class="carte-pres ligne">
            <span class="pictogramme orange"><Icone nom="maison" /></span>
            <div>
              <h3>À domicile ou en EHPAD</h3>
              <p>Une tablette posée dans sa chambre, ou son smartphone, suffit pour qu'une personne isolée continue de voir sa famille au quotidien.</p>
            </div>
          </article>
        </div>
      </section>

      <!-- Et aussi -->
      <section class="section">
        <h2>Et aussi</h2>
        <ul class="aussi">
          <li v-for="a in AUSSI" :key="a.titre">
            <span class="aussi-icone"><Icone :nom="a.icone" /></span>
            <div><strong>{{ a.titre }}</strong><span>{{ a.texte }}</span></div>
          </li>
        </ul>
      </section>

      <!-- Comment ça marche -->
      <section class="section">
        <h2>Comment ça marche</h2>
        <ol class="etapes">
          <li v-for="(e, i) in ETAPES" :key="e.titre">
            <span class="numero">{{ i + 1 }}</span>
            <div><h3>{{ e.titre }}</h3><p>{{ e.texte }}</p></div>
          </li>
        </ol>
      </section>

      <!-- Vie privée -->
      <section class="section vie-privee">
        <span class="pictogramme vert grand"><Icone nom="cadenas" /></span>
        <div>
          <h2>Vos souvenirs restent les vôtres</h2>
          <p>Trait d'union est hébergée sur un serveur privé, pas chez un géant du web. Les photos sont stockées en France,
            chez OVHcloud, dans un espace privé, et ne s'affichent qu'aux membres du cercle par des liens temporaires.
            Pas de publicité, pas de mesure d'audience, aucune donnée revendue.</p>
        </div>
      </section>

      <section class="fin">
        <h2>Envie d'essayer ?</h2>
        <p v-if="lienContact">L'application est sur invitation. Écrivez-moi pour créer le cercle de votre proche.</p>
        <p v-else>L'application est sur invitation : demandez à la personne qui vous a partagé cette page.</p>
        <button v-if="lienContact" type="button" class="bouton-contact" @click="contacter">
          <Icone nom="message" /> Me contacter
        </button>
      </section>

      <footer class="pied">Trait d'union · Le lien entre toi et les tiens</footer>
    </template>
  </div>
</template>

<style scoped>
.presentation {
  --bleu: #4a7fd4;
  --orange: #f29e4c;
  min-height: 100vh;
  background: var(--fond);
  color: #2b2b2b;
  overflow-x: hidden;
}

.attente {
  min-height: 100vh;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gris);
}

h1, h2, h3 { color: var(--bleu-nuit); }

/* En-tête */
.haut {
  padding: 20px 16px 48px;
  background:
    radial-gradient(circle at 12% 18%, rgb(47 143 107 / 0.16), transparent 45%),
    radial-gradient(circle at 88% 8%, rgb(242 158 76 / 0.16), transparent 40%),
    var(--fond);
}

.marque { max-width: 1080px; margin: 0 auto 32px; }
.marque img { height: 52px; width: auto; display: block; }

.haut-grille {
  max-width: 1080px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr;
  gap: 40px;
  align-items: center;
}

@media (min-width: 900px) {
  .haut-grille { grid-template-columns: 0.95fr 1.1fr; }
}

.pastille {
  display: inline-block;
  padding: 5px 13px;
  border-radius: 999px;
  background: var(--vert-clair);
  color: var(--vert);
  font-size: 0.85rem;
  font-weight: 700;
}

.haut h1 {
  margin: 14px 0 12px;
  font-size: clamp(2rem, 6vw, 3.1rem);
  line-height: 1.12;
  letter-spacing: -0.02em;
}

.chapeau {
  margin: 0;
  max-width: 34rem;
  font-size: 1.1rem;
  line-height: 1.6;
  color: #4a4a55;
}

.appel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 26px;
}

.bouton-contact {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 14px 24px;
  border-radius: 999px;
  font-size: 1.05rem;
  font-weight: 700;
  box-shadow: 0 10px 24px rgb(47 143 107 / 0.32);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.bouton-contact:hover { transform: translateY(-1px); box-shadow: 0 14px 30px rgb(47 143 107 / 0.4); }
.note { font-size: 0.9rem; color: var(--gris); }

/* Tablette d'exemple */
.appareils {
  justify-self: center;
  width: min(620px, 100%);
  display: flex;
  align-items: flex-end;
  gap: 14px;
}

.tablette {
  flex: 1;
  min-width: 0;
  padding: 14px;
  border-radius: 30px;
  background: var(--bleu-nuit);
  box-shadow: 0 30px 60px rgb(35 48 90 / 0.28);
}

.ecran {
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  overflow: hidden;
  background: var(--fond);
}

.ecran-haut {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 18px 12px 10px;
  text-align: center;
}

.bonjour { font-size: clamp(1.3rem, 4.5vw, 1.75rem); color: var(--bleu-nuit); }
.date { font-size: clamp(0.85rem, 2.6vw, 1rem); }
.heure { font-size: clamp(2rem, 7vw, 2.6rem); font-weight: 800; color: var(--vert); line-height: 1.1; }
.moment { font-size: 0.85rem; color: var(--gris); }

.ecouter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 7px 14px;
  border-radius: 12px;
  background: var(--vert-clair);
  color: var(--vert);
  font-weight: 700;
  font-size: 0.85rem;
}

.ecouter .icone { width: 16px; height: 16px; }

.paves {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 6px 12px 14px;
}

.pave {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 11px;
  border-radius: 12px;
  font-size: 0.8rem;
}

.pave strong { color: var(--bleu-nuit); display: flex; align-items: center; gap: 6px; }
.pave-titre { display: flex; align-items: center; gap: 5px; font-weight: 700; }
.pave-titre .icone { width: 15px; height: 15px; }
.pave.rdv { background: white; box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); }
.pave.rdv .pave-titre { color: var(--vert); }
.pave.anniversaire { background: #fbe7ee; }
.pave.anniversaire .pave-titre { color: #b02e5c; }

.rond {
  object-fit: cover;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--vert-clair);
  color: var(--vert);
  font-size: 0.7rem;
}

.barre {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
  padding: 8px;
  background: white;
  border-top: 1px solid #ece9e3;
}

.bouton {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 2px;
  border-radius: 12px;
  background: #f2efe9;
  color: var(--bleu-nuit);
  font-size: clamp(0.58rem, 1.8vw, 0.72rem);
  font-weight: 700;
  text-align: center;
  line-height: 1.1;
}

.bouton .icone { width: 24px; height: 24px; }
.bouton.actif { background: var(--vert); color: white; }
.bouton.parler { background: var(--vert-clair); color: var(--vert); }

/* Smartphone d'exemple, à côté de la tablette */
.smartphone {
  flex: none;
  width: 140px;
  margin-bottom: -24px;
  padding: 7px;
  border-radius: 24px;
  background: #1b2547;
  box-shadow: 0 20px 40px rgb(35 48 90 / 0.35);
}

.smartphone .ecran { border-radius: 18px; }
.smartphone .ecran-haut { padding: 14px 6px 6px; }
.smartphone .bonjour { font-size: 0.85rem; }
.smartphone .heure { font-size: 1.5rem; }
.smartphone .moment { font-size: 0.6rem; }
.smartphone .ecouter { margin-top: 4px; padding: 4px 8px; font-size: 0.58rem; gap: 4px; }
.smartphone .ecouter .icone { width: 11px; height: 11px; }
.smartphone .pave { margin: 4px 6px 8px; padding: 6px 8px; font-size: 0.6rem; gap: 2px; }
.smartphone .pave-titre .icone { width: 11px; height: 11px; }
.smartphone .barre { gap: 3px; padding: 5px 4px; }
.smartphone .bouton { padding: 5px 0; border-radius: 7px; }
.smartphone .bouton .icone { width: 14px; height: 14px; }

/* Questions */
.questions {
  max-width: 820px;
  margin: 0 auto;
  padding: 40px 16px;
  text-align: center;
}

.surtitre {
  margin: 0 0 12px;
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gris);
}

.question {
  margin: 6px 0;
  font-size: clamp(1.05rem, 3.2vw, 1.3rem);
  font-weight: 600;
  font-style: italic;
  color: #4a4a55;
}

.reponse { margin: 20px 0 0; font-size: 1.1rem; font-weight: 700; color: var(--vert); }

/* Sections */
.section {
  max-width: 1080px;
  margin: 0 auto;
  padding: 40px 16px;
}

.section h2, .fin h2 {
  margin: 0 0 24px;
  font-size: clamp(1.5rem, 4.5vw, 2rem);
  letter-spacing: -0.01em;
}

.essentiel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.carte-pres {
  padding: 20px;
  border-radius: 18px;
  background: white;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
}

.carte-pres h3 { margin: 14px 0 6px; font-size: 1.08rem; }
.carte-pres p { margin: 0; font-size: 0.95rem; line-height: 1.55; color: #4a4a55; }
.carte-pres.ligne { display: flex; gap: 14px; }
.carte-pres.ligne h3 { margin-top: 2px; }

.pictogramme {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  color: white;
}

.pictogramme .icone { width: 24px; height: 24px; }
.pictogramme.vert { background: linear-gradient(135deg, #2f8f6b, #4fb08b); }
.pictogramme.bleu { background: linear-gradient(135deg, #23305a, #4a7fd4); }
.pictogramme.orange { background: linear-gradient(135deg, #e48a35, #f5b56f); }
.pictogramme.grand { width: 56px; height: 56px; }
.pictogramme.grand .icone { width: 28px; height: 28px; }

/* Chacun sa place */
.encadre {
  display: grid;
  grid-template-columns: 1fr;
  gap: 28px;
  align-items: center;
  padding: 28px 20px;
  border-radius: 24px;
  background:
    radial-gradient(circle at 92% 8%, rgb(74 127 212 / 0.14), transparent 50%),
    white;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
}

@media (min-width: 900px) {
  .encadre { grid-template-columns: 1.15fr 0.85fr; padding: 36px; }
}

.encadre > div { min-width: 0; }
.encadre h2 { margin: 12px 0 10px; }
.encadre > div > p { margin: 0; line-height: 1.6; color: #4a4a55; }

.roles {
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.roles li { display: flex; gap: 12px; }
.roles strong { display: block; color: var(--bleu-nuit); }
.roles span { font-size: 0.92rem; line-height: 1.5; color: #4a4a55; }

.role-icone {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--vert-clair);
  color: var(--vert);
}

.demo-agenda {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 18px;
  background: var(--fond);
  border: 1px solid #ece9e3;
}

.demo-titre {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gris);
}

.demo-rdv {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: white;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
}

.demo-rdv > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.demo-heure { font-weight: 800; color: var(--vert); }
.demo-alerte { font-size: 0.82rem; color: var(--gris); }
.etiquettes { display: flex; flex-wrap: wrap; gap: 5px; }

.etiquette {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
}

.etiquette.tous { background: #e8ecf6; color: var(--bleu-nuit); }
.etiquette.aidants { background: #fdf0dc; color: #9a5b12; }
.etiquette.auxiliaires { background: #efe6f8; color: #6b3fa0; }
.etiquette.accompagne { background: var(--vert-clair); color: var(--vert); }

/* Encadré avec la démonstration à gauche sur ordinateur */
@media (min-width: 900px) {
  .encadre.inverse { grid-template-columns: 0.95fr 1.05fr; }
}

@media (max-width: 899px) {
  .encadre.inverse > :first-child { order: 2; }
}

.points {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--bleu-nuit);
}

.points .icone { color: var(--vert); }

/* Arbre d'exemple */
.demo-arbre {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 14px;
  border-radius: 18px;
  background: var(--fond);
  border: 1px solid #ece9e3;
}

.arbre-couple, .arbre-generation {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 10px;
}

.arbre-et { align-self: center; color: var(--gris); font-size: 0.85rem; margin-top: -18px; }

.arbre-personne {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 64px;
  text-align: center;
}

.arbre-personne img {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  object-fit: cover;
  background: white;
}

.arbre-personne strong { color: var(--bleu-nuit); font-size: 0.9rem; }
.arbre-personne small { color: var(--gris); font-size: 0.72rem; line-height: 1.2; }
.arbre-personne em {
  font-style: normal;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--bleu-nuit);
  color: white;
}

.arbre-personne.moi img { width: 64px; height: 64px; box-shadow: 0 0 0 3px var(--bleu-nuit); }
.arbre-personne.defunt img { filter: grayscale(1); opacity: 0.8; }
.arbre-personne.defunt strong, .arbre-personne.allie strong { color: #5a6280; }

.arbre-branches {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-items: start;
}

.arbre-branche {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 6px;
  border-radius: 16px;
}

.arbre-branche.vert { background: var(--vert-clair); }
.arbre-branche.orange { background: #fdf1e4; }
.arbre-famille { color: var(--bleu-nuit); font-size: 0.85rem; margin-bottom: 4px; }
.arbre-lien { font-size: 0.72rem; color: var(--gris); margin-top: 4px; }

/* Tableau de bord d'exemple */
.demo-tableau {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 18px;
  background: var(--fond);
  border: 1px solid #ece9e3;
}

.tableau-anniversaire {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #fbe7ee;
  border: 1px solid #f5cfdc;
}

.tableau-anniversaire img, .tableau-personne img { width: 40px; height: 40px; border-radius: 50%; flex: none; }
.tableau-anniversaire div, .tableau-personne div { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.tableau-anniversaire strong { color: #9b2557; font-size: 0.9rem; }
.tableau-anniversaire div span { font-size: 0.8rem; color: #4a4a55; }

.tableau-bouton {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--vert);
  color: white;
  font-size: 0.8rem;
  font-weight: 600;
}

.tableau-bloc {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 14px;
  background: white;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
}

.tableau-bloc > strong { color: var(--bleu-nuit); font-size: 0.92rem; }
.tableau-bloc.a-faire { background: #fff6ec; border: 1px solid #f6dfc2; box-shadow: none; }
.tableau-bloc.a-faire > strong { color: #9a5b12; }
.tableau-bloc.a-faire > span { font-size: 0.85rem; }

.tableau-personne { display: flex; align-items: center; gap: 10px; }
.tableau-personne strong { color: var(--bleu-nuit); font-size: 0.9rem; }
.tableau-personne span.vu { font-size: 0.78rem; color: var(--vert); }
.tableau-personne span.pas-vu { font-size: 0.78rem; color: #c26a12; }

.tableau-rond {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--vert-clair);
  color: var(--vert);
}

.tableau-rond .icone { width: 16px; height: 16px; }

/* Sondage de dates d'exemple */
.demo-sondage { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 18px; background: var(--fond); border: 1px solid #ece9e3; }
.sondage-titre { color: var(--bleu-nuit); font-size: 1.1rem; line-height: 1.3; }
.sondage-meta { color: var(--gris); font-size: 0.85rem; display: flex; align-items: center; gap: 6px; }
.sondage-ligne { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 14px; background: white; box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); }
.sondage-ligne > strong { color: var(--bleu-nuit); font-size: 0.95rem; }
.sondage-choix { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.sondage-choix span { display: flex; align-items: center; justify-content: center; gap: 5px; padding: 7px 4px; border-radius: 10px; background: #f1eee9; color: var(--gris); font-size: 0.8rem; font-weight: 700; white-space: nowrap; }
.demo-jeux { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 16px; border-radius: 18px; background: var(--fond); border: 1px solid #ece9e3; }
.jeux-photo { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; background: var(--vert-clair); }
.jeux-question { color: var(--bleu-nuit); font-size: 1.05rem; }
.jeux-reponses { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; }
.jeux-reponses span { display: flex; align-items: center; justify-content: center; padding: 12px 4px; border-radius: 14px; background: white; border: 2px solid #e3dfd7; color: var(--bleu-nuit); font-weight: 700; font-size: 0.95rem; }
.jeux-pas-sur { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 12px; background: #f1eee9; color: var(--bleu-nuit); font-weight: 700; font-size: 0.85rem; }
.sondage-choix .oui.on { background: var(--vert); color: white; }
.sondage-choix .peut_etre.on { background: #fdf0d8; color: #9a5b12; }
.sondage-choix .non.on { background: #fbe3e0; color: #b03a2e; }

/* Messagerie d'exemple */
.avec-pastille { position: relative; display: inline-flex; }
.avec-pastille i { position: absolute; top: -5px; right: -9px; min-width: 15px; height: 15px; padding: 0 3px; border-radius: 999px; background: #c0392b; color: white; font-style: normal; font-size: 0.55rem; display: grid; place-items: center; }
.smartphone .avec-pastille i { top: -4px; right: -7px; min-width: 11px; height: 11px; font-size: 0.45rem; }
.demo-messages { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 18px; background: var(--fond); border: 1px solid #ece9e3; }
.demo-conv { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: white; box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); }
.demo-conv > img, .demo-groupe { width: 40px; height: 40px; border-radius: 50%; flex: none; }
.demo-groupe { display: grid; place-items: center; background: var(--vert-clair); color: var(--vert); }
.demo-conv > div { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.demo-conv strong { color: var(--bleu-nuit); font-size: 0.95rem; }
.demo-conv div span { font-size: 0.8rem; color: #4a4a55; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.demo-conv-droite { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: none; }
.demo-conv-droite small { font-size: 0.72rem; color: var(--gris); }
.demo-conv-droite small.nouveau { color: var(--vert); font-weight: 700; }
.demo-conv-droite b { min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; background: var(--vert); color: white; font-size: 0.75rem; display: grid; place-items: center; }
.demo-fil { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding: 12px; border-radius: 14px; background: #f3f0ea; }
.demo-msg { display: flex; gap: 8px; align-items: flex-start; max-width: 88%; }
.demo-msg.moi { align-self: flex-end; flex-direction: row-reverse; }
.demo-msg > img { width: 30px; height: 30px; border-radius: 50%; flex: none; }
.demo-bulle { display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; border-radius: 14px 14px 14px 4px; background: white; font-size: 0.85rem; box-shadow: 0 1px 2px rgb(0 0 0 / 0.07); }
.moi .demo-bulle { background: #dff1e7; border-radius: 14px 14px 4px 14px; }
.demo-bulle strong { color: var(--bleu-nuit); font-size: 0.78rem; }
.demo-photo img { display: block; width: 120px; height: 80px; object-fit: cover; border-radius: 8px; background: #f6e6d8; }
.demo-rapide { color: var(--vert); font-weight: 700; font-size: 0.95rem; }
.demo-ecouter { align-self: flex-start; padding: 3px 8px; border-radius: 8px; background: var(--vert-clair); color: var(--vert); font-size: 0.72rem; font-weight: 700; }
.demo-repondre { display: flex; justify-content: center; align-items: center; gap: 6px; padding: 10px; border-radius: 12px; background: var(--vert); color: white; font-weight: 700; font-size: 0.9rem; }

/* Pour qui */
.pour-qui {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

/* Et aussi */
.aussi {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 4px 28px;
}

.aussi li {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #ece9e3;
}

.aussi-icone { flex: none; color: var(--vert); padding-top: 2px; }
.aussi strong { display: block; color: var(--bleu-nuit); }
.aussi span { font-size: 0.92rem; line-height: 1.5; color: #4a4a55; }

/* Étapes */
.etapes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.etapes li {
  display: flex;
  gap: 14px;
  padding: 20px;
  border-radius: 18px;
  background: white;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
}

.numero {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--vert);
  color: white;
  font-weight: 800;
}

.etapes h3 { margin: 5px 0 6px; font-size: 1.05rem; }
.etapes p { margin: 0; font-size: 0.95rem; line-height: 1.55; color: #4a4a55; }

/* Vie privée */
.vie-privee { display: flex; gap: 18px; align-items: flex-start; }
.vie-privee h2 { margin-bottom: 10px; }
.vie-privee p { margin: 0; line-height: 1.6; color: #4a4a55; }

/* Fin */
.fin {
  max-width: 820px;
  margin: 16px auto 0;
  padding: 48px 16px;
  text-align: center;
}

.fin p { margin: 0 0 24px; line-height: 1.6; color: #4a4a55; }

.pied {
  padding: 32px 16px 40px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--gris);
}

@media (max-width: 600px) {
  .vie-privee { flex-direction: column; }
  .paves { grid-template-columns: 1fr; }
  .appareils { flex-direction: column; align-items: center; gap: 20px; }
  .tablette { width: 100%; padding: 9px; border-radius: 22px; }
  .smartphone { width: 170px; margin: 0; }
}
</style>
