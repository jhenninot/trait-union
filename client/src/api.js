// Appel à l'API : renvoie le JSON ou lève une Error avec le message du serveur.
export async function api(methode, url, corps) {
  const res = await fetch('/api' + url, {
    method: methode,
    headers: corps ? { 'Content-Type': 'application/json' } : {},
    body: corps ? JSON.stringify(corps) : undefined
  })
  if (res.status === 204) return null
  const donnees = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(donnees.erreur || 'Le serveur ne répond pas')
  return donnees
}
