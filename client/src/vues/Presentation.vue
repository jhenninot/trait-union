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
  'A-t-elle vu les photos des petits-enfants ?'
]

// Les trois bénéfices mis en avant ; le reste est présenté plus bas
const ESSENTIEL = [
  {
    icone: 'tablette',
    couleur: 'vert',
    titre: 'Un écran tout simple pour elle',
    texte: 'La date et l\'heure en grand, le moment de la journée, ses rendez-vous, ses photos et sa famille : quatre gros boutons, rien d\'autre. Un bouton lui lit sa journée à voix haute.'
  },
  {
    icone: 'agenda',
    couleur: 'bleu',
    titre: 'Un agenda partagé par tous',
    texte: 'Médecin, kiné, visites, toilette, médicaments : chacun ajoute les rendez-vous, avec une alerte avant l\'heure. Elle voit les siens sur sa tablette, et le reste n\'encombre pas son écran.'
  },
  {
    icone: 'photo',
    couleur: 'orange',
    titre: 'Les photos de la famille',
    texte: 'Les petits-enfants envoient leurs photos depuis leur téléphone, rangées en albums. Elles arrivent sur sa tablette, en grand et en diaporama, avec le prénom de qui les a envoyées.'
  }
]

const ROLES = [
  { icone: 'compte', nom: 'La personne accompagnée', texte: 'Pas d\'email ni de mot de passe : un aidant tape un code à 6 chiffres sur sa tablette, qui reste ensuite connectée.' },
  { icone: 'coeur', nom: 'Les aidants', texte: 'Ils gèrent le cercle : invitations, tablette, coordonnées de la personne accompagnée, réglages de ses alertes.' },
  { icone: 'famille', nom: 'Les proches', texte: 'Enfants, petits-enfants, amis : ils suivent l\'agenda, partagent leurs photos et gardent le contact, même de loin.' },
  { icone: 'maison', nom: 'Les auxiliaires de vie', texte: 'Ils voient seulement les rendez-vous qui les concernent et le téléphone de chacun. Pas les photos de famille.' }
]

// Agenda d'exemple : chaque rendez-vous a son niveau de visibilité
const RENDEZ_VOUS = [
  { heure: '09h00', titre: 'Toilette', visibilite: [{ nom: 'Aidants', classe: 'aidants' }, { nom: 'Auxiliaires', classe: 'auxiliaires' }], alerte: '15 minutes avant' },
  { heure: '11h30', titre: 'Kinésithérapeute', visibilite: [{ nom: 'Jeanne + aidants', classe: 'accompagne' }], alerte: '1 heure avant' },
  { heure: '15h00', titre: 'Visite de Claire et Lucas', visibilite: [{ nom: 'Tous', classe: 'tous' }] }
]

const AUSSI = [
  { icone: 'cloche', titre: 'Des alertes qui arrivent', texte: 'Rappel avant un rendez-vous, nouvelles photos, anniversaire du jour : sur le téléphone de chacun et sur la tablette, même écran éteint.' },
  { icone: 'gateau', titre: 'Les anniversaires', texte: 'Le matin, sa tablette lui rappelle à qui souhaiter son anniversaire, avec l\'âge. Toute la famille reçoit la même alerte.' },
  { icone: 'telephone', titre: 'Les coordonnées de chacun', texte: 'Téléphone, adresse, âge : une fiche en gros caractères pour qu\'elle sache qui est qui, et qui appeler.' },
  { icone: 'compte', titre: 'Un visage pour chacun', texte: 'Une photo ou un avatar illustré pour chaque membre, pour reconnaître tout le monde d\'un coup d\'oeil.' },
  { icone: 'partager', titre: 'Partager depuis le téléphone', texte: 'Sur Android, « Partager » depuis la galerie envoie directement des photos dans un album du cercle.' },
  { icone: 'micro', titre: 'Commandes vocales', texte: 'Elle appuie sur « Parler » et demande « Qu\'est-ce que je fais aujourd\'hui ? » ou « Montre-moi les photos » : la tablette répond à voix haute et ouvre le bon écran. Sans intelligence artificielle.' },
  { icone: 'mobile', titre: 'Sur tous les écrans', texte: 'Ordinateur, téléphone ou tablette : application installable sur iPhone et Android, et application Android dédiée.' }
]

const ETAPES = [
  { titre: 'Créer le cercle', texte: 'Un cercle par personne accompagnée, avec ses aidants.' },
  { titre: 'Inviter la famille', texte: 'Un lien d\'invitation, envoyé par email ou par message. Chacun choisit son mot de passe.' },
  { titre: 'Installer la tablette', texte: 'Un code à 6 chiffres sur sa tablette ou son téléphone, et c\'est prêt. Rien à retenir pour elle.' }
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
            <span class="pastille">Alzheimer et maladies apparentées</span>
            <h1>Le lien entre toi et les tiens</h1>
            <p class="chapeau">Trait d'union réunit la personne accompagnée, ses aidants et toute la famille dans un même
              cercle : l'agenda, les photos, les nouvelles. Elle, elle n'a qu'un écran tout simple, avec de gros boutons
              et une voix pour lui lire sa journée. Chez elle comme en EHPAD.</p>
            <div class="appel">
              <button v-if="lienContact" type="button" class="bouton-contact" @click="contacter">
                <Icone nom="message" /> Me contacter
              </button>
              <span class="note">Application privée, sur invitation uniquement.</span>
            </div>
          </div>

          <!-- Tablette de la personne accompagnée (données d'exemple) -->
          <div class="tablette" aria-hidden="true">
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
                  <strong><span class="rond">P</span> Paul · 51 ans</strong>
                </div>
              </div>
              <div class="barre">
                <span class="bouton actif"><Icone nom="accueil" />Accueil</span>
                <span class="bouton"><Icone nom="agenda" />Mon agenda</span>
                <span class="bouton"><Icone nom="photo" />Mes photos</span>
                <span class="bouton"><Icone nom="famille" />Ma famille</span>
                <span class="bouton parler"><Icone nom="micro" />Parler</span>
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

      <!-- Chacun sa place : rôles et visibilité de l'agenda -->
      <section class="section">
        <div class="encadre">
          <div>
            <span class="pastille">Chacun sa place</span>
            <h2>Chacun voit ce qui le concerne</h2>
            <p>Un cercle réunit tous ceux qui entourent une personne, chacun avec son rôle. Pour chaque rendez-vous,
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
              <p>Une tablette posée dans sa chambre suffit pour qu'une personne isolée continue de voir sa famille au quotidien.</p>
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
  .haut-grille { grid-template-columns: 1fr 1.05fr; }
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
.tablette {
  justify-self: center;
  width: min(540px, 100%);
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
  grid-template-columns: repeat(5, 1fr);
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
  .tablette { padding: 9px; border-radius: 22px; }
}
</style>
