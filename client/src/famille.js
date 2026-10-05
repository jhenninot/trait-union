// Famille de la personne accompagnée (« Ma famille », « Mon arbre », anniversaires de l'accueil) :
// les membres de ses cercles et les personnes de leur arbre généalogique, vus depuis elle.
import { api } from './api.js'
import { session } from './session.js'

export async function chargerFamille() {
  const personnes = []
  const arbres = []
  const vus = new Set()
  for (const c of session.cercles) {
    const [cercle, arbre] = await Promise.all([
      api('GET', `/cercles/${c.id}`).catch(() => null),
      api('GET', `/cercles/${c.id}/arbre`).catch(() => null)
    ])
    const dansArbre = new Set()
    if (arbre?.moi) {
      // Chaque personne sait de quel cercle elle vient (bouton « Envoyer un message » de sa fiche)
      for (const p of arbre.personnes) p.cercleId = c.id
      arbres.push(arbre)
      for (const p of arbre.personnes) {
        dansArbre.add(p.id)
        const cle = `${p.prenom} ${p.nom ?? ''}`
        if (p.id === arbre.moi || vus.has(cle)) continue
        vus.add(cle)
        personnes.push({ ...p, dansArbre: true, cercleId: c.id })
      }
    }
    for (const m of cercle?.membres ?? []) {
      const cle = `${m.prenom} ${m.nom ?? ''}`
      // Les autres personnes accompagnées du cercle (un conjoint, par exemple) y figurent aussi
      if (m.moi || vus.has(cle) || (m.personneId && dansArbre.has(m.personneId))) continue
      // Placé dans l'arbre mais caché à la personne accompagnée
      if (m.personneId && arbre?.moi) continue
      vus.add(cle)
      personnes.push({ ...m, membreId: m.id, cercleId: c.id, groupe: m.role === 'auxiliaire' || !m.lien ? 'aide' : 'famille' })
    }
  }
  return { personnes, arbres }
}
