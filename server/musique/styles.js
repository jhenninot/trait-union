// Styles musicaux proposés aux aidants : chacun est représenté par quelques artistes connus, dont
// les titres sont cherchés chez Deezer ou iTunes au moment de jouer (server/musique/itunes.js).
export const STYLES = {
  'Chanson française': ['Édith Piaf', 'Charles Aznavour', 'Jacques Brel', 'Georges Brassens', 'Barbara', 'Yves Montand', 'Charles Trenet'],
  'Variété française': ['Claude François', 'Joe Dassin', 'Dalida', 'Michel Sardou', 'Johnny Hallyday', 'Sheila', 'Michel Fugain', 'Mireille Mathieu'],
  'Pop et rock français': ['Jean-Jacques Goldman', 'Francis Cabrel', 'Renaud', 'Daniel Balavoine', 'Indochine', 'Téléphone', 'Jacques Dutronc'],
  'Rock et pop internationaux': ['The Beatles', 'The Rolling Stones', 'Queen', 'ABBA', 'Eagles', 'Michael Jackson', 'Elvis Presley'],
  'Rock\'n\'roll des années 50': ['Elvis Presley', 'Chuck Berry', 'Little Richard', 'Bill Haley & His Comets', 'Jerry Lee Lewis'],
  'Jazz': ['Louis Armstrong', 'Ella Fitzgerald', 'Duke Ellington', 'Django Reinhardt', 'Billie Holiday', 'Nat King Cole'],
  'Musette et accordéon': ['Yvette Horner', 'Tino Rossi', 'Andrex', 'Aimable', 'Marcel Azzola'],
  'Disco et années 70': ['Bee Gees', 'Gloria Gaynor', 'Donna Summer', 'Boney M.', 'Earth, Wind & Fire'],
  'Soul et gospel': ['Aretha Franklin', 'Ray Charles', 'Otis Redding', 'Whitney Houston', 'Stevie Wonder'],
  'Musiques latines': ['Los Machucambos', 'Luis Mariano', 'Julio Iglesias', 'Gipsy Kings', 'Enrico Macias'],
  'Country': ['Johnny Cash', 'Dolly Parton', 'Kenny Rogers', 'Willie Nelson', 'Hugues Aufray'],
  // Pas d'artistes : des œuvres célèbres (PIECES_CLASSIQUES ci-dessous)
  'Instrumental': ['Paul Mauriat', 'Richard Clayderman', 'Franck Pourcel', 'James Last', 'Ray Conniff', 'Mantovani', 'Caravelli', 'Raymond Lefèvre'],
  'Musique classique': []
}
export const NOMS_STYLES = Object.keys(STYLES)

// Œuvres classiques connues : [titre affiché, compositeur, année, recherche dans iTunes]. Le catalogue
// iTunes classe les morceaux sous le nom des interprètes avec de longs titres : on les retrouve
// donc par les mots de la recherche, et non par l'artiste.
export const PIECES_CLASSIQUES = [
  ['Pour Élise', 'Beethoven', 1810, 'Für Elise'], ['La Symphonie n° 5', 'Beethoven', 1808, 'Symphony No. 5'],
  ['L\'Hymne à la joie', 'Beethoven', 1824, 'Symphony No. 9 Ode to Joy'], ['La Sonate au clair de lune', 'Beethoven', 1801, 'Moonlight Sonata'],
  ['Clair de lune', 'Debussy', 1905, 'Clair de lune'], ['Prélude à l\'après-midi d\'un faune', 'Debussy', 1894, 'Prélude à l\'après-midi d\'un faune'],
  ['Le Printemps (Les Quatre Saisons)', 'Vivaldi', 1725, 'Four Seasons Spring'], ['L\'Été (Les Quatre Saisons)', 'Vivaldi', 1725, 'Four Seasons Summer'],
  ['Une petite musique de nuit', 'Mozart', 1787, 'Eine kleine Nachtmusik'], ['La Marche turque', 'Mozart', 1783, 'Rondo alla turca'],
  ['La Flûte enchantée', 'Mozart', 1791, 'Magic Flute Queen of the Night'], ['Le Lac des cygnes', 'Tchaïkovski', 1876, 'Swan Lake'],
  ['Casse-Noisette', 'Tchaïkovski', 1892, 'Nutcracker Dance of the Sugar Plum Fairy'], ['Boléro', 'Ravel', 1928, 'Boléro'],
  ['La Danse hongroise n° 5', 'Brahms', 1869, 'Hungarian Dance No. 5'], ['Le Beau Danube bleu', 'Strauss', 1867, 'Blue Danube'],
  ['Ave Maria', 'Schubert', 1825, 'Ave Maria'], ['Gymnopédie n° 1', 'Satie', 1888, 'Gymnopédie No. 1'],
  ['Le Carnaval des animaux', 'Saint-Saëns', 1886, 'Carnival of the Animals'], ['La Danse macabre', 'Saint-Saëns', 1874, 'Danse macabre'],
  ['Nocturne en mi bémol majeur', 'Chopin', 1832, 'Nocturne Op. 9 No. 2'], ['La Valse de l\'adieu', 'Chopin', 1835, 'Waltz Op. 69 No. 1'],
  ['Toccata et fugue en ré mineur', 'Bach', 1704, 'Toccata and Fugue in D Minor'], ['Air sur la corde de sol', 'Bach', 1730, 'Air on the G String'],
  ['Le Canon en ré', 'Pachelbel', 1680, 'Canon in D'], ['Dans l\'antre du roi de la montagne', 'Grieg', 1875, 'In the Hall of the Mountain King'],
  ['Habanera (Carmen)', 'Bizet', 1875, 'Carmen Habanera'], ['La Marche nuptiale', 'Mendelssohn', 1842, 'Wedding March'],
  ['Rhapsody in Blue', 'Gershwin', 1924, 'Rhapsody in Blue'], ['Jupiter (Les Planètes)', 'Holst', 1916, 'The Planets Jupiter']
].map(([titre, artiste, annee, terme]) => ({ titre, artiste, annee, terme, classique: true }))
