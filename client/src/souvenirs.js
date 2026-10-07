// Jeu « Il y a longtemps… » : quel événement heureux ou marquant de sa jeunesse reconnaître ?
// Les questions viennent de ce catalogue de faits connus, choisis pour rester positifs (pas de guerre,
// de drame ni de décès) : une année, une phrase qui complète « En 1969, … ». Pour en ajouter :
// [année, 'phrase'], de préférence un fait que les plus de 70 ans ont vécu ou entendu raconter.
const FAITS = [
  [1945, 'les Françaises votent pour la première fois'],
  [1946, 'le premier Festival de Cannes a lieu'],
  [1947, 'Christian Dior présente son « New Look »'],
  [1948, 'les Jeux olympiques d\'été se tiennent à Londres'],
  [1949, 'Simone de Beauvoir publie « Le Deuxième Sexe »'],
  [1950, 'le salaire minimum, le SMIG, est créé'],
  [1951, 'les « Cahiers du cinéma » voient le jour'],
  [1952, 'les Jeux olympiques d\'été se tiennent à Helsinki'],
  [1953, 'Hillary et Tenzing atteignent le sommet de l\'Everest'],
  [1953, 'la reine Élisabeth II est couronnée à Londres'],
  [1954, 'l\'abbé Pierre lance son appel en faveur des sans-abri'],
  [1955, 'Citroën présente la DS'],
  [1956, 'Brigitte Bardot triomphe dans « Et Dieu… créa la femme »'],
  [1956, 'Grace Kelly épouse le prince Rainier de Monaco'],
  [1957, 'le premier satellite, Spoutnik, est lancé dans l\'espace'],
  [1958, 'le général de Gaulle revient et la Ve République naît'],
  [1958, 'Just Fontaine marque 13 buts à la Coupe du monde de football'],
  [1959, 'Astérix apparaît dans le journal « Pilote »'],
  [1960, 'les Jeux olympiques d\'été se tiennent à Rome'],
  [1961, 'Youri Gagarine est le premier homme dans l\'espace'],
  [1962, 'les images de télévision traversent l\'Atlantique grâce au satellite Telstar'],
  [1963, 'Martin Luther King prononce son discours « I have a dream »'],
  [1964, 'les Beatles se produisent à l\'Olympia, à Paris'],
  [1964, '« Les Parapluies de Cherbourg » reçoit la Palme d\'or à Cannes'],
  [1965, 'France Gall gagne l\'Eurovision avec « Poupée de cire, poupée de son »'],
  [1966, 'l\'Angleterre remporte la Coupe du monde de football'],
  [1967, 'la télévision française passe à la couleur'],
  [1968, 'les Jeux olympiques d\'hiver se tiennent à Grenoble'],
  [1969, 'Neil Armstrong marche sur la Lune'],
  [1969, 'le Concorde effectue son premier vol'],
  [1970, 'le Brésil de Pelé remporte la Coupe du monde de football'],
  [1971, 'le premier microprocesseur est mis au point'],
  [1972, 'les Jeux olympiques d\'été se tiennent à Munich'],
  [1973, 'l\'opéra de Sydney est inauguré'],
  [1974, 'Valéry Giscard d\'Estaing est élu président de la République'],
  [1974, 'la majorité passe de 21 à 18 ans'],
  [1975, 'le film « Les Dents de la mer » sort au cinéma'],
  [1976, 'Nadia Comaneci obtient la note de 10 aux Jeux olympiques de Montréal'],
  [1977, 'le centre Pompidou ouvre à Paris'],
  [1978, 'Louise Brown, le premier « bébé éprouvette », naît'],
  [1978, 'l\'Argentine remporte la Coupe du monde de football'],
  [1979, 'Sony lance le Walkman'],
  [1980, 'Sophie Marceau éblouit dans le film « La Boum »'],
  [1981, 'François Mitterrand est élu président de la République'],
  [1981, 'le premier TGV roule entre Paris et Lyon'],
  [1982, 'le Minitel arrive dans les foyers'],
  [1983, 'Yannick Noah remporte Roland-Garros'],
  [1984, 'la chaîne de télévision Canal+ est lancée'],
  [1984, 'Laurent Fignon remporte son deuxième Tour de France'],
  [1985, 'Coluche lance les Restos du Cœur'],
  [1985, 'le film « Trois hommes et un couffin » sort au cinéma'],
  [1986, 'la station spatiale Mir est lancée'],
  [1988, 'le film « Le Grand Bleu » de Luc Besson sort au cinéma'],
  [1989, 'la pyramide du Louvre est inaugurée'],
  [1989, 'le mur de Berlin tombe'],
  [1990, 'l\'Allemagne est réunifiée'],
  [1992, 'les Jeux olympiques d\'hiver se tiennent à Albertville'],
  [1994, 'le tunnel sous la Manche ouvre'],
  [1996, 'la brebis Dolly, premier mammifère cloné, naît'],
  [1998, 'la France remporte la Coupe du monde de football'],
  [2002, 'l\'euro remplace le franc'],
  [2012, 'Jean Dujardin reçoit l\'Oscar du meilleur acteur pour « The Artist »']
]

const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1)

const melanger = (liste) => {
  const l = [...liste]
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]]
  }
  return l
}

// Années de jeunesse (15 à 30 ans) d'après l'année de naissance ; sans date, les années 1950 à 1985
function fenetre(naissance) {
  return naissance ? [naissance + 15, naissance + 30] : [1950, 1985]
}

// Questions d'une partie : { annee, ilYa, fait, choix: [{ texte, bonne }] }. Un fait de la jeunesse
// par question (les plus proches de la fenêtre si elle est vide), des faux choix d'autres années.
export function questionsSouvenirs(naissance, { niveau = 3, questions = 5 } = {}, aujourdhui = new Date().getFullYear()) {
  const [debut, fin] = fenetre(naissance)
  const distance = ([a]) => (a < debut ? debut - a : a > fin ? a - fin : 0)
  // Faits de la fenêtre d'abord (mélangés), puis les plus proches ; une seule question par année
  const ordre = melanger(FAITS).sort((x, y) => distance(x) - distance(y))
  const vues = new Set()
  const tires = []
  for (const f of ordre) {
    if (tires.length >= questions) break
    if (vues.has(f[0])) continue
    vues.add(f[0])
    tires.push(f)
  }
  return melanger(tires).map(([annee, fait]) => {
    const faux = []
    for (const [a, t] of melanger(FAITS)) {
      if (faux.length >= niveau - 1) break
      if (Math.abs(a - annee) >= 4 && !faux.some((f) => Math.abs(f.annee - a) < 2)) faux.push({ annee: a, texte: t })
    }
    return {
      annee,
      ilYa: aujourdhui - annee,
      fait,
      choix: melanger([{ texte: majuscule(fait), bonne: true }, ...faux.map((f) => ({ texte: majuscule(f.texte), bonne: false }))])
    }
  })
}
