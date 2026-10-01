<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '../api.js'
import { session } from '../session.js'
import { cercleMemorise, memoriserCercle } from '../cercleCourant.js'
import { aLesDroits, estAuxiliaire } from '../roles.js'
import { visibilites, debutDuJour, ajouterJours, heureCourte, horaire, parJour } from '../agenda.js'
import { lienTelephone, lienSms, lienWhatsApp, ans, age, ageTexte, estAnniversaire } from '../coordonnees.js'
import { modeAlertes, autorisation, activerAlertes, alertesArretees, refuserAlertes } from '../alertes.js'
import Icone from '../navigation/Icone.vue'
import Avatar from './Avatar.vue'

// Accueil des aidants, proches et auxiliaires de vie : tableau de bord du cercle courant
// (celui choisi dans le menu). Ce que chacun voit suit ses droits : une auxiliaire n'a ni
// photos ni anniversaires, et seulement les rendez-vous où les auxiliaires sont attendues.
const NB_RDV = 5

// Cercles où l'on n'est pas la personne accompagnée ; un administrateur peut en consulter d'autres
const mesCercles = computed(() => session.cercles.filter((c) => c.role !== 'accompagne'))
const cercleId = computed(() => {
  const memoire = cercleMemorise.value
  if (memoire && (session.utilisateur.estAdmin || mesCercles.value.some((c) => c.id === memoire))) return memoire
  return mesCercles.value[0]?.id ?? null
})

const cercle = ref(null)
const erreur = ref('')
const rendezVous = ref([])
const albums = ref([]) // albums où des photos sont arrivées depuis ma dernière visite
const dernieres = ref([]) // dernières photos, quand il n'y a rien de nouveau
const photosActives = ref(false)
const vuesAccompagnes = ref([]) // photos pas encore regardées par chaque personne accompagnée
// Personnes de l'arbre généalogique sans compte (un jeune enfant…) : pour leurs anniversaires
const sansCompte = ref([])
const autres = ref([]) // résumé de mes autres cercles

const peutGerer = computed(() => Boolean(cercle.value?.peutGerer))
const suisAuxiliaire = computed(() => !peutGerer.value && estAuxiliaire(cercle.value?.monRole))
const suisProche = computed(() => !peutGerer.value && cercle.value?.monRole === 'proche')
const base = computed(() => `/cercles/${cercleId.value}`)

const accompagnes = computed(() => cercle.value?.membres.filter((m) => m.role === 'accompagne') ?? [])
const plusieurs = computed(() => accompagnes.value.length > 1)

// Rendez-vous à venir (les « Rendez-vous privé » restent dans l'agenda)
async function chargerRendezVous(id) {
  const maintenant = new Date()
  const params = new URLSearchParams({ depuis: debutDuJour().toISOString(), jusqua: ajouterJours(debutDuJour(), 31).toISOString() })
  const liste = await api('GET', `/cercles/${id}/rendez-vous?${params}`)
  return liste.filter((r) => !r.masque && new Date(r.fin ?? r.debut) > maintenant)
}

// Albums avec des nouveautés (et les photos sans album), avec leurs dernières photos
async function chargerPhotos(id) {
  const [reponse, recentes] = await Promise.all([
    api('GET', `/cercles/${id}/albums`),
    api('GET', `/cercles/${id}/photos?limite=6`)
  ])
  photosActives.value = recentes.actif !== false
  const avecNouvelles = [
    ...reponse.albums.filter((a) => a.nouvelles > 0).map((a) => ({ id: a.id, nom: a.nom, nouvelles: a.nouvelles, derniere: a.derniere })),
    ...(reponse.sansAlbumNouvelles > 0 ? [{ id: 'aucun', nom: reponse.albums.length ? 'Non classé' : 'Photos', nouvelles: reponse.sansAlbumNouvelles, derniere: reponse.sansAlbumDerniere }] : [])
  ].sort((a, b) => new Date(b.derniere) - new Date(a.derniere)).slice(0, 3)
  albums.value = await Promise.all(avecNouvelles.map(async (a, i) => {
    const { photos } = await api('GET', `/cercles/${id}/photos?album=${a.id}&limite=${Math.min(a.nouvelles, i === 0 ? 6 : 3)}`)
    return { ...a, photos, auteurs: [...new Set(photos.filter((p) => !p.deMoi).map((p) => p.creeParPrenom).filter(Boolean))] }
  }))
  dernieres.value = recentes.photos ?? []
}

// Résumé de chacun de mes autres cercles : rendez-vous du jour et nouvelles photos
async function chargerAutres(id) {
  autres.value = await Promise.all(mesCercles.value.filter((c) => c.id !== id).map(async (c) => {
    const fin = ajouterJours(debutDuJour(), 1)
    const [rdv, photos] = await Promise.all([
      chargerRendezVous(c.id).then((l) => l.filter((r) => new Date(r.debut) < fin).length).catch(() => 0),
      estAuxiliaire(c.role) && !session.utilisateur.estAdmin
        ? 0
        : api('GET', `/cercles/${c.id}/albums`).then((r) => r.albums.reduce((n, a) => n + a.nouvelles, r.sansAlbumNouvelles ?? 0)).catch(() => 0)
    ])
    return { ...c, rdv, photos }
  }))
}

async function charger() {
  const id = cercleId.value
  cercle.value = null
  erreur.value = ''
  rendezVous.value = []
  albums.value = []
  dernieres.value = []
  vuesAccompagnes.value = []
  sansCompte.value = []
  if (!id) return
  try {
    const c = await api('GET', `/cercles/${id}`)
    if (id !== cercleId.value) return
    cercle.value = c
    const auxiliaire = !c.peutGerer && estAuxiliaire(c.monRole)
    await Promise.all([
      chargerRendezVous(id).then((l) => (rendezVous.value = l.slice(0, NB_RDV))),
      auxiliaire ? null : chargerPhotos(id).catch(() => (photosActives.value = false)),
      auxiliaire ? null : api('GET', `/cercles/${id}/albums/accompagnes`).then((l) => (vuesAccompagnes.value = l)).catch(() => {}),
      auxiliaire ? null : api('GET', `/cercles/${id}/arbre`).then((a) => (sansCompte.value = a.personnes.filter((p) => !p.compte && !p.decede))).catch(() => {}),
      chargerAutres(id)
    ])
  } catch (e) {
    erreur.value = e.message
  }
}
watch(cercleId, charger, { immediate: true })

function changerCercle(id) {
  memoriserCercle(id)
  window.scrollTo(0, 0)
}

// Place des blocs : colonnes sur grand écran, ordre sur téléphone. Un proche voit d'abord
// les personnes accompagnées et les photos ; une auxiliaire n'a ni photos ni anniversaires.
const colonnes = computed(() => {
  if (suisProche.value) return [['photos', 'rdv'], ['aides', 'autres']]
  if (suisAuxiliaire.value) return [['rdv'], ['aides', 'autres']]
  return [['rdv', 'autres'], ['aides', 'photos']]
})
const ordreTelephone = computed(() => (suisProche.value
  ? ['aides', 'photos', 'rdv', 'autres']
  : ['rdv', 'aides', 'photos', 'autres']))

// --- Rendez-vous ---
const groupes = computed(() => parJour(rendezVous.value))
const pourQui = (id) => (id && accompagnes.value.find((m) => m.utilisateurId === id)?.prenom) || (plusieurs.value ? 'Personnes accompagnées' : accompagnes.value[0]?.prenom)
const libelleNiveau = (rdv) => visibilites(rdv.accompagnePrenom ?? pourQui(null)).find((n) => n.valeur === rdv.visibilite)?.court
const heureRdv = (rdv) => (rdv.journeeEntiere ? 'Journée' : heureCourte(rdv.debut))

// --- Personnes accompagnées ---
function etatPhotos(m) {
  const v = vuesAccompagnes.value.find((x) => x.utilisateurId === m.utilisateurId)
  if (!v) return null
  if (v.nouvelles > 0) return { vu: false, texte: `${v.nouvelles} photo${v.nouvelles > 1 ? 's' : ''} pas encore vue${v.nouvelles > 1 ? 's' : ''}` }
  if (!v.vuLe) return null
  return { vu: true, texte: `A regardé toutes les photos (${quand(v.vuLe)})` }
}
function quand(d) {
  const date = new Date(d)
  const jours = Math.round((debutDuJour() - debutDuJour(date)) / 86_400_000)
  if (jours === 0) return `aujourd'hui à ${heureCourte(date)}`
  if (jours === 1) return `hier à ${heureCourte(date)}`
  return `le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
}

// --- Anniversaires du jour (le sien compris), en tête de page ---
const anniversaires = computed(() => [...(cercle.value?.membres ?? []), ...sansCompte.value]
  .filter((m) => estAnniversaire(m.dateNaissance))
  .map((m) => ({ ...m, age: age(m.dateNaissance) }))
  .sort((a, b) => Number(b.moi) - Number(a.moi)))

// --- Photos ---
const totalNouvelles = computed(() => albums.value.reduce((n, a) => n + a.nouvelles, 0))
const lienPhoto = (album, photo) => `${base.value}/photos?album=${album}&photo=${photo.id}`

// --- À faire : appareils à relier (aidants) et alertes à activer sur cet appareil ---
const sansAppareil = computed(() => (peutGerer.value ? accompagnes.value.filter((m) => m.appareils === 0) : []))
const alertes = ref(null) // { clePublique, proposer, fait, erreur }
async function chargerAlertes() {
  const mode = modeAlertes()
  if (!['web', 'android'].includes(mode) || alertesArretees() || autorisation() === 'refusee') return
  const d = await api('GET', '/alertes').catch(() => null)
  if (!d || d.appareils.some((a) => a.ceAppareil)) return
  alertes.value = { clePublique: d.clePublique, proposer: true }
}
chargerAlertes()
async function accepterAlertes() {
  try {
    await activerAlertes(alertes.value.clePublique)
    alertes.value = { fait: true }
    setTimeout(() => (alertes.value = null), 6000)
  } catch (e) {
    alertes.value = { ...alertes.value, erreur: e.message }
  }
}
function plusTard() {
  refuserAlertes()
  alertes.value = null
}

const aujourdhui = (() => {
  const t = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return t.charAt(0).toUpperCase() + t.slice(1)
})()
</script>

<template>
  <main class="accueil">
    <p class="date">{{ aujourdhui }}</p>
    <h1>Bonjour {{ session.utilisateur.prenom }}</h1>

    <p v-if="!cercleId" class="aide">
      Vous ne faites encore partie d'aucun cercle.
      <RouterLink v-if="session.utilisateur.estAdmin" to="/admin/cercles">Créer un cercle</RouterLink>
    </p>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>

    <template v-if="cercle">
      <section v-if="anniversaires.length" class="anniversaires">
        <div v-for="a in anniversaires" :key="a.id" class="anniversaire">
          <Avatar :src="a.avatar" :prenom="a.prenom" :taille="52" />
          <Icone nom="gateau" class="gateau" />
          <div class="grandit">
            <template v-if="a.moi"><strong>Joyeux anniversaire, {{ a.prenom }} !</strong></template>
            <template v-else><strong>Anniversaire de {{ a.prenom }} aujourd'hui</strong></template>
            <p v-if="a.age != null" class="aide">{{ a.moi ? `${ans(a.age)} aujourd'hui` : `${a.prenom} fête ses ${ans(a.age)}` }}</p>
          </div>
          <div v-if="!a.moi && a.telephone" class="contacts">
            <a :href="lienTelephone(a.telephone)" class="bouton petit appeler" :aria-label="`Appeler ${a.prenom}`"><Icone nom="telephone" class="en-ligne" /><span class="texte-appeler"> Appeler</span></a>
            <a :href="lienSms(a.telephone)" class="rond" :title="`SMS à ${a.prenom}`" :aria-label="`Envoyer un SMS à ${a.prenom}`"><Icone nom="sms" /></a>
            <a :href="lienWhatsApp(a.telephone)" class="rond" target="_blank" rel="noopener" :title="`WhatsApp à ${a.prenom}`" :aria-label="`Écrire à ${a.prenom} sur WhatsApp`"><Icone nom="whatsapp" /></a>
          </div>
        </div>
      </section>

      <section v-if="sansAppareil.length || alertes" class="a-faire">
        <p class="titre-a-faire"><Icone nom="cloche" /> À faire</p>
        <div v-for="m in sansAppareil" :key="m.id" class="tache">
          <Icone nom="tablette" />
          <div class="grandit">
            <strong>{{ m.prenom }} n'a pas encore d'appareil relié</strong>
            <p class="aide">Reliez sa tablette ou son téléphone avec un code à 6 chiffres : l'agenda et les photos s'y afficheront.</p>
          </div>
          <RouterLink :to="`${base}/tablettes`" class="bouton petit">Relier</RouterLink>
        </div>
        <div v-if="alertes" class="tache">
          <Icone nom="cloche" />
          <div class="grandit">
            <template v-if="alertes.fait"><strong>Alertes activées sur cet appareil</strong></template>
            <template v-else>
              <strong>Recevoir les alertes sur cet appareil</strong>
              <p class="aide">{{ suisAuxiliaire ? 'Rappels de rendez-vous.' : 'Rappels de rendez-vous, nouvelles photos, anniversaires.' }}</p>
              <p v-if="alertes.erreur" class="erreur">{{ alertes.erreur }}</p>
            </template>
          </div>
          <div v-if="!alertes.fait" class="boutons-tache">
            <button class="petit" @click="accepterAlertes">Activer</button>
            <button class="lien petit" @click="plusTard">Plus tard</button>
          </div>
        </div>
      </section>

      <!-- Deux colonnes sur grand écran ; sur téléphone, une seule dans l'ordre de ordreTelephone -->
      <div class="grille">
        <div v-for="(colonne, i) in colonnes" :key="i" class="colonne">
          <template v-for="nom in colonne" :key="nom">
        <section v-if="nom === 'rdv'" class="carte bloc" :style="{ order: ordreTelephone.indexOf(nom) }">
          <div class="titre-bloc">
            <h2><Icone nom="agenda" /> {{ suisAuxiliaire ? 'Mes rendez-vous' : suisProche ? 'Les prochains moments en famille' : 'Prochains rendez-vous' }}</h2>
            <RouterLink :to="`${base}/agenda`" class="voir">Agenda <Icone nom="suivant" class="en-ligne" /></RouterLink>
          </div>
          <p v-if="!rendezVous.length" class="aide">Aucun rendez-vous dans les 30 prochains jours.</p>
          <div v-for="g in groupes" :key="g.cle">
            <p class="jour">{{ g.titre }}</p>
            <RouterLink v-for="r in g.rendezVous" :key="r.cle" :to="`${base}/agenda`" class="rdv">
              <span class="heure">{{ heureRdv(r) }}</span>
              <div>
                <strong>{{ r.titre }}</strong>
                <div class="meta">
                  <span v-if="!suisAuxiliaire" class="pastille" :class="r.visibilite">{{ libelleNiveau(r) }}</span>
                  <span v-else-if="r.accompagnePrenom" class="pastille accompagne">{{ r.accompagnePrenom }}</span>
                  <span v-if="r.lieu"><Icone nom="lieu" class="en-ligne" /> {{ r.lieu }}</span>
                  <span v-if="r.journeeEntiere || horaire(r).startsWith('Du')">{{ horaire(r) }}</span>
                </div>
              </div>
            </RouterLink>
          </div>
          <p v-if="suisAuxiliaire" class="aide note">Seuls les rendez-vous où les auxiliaires sont attendues sont affichés.</p>
          <RouterLink :to="`${base}/agenda?ajouter=1`" class="bouton secondaire petit"><Icone nom="ajouter" class="en-ligne" /> Ajouter un rendez-vous</RouterLink>
        </section>

        <section v-else-if="nom === 'aides' && accompagnes.length" class="carte bloc" :style="{ order: ordreTelephone.indexOf(nom) }">
          <div class="titre-bloc">
            <h2><Icone nom="compte" /> {{ plusieurs ? 'Personnes accompagnées' : 'Personne accompagnée' }}</h2>
          </div>
          <div v-for="m in accompagnes" :key="m.id" class="personne">
            <Avatar :src="m.avatar" :prenom="m.prenom" :taille="52" />
            <div class="grandit">
              <strong>{{ m.prenom }} {{ m.nom }}</strong>
              <p class="aide">
                <span v-if="m.dateNaissance">{{ ageTexte(m.dateNaissance) }}</span>
                <span v-if="m.dateNaissance && m.telephone"> · </span>
                <span v-if="m.telephone"><Icone nom="telephone" class="en-ligne" /> {{ m.telephone }}</span>
              </p>
              <p v-if="etatPhotos(m)" class="etat" :class="{ ok: etatPhotos(m).vu }">
                <Icone :nom="etatPhotos(m).vu ? 'coche' : 'photo'" class="en-ligne" /> {{ etatPhotos(m).texte }}
              </p>
            </div>
            <div v-if="m.telephone" class="contacts">
              <a :href="lienTelephone(m.telephone)" class="rond" :title="`Appeler ${m.prenom}`" :aria-label="`Appeler ${m.prenom}`"><Icone nom="telephone" /></a>
              <a :href="lienSms(m.telephone)" class="rond" :title="`SMS à ${m.prenom}`" :aria-label="`Envoyer un SMS à ${m.prenom}`"><Icone nom="sms" /></a>
              <a :href="lienWhatsApp(m.telephone)" class="rond" target="_blank" rel="noopener" :title="`WhatsApp à ${m.prenom}`" :aria-label="`Écrire à ${m.prenom} sur WhatsApp`"><Icone nom="whatsapp" /></a>
            </div>
          </div>
        </section>

        <section v-else-if="nom === 'photos' && !suisAuxiliaire && photosActives" class="carte bloc" :style="{ order: ordreTelephone.indexOf(nom) }">
          <div class="titre-bloc">
            <h2><Icone nom="photo" /> {{ totalNouvelles ? 'Nouvelles photos' : 'Dernières photos' }}</h2>
            <RouterLink :to="`${base}/photos`" class="voir">Photos <Icone nom="suivant" class="en-ligne" /></RouterLink>
          </div>
          <template v-if="totalNouvelles">
            <p class="aide">{{ totalNouvelles }} nouvelle{{ totalNouvelles > 1 ? 's' : '' }} photo{{ totalNouvelles > 1 ? 's' : '' }} depuis votre dernière visite</p>
            <div v-for="a in albums" :key="a.id" class="album">
              <div class="album-ligne">
                <RouterLink :to="`${base}/photos?album=${a.id}`"><strong>{{ a.nom }}</strong></RouterLink>
                <span class="aide">{{ a.auteurs.length ? `${a.auteurs.join(', ')} · ` : '' }}{{ a.nouvelles }} photo{{ a.nouvelles > 1 ? 's' : '' }}</span>
              </div>
              <div class="vignettes">
                <RouterLink v-for="p in a.photos" :key="p.id" :to="lienPhoto(a.id, p)" class="vignette">
                  <img :src="p.miniature" :alt="p.legende || 'Photo'" loading="lazy" />
                </RouterLink>
              </div>
            </div>
          </template>
          <template v-else-if="dernieres.length">
            <p class="aide">Rien de nouveau depuis votre dernière visite.</p>
            <div class="vignettes">
              <RouterLink v-for="p in dernieres" :key="p.id" :to="`${base}/photos?photo=${p.id}`" class="vignette">
                <img :src="p.miniature" :alt="p.legende || 'Photo'" loading="lazy" />
              </RouterLink>
            </div>
          </template>
          <p v-else class="aide">Aucune photo pour l'instant. Partagez la première !</p>
          <RouterLink :to="`${base}/photos`" class="bouton petit" :class="{ secondaire: !suisProche }"><Icone nom="ajouter" class="en-ligne" /> Ajouter des photos</RouterLink>
        </section>

        <section v-else-if="nom === 'autres' && autres.length" class="carte bloc" :style="{ order: ordreTelephone.indexOf(nom) }">
          <div class="titre-bloc"><h2><Icone nom="cercle" /> Vos autres cercles</h2></div>
          <button v-for="c in autres" :key="c.id" class="cercle-ligne" @click="changerCercle(c.id)">
            <strong>{{ c.nom }}</strong>
            <span class="aide">
              {{ c.rdv ? `${c.rdv} rendez-vous aujourd'hui` : 'Rien aujourd\'hui' }}{{ c.photos ? ` · ${c.photos} nouvelle${c.photos > 1 ? 's' : ''} photo${c.photos > 1 ? 's' : ''}` : '' }}
            </span>
            <Icone nom="suivant" />
          </button>
        </section>
          </template>
        </div>
      </div>
    </template>
  </main>
</template>

<style scoped>
.accueil { max-width: 1060px; padding: 28px 32px; }
.date { color: var(--gris); margin: 0 0 4px; }
h1 { margin: 0 0 20px; font-size: 2.1rem; }
.grille { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.carte { margin: 0 0 16px; }
.bloc h2 { font-size: 1.1rem; color: var(--bleu-nuit); margin: 0; display: flex; align-items: center; gap: 10px; }
.titre-bloc { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.voir { font-size: 0.9rem; white-space: nowrap; text-decoration: none; }
.jour { font-weight: 700; color: var(--bleu-nuit); font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; margin: 12px 0 2px; }
.rdv { display: flex; gap: 14px; padding: 8px 0; border-bottom: 1px solid #f1eee9; color: inherit; text-decoration: none; }
.heure { color: var(--vert); font-weight: 700; min-width: 58px; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 4px; color: var(--gris); font-size: 0.85rem; }
.pastille { border-radius: 999px; padding: 1px 10px; font-size: 0.8rem; background: #eef0f6; color: var(--bleu-nuit); }
.pastille.aidants { background: #fdf0dc; color: #8a5a00; }
.pastille.accompagne, .pastille.accompagne_aidants { background: var(--vert-clair); color: var(--vert); }
.note { margin-top: 10px; }
.bouton {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 14px;
  border-radius: 8px;
  background: var(--vert);
  color: white;
  text-decoration: none;
  font-size: 0.92rem;
}
.bouton.secondaire { background: var(--vert-clair); color: var(--vert); }
button.petit { padding: 8px 14px; font-size: 0.92rem; }
.personne { display: flex; gap: 12px; align-items: center; padding: 8px 0; }
.personne p { margin: 2px 0 0; }
.grandit { flex: 1; min-width: 0; }
.etat { font-size: 0.85rem; color: #b46a22; }
.etat.ok { color: var(--vert); }
.contacts { display: flex; gap: 6px; flex: none; }
.anniversaire .rond { background: white; }
.rond { width: 44px; height: 44px; border-radius: 50%; background: var(--vert-clair); color: var(--vert); display: grid; place-items: center; flex: none; }
.album + .album { margin-top: 10px; }
.album-ligne { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: 6px; }
.album-ligne a { color: inherit; text-decoration: none; }
.vignettes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px; }
.vignette { display: block; aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: #eef0f4; }
.vignette img { width: 100%; height: 100%; object-fit: cover; display: block; }
.anniversaires { background: #fdeef3; border: 1px solid #f6cfdc; border-radius: 12px; padding: 4px 16px; margin-bottom: 16px; }
.anniversaire { display: flex; gap: 12px; align-items: center; padding: 10px 0; }
.anniversaire + .anniversaire { border-top: 1px solid #f6d9e3; }
.anniversaire p { margin: 2px 0 0; }
.anniversaire .gateau { color: #b03a64; width: 24px; height: 24px; }
.anniversaire strong { color: #8a2850; }
.appeler { margin: 0; white-space: nowrap; }
.a-faire { background: #fff7ec; border: 1px solid #f6dfc0; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; }
.titre-a-faire { display: flex; gap: 8px; align-items: center; font-weight: 700; color: #9a5b1c; margin: 0 0 4px; }
.tache { display: flex; gap: 12px; align-items: center; padding: 8px 0; border-top: 1px solid #f6e6cf; }
.tache:first-of-type { border-top: none; }
.tache > .icone { color: #b46a22; }
.tache p { margin: 2px 0 0; }
.tache .bouton { margin: 0; }
.boutons-tache { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.cercle-ligne {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 0;
  background: none;
  color: inherit;
  text-align: left;
  border-radius: 0;
}
.cercle-ligne + .cercle-ligne { border-top: 1px solid #f1eee9; }
.cercle-ligne .aide { flex: 1; margin: 0; }
.cercle-ligne .icone { color: var(--gris); }

@media (max-width: 900px) {
  .accueil { padding: 20px 16px; }
  h1 { font-size: 1.8rem; }
  .grille { display: flex; flex-direction: column; align-items: stretch; gap: 0; }
  .colonne { display: contents; }
  .anniversaire .gateau, .texte-appeler { display: none; }
  .appeler { width: 44px; height: 44px; border-radius: 50%; padding: 0; justify-content: center; }
  /* Appel, SMS et WhatsApp passent sous le nom, alignés sur le texte */
  .personne, .anniversaire { flex-wrap: wrap; }
  .personne .grandit, .anniversaire .grandit { flex-basis: calc(100% - 64px); }
  .personne .contacts, .anniversaire .contacts { margin-left: 64px; }
  .cercle-ligne { flex-wrap: wrap; }
  .cercle-ligne .aide { flex-basis: 100%; order: 3; }
}
</style>
