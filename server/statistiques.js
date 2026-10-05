import { sql } from 'drizzle-orm'
import { db } from './db/index.js'
import { derniereApkConnue } from './application.js'
import * as presentation from './presentation/config.js'

// Statistiques d'utilisation pour l'administration (Administration > Statistiques), inspirées de
// la console Super Admin de FamilyGest : uniquement des nombres et des dates, jamais de contenu ni
// de donnée personnelle (pas de nom de personne, pas de titre de rendez-vous, pas de photo).
// Calculées à la demande à partir des dates de création, de la dernière activité des sessions et
// des compteurs journaliers (table compteurs) pour ce qui ne laisse pas de trace en base.

const JOUR = 24 * 60 * 60 * 1000
export const SEMAINES = 12
export const CANAUX = ['voix', 'alertes', 'presentation', 'jeux']

// --- Compteurs journaliers (une écriture par événement, sans attendre ni bloquer la requête)

export function compter(canal, cercleId = null, nombre = 1) {
  if (!CANAUX.includes(canal) || !(nombre > 0)) return
  db.execute(sql`
    insert into compteurs (jour, canal, cercle_id, nombre)
    values ((now() at time zone 'Europe/Paris')::date, ${canal}, ${cercleId}, ${nombre})
    on conflict on constraint compteurs_unique
    do update set nombre = compteurs.nombre + excluded.nombre, modifie_le = now()
  `).catch((e) => console.error('[Statistiques] Compteur :', e.message))
}

// Commande vocale ou partie de jeu : comptée dans le cercle de la personne accompagnée (le premier s'il y en a plusieurs)
export const compterVoix = (utilisateurId) => compterPourUtilisateur('voix', utilisateurId)
export const compterJeux = (utilisateurId) => compterPourUtilisateur('jeux', utilisateurId)

async function compterPourUtilisateur(canal, utilisateurId) {
  try {
    const { rows } = await db.execute(sql`
      select cercle_id from membres where utilisateur_id = ${utilisateurId}
      order by (role = 'accompagne') desc, cree_le limit 1`)
    compter(canal, rows[0]?.cercle_id ?? null)
  } catch (e) {
    console.error(`[Statistiques] ${canal} :`, e.message)
  }
}

// --- Calculs

const lignes = async (requete) => (await db.execute(requete)).rows
const nb = (v) => Number(v ?? 0)
const date = (v) => (v ? new Date(v) : null) // les requêtes brutes rendent les dates en texte

// Activité d'un compte : date de modification de ses sessions (prolongées au plus une fois par jour)
const activite = sql`(select utilisateur_id, max(modifie_le) as le from sessions group by utilisateur_id)`

// Modules suivis : nombre d'ajouts sur 30 jours, sur les 30 jours précédents (tendance) et nombre de
// cercles qui s'en sont servis. Source : une table (date de création) ou un canal de compteurs.
const MODULES = [
  { cle: 'agenda', table: sql`rendez_vous` },
  { cle: 'photos', table: sql`photos`, filtre: sql`statut = 'publiee'` },
  { cle: 'albums', table: sql`albums` },
  { cle: 'arbre', table: sql`personnes` },
  { cle: 'invitations', table: sql`invitations` },
  { cle: 'messages', table: sql`messages`, filtre: sql`publie` },
  { cle: 'voix', canal: 'voix' },
  { cle: 'jeux', canal: 'jeux' },
  { cle: 'alertes', canal: 'alertes' }
]

async function parModule(j30, j60) {
  const resultat = {}
  for (const m of MODULES) {
    const [r] = m.canal
      ? await lignes(sql`
          select coalesce(sum(nombre) filter (where jour >= ${j30}::date), 0) as n30,
                 coalesce(sum(nombre) filter (where jour < ${j30}::date and jour >= ${j60}::date), 0) as avant,
                 count(distinct cercle_id) filter (where jour >= ${j30}::date and nombre > 0) as cercles
          from compteurs where canal = ${m.canal}`)
      : await lignes(sql`
          select count(*) filter (where cree_le >= ${j30}) as n30,
                 count(*) filter (where cree_le < ${j30} and cree_le >= ${j60}) as avant,
                 count(distinct cercle_id) filter (where cree_le >= ${j30}) as cercles
          from ${m.table} ${m.filtre ? sql`where ${m.filtre}` : sql``}`)
    resultat[m.cle] = { n30: nb(r.n30), avant: nb(r.avant), cercles: nb(r.cercles) }
  }
  return resultat
}

// Ajouts par semaine (12 dernières semaines) : rendez-vous, photos, albums, personnes de l'arbre,
// commandes vocales. La dernière colonne est la semaine en cours (jusqu'à maintenant).
async function parSemaine(maintenant) {
  const debut = new Date(maintenant.getTime() - SEMAINES * 7 * JOUR)
  const semaines = Array.from({ length: SEMAINES }, (_, i) => ({
    debut: new Date(debut.getTime() + i * 7 * JOUR), agenda: 0, photos: 0, arbre: 0, voix: 0
  }))
  const index = (d) => Math.min(SEMAINES - 1, Math.floor((new Date(d) - debut) / (7 * JOUR)))
  const tables = [
    ['agenda', sql`select cree_le as le from rendez_vous where cree_le >= ${debut}`],
    ['photos', sql`select cree_le as le from photos where statut = 'publiee' and cree_le >= ${debut}`],
    ['photos', sql`select cree_le as le from albums where cree_le >= ${debut}`],
    ['arbre', sql`select cree_le as le from personnes where cree_le >= ${debut}`]
  ]
  for (const [cle, requete] of tables) {
    for (const r of await lignes(requete)) semaines[index(r.le)][cle]++
  }
  // Compteurs : le jour (heure de Paris) est rapporté à midi pour tomber dans la bonne semaine
  for (const r of await lignes(sql`select jour, sum(nombre) as n from compteurs where canal = 'voix' and jour >= ${debut}::date group by jour`)) {
    const i = index(new Date(`${r.jour}T12:00:00`))
    if (i >= 0) semaines[i].voix += nb(r.n)
  }
  return semaines.map((s) => ({ ...s, total: s.agenda + s.photos + s.arbre + s.voix }))
}

export async function statistiques(maintenant = new Date()) {
  const j7 = new Date(maintenant.getTime() - 7 * JOUR)
  const j30 = new Date(maintenant.getTime() - 30 * JOUR)
  const j60 = new Date(maintenant.getTime() - 60 * JOUR)
  const annee = maintenant.getFullYear()

  const [comptes] = await lignes(sql`
    select count(*) as total,
           count(*) filter (where u.est_admin) as admins,
           count(*) filter (where u.email is null) as accompagnes,
           count(*) filter (where u.google_id is not null) as google,
           count(*) filter (where u.desactive_le is not null) as desactives,
           count(*) filter (where u.cree_le >= ${j30}) as nouveaux30,
           count(*) filter (where a.le >= ${j7}) as actifs7,
           count(*) filter (where a.le >= ${j30}) as actifs30,
           count(*) filter (where u.avatar is not null) as avatars,
           count(*) filter (where u.date_naissance is not null) as naissances,
           count(*) filter (where u.telephone is not null and u.telephone <> '') as telephones,
           count(*) filter (where not exists (select 1 from membres m where m.utilisateur_id = u.id)) as sans_cercle
    from utilisateurs u left join ${activite} a on a.utilisateur_id = u.id`)

  // Rôles : une personne compte une fois par rôle (même si elle est dans plusieurs cercles)
  const roles = await lignes(sql`
    select m.role, count(distinct m.utilisateur_id) as comptes,
           count(distinct m.utilisateur_id) filter (where a.le >= ${j30}) as actifs30
    from membres m left join ${activite} a on a.utilisateur_id = m.utilisateur_id
    where m.utilisateur_id is not null group by m.role`)

  // Cercles : actif = au moins un membre venu ou un ajout dans les 30 derniers jours
  const parCercle = await lignes(sql`
    select c.id, c.nom, c.cree_le,
      (select count(*) from membres m where m.cercle_id = c.id and m.role = 'accompagne') as accompagnes,
      (select count(*) from membres m where m.cercle_id = c.id and m.role = 'aidant') as aidants,
      (select count(*) from membres m where m.cercle_id = c.id and m.role = 'proche') as proches,
      (select count(*) from membres m where m.cercle_id = c.id and m.role = 'auxiliaire') as auxiliaires,
      (select count(*) from membres m join ${activite} a on a.utilisateur_id = m.utilisateur_id
        where m.cercle_id = c.id and a.le >= ${j30}) as actifs30,
      greatest(
        (select max(a.le) from membres m join ${activite} a on a.utilisateur_id = m.utilisateur_id where m.cercle_id = c.id),
        (select max(cree_le) from rendez_vous where cercle_id = c.id),
        (select max(cree_le) from photos where cercle_id = c.id),
        (select max(cree_le) from personnes where cercle_id = c.id)
      ) as derniere_activite,
      (select count(*) from photos p where p.cercle_id = c.id and p.statut = 'publiee') as photos,
      (select coalesce(sum(taille), 0) from photos p where p.cercle_id = c.id and p.statut = 'publiee') as volume,
      (select count(*) from rendez_vous r where r.cercle_id = c.id) as rendez_vous,
      (select count(*) from rendez_vous r where r.cercle_id = c.id and r.cree_le >= ${j30}) as rendez_vous30,
      (select count(*) from personnes p where p.cercle_id = c.id) as arbre,
      (select coalesce(sum(nombre), 0) from compteurs k where k.cercle_id = c.id and k.canal = 'voix' and k.jour >= ${j30}::date) as voix30,
      (select count(*) from sessions s join membres m on m.utilisateur_id = s.utilisateur_id
        where m.cercle_id = c.id and m.role = 'accompagne' and s.type = 'appareil' and s.expire_le > now()) as appareils,
      (select count(*) from invitations i where i.cercle_id = c.id and i.acceptee_le is null and i.expire_le > now()) as invitations
    from cercles c order by lower(c.nom)`)

  // Appareils connectés (sessions en cours) : type de connexion, application Android et sa version
  const connexions = await lignes(sql`
    select type, count(*) as n, count(*) filter (where modifie_le >= ${j30}) as actives30,
           count(*) filter (where version_apk is not null) as apk
    from sessions where expire_le > now() group by type`)
  const versions = await lignes(sql`
    select version_apk as version, count(*) as n from sessions
    where expire_le > now() and version_apk is not null group by version_apk order by version_apk desc`)
  const [codes] = await lignes(sql`
    select count(*) filter (where cree_le >= ${j30}) as crees30,
           count(*) filter (where utilise_le >= ${j30}) as utilises30
    from codes_connexion`)

  const [agenda] = await lignes(sql`
    select count(*) as total, count(*) filter (where cree_le >= ${j30}) as n30,
           count(*) filter (where recurrence <> 'aucune') as repetes,
           count(*) filter (where rappel is not null) as rappels,
           count(*) filter (where auxiliaires) as auxiliaires,
           count(*) filter (where visibilite = 'tous') as tous,
           count(*) filter (where visibilite = 'aidants') as aidants,
           count(*) filter (where visibilite = 'accompagne') as accompagne,
           count(*) filter (where visibilite = 'accompagne_aidants') as "accompagneAidants",
           count(*) filter (where debut >= now() or (recurrence <> 'aucune' and (recurrence_fin is null or recurrence_fin >= now()))) as "aVenir"
    from rendez_vous`)

  const [photos] = await lignes(sql`
    select count(*) filter (where statut = 'publiee') as total,
           coalesce(sum(taille) filter (where statut = 'publiee'), 0) as volume,
           count(*) filter (where statut = 'publiee' and cree_le >= ${j30}) as n30,
           coalesce(sum(taille) filter (where statut = 'publiee' and cree_le >= ${j30}), 0) as volume30,
           count(*) filter (where statut = 'publiee' and album_id is null) as sans_album,
           count(*) filter (where statut = 'envoi' and cree_le < now() - interval '1 hour') as inacheves,
           count(distinct cercle_id) filter (where statut = 'publiee') as cercles,
           (select count(*) from albums) as albums
    from photos`)

  const alertesAppareils = await lignes(sql`
    select type, count(*) as n, count(distinct utilisateur_id) as comptes from appareils_alertes group by type`)
  const [alertes] = await lignes(sql`
    select (select count(distinct utilisateur_id) from appareils_alertes) as comptes,
           (select coalesce(sum(nombre), 0) from compteurs where canal = 'alertes' and jour >= ${j30}::date) as recues30,
           (select count(*) from rappels_envoyes where cree_le >= ${j30}) as rappels30,
           (select count(*) from utilisateurs u where exists (select 1 from appareils_alertes x where x.utilisateur_id = u.id)
              and (u.alertes->>'rendezVous' = 'false' or u.alertes->>'photos' = 'false' or u.alertes->>'anniversaires' = 'false')) as reglages`)

  const [anniversaires] = await lignes(sql`
    select (select count(*) from utilisateurs where date_naissance is not null) as comptes,
           (select count(*) from personnes where utilisateur_id is null and date_naissance is not null and not decede) as sans_compte,
           (select count(*) from anniversaires_envoyes where annee = ${annee}) as fetes,
           (select count(*) from utilisateurs where date_naissance is not null
              and to_char(date_naissance, 'MM') = to_char(now() at time zone 'Europe/Paris', 'MM')) as ce_mois`)

  const [arbre] = await lignes(sql`
    select count(*) as total,
           count(*) filter (where utilisateur_id is null) as sans_compte,
           count(*) filter (where decede) as defunts,
           count(*) filter (where cree_le >= ${j30}) as n30,
           count(*) filter (where a_savoir is not null and a_savoir <> '') as a_savoir,
           count(distinct cercle_id) as cercles,
           (select count(*) from relations) as liens
    from personnes`)

  const [voix] = await lignes(sql`
    select coalesce(sum(nombre) filter (where jour >= ${j30}::date), 0) as n30,
           coalesce(sum(nombre) filter (where jour >= ${j7}::date), 0) as n7,
           count(distinct cercle_id) filter (where jour >= ${j30}::date) as cercles,
           max(modifie_le) as derniere
    from compteurs where canal = 'voix'`)

  const [jeux] = await lignes(sql`
    select coalesce(sum(nombre) filter (where jour >= ${j30}::date), 0) as n30,
           coalesce(sum(nombre) filter (where jour >= ${j7}::date), 0) as n7,
           count(distinct cercle_id) filter (where jour >= ${j30}::date) as cercles,
           max(modifie_le) as derniere
    from compteurs where canal = 'jeux'`)

  const [invitations] = await lignes(sql`
    select count(*) filter (where acceptee_le is null and expire_le > now()) as en_attente,
           count(*) filter (where cree_le >= ${j30}) as envoyees30,
           count(*) filter (where acceptee_le >= ${j30}) as acceptees30,
           count(*) filter (where acceptee_le is null and expire_le <= now()) as expirees
    from invitations`)

  const configPresentation = await presentation.lireConfiguration()
  const [visites] = await lignes(sql`
    select coalesce(sum(nombre) filter (where jour >= ${j30}::date), 0) as n30,
           coalesce(sum(nombre) filter (where jour < ${j30}::date and jour >= ${j60}::date), 0) as avant
    from compteurs where canal = 'presentation'`)

  const cercles = parCercle.map((c) => ({
    id: c.id,
    nom: c.nom,
    creeLe: date(c.cree_le),
    membres: { accompagne: nb(c.accompagnes), aidant: nb(c.aidants), proche: nb(c.proches), auxiliaire: nb(c.auxiliaires) },
    actifs30: nb(c.actifs30),
    derniereActivite: date(c.derniere_activite),
    photos: nb(c.photos),
    volume: nb(c.volume),
    rendezVous: nb(c.rendez_vous),
    rendezVous30: nb(c.rendez_vous30),
    arbre: nb(c.arbre),
    voix30: nb(c.voix30),
    appareils: nb(c.appareils),
    invitations: nb(c.invitations)
  }))
  const cerclesActifs = cercles.filter((c) => c.derniereActivite >= j30).length
  const parType = Object.fromEntries(connexions.map((c) => [c.type, { n: nb(c.n), actives30: nb(c.actives30), apk: nb(c.apk) }]))
  const apk = derniereApkConnue()

  return {
    calculeLe: maintenant,
    comptes: {
      total: nb(comptes.total),
      admins: nb(comptes.admins),
      accompagnes: nb(comptes.accompagnes),
      google: nb(comptes.google),
      desactives: nb(comptes.desactives),
      nouveaux30: nb(comptes.nouveaux30),
      actifs7: nb(comptes.actifs7),
      actifs30: nb(comptes.actifs30),
      avatars: nb(comptes.avatars),
      naissances: nb(comptes.naissances),
      telephones: nb(comptes.telephones),
      sansCercle: nb(comptes.sans_cercle)
    },
    roles: Object.fromEntries(['accompagne', 'aidant', 'proche', 'auxiliaire'].map((role) => {
      const r = roles.find((x) => x.role === role)
      return [role, { comptes: nb(r?.comptes), actifs30: nb(r?.actifs30) }]
    })),
    cerclesTotal: cercles.length,
    cerclesActifs,
    cercles,
    modules: await parModule(j30, j60),
    semaines: await parSemaine(maintenant),
    appareils: {
      parType: Object.fromEntries(['mot_de_passe', 'google', 'appareil'].map((t) => [t, parType[t] ?? { n: 0, actives30: 0, apk: 0 }])),
      navigateur: connexions.reduce((s, c) => s + nb(c.n) - nb(c.apk), 0),
      apk: connexions.reduce((s, c) => s + nb(c.apk), 0),
      versions: versions.map((v) => ({ version: nb(v.version), n: nb(v.n) })),
      derniereApk: apk ? { version: apk.version, nom: apk.nom, publieeLe: apk.publieeLe } : null,
      codesCrees30: nb(codes.crees30),
      codesUtilises30: nb(codes.utilises30)
    },
    agenda: Object.fromEntries(Object.entries(agenda).map(([k, v]) => [k, nb(v)])),
    photos: {
      total: nb(photos.total),
      volume: nb(photos.volume),
      n30: nb(photos.n30),
      volume30: nb(photos.volume30),
      sansAlbum: nb(photos.sans_album),
      inacheves: nb(photos.inacheves),
      cercles: nb(photos.cercles),
      albums: nb(photos.albums)
    },
    alertes: {
      appareils: Object.fromEntries(['web', 'android'].map((t) => {
        const a = alertesAppareils.find((x) => x.type === t)
        return [t, nb(a?.n)]
      })),
      comptes: nb(alertes.comptes),
      recues30: nb(alertes.recues30),
      rappels30: nb(alertes.rappels30),
      reglages: nb(alertes.reglages)
    },
    anniversaires: {
      comptes: nb(anniversaires.comptes),
      sansCompte: nb(anniversaires.sans_compte),
      fetes: nb(anniversaires.fetes),
      ceMois: nb(anniversaires.ce_mois),
      annee
    },
    arbre: {
      total: nb(arbre.total),
      sansCompte: nb(arbre.sans_compte),
      defunts: nb(arbre.defunts),
      n30: nb(arbre.n30),
      aSavoir: nb(arbre.a_savoir),
      cercles: nb(arbre.cercles),
      liens: nb(arbre.liens)
    },
    voix: { n30: nb(voix.n30), n7: nb(voix.n7), cercles: nb(voix.cercles), derniere: date(voix.derniere) },
    jeux: { n30: nb(jeux.n30), n7: nb(jeux.n7), cercles: nb(jeux.cercles), derniere: date(jeux.derniere) },
    invitations: {
      enAttente: nb(invitations.en_attente),
      envoyees30: nb(invitations.envoyees30),
      acceptees30: nb(invitations.acceptees30),
      expirees: nb(invitations.expirees)
    },
    presentation: {
      actif: configPresentation.actif,
      visites: configPresentation.visites || 0,
      depuis: configPresentation.visitesDepuis,
      derniere: configPresentation.derniereVisite,
      n30: nb(visites.n30),
      avant: nb(visites.avant)
    }
  }
}
