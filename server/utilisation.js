import { sql } from 'drizzle-orm'
import { db } from './db/index.js'

// Utilisation de l'application par les personnes accompagnées, montrée à leurs aidants
// (page Personnes accompagnées et accueil des aidants) : par jour, combien de fois chaque écran a
// été ouvert. Rien sur ce qui a été regardé, dit ou écrit.

export const ECRANS = ['accueil', 'photos', 'agenda', 'famille', 'arbre', 'messages', 'voix']
const JOURS_FRISE = 30

// Seuls les appareils configurés pour une personne accompagnée sont suivis
export function noterUtilisation(req, ecran) {
  if (req.session?.type !== 'appareil' || !ECRANS.includes(ecran)) return
  db.execute(sql`
    insert into utilisation_jour (utilisateur_id, jour, ecrans)
    values (${req.utilisateur.id}, (now() at time zone 'Europe/Paris')::date, jsonb_build_object(${ecran}::text, 1))
    on conflict on constraint utilisation_jour_unique do update set
      ecrans = utilisation_jour.ecrans || jsonb_build_object(${ecran}::text, coalesce((utilisation_jour.ecrans->>${ecran})::int, 0) + 1),
      derniere_le = now(), modifie_le = now()
  `).catch((e) => console.error('[Utilisation]', e.message))
}

// Résumé pour chaque personne : dernier passage, jours d'utilisation sur 7 et 30 jours, frise des
// 30 derniers jours (nombre d'écrans ouverts par jour) et écrans ouverts sur 30 jours.
export async function resumeUtilisation(utilisateurIds) {
  if (!utilisateurIds.length) return new Map()
  const ids = sql.join(utilisateurIds.map((id) => sql`${id}::uuid`), sql`, `)
  const { rows } = await db.execute(sql`
    select utilisateur_id, to_char(jour, 'YYYY-MM-DD') as jour, ecrans, derniere_le
    from utilisation_jour
    where utilisateur_id in (${ids}) and jour > (now() at time zone 'Europe/Paris')::date - ${JOURS_FRISE}::int
  `)
  const { rows: derniers } = await db.execute(sql`
    select utilisateur_id, max(derniere_le) as le, min(jour) as depuis from utilisation_jour
    where utilisateur_id in (${ids}) group by utilisateur_id
  `)
  // Jours de la frise, du plus ancien à aujourd'hui (heure de Paris)
  const aujourdhui = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  const jours = Array.from({ length: JOURS_FRISE }, (_, i) => {
    const d = new Date(aujourdhui)
    d.setDate(d.getDate() - (JOURS_FRISE - 1 - i))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const resultat = new Map()
  for (const id of utilisateurIds) {
    const lignes = rows.filter((r) => r.utilisateur_id === id)
    const parJour = new Map(lignes.map((r) => [r.jour, Object.values(r.ecrans).reduce((s, n) => s + Number(n), 0)]))
    const ecrans = Object.fromEntries(ECRANS.map((e) => [e, lignes.reduce((s, r) => s + Number(r.ecrans[e] ?? 0), 0)]))
    const d = derniers.find((x) => x.utilisateur_id === id)
    resultat.set(id, {
      dernierPassage: d?.le ? new Date(d.le) : null,
      suiviDepuis: d?.depuis ?? null,
      jours7: jours.slice(-7).filter((j) => parJour.has(j)).length,
      jours30: parJour.size,
      frise: jours.map((jour) => ({ jour, ecrans: parJour.get(jour) ?? 0 })),
      ecrans
    })
  }
  return resultat
}
