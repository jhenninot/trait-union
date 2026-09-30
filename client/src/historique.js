// Étapes d'une page (album ouvert, photo affichée, plein écran...) inscrites dans l'adresse, pour
// que le bouton retour d'Android ou du navigateur remonte d'une étape au lieu de quitter la page.

// Même page, paramètres modifiés (undefined ou null : paramètre retiré)
export function avecParametres(route, changements) {
  const query = { ...route.query, ...changements }
  for (const cle of Object.keys(query)) if (query[cle] == null) delete query[cle]
  return { path: route.path, query }
}

// Revient à `cible` : comme le bouton retour si c'est l'étape d'avant (pour ne pas empiler les
// étapes), sinon en remplaçant l'étape actuelle.
export function revenir(router, cible) {
  const chemin = router.resolve(cible).fullPath
  if (window.history.state?.back === chemin) router.back()
  else router.replace(chemin)
}
