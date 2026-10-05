// Appel à l'API : renvoie le JSON ou lève une Error avec le message du serveur.
export async function api(methode, url, corps) {
  let res
  try {
    res = await fetch('/api' + url, {
      method: methode,
      headers: corps ? { 'Content-Type': 'application/json' } : {},
      body: corps ? JSON.stringify(corps) : undefined
    })
  } catch {
    throw Object.assign(new Error('Le serveur ne répond pas'), { status: 0 })
  }
  if (res.status === 204) return null
  const donnees = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(donnees.erreur || 'Le serveur ne répond pas'), { status: res.status })
  return donnees
}
